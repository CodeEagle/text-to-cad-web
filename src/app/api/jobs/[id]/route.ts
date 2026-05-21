import { deleteJob, getJob } from "@/lib/jobs";
import { getDataRoot } from "@/lib/paths";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const job = await getJob(getDataRoot(), id);
    return Response.json({ job });
  } catch {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    await deleteJob(getDataRoot(), id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /still running/i.test(message) ? 409 : 404;
    return Response.json({ error: status === 409 ? "任务仍在运行，完成后再删除。" : "Job not found." }, { status });
  }
}
