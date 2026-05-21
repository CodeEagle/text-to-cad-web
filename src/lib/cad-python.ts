import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { WriteStream } from "node:fs";

import { getCadPythonBin, getCodexEnv, getDataRoot } from "./paths";

const execFileAsync = promisify(execFile);
const REQUIRED_CAD_PYTHON_MODULES = ["build123d", "ezdxf", "numpy", "trimesh", "vtk", "OCP"] as const;

let ensurePromise: Promise<void> | undefined;

export async function ensureCadPythonEnvironment({
  dataRoot = getDataRoot(),
  logStream
}: {
  dataRoot?: string;
  logStream?: WriteStream;
} = {}): Promise<void> {
  if (process.env.TEXT_TO_CAD_SKIP_CAD_PYTHON_SETUP === "1") {
    return;
  }

  ensurePromise ??= installCadPythonEnvironment({ dataRoot, logStream }).finally(() => {
    ensurePromise = undefined;
  });
  return ensurePromise;
}

export async function listMissingCadPythonModules(dataRoot = getDataRoot()): Promise<string[]> {
  const pythonPath = getCadPythonBin(dataRoot);
  try {
    await access(pythonPath);
  } catch {
    return [...REQUIRED_CAD_PYTHON_MODULES];
  }

  const missing: string[] = [];
  for (const moduleName of REQUIRED_CAD_PYTHON_MODULES) {
    try {
      await execFileAsync(pythonPath, ["-c", `import ${moduleName}`], {
        env: getCodexEnv(dataRoot),
        timeout: 30_000
      });
    } catch {
      missing.push(moduleName);
    }
  }
  return missing;
}

async function installCadPythonEnvironment({
  dataRoot,
  logStream
}: {
  dataRoot: string;
  logStream?: WriteStream;
}): Promise<void> {
  const missing = await listMissingCadPythonModules(dataRoot);
  if (missing.length === 0) {
    return;
  }

  logStream?.write(`[setup] installing CAD Python dependencies: ${missing.join(", ")}\n`);
  const scriptPath = path.join(process.cwd(), "scripts", "setup-cad-python.mjs");
  const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024 * 20,
    timeout: 15 * 60_000
  });
  if (stdout) {
    logStream?.write(stdout);
  }
  if (stderr) {
    logStream?.write(stderr);
  }

  const remaining = await listMissingCadPythonModules(dataRoot);
  if (remaining.length > 0) {
    throw new Error(`CAD Python dependencies are still missing: ${remaining.join(", ")}`);
  }
}
