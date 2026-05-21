import { getAuthStatus } from "@/lib/codex-auth";

export const runtime = "nodejs";

export async function GET() {
  const status = await getAuthStatus();
  return Response.json(status);
}
