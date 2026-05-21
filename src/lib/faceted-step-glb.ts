import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

type Point = [number, number, number];

type FacetedStepMesh = {
  positions: number[];
  normals: number[];
  indices: number[];
  min: Point;
  max: Point;
  faceCount: number;
};

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const TRIANGLES = 4;
const CAD_TO_GLB_SCALE = 0.001;

export async function stepPreviewSidecarHasRenderableMesh(filePath: string): Promise<boolean> {
  try {
    const { json } = parseGlb(await readFile(filePath));
    return Boolean(
      Array.isArray(json.meshes) &&
        json.meshes.some((mesh) => Array.isArray(mesh?.primitives) && mesh.primitives.length > 0)
    );
  } catch {
    return false;
  }
}

export async function writeFacetedStepPreviewGlb({
  stepPath,
  glbPath,
  kind = "part"
}: {
  stepPath: string;
  glbPath: string;
  kind?: "part" | "assembly";
}): Promise<void> {
  const stepText = await readFile(stepPath, "utf8");
  const mesh = parseFacetedStepMesh(stepText);
  const stepHash = createHash("sha256").update(stepText).digest("hex");
  await writeFile(glbPath, buildGlb(mesh, stepHash, kind));
}

function parseGlb(payload: Buffer): { json: Record<string, any> } {
  if (payload.length < 20 || payload.readUInt32LE(0) !== GLB_MAGIC || payload.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error("Not a GLB v2 file.");
  }
  const length = payload.readUInt32LE(8);
  let offset = 12;
  while (offset + 8 <= length && offset + 8 <= payload.length) {
    const chunkLength = payload.readUInt32LE(offset);
    const chunkType = payload.toString("latin1", offset + 4, offset + 8);
    offset += 8;
    const chunk = payload.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === "JSON") {
      return { json: JSON.parse(chunk.toString("utf8").trim()) };
    }
  }
  throw new Error("GLB JSON chunk is missing.");
}

