import { stat } from "node:fs/promises";
import path from "node:path";

import { getOutputsDir, resolveArtifactPath } from "@/lib/artifacts";
import { ensureCadExplorer } from "@/lib/cad-explorer";
import { getDataRoot } from "@/lib/paths";
import { repairSdfPreviewArtifact } from "@/lib/sdf-preview-repair";
import { repairStepPreviewArtifactsForJob } from "@/lib/step-preview-repair";
import { repairUrdfPreviewArtifact } from "@/lib/urdf-preview-repair";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: string;
      artifactPath?: string;
    };
    const jobId = body.jobId ?? "";
    const artifactPath = body.artifactPath ?? "";
    const dataRoot = getDataRoot();
    const resolvedArtifactPath = resolveArtifactPath(dataRoot, jobId, artifactPath);
    const artifactInfo = await stat(resolvedArtifactPath).catch(() => null);
    if (!artifactInfo?.isFile()) {
      return Response.json({ error: "Artifact not found." }, { status: 404 });
    }
    await repairStepPreviewArtifactsForJob({ dataRoot, jobId });
    let viewerArtifactPath = await repairUrdfPreviewArtifact({ dataRoot, jobId, artifactPath });
    viewerArtifactPath = await repairSdfPreviewArtifact({ dataRoot, jobId, artifactPath: viewerArtifactPath });
    const explorerArtifactPath = /\.viewer\.sdf$/i.test(viewerArtifactPath) ? artifactPath : viewerArtifactPath;
    const scanRoot = path.resolve(getOutputsDir(dataRoot, jobId));
    const explorer = await ensureCadExplorer({
      artifactPath: resolveArtifactPath(dataRoot, jobId, explorerArtifactPath),
      scanRoot
    });

    return Response.json({ explorer });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
