import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { listArtifactsForJob, type Artifact } from "./artifacts";
import { ensureCadPythonEnvironment } from "./cad-python";
import { runCodexAppServerTurn } from "./codex-app-server";
import {
  DEFAULT_CAD_SKILL_ID,
  cadSkillInstruction,
  cadSkillLabel,
  isCadSkillId,
  type CadSkillId
} from "./cad-skills";
import { resolveCadSkillsSourceDir, seedBundledCadSkills } from "./cad-skill-seed";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
  isCodexModel,
  isCodexReasoningEffort,
  type CodexModel,
  type CodexReasoningEffort
} from "./codex-settings";
import { PROMPT_EXAMPLES } from "./examples";
import { getCodexHome, getDataRoot, getJobsRoot, getTextToCadReferenceResourceDir } from "./paths";
import { repairStepPreviewArtifactsForJob } from "./step-preview-repair";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type JobRunner = "codex-app-server";
export type JobMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  jobId?: string;
};

export type JobRecord = {
  id: string;
  title: string;
  prompt: string;
  messages?: JobMessage[];
  runner?: JobRunner;
  skillId?: CadSkillId;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
  exampleId?: string;
  parentJobId?: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  error?: string;
  artifactCount: number;
  artifacts?: Artifact[];
  logTail?: string;
};

export type CreateJobInput = {
  prompt: string;
  title?: string;
  exampleId?: string;
  parentJobId?: string;
  messages?: JobMessage[];
  skillId?: string;
  model?: string;
  reasoningEffort?: string;
};

const activeJobs = new Map<string, true>();
const DETACHED_JOB_GRACE_MS = 5 * 60 * 1000;

export async function createCadJob(input: CreateJobInput): Promise<JobRecord> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error("请输入任务描述。");
  }
  const skillId = parseCadSkillId(input.skillId);
  const model = parseCodexModel(input.model);
  const reasoningEffort = parseCodexReasoningEffort(input.reasoningEffort);

  const dataRoot = getDataRoot();
  const id = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${slugify(
    input.title || prompt
  )}-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const messages = [
    ...normalizeMessages(input.messages),
    createJobMessage({
      role: "user",
      content: prompt,
      createdAt: now,
      jobId: id
    })
  ];
  const job: JobRecord = {
    id,
    title: input.title?.trim() || prompt.split(/\s+/).slice(0, 8).join(" "),
    prompt,
    messages,
    runner: "codex-app-server",
    skillId,
    model,
    reasoningEffort,
    exampleId: input.exampleId,
    parentJobId: input.parentJobId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    artifactCount: 0
  };

  await mkdir(getJobDir(dataRoot, id), { recursive: true });
  await mkdir(path.join(getJobDir(dataRoot, id), "outputs"), { recursive: true });
  await mkdir(getCodexHome(), { recursive: true });
  await seedBundledCadSkills();
  await writeFile(path.join(getJobDir(dataRoot, id), "prompt.md"), prompt);
  await prepareTextToCadReferenceInputs(dataRoot, id, input.exampleId);
  if (input.parentJobId) {
    await prepareFollowUpInputs(dataRoot, id, input.parentJobId);
  }
  await writeJob(dataRoot, job);

  void startCodexJob(dataRoot, job).catch(async (error: unknown) => {
    await updateJob(dataRoot, id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString()
    });
  });

  return getJob(dataRoot, id);
}

