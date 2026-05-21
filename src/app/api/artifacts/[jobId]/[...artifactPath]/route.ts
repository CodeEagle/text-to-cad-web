import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { resolveArtifactPath } from "@/lib/artifacts";
import { getDataRoot } from "@/lib/paths";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ jobId: string; artifactPath: string[] }> | { jobId: string; artifactPath: string[] };
};

const CONTENT_TYPES: Record<string, string> = {
  ".3mf": "model/3mf",
  ".dxf": "application/dxf",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".py": "text/x-python; charset=utf-8",
  ".step": "application/step",
  ".stl": "model/stl",
  ".stp": "application/step",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

export async function GET(request: Request, context: RouteContext) {
  const { jobId, artifactPath } = await context.params;
  const relativePath = artifactPath.join("/");

  try {
    const filePath = resolveArtifactPath(getDataRoot(), jobId, relativePath);
    const info = await stat(filePath);
    if (!info.isFile()) {
      return Response.json({ error: "Artifact not found." }, { status: 404 });
    }
    const file = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const download = new URL(request.url).searchParams.get("download") === "1";

    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Length": String(file.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${path.basename(
          filePath
        )}"`
      }
    });
  } catch {
    return Response.json({ error: "Artifact not found." }, { status: 404 });
  }
}
