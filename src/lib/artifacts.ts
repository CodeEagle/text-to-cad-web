import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { getJobsRoot } from "./paths";

export type ArtifactKind = "cad" | "image" | "mesh" | "source" | "log" | "other";

export type Artifact = {
  name: string;
  path: string;
  size: number;
  kind: ArtifactKind;
  downloadUrl: string;
  hasAnimation?: boolean;
};

const CAD_EXTENSIONS = new Set([".step", ".stp", ".stl", ".3mf", ".dxf", ".urdf", ".srdf", ".sdf"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const MESH_EXTENSIONS = new Set([".glb", ".gltf", ".obj"]);
const SOURCE_EXTENSIONS = new Set([".py", ".js", ".ts", ".json", ".yaml", ".yml", ".md", ".txt"]);
const LOG_EXTENSIONS = new Set([".log"]);

function assertSafeJobId(jobId: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(jobId)) {
    throw new Error("Invalid job id");
  }
}

export function getOutputsDir(dataRoot: string, jobId: string): string {
  assertSafeJobId(jobId);
  return path.join(getJobsRoot(dataRoot), jobId, "outputs");
}

export function resolveArtifactPath(dataRoot: string, jobId: string, artifactPath: string): string {
  if (!artifactPath || path.isAbsolute(artifactPath)) {
    throw new Error("Invalid artifact path");
  }

  const outputsDir = path.resolve(getOutputsDir(dataRoot, jobId));
  const target = path.resolve(outputsDir, artifactPath);

  if (target !== outputsDir && !target.startsWith(`${outputsDir}${path.sep}`)) {
    throw new Error("Invalid artifact path");
  }

  return target;
}

export function getArtifactKind(filePath: string): ArtifactKind {
  const ext = path.extname(filePath).toLowerCase();
  if (CAD_EXTENSIONS.has(ext)) return "cad";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (MESH_EXTENSIONS.has(ext)) return "mesh";
  if (LOG_EXTENSIONS.has(ext)) return "log";
  if (SOURCE_EXTENSIONS.has(ext)) return "source";
  return "other";
}

export async function listArtifactsForJob(dataRoot: string, jobId: string): Promise<Artifact[]> {
  const outputsDir = getOutputsDir(dataRoot, jobId);
  const files = await walk(outputsDir);
  const relativePaths = files.map((file) => path.relative(outputsDir, file.path).split(path.sep).join("/"));
  const relativePathSet = new Set(relativePaths);

  const artifacts = await Promise.all(
    files.map(async (file): Promise<Artifact | null> => {
      const relativePath = path.relative(outputsDir, file.path).split(path.sep).join("/");
      if (isInternalArtifactPath(relativePath)) {
        return null;
      }
      const hasAnimation = await hasStepAnimationSidecar(outputsDir, relativePath, relativePathSet);
      const artifact: Artifact = {
        name: path.basename(file.path),
        path: relativePath,
        size: file.size,
        kind: getArtifactKind(file.path),
        downloadUrl: `/api/artifacts/${encodeURIComponent(jobId)}/${relativePath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`
      };
      if (hasAnimation) {
        artifact.hasAnimation = true;
      }
      return artifact;
    })
  );

  return artifacts
    .filter((artifact): artifact is Artifact => Boolean(artifact))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function isInternalArtifactPath(relativePath: string): boolean {
  return relativePath
    .split("/")
    .some(
      (part) =>
        part === ".preview" ||
        part.endsWith("-viewer-meshes") ||
        /\.viewer\.(urdf|sdf)$/i.test(part) ||
        /^\..+\.(step|stp)(\.(glb|js))?$/i.test(part)
    );
}

async function hasStepAnimationSidecar(
  outputsDir: string,
  relativePath: string,
  relativePathSet: Set<string>
): Promise<boolean> {
  const ext = path.posix.extname(relativePath).toLowerCase();
  if (ext !== ".step" && ext !== ".stp") {
    return false;
  }

  const directory = path.posix.dirname(relativePath);
  const stem = path.posix.basename(relativePath, ext);
  const sidecarRelativePath = path.posix.join(directory === "." ? "" : directory, `.${stem}.step.js`);
  if (!relativePathSet.has(sidecarRelativePath)) {
    return false;
  }

  try {
    const source = await readFile(path.join(outputsDir, ...sidecarRelativePath.split("/")), "utf8");
    return stepModuleSourceHasAnimation(source);
  } catch {
    return false;
  }
}

function stepModuleSourceHasAnimation(source: string): boolean {
  return (
    /(?:^|[,{]\s*)animations\s*:\s*(?!\{\s*\})(?!\[\s*\])/m.test(source) ||
    /["']animations["']\s*:\s*(?!\{\s*\})(?!\[\s*\])/m.test(source)
  );
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
