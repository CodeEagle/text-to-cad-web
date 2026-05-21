import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { WriteStream } from "node:fs";

import type { CodexModel, CodexReasoningEffort } from "./codex-settings";
import { getCodexBin, getCodexEnv, getCodexHome } from "./paths";

type AppServerMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string } | string;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

type PendingTurn = {
  reject: (error: Error) => void;
  resolve: (value: CodexAppServerTurnResult) => void;
};

export type CodexAppServerTurnResult = {
  exitCode: number;
  lastMessage: string;
  threadId?: string;
  turnId?: string;
  error?: string;
};

export function buildCodexAppServerArgs(): string[] {
  return ["app-server", "--listen", "stdio://"];
}

export async function runCodexAppServerTurn({
  cwd,
  model,
  prompt,
  reasoningEffort,
  logStream
}: {
  cwd: string;
  model: CodexModel;
  prompt: string;
  reasoningEffort: CodexReasoningEffort;
  logStream: WriteStream;
}): Promise<CodexAppServerTurnResult> {
  const child = spawn(getCodexBin(), buildCodexAppServerArgs(), {
    cwd,
    env: getCodexEnv(),
    stdio: ["pipe", "pipe", "pipe"]
  });
  const client = new AppServerClient(child, logStream);

  try {
    await client.initialize();
    const thread = await client.startThread(cwd, model);
    const turn = await client.startTurn(thread.id, cwd, prompt, model, reasoningEffort);
    return await client.waitForTurn(thread.id, turn.id);
  } finally {
    client.close();
  }
}

class AppServerClient {
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private completedTurns = new Map<string, CodexAppServerTurnResult>();
  private turnWaiters = new Map<string, PendingTurn>();
  private agentMessage = "";

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly logStream: WriteStream
  ) {
    child.stdout.on("data", (chunk: Buffer) => this.readStdout(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => this.log(chunk.toString("utf8")));
    child.on("error", (error) => this.rejectAll(error));
    child.on("close", (code) => {
      this.rejectAll(new Error(`codex app-server exited before the turn completed (code ${code}).`));
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "text-to-cad-web",
        title: "Text-to-CAD Web",
        version: "0.1.0"
      },
      capabilities: null
    });
    this.notify("initialized");
  }

  async startThread(cwd: string, model: CodexModel): Promise<{ id: string }> {
    const response = (await this.request("thread/start", {
      cwd,
      model,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      ephemeral: true,
      threadSource: "user"
    })) as { thread?: { id?: string } };
    const threadId = response.thread?.id;
    if (!threadId) {
      throw new Error("codex app-server did not return a thread id.");
    }
    this.log(`\n[app-server] started thread ${threadId}\n`);
    return { id: threadId };
  }

  async startTurn(
    threadId: string,
    cwd: string,
    prompt: string,
    model: CodexModel,
    reasoningEffort: CodexReasoningEffort
  ): Promise<{ id: string }> {
    const response = (await this.request("turn/start", {
      threadId,
      cwd,
      model,
      effort: reasoningEffort,
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [cwd, getCodexHome()],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false
      },
      input: [
        {
          type: "text",
          text: prompt,
          text_elements: []
        }
      ]
    })) as { turn?: { id?: string } };
    const turnId = response.turn?.id;
    if (!turnId) {
      throw new Error("codex app-server did not return a turn id.");
    }
    this.log(`[app-server] started turn ${turnId}\n`);
    return { id: turnId };
  }

  waitForTurn(threadId: string, turnId: string): Promise<CodexAppServerTurnResult> {
    const key = `${threadId}:${turnId}`;
    const completed = this.completedTurns.get(key);
    if (completed) {
      return Promise.resolve(completed);
    }

    return new Promise((resolve, reject) => {
      this.turnWaiters.set(key, { resolve, reject });
    });
  }

  close(): void {
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const payload = `${JSON.stringify({ id, method, params })}\n`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(payload);
    });
  }

  private notify(method: string): void {
    this.child.stdin.write(`${JSON.stringify({ method })}\n`);
  }

  private readStdout(text: string): void {
    this.buffer += text;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        this.handleMessage(line);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleMessage(line: string): void {
    let message: AppServerMessage;
    try {
      message = JSON.parse(line) as AppServerMessage;
    } catch {
      this.log(`${line}\n`);
      return;
    }

    if (typeof message.id === "number" && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (!pending) {
        return;
      }
      if (message.error) {
        pending.reject(new Error(errorMessage(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    this.handleNotification(message);
  }

  private handleNotification(message: AppServerMessage): void {
    if (!message.method) {
      return;
    }

    if (message.method === "item/agentMessage/delta") {
      const delta = typeof message.params?.delta === "string" ? message.params.delta : "";
      this.agentMessage += delta;
      this.log(delta);
      return;
    }

    if (message.method === "turn/completed") {
      const params = message.params ?? {};
      const threadId = typeof params.threadId === "string" ? params.threadId : "";
      const turn = params.turn as { id?: string; status?: string; error?: { message?: string } | null } | undefined;
      const turnId = turn?.id ?? "";
      const error = turn?.error?.message;
      const result: CodexAppServerTurnResult = {
        exitCode: turn?.status === "completed" ? 0 : 1,
        lastMessage: this.agentMessage.trim(),
        threadId,
        turnId,
        error
      };
      this.completedTurns.set(`${threadId}:${turnId}`, result);
      this.turnWaiters.get(`${threadId}:${turnId}`)?.resolve(result);
      this.turnWaiters.delete(`${threadId}:${turnId}`);
      this.log(`\n[app-server] turn ${turnId} ${turn?.status ?? "completed"}\n`);
      return;
    }

    if (message.method === "error") {
      const error = (message.params?.error as { message?: string } | undefined)?.message ?? "codex app-server error";
      this.log(`\n[app-server] ${error}\n`);
      return;
    }

    if (message.method.startsWith("thread/") || message.method.startsWith("turn/")) {
      this.log(`[app-server] ${message.method}\n`);
    }
  }

  private log(text: string): void {
    this.logStream.write(text);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    for (const waiter of this.turnWaiters.values()) {
      waiter.reject(error);
    }
    this.turnWaiters.clear();
  }
}

function errorMessage(error: { message?: string } | string): string {
  return typeof error === "string" ? error : error.message ?? "codex app-server request failed.";
}
