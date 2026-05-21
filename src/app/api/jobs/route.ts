import { createCadJob, listJobs } from "@/lib/jobs";
import { getDataRoot } from "@/lib/paths";

export const runtime = "nodejs";

export async function GET() {
  const jobs = await listJobs(getDataRoot());
  return Response.json({ jobs });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      title?: string;
      exampleId?: string;
      parentJobId?: string;
      messages?: Parameters<typeof createCadJob>[0]["messages"];
      skillId?: string;
      model?: string;
      reasoningEffort?: string;
    };
    const job = await createCadJob({
      prompt: body.prompt ?? "",
      title: body.title,
      exampleId: body.exampleId,
      parentJobId: body.parentJobId,
      messages: body.messages,
      skillId: body.skillId,
      model: body.model,
      reasoningEffort: body.reasoningEffort
    });
    return Response.json({ job }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
