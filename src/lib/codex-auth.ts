import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

import { parseDeviceAuthOutput, type DeviceAuthDetails } from "./codex-output";
import { getCodexBin, getCodexEnv, getCodexHome } from "./paths";

type ActiveLogin = {
  child: ChildProcess;
  details?: DeviceAuthDetails;
  error?: string;
  exited: boolean;
  rawOutput: string;
  startedAt: string;
  waiters: Array<(login: ActiveLogin) => void>;
};

export type DeviceLoginResponse = DeviceAuthDetails & {
  rawOutput: string;
  startedAt: string;
};

export type DeviceLoginStartResponse =
  | (DeviceLoginResponse & { pending: false })
  | {
      pending: true;
      rawOutput: string;
      startedAt: string;
      error?: string;
    };

export type AuthStatus = {
  available: boolean;
  loggedIn: boolean;
  output: string;
  activeDeviceLogin: DeviceLoginResponse | null;
  pendingDeviceLogin: boolean;
  deviceLoginError?: string;
};

export type LogoutResponse = {
  available: boolean;
  output: string;
};

let activeLogin: ActiveLogin | null = null;

export async function startDeviceLogin(options: { forceNew?: boolean } = {}): Promise<DeviceLoginStartResponse> {
  const login = await ensureDeviceLogin(options.forceNew ?? false);
  const readyLogin = login.details ? login : await waitForDeviceDetails(login, 8_000);

  if (readyLogin.details) {
    return {
      ...readyLogin.details,
      pending: false,
      rawOutput: readyLogin.rawOutput,
      startedAt: readyLogin.startedAt
    };
  }

  return {
    pending: true,
    rawOutput: readyLogin.rawOutput,
    startedAt: readyLogin.startedAt,
    error: readyLogin.error
  };
}

async function ensureDeviceLogin(forceNew: boolean): Promise<ActiveLogin> {
  if (activeLogin && !activeLogin.exited && !forceNew) {
    return activeLogin;
  }
  if (activeLogin && !activeLogin.exited && forceNew) {
    activeLogin.child.kill();
    activeLogin.exited = true;
    activeLogin.error = "Superseded by a newer device login request.";
    notifyWaiters(activeLogin);
    activeLogin = null;
  }

  await mkdir(getCodexHome(), { recursive: true });

  const child = spawn(getCodexBin(), ["login", "--device-auth"], {
    env: {
      ...getCodexEnv(),
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      TERM: "dumb"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const login: ActiveLogin = {
    child,
    exited: false,
    rawOutput: "",
    startedAt: new Date().toISOString(),
    waiters: []
  };
  activeLogin = login;

  const consume = (chunk: Buffer) => {
    login.rawOutput = `${login.rawOutput}${chunk.toString("utf8")}`.slice(-20_000);
    const details = parseDeviceAuthOutput(login.rawOutput);
    if (details) {
      login.details = details;
      notifyWaiters(login);
    }
  };

  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  child.on("error", (error) => {
    login.error = error.message;
    login.exited = true;
    notifyWaiters(login);
  });
  child.on("close", (code) => {
    login.exited = true;
    if (!login.details) {
      login.error = `codex login exited before printing a device code (exit ${code}).`;
      notifyWaiters(login);
    }
  });

  return login;
}

function waitForDeviceDetails(login: ActiveLogin, timeoutMs: number): Promise<ActiveLogin> {
  if (login.details || login.error || login.exited) {
    return Promise.resolve(login);
  }

  return new Promise((resolve) => {
    const waiter = (nextLogin: ActiveLogin) => {
      if (nextLogin.details || nextLogin.error || nextLogin.exited) {
        clearTimeout(timeout);
        resolve(nextLogin);
      }
    };
    const timeout = setTimeout(() => {
      login.waiters = login.waiters.filter((candidate) => candidate !== waiter);
      resolve(login);
    }, timeoutMs);
    login.waiters.push(waiter);
  });
}

function notifyWaiters(login: ActiveLogin): void {
  const waiters = login.waiters.splice(0);
  for (const waiter of waiters) {
    waiter(login);
  }
}

export async function getAuthStatus(): Promise<AuthStatus> {
  await mkdir(getCodexHome(), { recursive: true });

  const activeDeviceLogin =
    activeLogin?.details && !activeLogin.child.killed
      ? {
          ...activeLogin.details,
          rawOutput: activeLogin.rawOutput,
          startedAt: activeLogin.startedAt
        }
      : null;
  const pendingDeviceLogin = Boolean(activeLogin && !activeLogin.exited && !activeLogin.details);
  const deviceLoginError = activeLogin?.error;

  return new Promise((resolve) => {
    execFile(
      getCodexBin(),
      ["login", "status"],
      { env: getCodexEnv(), timeout: 10_000 },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        if (error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({
            available: false,
            loggedIn: false,
            output: "codex CLI was not found in PATH.",
            activeDeviceLogin,
            pendingDeviceLogin,
            deviceLoginError
          });
          return;
        }

        resolve({
          available: true,
          loggedIn: !error && /logged in/i.test(output),
          output: output || (error ? error.message : "Codex CLI returned no status output."),
          activeDeviceLogin,
          pendingDeviceLogin,
          deviceLoginError
        });
      }
    );
  });
}

export async function logoutCodex(): Promise<LogoutResponse> {
  if (activeLogin && !activeLogin.exited) {
    activeLogin.child.kill();
    activeLogin.exited = true;
    activeLogin.error = "Canceled because the user logged out.";
    notifyWaiters(activeLogin);
    activeLogin = null;
  }

  await mkdir(getCodexHome(), { recursive: true });

  return new Promise((resolve, reject) => {
    execFile(
      getCodexBin(),
      ["logout"],
      { env: getCodexEnv(), timeout: 10_000 },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        if (error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({
            available: false,
            output: "codex CLI was not found in PATH."
          });
          return;
        }

        if (error) {
          reject(new Error(output || error.message));
          return;
        }

        resolve({
          available: true,
          output: output || "Codex credentials were removed."
        });
      }
    );
  });
}