function parseFacetedStepMesh(stepText: string): FacetedStepMesh {
  const points = new Map<number, Point>();
  const loops = new Map<number, number[]>();
  const bounds = new Map<number, number>();
  const faceBoundIds: number[] = [];

  for (const line of stepText.split(/\r?\n/)) {
    const match = line.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\((.*)\);$/i);
    if (!match) {
      continue;
    }
    const id = Number(match[1]);
    const type = match[2].toUpperCase();
    const body = match[3];
    if (type === "CARTESIAN_POINT") {
      const coords = body.match(/\(([-+0-9Ee.,\s]+)\)\s*$/)?.[1];
      const values = coords?.split(",").map((value) => Number(value.trim()));
      if (values?.length === 3 && values.every(Number.isFinite)) {
        points.set(id, [values[0], values[1], values[2]]);
      }
      continue;
    }
    if (type === "POLY_LOOP") {
      const refs = [...body.matchAll(/#(\d+)/g)].map((ref) => Number(ref[1]));
      if (refs.length >= 3) {
        loops.set(id, refs);
      }
      continue;
    }
    if (type === "FACE_OUTER_BOUND") {
      const loopId = Number(body.match(/#(\d+)/)?.[1]);
      if (Number.isFinite(loopId)) {
        bounds.set(id, loopId);
      }
      continue;
    }
    if (type === "FACE") {
      const boundId = Number(body.match(/#(\d+)/)?.[1]);
      if (Number.isFinite(boundId)) {
        faceBoundIds.push(boundId);
      }
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const min: Point = [Infinity, Infinity, Infinity];
  const max: Point = [-Infinity, -Infinity, -Infinity];
  let faceCount = 0;

  for (const boundId of faceBoundIds) {
    const loop = loops.get(bounds.get(boundId) ?? -1);
    const polygon = loop?.map((pointId) => points.get(pointId)).filter((point): point is Point => Boolean(point));
    if (!polygon || polygon.length < 3) {
      continue;
    }
    const normal = polygonNormal(polygon);
    if (!normal) {
      continue;
    }
    const baseIndex = positions.length / 3;
    for (const point of polygon) {
      const scaled: Point = [point[0] * CAD_TO_GLB_SCALE, point[1] * CAD_TO_GLB_SCALE, point[2] * CAD_TO_GLB_SCALE];
      positions.push(...scaled);
      normals.push(...normal);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], scaled[axis]);
        max[axis] = Math.max(max[axis], scaled[axis]);
      }
    }
    for (let index = 1; index < polygon.length - 1; index += 1) {
      indices.push(baseIndex, baseIndex + index, baseIndex + index + 1);
    }
    faceCount += 1;
  }

  if (!indices.length || !positions.length || !min.every(Number.isFinite) || !max.every(Number.isFinite)) {
    throw new Error("STEP faceted B-rep fallback could not extract renderable faces.");
  }
  return { positions, normals, indices, min, max, faceCount };
}

function polygonNormal(points: Point[]): Point | null {
  const origin = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const normal = cross(subtract(points[index], origin), subtract(points[index + 1], origin));
    const length = Math.hypot(...normal);
    if (length > 1e-12) {
      return [normal[0] / length, normal[1] / length, normal[2] / length];
    }
  }
  return null;
}

function subtract(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Point, b: Point): Point {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function buildGlb(mesh: FacetedStepMesh, stepHash: string, kind: "part" | "assembly"): Buffer {
  const builder = new GlbBuilder();
  const material = builder.addMaterial([0.72, 0.72, 0.72, 1]);
  const meshIndex = builder.addMesh(mesh, material);
  const nodeIndex = builder.addNode({ name: "faceted-step-preview", mesh: meshIndex });
  builder.setSceneNodes([nodeIndex]);
  builder.addStepTopology({
    schemaVersion: 1,
    profile: "index",
    entryKind: kind,
    stepHash,
    stats: {
      faceCount: mesh.faceCount,
      edgeCount: 0
    },
    bbox: {
      min: mesh.min,
      max: mesh.max,
      center: [
        (mesh.min[0] + mesh.max[0]) / 2,
        (mesh.min[1] + mesh.max[1]) / 2,
        (mesh.min[2] + mesh.max[2]) / 2
      ],
      size: [
        mesh.max[0] - mesh.min[0],
        mesh.max[1] - mesh.min[1],
        mesh.max[2] - mesh.min[2]
      ]
    }
  });
  return builder.toBuffer();
}

class GlbBuilder {
  private readonly json: Record<string, any> = {
    asset: { version: "2.0", generator: "text-to-cad-web faceted STEP fallback" },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    buffers: [{ byteLength: 0 }],
    bufferViews: [],
    accessors: []
  };
  private binary = Buffer.alloc(0);

  addMaterial(color: [number, number, number, number]): number {
    this.json.materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: color,
        metallicFactor: 0,
        roughnessFactor: 0.55
      },
      doubleSided: true
    });
    return this.json.materials.length - 1;
  }

  addMesh(mesh: FacetedStepMesh, material: number): number {
    const positionAccessor = this.addAccessor(floatBuffer(mesh.positions), {
      componentType: FLOAT,
      type: "VEC3",
      target: ARRAY_BUFFER,
      count: mesh.positions.length / 3,
      min: mesh.min,
      max: mesh.max
    });
    const normalAccessor = this.addAccessor(floatBuffer(mesh.normals), {
      componentType: FLOAT,
      type: "VEC3",
      target: ARRAY_BUFFER,
      count: mesh.normals.length / 3
    });
    const indexAccessor = this.addAccessor(uintBuffer(mesh.indices), {
      componentType: UNSIGNED_INT,
      type: "SCALAR",
      target: ELEMENT_ARRAY_BUFFER,
      count: mesh.indices.length
    });
    this.json.meshes.push({
      name: "faceted-step-preview",
      primitives: [
        {
          attributes: { POSITION: positionAccessor, NORMAL: normalAccessor },
          indices: indexAccessor,
          material,
          mode: TRIANGLES
        }
      ]
    });
    return this.json.meshes.length - 1;
  }

  addNode(node: Record<string, any>): number {
    this.json.nodes.push(node);
    return this.json.nodes.length - 1;
  }

  setSceneNodes(nodes: number[]): void {
    this.json.scenes[0].nodes = nodes;
  }

  addStepTopology(indexManifest: Record<string, any>): void {
    const indexView = this.addBufferView(Buffer.from(JSON.stringify(indexManifest), "utf8"));
    this.json.extensionsUsed = ["STEP_topology"];
    this.json.extensions = {
      STEP_topology: {
        schemaVersion: 1,
        entryKind: indexManifest.entryKind || "part",
        indexView,
        encoding: "utf-8",
        stats: indexManifest.stats
      }
    };
  }

  private addAccessor(
    payload: Buffer,
    {
      componentType,
      type,
      target,
      count,
      min,
      max
    }: {
      componentType: number;
      type: string;
      target: number;
      count: number;
      min?: number[];
      max?: number[];
    }
  ): number {
    const bufferView = this.addBufferView(payload, target);
    const accessor: Record<string, any> = {
      bufferView,
      byteOffset: 0,
      componentType,
      count,
      type
    };
    if (min) accessor.min = min;
    if (max) accessor.max = max;
    this.json.accessors.push(accessor);
    return this.json.accessors.length - 1;
  }

  private addBufferView(payload: Buffer, target?: number): number {
    this.binary = Buffer.concat([this.binary, Buffer.alloc(paddingFor(this.binary.length)), payload]);
    const byteOffset = this.binary.length - payload.length;
    const view: Record<string, any> = {
      buffer: 0,
      byteOffset,
      byteLength: payload.length
    };
    if (target !== undefined) {
      view.target = target;
    }
    this.json.bufferViews.push(view);
    return this.json.bufferViews.length - 1;
  }

  toBuffer(): Buffer {
    this.json.buffers[0].byteLength = this.binary.length;
    const jsonChunk = pad(Buffer.from(JSON.stringify(this.json), "utf8"), 0x20);
    const binaryChunk = pad(this.binary, 0);
    const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(GLB_MAGIC, 0);
    header.writeUInt32LE(GLB_VERSION, 4);
    header.writeUInt32LE(totalLength, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonChunk.length, 0);
    jsonHeader.write("JSON", 4, "latin1");
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(binaryChunk.length, 0);
    binaryHeader.write("BIN\0", 4, "latin1");
    return Buffer.concat([header, jsonHeader, jsonChunk, binaryHeader, binaryChunk]);
  }
}

function floatBuffer(values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function uintBuffer(values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4));
  return buffer;
}

function pad(buffer: Buffer, byte: number): Buffer {
  const padding = paddingFor(buffer.length);
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, byte)]) : buffer;
}

function paddingFor(length: number): number {
  return (4 - (length % 4)) % 4;
}
