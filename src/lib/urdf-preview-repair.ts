import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getOutputsDir, resolveArtifactPath } from "./artifacts";

type RepairUrdfPreviewInput = {
  artifactPath: string;
  dataRoot: string;
  jobId: string;
};

type PrimitiveGeometry =
  | { kind: "box"; size: [number, number, number] }
  | { kind: "cylinder"; length: number; radius: number }
  | { kind: "sphere"; radius: number };

export async function repairUrdfPreviewArtifact({
  artifactPath,
  dataRoot,
  jobId
}: RepairUrdfPreviewInput): Promise<string> {
  if (!/\.urdf$/i.test(artifactPath) || /\.viewer\.urdf$/i.test(artifactPath)) {
    return artifactPath;
  }

  const sourcePath = resolveArtifactPath(dataRoot, jobId, artifactPath);
  const source = await readFile(sourcePath, "utf8");
  if (!needsPrimitiveUrdfPreviewRepair(source)) {
    return artifactPath;
  }

  const outputsDir = getOutputsDir(dataRoot, jobId);
  const sourceRelativeDir = path.posix.dirname(artifactPath);
  const sourceDir = sourceRelativeDir === "." ? "" : sourceRelativeDir;
  const baseName = path.posix.basename(artifactPath, ".urdf");
  const previewDir = sourceDir;
  const meshDir = path.posix.join(sourceDir, `${baseName}-viewer-meshes`);
  const previewArtifactPath = path.posix.join(sourceDir, `${baseName}.viewer.urdf`);
  const previewDirAbs = path.join(outputsDir, ...previewDir.split("/").filter(Boolean));
  const meshDirAbs = path.join(outputsDir, ...meshDir.split("/").filter(Boolean));

  await mkdir(meshDirAbs, { recursive: true });

  let meshIndex = 0;
  const meshWrites: Promise<void>[] = [];
  const repaired = source.replace(/<link\b[^>]*\bname=["']([^"']+)["'][^>]*>[\s\S]*?<\/link>/g, (linkBlock, linkName) => {
    let visualIndex = 0;
    return linkBlock.replace(/<visual\b([^>]*)>[\s\S]*?<\/visual>/g, (visualBlock, visualAttrs) => {
      const geometryMatch = visualBlock.match(/<geometry\b[^>]*>[\s\S]*?<\/geometry>/);
      if (!geometryMatch || /<mesh\b/i.test(geometryMatch[0])) {
        visualIndex += 1;
        return visualBlock;
      }

      const primitive = parsePrimitiveGeometry(geometryMatch[0]);
      if (!primitive) {
        visualIndex += 1;
        return visualBlock;
      }

      const visualName = visualAttrs.match(/\bname=["']([^"']+)["']/)?.[1] || `visual_${visualIndex}`;
      const meshName = `${safeMeshName(linkName)}-${safeMeshName(visualName)}-${meshIndex}.stl`;
      const meshArtifactPath = path.posix.join(meshDir, meshName);
      const meshAbsPath = path.join(meshDirAbs, meshName);
      meshWrites.push(writeFile(meshAbsPath, primitiveToAsciiStl(primitive, `${linkName}_${visualName}`)));
      meshIndex += 1;
      visualIndex += 1;

      const meshFilename = relativePosixPath(previewDir, meshArtifactPath);
      return visualBlock.replace(
        geometryMatch[0],
        `<geometry>\n        <mesh filename="${meshFilename}" scale="1 1 1" />\n      </geometry>`
      );
    });
  });

  // Existing mesh paths are relative to the original URDF. Keep that basis
  // intact when only primitive visual geometry is rewritten to generated STL.
  const relocated = repaired.replace(/filename=["']([^"':]+)["']/g, (match, filename) => {
    if (filename.startsWith("/") || filename.startsWith("package://") || filename.startsWith("http://") || filename.startsWith("https://")) {
      return match;
    }
    if (filename.includes(`${baseName}-viewer-meshes/`)) {
      return match;
    }
    return `filename="${relativePosixPath(previewDir, path.posix.join(sourceDir, filename))}"`;
  });

  await mkdir(previewDirAbs, { recursive: true });
  await Promise.all(meshWrites);
  await writeFile(path.join(outputsDir, ...previewArtifactPath.split("/")), relocated);
  return previewArtifactPath;
}

function needsPrimitiveUrdfPreviewRepair(source: string): boolean {
  const visualBlocks = source.match(/<visual\b[^>]*>[\s\S]*?<\/visual>/gi) || [];
  return visualBlocks.some((visualBlock) => /<geometry\b[^>]*>[\s\S]*?<(box|cylinder|sphere)\b/i.test(visualBlock));
}

function parsePrimitiveGeometry(geometryBlock: string): PrimitiveGeometry | null {
  const boxSize = geometryBlock.match(/<box\b[^>]*\bsize=["']([^"']+)["'][^>]*\/?>/i)?.[1];
  if (boxSize) {
    return { kind: "box", size: parseNumbers(boxSize, 3, [1, 1, 1]) };
  }

  const cylinder = geometryBlock.match(/<cylinder\b([^>]*)\/?>/i)?.[1];
  if (cylinder) {
    return {
      kind: "cylinder",
      length: parsePositiveNumber(attribute(cylinder, "length"), 1),
      radius: parsePositiveNumber(attribute(cylinder, "radius"), 0.5)
    };
  }

  const sphere = geometryBlock.match(/<sphere\b([^>]*)\/?>/i)?.[1];
  if (sphere) {
    return { kind: "sphere", radius: parsePositiveNumber(attribute(sphere, "radius"), 0.5) };
  }

  return null;
}

