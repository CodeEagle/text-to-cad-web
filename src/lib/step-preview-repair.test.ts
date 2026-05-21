import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { stepPreviewSidecarHasRenderableMesh, writeFacetedStepPreviewGlb } from "./faceted-step-glb";
import {
  findMissingStepPreviewArtifacts,
  isInternalStepPreviewArtifact
} from "./step-preview-repair";

function simpleFacetedStep(): string {
  return [
    "ISO-10303-21;",
    "DATA;",
    "#1=CARTESIAN_POINT('',(0,0,0));",
    "#2=CARTESIAN_POINT('',(1,0,0));",
    "#3=CARTESIAN_POINT('',(0,1,0));",
    "#4=POLY_LOOP('',(#1,#2,#3));",
    "#5=FACE_OUTER_BOUND('',#4,.T.);",
    "#6=FACE('',(#5));",
    "ENDSEC;",
    "END-ISO-10303-21;"
  ].join("\n");
}

describe("step-preview-repair", () => {
  it("finds STEP files that need hidden GLB preview sidecars", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "step-preview-"));
    await writeFile(path.join(root, "part.step"), "ISO-10303");
    const readyStepPath = path.join(root, "ready.step");
    const readyGlbPath = path.join(root, ".ready.step.glb");
    await writeFile(readyStepPath, simpleFacetedStep());
    await writeFacetedStepPreviewGlb({ stepPath: readyStepPath, glbPath: readyGlbPath });

    await expect(findMissingStepPreviewArtifacts(root)).resolves.toEqual([
      {
        relativePath: "part.step",
        sidecarRelativePath: ".part.step.glb",
        reason: "missing"
      }
    ]);
  });

  it("handles nested STEP files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "step-preview-"));
    await mkdir(path.join(root, "nested"), { recursive: true });
    await writeFile(path.join(root, "nested", "part.stp"), "ISO-10303");

    await expect(findMissingStepPreviewArtifacts(root)).resolves.toEqual([
      {
        relativePath: "nested/part.stp",
        sidecarRelativePath: "nested/.part.stp.glb",
        reason: "missing"
      }
    ]);
  });

  it("repairs existing STEP sidecars that contain no renderable mesh", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "step-preview-"));
    await writeFile(path.join(root, "part.step"), "ISO-10303");
    await writeFile(path.join(root, ".part.step.glb"), "not a renderable glb");

    await expect(findMissingStepPreviewArtifacts(root)).resolves.toEqual([
      {
        relativePath: "part.step",
        sidecarRelativePath: ".part.step.glb",
        reason: "meshless"
      }
    ]);
  });

  it("writes a renderable GLB fallback for simple faceted STEP files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "step-preview-"));
    const stepPath = path.join(root, "triangle.step");
    const glbPath = path.join(root, ".triangle.step.glb");
    await writeFile(
      stepPath,
      simpleFacetedStep()
    );

    await writeFacetedStepPreviewGlb({ stepPath, glbPath });

    await expect(stepPreviewSidecarHasRenderableMesh(glbPath)).resolves.toBe(true);
  });

  it("detects internal STEP preview artifact paths", () => {
    expect(isInternalStepPreviewArtifact(".part.step.glb")).toBe(true);
    expect(isInternalStepPreviewArtifact(".part.step/model.glb")).toBe(true);
    expect(isInternalStepPreviewArtifact("part.step")).toBe(false);
  });
});
