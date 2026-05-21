import { startDeviceLogin } from "@/lib/codex-auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const login = await startDeviceLogin({ forceNew: true });
    return Response.json(login);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
