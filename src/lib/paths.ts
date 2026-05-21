import path from "node:path";
import os from "node:os";

export function getDataRoot(): string {
  if (process.env.TEXT_TO_CAD_DATA_DIR) {
    return path.resolve(process.env.TEXT_TO_CAD_DATA_DIR);
  }
  return path.join(process.cwd(), "var");
}

export function getCodexHome(dataRoot = getDataRoot()): string {
  return path.join(dataRoot, "codex-home");
}

export function getJobsRoot(dataRoot = getDataRoot()): string {
  return path.join(dataRoot, "jobs");
}

export function getResourcesRoot(dataRoot = getDataRoot()): string {
  return path.join(dataRoot, "resources");
}

export function getTextToCadSkillsResourceDir(dataRoot = getDataRoot()): string {
  return path.join(getResourcesRoot(dataRoot), "text-to-cad-skills");
}

export function getTextToCadReferenceResourceDir(dataRoot = getDataRoot()): string {
  return path.join(getResourcesRoot(dataRoot), "text-to-cad-reference");
}

export function getTextToCadResourceMetadataPath(dataRoot = getDataRoot()): string {
  return path.join(getResourcesRoot(dataRoot), "text-to-cad-resources.json");
}

export function getCodexBin(): string {
  return process.env.CODEX_BIN || "codex";
}

export function getCadPythonVenvDir(dataRoot = getDataRoot()): string {
  if (process.env.TEXT_TO_CAD_PYTHON_VENV) {
    return path.resolve(process.env.TEXT_TO_CAD_PYTHON_VENV);
  }
  void dataRoot;
  return path.join(os.homedir(), ".cache", "text-to-cad-web", "cad-python");
}

export function getCadPythonBin(dataRoot = getDataRoot()): string {
  if (process.env.TEXT_TO_CAD_PYTHON) {
    return path.resolve(process.env.TEXT_TO_CAD_PYTHON);
  }
  const binaryName = process.platform === "win32" ? "python.exe" : "python";
  const binDir = process.platform === "win32" ? "Scripts" : "bin";
  return path.join(getCadPythonVenvDir(dataRoot), binDir, binaryName);
}

export function getCadPythonBinDir(dataRoot = getDataRoot()): string {
  return path.dirname(getCadPythonBin(dataRoot));
}

export function getCodexEnv(dataRoot = getDataRoot()): NodeJS.ProcessEnv {
  const cadPythonBinDir = getCadPythonBinDir(dataRoot);
  const pathValue = process.env.PATH
    ? `${cadPythonBinDir}${path.delimiter}${process.env.PATH}`
    : cadPythonBinDir;

  return {
    ...process.env,
    CODEX_HOME: getCodexHome(dataRoot),
    HOME: dataRoot,
    XDG_CACHE_HOME: path.join(dataRoot, "cache"),
    PATH: pathValue,
    TEXT_TO_CAD_PYTHON: getCadPythonBin(dataRoot),
    VIRTUAL_ENV: getCadPythonVenvDir(dataRoot),
    CI: "1"
  };
}