function attribute(source: string, name: string): string | undefined {
  return source.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
}

function parseNumbers(value: string, count: number, fallback: number[]): [number, number, number] {
  const values = value
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));
  return Array.from({ length: count }, (_, index) => {
    const candidate = values[index];
    return Number.isFinite(candidate) && candidate > 0 ? candidate : fallback[index] ?? 1;
  }) as [number, number, number];
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function primitiveToAsciiStl(primitive: PrimitiveGeometry, name: string): string {
  if (primitive.kind === "box") {
    return trianglesToStl(name, boxTriangles(primitive.size));
  }
  if (primitive.kind === "cylinder") {
    return trianglesToStl(name, cylinderTriangles(primitive.radius, primitive.length));
  }
  return trianglesToStl(name, sphereTriangles(primitive.radius));
}

type Vec3 = [number, number, number];
type Triangle = [Vec3, Vec3, Vec3];

function boxTriangles([x, y, z]: [number, number, number]): Triangle[] {
  const hx = x / 2;
  const hy = y / 2;
  const hz = z / 2;
  const p: Record<string, Vec3> = {
    lbf: [-hx, -hy, -hz],
    rbf: [hx, -hy, -hz],
    rtf: [hx, hy, -hz],
    ltf: [-hx, hy, -hz],
    lbb: [-hx, -hy, hz],
    rbb: [hx, -hy, hz],
    rtb: [hx, hy, hz],
    ltb: [-hx, hy, hz]
  };
  return [
    [p.lbf, p.rbf, p.rtf], [p.lbf, p.rtf, p.ltf],
    [p.lbb, p.ltb, p.rtb], [p.lbb, p.rtb, p.rbb],
    [p.lbf, p.lbb, p.rbb], [p.lbf, p.rbb, p.rbf],
    [p.ltf, p.rtf, p.rtb], [p.ltf, p.rtb, p.ltb],
    [p.lbf, p.ltf, p.ltb], [p.lbf, p.ltb, p.lbb],
    [p.rbf, p.rbb, p.rtb], [p.rbf, p.rtb, p.rtf]
  ];
}

function cylinderTriangles(radius: number, length: number, segments = 48): Triangle[] {
  const triangles: Triangle[] = [];
  const half = length / 2;
  const topCenter: Vec3 = [0, 0, half];
  const bottomCenter: Vec3 = [0, 0, -half];
  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * Math.PI * 2;
    const b = ((index + 1) / segments) * Math.PI * 2;
    const p1: Vec3 = [Math.cos(a) * radius, Math.sin(a) * radius, -half];
    const p2: Vec3 = [Math.cos(b) * radius, Math.sin(b) * radius, -half];
    const p3: Vec3 = [Math.cos(a) * radius, Math.sin(a) * radius, half];
    const p4: Vec3 = [Math.cos(b) * radius, Math.sin(b) * radius, half];
    triangles.push([p1, p2, p4], [p1, p4, p3], [topCenter, p3, p4], [bottomCenter, p2, p1]);
  }
  return triangles;
}

function sphereTriangles(radius: number, segments = 32, rings = 16): Triangle[] {
  const triangles: Triangle[] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const phi1 = (ring / rings) * Math.PI;
    const phi2 = ((ring + 1) / rings) * Math.PI;
    for (let segment = 0; segment < segments; segment += 1) {
      const theta1 = (segment / segments) * Math.PI * 2;
      const theta2 = ((segment + 1) / segments) * Math.PI * 2;
      const a = spherePoint(radius, phi1, theta1);
      const b = spherePoint(radius, phi1, theta2);
      const c = spherePoint(radius, phi2, theta2);
      const d = spherePoint(radius, phi2, theta1);
      if (ring > 0) triangles.push([a, b, d]);
      if (ring < rings - 1) triangles.push([b, c, d]);
    }
  }
  return triangles;
}

function spherePoint(radius: number, phi: number, theta: number): Vec3 {
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi)
  ];
}

function trianglesToStl(name: string, triangles: Triangle[]): string {
  const lines = [`solid ${safeMeshName(name)}`];
  for (const triangle of triangles) {
    const normal = normalForTriangle(triangle);
    lines.push(`  facet normal ${formatNumber(normal[0])} ${formatNumber(normal[1])} ${formatNumber(normal[2])}`);
    lines.push("    outer loop");
    for (const vertex of triangle) {
      lines.push(`      vertex ${formatNumber(vertex[0])} ${formatNumber(vertex[1])} ${formatNumber(vertex[2])}`);
    }
    lines.push("    endloop", "  endfacet");
  }
  lines.push(`endsolid ${safeMeshName(name)}`, "");
  return lines.join("\n");
}

function normalForTriangle([a, b, c]: Triangle): Vec3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(8).replace(/\.?0+$/, "") || "0" : "0";
}

function relativePosixPath(fromDir: string, toPath: string): string {
  return path.posix.relative(fromDir || ".", toPath).replace(/^$/, ".");
}

function safeMeshName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "mesh";
}
