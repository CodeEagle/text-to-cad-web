import { readFile } from "node:fs/promises";

import { listArtifactsForJob, resolveArtifactPath, type Artifact } from "./artifacts";

type ZipEntry = {
  data: Buffer;
  name: string;
};

type CentralDirectoryEntry = {
  crc: number;
  compressedSize: number;
  localHeaderOffset: number;
  name: Buffer;
  uncompressedSize: number;
};

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

export async function createArtifactsZip(dataRoot: string, jobId: string): Promise<Buffer> {
  const artifacts = await listArtifactsForJob(dataRoot, jobId);
  const entries = await Promise.all(
    artifacts.map(async (artifact) => ({
      data: await readFile(resolveArtifactPath(dataRoot, jobId, artifact.path)),
      name: zipEntryName(artifact)
    }))
  );
  return createStoredZip(entries);
}

function createStoredZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const centralDirectory: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, name, entry.data);
    centralDirectory.push({
      crc,
      compressedSize: entry.data.length,
      localHeaderOffset: offset,
      name,
      uncompressedSize: entry.data.length
    });
    offset += localHeader.length + name.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  for (const entry of centralDirectory) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressedSize, 20);
    header.writeUInt32LE(entry.uncompressedSize, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(entry.localHeaderOffset, 42);
    chunks.push(header, entry.name);
    offset += header.length + entry.name.length;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centralDirectory.length, 8);
  end.writeUInt16LE(centralDirectory.length, 10);
  end.writeUInt32LE(centralDirectorySize, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);

  return Buffer.concat(chunks);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntryName(artifact: Artifact): string {
  return artifact.path
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}
