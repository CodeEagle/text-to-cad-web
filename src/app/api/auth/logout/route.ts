import { logoutCodex } from "@/lib/codex-auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const logout = await logoutCodex();
    return Response.json(logout);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
