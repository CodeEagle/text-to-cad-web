import { access, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const repoMediaBase = "https://media.githubusercontent.com/media/earthtojake/text-to-cad/main";
const outDir = path.join(process.cwd(), "public", "demo-previews");

const previews = [
  ["benchmark_01_rectangular_calibration_block.jpg", "benchmarks/benchmark_01_rectangular_calibration_block.gif"],
  ["benchmark_02_circular_flange.jpg", "benchmarks/benchmark_02_circular_flange.gif"],
  ["benchmark_03_l_bracket.jpg", "benchmarks/benchmark_03_l_bracket.gif"],
  ["benchmark_04_stepped_shaft_keyway.jpg", "benchmarks/benchmark_04_stepped_shaft_keyway.gif"],
  ["benchmark_05_open_top_electronics_enclosure.jpg", "benchmarks/benchmark_05_open_top_electronics_enclosure.gif"],
  ["benchmark_06_clevis_bracket_lightening_cutouts.jpg", "benchmarks/benchmark_06_clevis_bracket_lightening_cutouts.gif"],
  ["benchmark_07_radial_engine_cylinder.jpg", "benchmarks/benchmark_07_radial_engine_cylinder.gif"],
  ["benchmark_08_centrifugal_impeller.jpg", "benchmarks/benchmark_08_centrifugal_impeller.gif"],
  ["benchmark_09_spiral_staircase.jpg", "benchmarks/benchmark_09_spiral_staircase.gif"],
  ["benchmark_10_planetary_gear_stage.jpg", "benchmarks/benchmark_10_planetary_gear_stage.gif"],
  ["text-to-cad-demo.jpg", "assets/text-to-cad-demo.gif"],
  ["urdf-demo.jpg", "assets/urdf-demo.gif"],
  ["srdf-moveit2-demo.jpg", "assets/srdf-moveit2-demo.gif"]
];

await mkdir(outDir, { recursive: true });

for (const [outputName, sourcePath] of previews) {
  const sourceUrl = `${repoMediaBase}/${sourcePath}`;
  const outputPath = path.join(outDir, outputName);
  if (!process.argv.includes("--force") && (await exists(outputPath))) {
    console.log(`skipped ${path.relative(process.cwd(), outputPath)}`);
    continue;
  }
  await runWithRetry(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      sourceUrl,
      "-frames:v",
      "1",
      "-vf",
      "scale=248:184:force_original_aspect_ratio=increase,crop=248:184,setsar=1",
      "-q:v",
      "4",
      outputPath
    ],
    2
  );
  console.log(`wrote ${path.relative(process.cwd(), outputPath)}`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runWithRetry(command, args, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await run(command, args);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`retrying after ${error.message}`);
      }
    }
  }
  throw lastError;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}
