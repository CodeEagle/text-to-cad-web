import { createArtifactsZip } from "@/lib/artifact-archive";
import { getJob } from "@/lib/jobs";
import { getDataRoot } from "@/lib/paths";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const dataRoot = getDataRoot();

  try {
    const job = await getJob(dataRoot, id);
    const archive = await createArtifactsZip(dataRoot, id);
    const filename = `${safeFilename(job.title || id)}-${id}.zip`;

    return new Response(new Uint8Array(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(archive.length),
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch {
    return Response.json({ error: "Job artifacts not found." }, { status: 404 });
  }
}

function safeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "artifacts";
}
