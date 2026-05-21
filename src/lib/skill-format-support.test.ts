import { describe, expect, it } from "vitest";

import { getArtifactKind, type ArtifactKind } from "./artifacts";
import { CAD_SKILLS, type CadSkillId } from "./cad-skills";
import { isCadExplorerSupportedPath } from "./cad-explorer";
import { selectPreviewArtifact, type PreviewArtifact } from "./preview-artifacts";

const EXPECTED_OUTPUTS_BY_SKILL: Record<CadSkillId, string[]> = {
  cad: ["model.step", "model.stl", "model.3mf", "drawing.dxf", "model.glb"],
  render: ["snapshot.png"],
  "step-parts": ["m3_hex_nut.step"],
  urdf: ["robot.urdf"],
  srdf: ["robot.srdf"],
  sdf: ["cart.sdf"],
  sendcutsend: ["flat_pattern.dxf", "formed_part.step"]
};

const previewArtifact = (path: string, kind: ArtifactKind): PreviewArtifact => ({
  name: path.split("/").at(-1) ?? path,
  path,
  kind,
  size: 10,
  downloadUrl: `/api/artifacts/job/${path}`
});

describe("skill output format support", () => {
  it("covers every bundled skill with previewable output formats", () => {
    expect(Object.keys(EXPECTED_OUTPUTS_BY_SKILL).sort()).toEqual(CAD_SKILLS.map((skill) => skill.id).sort());

    for (const skill of CAD_SKILLS) {
      for (const outputPath of EXPECTED_OUTPUTS_BY_SKILL[skill.id]) {
        const kind = getArtifactKind(outputPath);
        expect(["cad", "mesh", "image"]).toContain(kind);
        expect(selectPreviewArtifact([previewArtifact(outputPath, kind)])?.path).toBe(outputPath);
        if (kind === "cad" || kind === "mesh") {
          expect(isCadExplorerSupportedPath(outputPath)).toBe(true);
        }
      }
    }
  });
});
