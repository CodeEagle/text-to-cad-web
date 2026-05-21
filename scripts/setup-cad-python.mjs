#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const dataRoot = process.env.TEXT_TO_CAD_DATA_DIR
  ? path.resolve(process.env.TEXT_TO_CAD_DATA_DIR)
  : path.join(projectRoot, "var");
const venvDir = process.env.TEXT_TO_CAD_PYTHON_VENV
  ? path.resolve(process.env.TEXT_TO_CAD_PYTHON_VENV)
  : path.join(os.homedir(), ".cache", "text-to-cad-web", "cad-python");
const pythonVersion = process.env.TEXT_TO_CAD_PYTHON_VERSION || "3.12";
const requirementsPath = path.join(projectRoot, "vendor", "text-to-cad-skills", "cad", "requirements.txt");
const pythonPath = process.platform === "win32"
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");
const requiredModules = ["build123d", "ezdxf", "numpy", "trimesh", "vtk", "OCP"];

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  return spawnSync(probe, [command], { stdio: "ignore" }).status === 0;
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
    ...options
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function missingModules() {
  if (!existsSync(pythonPath)) {
    return requiredModules;
  }
  const probe = requiredModules
    .map((name) => `import ${name}`)
    .join("\\n");
  const result = spawnSync(pythonPath, ["-c", probe], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (result.status === 0) {
    return [];
  }

  const missing = [];
  for (const name of requiredModules) {
    const single = spawnSync(pythonPath, ["-c", `import ${name}`], {
      cwd: projectRoot,
      encoding: "utf8"
    });
    if (single.status !== 0) {
      missing.push(name);
    }
  }
  return missing;
}

if (!existsSync(requirementsPath)) {
  console.error(`CAD requirements file is missing: ${requirementsPath}`);
  process.exit(1);
}

const before = missingModules();
if (before.length === 0) {
  console.log(`CAD Python dependencies are already installed in ${venvDir}`);
  process.exit(0);
}

console.log(`Installing CAD Python dependencies into ${venvDir}`);
console.log(`Missing modules: ${before.join(", ")}`);

if (commandExists("uv")) {
  run("uv", ["python", "install", pythonVersion]);
  run("uv", ["venv", "--python", pythonVersion, venvDir]);
  run("uv", ["pip", "install", "--python", pythonPath, "-r", requirementsPath]);
} else {
  const bootstrapPython = process.env.PYTHON || process.env.PYTHON3 || "python3";
  run(bootstrapPython, ["-m", "venv", venvDir]);
  run(pythonPath, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(pythonPath, ["-m", "pip", "install", "-r", requirementsPath]);
}

const after = missingModules();
if (after.length > 0) {
  console.error(`CAD Python setup finished but modules are still missing: ${after.join(", ")}`);
  process.exit(1);
}

console.log("CAD Python dependencies installed.");
