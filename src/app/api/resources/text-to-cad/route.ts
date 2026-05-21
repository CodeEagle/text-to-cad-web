import {
  getTextToCadResourceStatus,
  updateTextToCadResources
} from "@/lib/text-to-cad-resources";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getTextToCadResourceStatus();
    return Response.json({ status });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const status = await updateTextToCadResources();
    return Response.json({ status });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
