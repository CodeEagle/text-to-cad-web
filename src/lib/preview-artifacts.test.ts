import { describe, expect, it } from "vitest";

import { selectPreviewArtifact, type PreviewArtifact } from "./preview-artifacts";

const artifact = (
  path: string,
  kind: PreviewArtifact["kind"],
  extra: Partial<PreviewArtifact> = {}
): PreviewArtifact => ({
  name: path.split("/").at(-1) ?? path,
  path,
  kind,
  size: 10,
  downloadUrl: `/api/artifacts/job/${path}`,
  ...extra
});

describe("selectPreviewArtifact", () => {
  it("prefers visual artifacts before cad and source files", () => {
    expect(
      selectPreviewArtifact([
        artifact("model.step", "cad"),
        artifact("notes.md", "source"),
        artifact("render.png", "image")
      ])?.path
    ).toBe("render.png");
  });

  it("falls back to CAD files when no image or mesh is available", () => {
    expect(selectPreviewArtifact([artifact("notes.md", "source"), artifact("model.step", "cad")])?.path).toBe(
      "model.step"
    );
  });

  it("prefers richer CAD formats over generic GLB meshes", () => {
    expect(
      selectPreviewArtifact([
        artifact("model.glb", "mesh"),
        artifact("model.stl", "cad"),
        artifact("model.3mf", "cad")
      ])?.path
    ).toBe("model.3mf");
  });

  it("prefers robot description files over markdown notes", () => {
    expect(
      selectPreviewArtifact([
        artifact("README.md", "source"),
        artifact("validation.md", "source"),
        artifact("arm.urdf", "cad")
      ])?.path
    ).toBe("arm.urdf");
  });

  it("prefers URDF over image and richer CAD files when present", () => {
    expect(
      selectPreviewArtifact([
        artifact("preview.png", "image"),
        artifact("model.step", "cad"),
        artifact("motion_preview.glb", "mesh"),
        artifact("robot.urdf", "cad")
      ])?.path
    ).toBe("robot.urdf");
  });

  it("prefers an animated STEP artifact as the default preview target", () => {
    expect(
      selectPreviewArtifact([
        artifact("preview.png", "image"),
        artifact("robot.urdf", "cad"),
        artifact("planetary_gear_assembly.step", "cad", { hasAnimation: true })
      ])?.path
    ).toBe("planetary_gear_assembly.step");
  });
});