export async function listJobs(dataRoot = getDataRoot()): Promise<JobRecord[]> {
  const root = getJobsRoot(dataRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await getJob(dataRoot, entry.name);
        } catch {
          return null;
        }
      })
  );

  return jobs
    .filter((job): job is JobRecord => Boolean(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getJob(dataRoot: string, id: string): Promise<JobRecord> {
  assertSafeJobId(id);
  const job = JSON.parse(await readFile(getJobRecordPath(dataRoot, id), "utf8")) as JobRecord;
  await repairFinalJobArtifacts(dataRoot, job);
  let artifacts = await listArtifactsForJob(dataRoot, id);
  const logTail = await readLogTail(dataRoot, id);
  const reconciledJob = await reconcileDetachedJob(dataRoot, job, artifacts);
  if (reconciledJob.status !== job.status) {
    await repairFinalJobArtifacts(dataRoot, reconciledJob);
    artifacts = await listArtifactsForJob(dataRoot, id);
  }
  return {
    ...reconciledJob,
    artifactCount: artifacts.length,
    artifacts,
    logTail
  };
}

export async function deleteJob(dataRoot: string, id: string): Promise<void> {
  assertSafeJobId(id);
  const job = await readJob(dataRoot, id);
  if (activeJobs.has(id) || job.status === "queued" || job.status === "running") {
    throw new Error("Job is still running.");
  }
  await rm(getJobDir(dataRoot, id), { recursive: true, force: true });
}

async function startCodexJob(dataRoot: string, job: JobRecord): Promise<void> {
  if (activeJobs.has(job.id)) {
    return;
  }
  activeJobs.set(job.id, true);

  await updateJob(dataRoot, job.id, { status: "running" });

  const jobDir = getJobDir(dataRoot, job.id);
  const logPath = path.join(jobDir, "codex.log");
  const lastMessagePath = path.join(jobDir, "last-message.md");
  const logStream = createWriteStream(logPath, { flags: "a" });

  try {
    logStream.write(`[settings] model=${job.model ?? DEFAULT_CODEX_MODEL} effort=${job.reasoningEffort ?? DEFAULT_CODEX_REASONING_EFFORT}\n`);
    await ensureCadPythonEnvironment({ dataRoot, logStream });
    const result = await runCodexAppServerTurn({
      cwd: jobDir,
      prompt: buildAgentPrompt(job),
      logStream,
      model: job.model ?? DEFAULT_CODEX_MODEL,
      reasoningEffort: job.reasoningEffort ?? DEFAULT_CODEX_REASONING_EFFORT
    });
    await repairStepPreviewArtifactsForJob({ dataRoot, jobId: job.id, logStream });
    const artifacts = await listArtifactsForJob(dataRoot, job.id);
    const finalMessage = finalAssistantMessage(result.lastMessage, artifacts.length, result.error);
    await writeFile(lastMessagePath, `${finalMessage}\n`);
    await updateJob(dataRoot, job.id, {
      status: result.exitCode === 0 ? "succeeded" : "failed",
      exitCode: result.exitCode,
      artifactCount: artifacts.length,
      finishedAt: new Date().toISOString(),
      error: result.exitCode === 0 ? undefined : result.error ?? "codex app-server turn failed",
      messages: appendAssistantMessage(job.messages, finalMessage, job.id)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(dataRoot, job.id, {
      status: "failed",
      error: message,
      finishedAt: new Date().toISOString(),
      messages: appendAssistantMessage(job.messages, `生成失败：${message}`, job.id)
    });
    return;
  } finally {
    activeJobs.delete(job.id);
    logStream.end();
  }
}

export function buildAgentPrompt(job: JobRecord): string {
  const skillId = job.skillId ?? DEFAULT_CAD_SKILL_ID;
  const example = job.exampleId
    ? PROMPT_EXAMPLES.find((candidate) => candidate.id === job.exampleId)
    : undefined;
  const selectedSkill = `
Selected CAD Skill:
- id: ${skillId}
- label: ${cadSkillLabel(skillId)}
- instruction: ${cadSkillInstruction(skillId)}

Prioritize the selected skill workflow above. Use related bundled CAD Skills only when needed to complete the user's requested output.
`;
  const followUpContext = job.parentJobId
    ? `
This is a follow-up edit to a previous CAD job.

Previous job context:
- Previous prompt: ./inputs/previous-job/prompt.md
- Previous generated files: ./inputs/previous-job/outputs

Use the previous generated files as the starting point. Preserve useful source files, apply the user's requested change, regenerate the relevant CAD exports, and write the new final files under ./outputs.
`
    : "";
  const exampleReferenceContext = example
    ? `
Official upstream example reference:
- Example id: ${example.id}
- Example title: ${example.title}
- Reference manifest: ./inputs/text-to-cad-reference/manifest.md
- Bundled preview image: ./inputs/text-to-cad-reference/preview
- Upstream reference files: ./inputs/text-to-cad-reference/upstream

Treat the upstream reference files and preview image as the target for this example. Do not replace an official demo target with a different simpler model, topology, robot, mesh strategy, or simulator construct just because it is easier to generate. If the exact upstream source artifact is not present in the reference inputs, create the closest faithful reproduction using the selected skill workflow and state the gap in ./outputs/README.md.
`
    : "";

  const conversationContext = formatConversation(job);

  return `You are running inside Text-to-CAD Web, a server-side workbench for earthtojake/text-to-cad.

${selectedSkill}
${conversationContext}
${followUpContext}
${exampleReferenceContext}

Use the locally installed CAD Skills workflow when available. If CAD Skills are unavailable, generate reproducible source and artifact files directly with local tools.

Hard requirements:
- Work only inside the current directory.
- Put every final user-facing file under ./outputs.
- Treat the installed earthtojake/text-to-cad skills as the source of truth. Do not rewrite the skill workflow, rename generated formats, or invent incompatible geometry/mesh conventions unless the user explicitly asks for a different design.
- For SRDF tasks, SRDF must sit on top of an existing matching URDF; generate or reuse the matching URDF package first, keep physical geometry in URDF/meshes, and do not create unrelated robot geometry for a semantic-planning demo.
- For SDF and URDF tasks, keep the generated link/joint topology and visual/collision mesh strategy aligned with the selected skill references and the example preview. Simulator-only plugins or unsupported joint semantics must be documented separately from CAD Explorer previewable geometry.
- Prefer source-controlled CAD source plus STEP/STL/3MF/GLB/DXF exports when appropriate.
- For mechanical assemblies, linkages, gears, robots, or any model with intended motion, create a CAD Explorer STEP runtime sidecar next to the STEP file named .<step-stem>.step.js. The sidecar must export a schemaVersion 1 manifest with parameters and animations, target stable CAD feature refs, and drive viewer-time transforms without pretending to regenerate CAD geometry.
- Add ./outputs/README.md describing what was generated and how to inspect it.
- Do not ask follow-up questions and do not require manual terminal input.
- Do not run network installation commands. Runtime jobs must work with local tools only.
- Keep generated filenames short and descriptive.`;
}

async function reconcileDetachedJob(
  dataRoot: string,
  job: JobRecord,
  artifacts: Artifact[]
): Promise<JobRecord> {
  if ((job.status !== "running" && job.status !== "queued") || activeJobs.has(job.id)) {
    return job;
  }

  const updatedAt = Date.parse(job.updatedAt);
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt < DETACHED_JOB_GRACE_MS) {
    return job;
  }

  const status: JobStatus = artifacts.length > 0 ? "succeeded" : "failed";
  const patch: Partial<Omit<JobRecord, "id" | "createdAt">> = {
    status,
    finishedAt: new Date().toISOString(),
    artifactCount: artifacts.length,
    error: status === "failed" ? "Job stopped before producing artifacts." : undefined
  };
  await updateJob(dataRoot, job.id, patch);
  return {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

async function repairFinalJobArtifacts(dataRoot: string, job: JobRecord): Promise<void> {
  if (job.status !== "succeeded" && job.status !== "failed") {
    return;
  }
  try {
    await repairStepPreviewArtifactsForJob({ dataRoot, jobId: job.id });
  } catch {
    // Artifact repair is opportunistic on read; generation logs capture repair failures.
  }
}

async function updateJob(
  dataRoot: string,
  id: string,
  patch: Partial<Omit<JobRecord, "id" | "createdAt">>
): Promise<void> {
  const current = await readJob(dataRoot, id);
  await writeJob(dataRoot, {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

async function readJob(dataRoot: string, id: string): Promise<JobRecord> {
  return JSON.parse(await readFile(getJobRecordPath(dataRoot, id), "utf8")) as JobRecord;
}

async function writeJob(dataRoot: string, job: JobRecord): Promise<void> {
  await writeFile(getJobRecordPath(dataRoot, job.id), `${JSON.stringify(job, null, 2)}\n`);
}

function getJobDir(dataRoot: string, id: string): string {
  assertSafeJobId(id);
  return path.join(getJobsRoot(dataRoot), id);
}

function getJobRecordPath(dataRoot: string, id: string): string {
  return path.join(getJobDir(dataRoot, id), "job.json");
}

async function prepareFollowUpInputs(dataRoot: string, jobId: string, parentJobId: string): Promise<void> {
  assertSafeJobId(parentJobId);
  const parentJob = await readJob(dataRoot, parentJobId);
  const inputDir = path.join(getJobDir(dataRoot, jobId), "inputs", "previous-job");
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(inputDir, "prompt.md"), parentJob.prompt);
  await cp(path.join(getJobDir(dataRoot, parentJobId), "outputs"), path.join(inputDir, "outputs"), {
    recursive: true,
    force: true,
    errorOnExist: false
  });
}

async function prepareTextToCadReferenceInputs(
  dataRoot: string,
  jobId: string,
  exampleId: string | undefined
): Promise<void> {
  if (!exampleId) {
    return;
  }

  const example = PROMPT_EXAMPLES.find((candidate) => candidate.id === exampleId);
  if (!example) {
    return;
  }

  const inputDir = path.join(getJobDir(dataRoot, jobId), "inputs", "text-to-cad-reference");
  const previewDir = path.join(inputDir, "preview");
  const upstreamDir = path.join(inputDir, "upstream");
  const copiedPreviewPaths: string[] = [];
  const copiedReferencePaths: string[] = [];

  await mkdir(inputDir, { recursive: true });

  if (example.previewImage) {
    const previewSource = path.join(process.cwd(), "public", example.previewImage.slice(1));
    const previewTarget = path.join(previewDir, path.basename(example.previewImage));
    if (await copyIfExists(previewSource, previewTarget)) {
      copiedPreviewPaths.push(path.relative(inputDir, previewTarget));
    }
  }

  const referenceRoot = getTextToCadReferenceResourceDir(dataRoot);
  const skillsSource = await resolveCadSkillsSourceDir({ dataRoot });
  for (const relativePath of example.upstreamReferencePaths ?? []) {
    const targetPath = path.join(upstreamDir, relativePath);
    const copied =
      (await copyIfExists(path.join(referenceRoot, relativePath), targetPath)) ||
      (relativePath.startsWith("skills/")
        ? await copyIfExists(path.join(skillsSource.dir, relativePath.replace(/^skills\//, "")), targetPath)
        : false);
    if (copied) {
      copiedReferencePaths.push(path.relative(inputDir, targetPath));
    }
  }

  const manifest = [
    "# Official Text-to-CAD Reference",
    "",
    `Example id: ${example.id}`,
    `Example title: ${example.title}`,
    `Selected skill: ${example.skillId}`,
    "",
    "Use these files as upstream reference material for this generated job. The UI preview image is an official demo/benchmark visual target, not decorative art.",
    "",
    "Copied preview images:",
    ...formatManifestList(copiedPreviewPaths),
    "",
    "Copied upstream reference files:",
    ...formatManifestList(copiedReferencePaths),
    "",
    "If an exact official source artifact is not included here, reproduce the closest faithful target using the installed skill workflow and document that gap in ./outputs/README.md."
  ].join("\n");

  await writeFile(path.join(inputDir, "manifest.md"), `${manifest}\n`);
}

async function readLogTail(dataRoot: string, id: string): Promise<string> {
  try {
    const log = await readFile(path.join(getJobDir(dataRoot, id), "codex.log"), "utf8");
    return log.slice(-6000);
  } catch {
    return "";
  }
}

async function copyIfExists(sourcePath: string, targetPath: string): Promise<boolean> {
  try {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, {
      recursive: true,
      errorOnExist: false,
      force: true
    });
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: string }).code === "ENOENT" || (error as { code?: string }).code === "ENOTDIR")
  );
}

function formatManifestList(paths: string[]): string[] {
  return paths.length ? paths.map((item) => `- ${item}`) : ["- none copied"];
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "cad-model";
}

function assertSafeJobId(id: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new Error("Invalid job id");
  }
}

function normalizeMessages(messages: JobMessage[] | undefined): JobMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) =>
      createJobMessage({
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        jobId: message.jobId,
        id: message.id
      })
    )
    .filter((message) => message.content.length > 0);
}

function createJobMessage({
  id,
  role,
  content,
  createdAt,
  jobId
}: {
  id?: string;
  role: JobMessage["role"];
  content: string;
  createdAt: string;
  jobId?: string;
}): JobMessage {
  return {
    id: id || randomUUID(),
    role,
    content: content.trim(),
    createdAt,
    jobId
  };
}

function appendAssistantMessage(
  messages: JobMessage[] | undefined,
  content: string,
  jobId: string
): JobMessage[] {
  return [
    ...normalizeMessages(messages),
    createJobMessage({
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
      jobId
    })
  ];
}

function parseCadSkillId(value: string | undefined): CadSkillId {
  if (value === undefined || value === "") {
    return DEFAULT_CAD_SKILL_ID;
  }
  if (!isCadSkillId(value)) {
    throw new Error("不支持这个 CAD Skill。");
  }
  return value;
}

function parseCodexModel(value: string | undefined): CodexModel {
  if (value === undefined || value === "") {
    return DEFAULT_CODEX_MODEL;
  }
  if (!isCodexModel(value)) {
    throw new Error("不支持这个 Codex 模型。");
  }
  return value;
}

function parseCodexReasoningEffort(value: string | undefined): CodexReasoningEffort {
  if (value === undefined || value === "") {
    return DEFAULT_CODEX_REASONING_EFFORT;
  }
  if (!isCodexReasoningEffort(value)) {
    throw new Error("不支持这个推理强度。");
  }
  return value;
}

function finalAssistantMessage(lastMessage: string, artifactCount: number, error?: string): string {
  const trimmed = lastMessage.trim();
  if (trimmed) {
    return trimmed;
  }
  if (error) {
    return `生成失败：${error}`;
  }
  return `已生成 ${artifactCount} 个成品文件。`;
}

function formatConversation(job: JobRecord): string {
  const messages = normalizeMessages(job.messages);
  if (!messages.length) {
    return `Task:\n${job.prompt}`;
  }

  const transcript = messages
    .map((message) => `${message.role === "user" ? "User" : "Codex"}: ${message.content}`)
    .join("\n\n");

  return `Conversation so far:
${transcript}

Current user request:
${job.prompt}`;
}
