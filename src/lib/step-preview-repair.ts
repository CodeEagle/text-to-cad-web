import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { WriteStream } from "node:fs";

import { getOutputsDir } from "./artifacts";
import { ensureCadPythonEnvironment } from "./cad-python";
import { seedBundledCadSkills } from "./cad-skill-seed";
import { stepPreviewSidecarHasRenderableMesh, writeFacetedStepPreviewGlb } from "./faceted-step-glb";
import { getCadPythonBin, getCodexEnv, getCodexHome, getDataRoot } from "./paths";

const execFileAsync = promisify(execFile);
const STEP_EXTENSIONS = new Set([".step", ".stp"]);
const repairJobs = new Map<string, Promise<StepPreviewRepairResult>>();

export type MissingStepPreviewArtifact = {
  relativePath: string;
  sidecarRelativePath: string;
  reason?: "missing" | "meshless";
};

export type StepPreviewRepairResult = {
  attempted: number;
  repaired: number;
  failed: number;
};

export async function repairStepPreviewArtifactsForJob({
  dataRoot = getDataRoot(),
  jobId,
  logStream
}: {
  dataRoot?: string;
  jobId: string;
  logStream?: WriteStream;
}): Promise<StepPreviewRepairResult> {
  const key = `${dataRoot}:${jobId}`;
  const running = repairJobs.get(key);
  if (running) {
    return running;
  }

  const repair = repairStepPreviewArtifacts({ dataRoot, jobId, logStream }).finally(() => {
    repairJobs.delete(key);
  });
  repairJobs.set(key, repair);
  return repair;
}

export async function findMissingStepPreviewArtifacts(outputsDir: string): Promise<MissingStepPreviewArtifact[]> {
  const files = await walk(outputsDir);
  const relativePaths = files.map((file) => path.relative(outputsDir, file.path).split(path.sep).join("/"));
  const relativePathSet = new Set(relativePaths);
  const missing: MissingStepPreviewArtifact[] = [];

  for (const relativePath of relativePaths) {
    if (isInternalStepPreviewArtifact(relativePath)) {
      continue;
    }
    const ext = path.posix.extname(relativePath).toLowerCase();
    if (!STEP_EXTENSIONS.has(ext)) {
      continue;
    }
    const sidecarRelativePath = stepPreviewSidecarPath(relativePath);
    if (!relativePathSet.has(sidecarRelativePath)) {
      missing.push({ relativePath, sidecarRelativePath, reason: "missing" });
      continue;
    }
    const sidecarPath = path.join(outputsDir, ...sidecarRelativePath.split("/"));
    if (!(await stepPreviewSidecarHasRenderableMesh(sidecarPath))) {
      missing.push({ relativePath, sidecarRelativePath, reason: "meshless" });
    }
  }

  return missing;
}

export function isInternalStepPreviewArtifact(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  return normalized
    .split("/")
    .some((part) => /^\..+\.(step|stp)(\.glb)?$/i.test(part));
}

async function repairStepPreviewArtifacts({
  dataRoot,
  jobId,
  logStream
}: {
  dataRoot: string;
  jobId: string;
  logStream?: WriteStream;
}): Promise<StepPreviewRepairResult> {
  const outputsDir = getOutputsDir(dataRoot, jobId);
  const missing = await findMissingStepPreviewArtifacts(outputsDir);
  if (missing.length === 0) {
    return { attempted: 0, repaired: 0, failed: 0 };
  }

  await seedBundledCadSkills();
  await ensureCadPythonEnvironment({ dataRoot, logStream });

  let repaired = 0;
  let failed = 0;
  for (const artifact of missing) {
    try {
      await regenerateStepPreviewArtifact(outputsDir, artifact.relativePath, dataRoot);
      repaired += 1;
      logStream?.write(`[repair] generated STEP preview sidecar: ${artifact.sidecarRelativePath}\n`);
    } catch (error) {
      failed += 1;
      logStream?.write(
        `[repair] failed to generate STEP preview sidecar for ${artifact.relativePath}: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    }
  }

  return { attempted: missing.length, repaired, failed };
}

async function regenerateStepPreviewArtifact(
  outputsDir: string,
  relativePath: string,
  dataRoot: string
): Promise<void> {
  const stepScript = path.join(getCodexHome(dataRoot), "skills", "cad", "scripts", "step");
  try {
    await execStepRepair(stepScript, outputsDir, relativePath, dataRoot, "part");
  } catch (error) {
    try {
      await execStepRepair(stepScript, outputsDir, relativePath, dataRoot, "assembly");
    } catch {
      throw error;
    }
  }
}

async function execStepRepair(
  stepScript: string,
  outputsDir: string,
  relativePath: string,
  dataRoot: string,
  kind: "part" | "assembly"
): Promise<void> {
  const sidecarPath = path.join(outputsDir, ...stepPreviewSidecarPath(relativePath).split("/"));
  await execFileAsync(getCadPythonBin(dataRoot), [stepScript, "--kind", kind, relativePath], {
    cwd: outputsDir,
    env: getCodexEnv(dataRoot),
    maxBuffer: 1024 * 1024 * 20,
    timeout: 4 * 60_000
  });
  if (await stepPreviewSidecarHasRenderableMesh(sidecarPath)) {
    return;
  }
  await writeFacetedStepPreviewGlb({
    stepPath: path.join(outputsDir, ...relativePath.split("/")),
    glbPath: sidecarPath,
    kind
  });
}

function stepPreviewSidecarPath(relativePath: string): string {
  const directory = path.posix.dirname(relativePath);
  return `${directory === "." ? "" : `${directory}/`}.${path.posix.basename(relativePath)}.glb`;
}

async function walk(root: string): Promise<Array<{ path: string; size: number }>> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: Array<{ path: string; size: number }> = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const info = await stat(fullPath);
    files.push({ path: fullPath, size: info.size });
  }
  return files;
}
