import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { getOutputsDir, resolveArtifactPath } from "./artifacts";

type RepairSdfPreviewInput = {
  artifactPath: string;
  dataRoot: string;
  jobId: string;
};

const SDF_INTERACTIVE_JOINT_TYPES = new Set(["fixed", "continuous", "revolute", "prismatic"]);

export async function repairSdfPreviewArtifact({
  artifactPath,
  dataRoot,
  jobId
}: RepairSdfPreviewInput): Promise<string> {
  if (!/\.sdf$/i.test(artifactPath) || /\.viewer\.sdf$/i.test(artifactPath)) {
    return artifactPath;
  }

  const sourcePath = resolveArtifactPath(dataRoot, jobId, artifactPath);
  const source = await readFile(sourcePath, "utf8");
  const outputsDir = getOutputsDir(dataRoot, jobId);
  const sourceRelativeDir = path.posix.dirname(artifactPath);
  const sourceDir = sourceRelativeDir === "." ? "" : sourceRelativeDir;
  const baseName = path.posix.basename(artifactPath, ".sdf");
  const previewArtifactPath = path.posix.join(sourceDir, `${baseName}.viewer.sdf`);
  const previewAbsPath = path.join(outputsDir, ...previewArtifactPath.split("/"));

  if (!needsSdfPreviewRepair(source)) {
    await rm(previewAbsPath, { force: true });
    return artifactPath;
  }

  const repaired = rewriteStaticPreviewSdf(source);
  await mkdir(path.dirname(previewAbsPath), { recursive: true });
  await writeFile(previewAbsPath, repaired);
  return previewArtifactPath;
}

export function needsSdfPreviewRepair(source: string): boolean {
  return /<\s*plugin\b/i.test(source) || findStaticPreviewJointTypes(source).length > 0;
}

export function rewriteStaticPreviewSdf(source: string): string {
  return stripSimulatorPlugins(rewriteStaticPreviewJoints(source));
}

function stripSimulatorPlugins(source: string): string {
  return source.replace(/\n?[ \t]*<plugin\b[\s\S]*?<\/plugin>\s*/gi, "\n");
}

function rewriteStaticPreviewJoints(source: string): string {
  return source.replace(/<joint\b([^>]*)>/gi, (jointStartTag, rawAttrs) => {
    const type = readXmlAttribute(rawAttrs, "type").toLowerCase();
    if (!type || SDF_INTERACTIVE_JOINT_TYPES.has(type)) {
      return jointStartTag;
    }
    return jointStartTag.replace(/\btype\s*=\s*(["'])(.*?)\1/i, 'type="fixed"');
  });
}

function findStaticPreviewJointTypes(source: string): string[] {
  const types = new Set<string>();
  for (const match of source.matchAll(/<joint\b([^>]*)>/gi)) {
    const type = readXmlAttribute(match[1] ?? "", "type").toLowerCase();
    if (type && !SDF_INTERACTIVE_JOINT_TYPES.has(type)) {
      types.add(type);
    }
  }
  return [...types].sort();
}

function readXmlAttribute(source: string, name: string): string {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return String(match?.[1] ?? "").trim();
}
