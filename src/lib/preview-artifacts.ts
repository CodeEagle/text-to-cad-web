import type { ArtifactKind } from "./artifacts";

export type PreviewArtifact = {
  name: string;
  path: string;
  size: number;
  kind: ArtifactKind;
  downloadUrl: string;
  hasAnimation?: boolean;
};

const KIND_PRIORITY: Record<PreviewArtifact["kind"], number> = {
  image: 0,
  cad: 1,
  mesh: 1,
  source: 3,
  log: 4,
  other: 5
};

const EXTENSION_PRIORITY = new Map([
  [".step", 0],
  [".stp", 0],
  [".urdf", 1],
  [".srdf", 1],
  [".sdf", 1],
  [".3mf", 1],
  [".stl", 2],
  [".dxf", 3],
  [".glb", 4],
  [".gltf", 4],
  [".obj", 5]
]);

export function selectPreviewArtifact(
  artifacts: PreviewArtifact[] | undefined
): PreviewArtifact | undefined {
  const sourceArtifacts = artifacts ?? [];
  const animatedStepArtifact = [...sourceArtifacts]
    .filter((artifact) => artifact.hasAnimation && isStepArtifact(artifact.path))
    .sort((a, b) => a.path.localeCompare(b.path))[0];
  if (animatedStepArtifact) {
    return animatedStepArtifact;
  }

  const urdfArtifact = [...sourceArtifacts]
    .filter((artifact) => extensionForPath(artifact.path) === ".urdf")
    .sort((a, b) => a.path.localeCompare(b.path))[0];
  if (urdfArtifact) {
    return urdfArtifact;
  }

  return [...sourceArtifacts].sort((a, b) => {
    const kindDiff = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    return kindDiff || extensionPriority(a.path) - extensionPriority(b.path) || a.path.localeCompare(b.path);
  })[0];
}

function extensionForPath(filePath: string): string {
  return filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
}

function isStepArtifact(filePath: string): boolean {
  const extension = extensionForPath(filePath);
  return extension === ".step" || extension === ".stp";
}

function extensionPriority(filePath: string): number {
  const extension = extensionForPath(filePath);
  return EXTENSION_PRIORITY.get(extension) ?? 99;
}
