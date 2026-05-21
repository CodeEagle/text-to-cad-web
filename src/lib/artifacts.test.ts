import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getArtifactKind, listArtifactsForJob, resolveArtifactPath } from "./artifacts";

describe("artifacts", () => {
  it("lists generated files with download URLs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-artifacts-"));
    await mkdir(path.join(root, "jobs", "job-1", "outputs"), { recursive: true });
    await writeFile(path.join(root, "jobs", "job-1", "outputs", "part.step"), "ISO-10303");

    const artifacts = await listArtifactsForJob(root, "job-1");

    expect(artifacts).toEqual([
      {
        name: "part.step",
        path: "part.step",
        size: 9,
        kind: "cad",
        downloadUrl: "/api/artifacts/job-1/part.step"
      }
    ]);
  });

  it("does not list hidden CAD Explorer STEP sidecars as user artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-artifacts-"));
    await mkdir(path.join(root, "jobs", "job-1", "outputs"), { recursive: true });
    await writeFile(path.join(root, "jobs", "job-1", "outputs", "part.step"), "ISO-10303");
    await writeFile(path.join(root, "jobs", "job-1", "outputs", ".part.step.glb"), "glb");

    const artifacts = await listArtifactsForJob(root, "job-1");

    expect(artifacts.map((artifact) => artifact.path)).toEqual(["part.step"]);
  });

  it("marks STEP artifacts that have CAD Explorer animation sidecars", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-artifacts-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(outputs, { recursive: true });
    await writeFile(path.join(outputs, "gearbox.step"), "ISO-10303");
    await writeFile(
      path.join(outputs, ".gearbox.step.js"),
      "export default { manifest: { animations: { meshCycle: { duration: 2 } } } };"
    );

    const artifacts = await listArtifactsForJob(root, "job-1");

    expect(artifacts).toEqual([
      {
        name: "gearbox.step",
        path: "gearbox.step",
        size: 9,
        kind: "cad",
        hasAnimation: true,
        downloadUrl: "/api/artifacts/job-1/gearbox.step"
      }
    ]);
  });

  it("does not list hidden preview repair files as user artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-artifacts-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(path.join(outputs, ".preview", "arm-meshes"), { recursive: true });
    await mkdir(path.join(outputs, "arm-viewer-meshes"), { recursive: true });
    await writeFile(path.join(outputs, "arm.urdf"), "<robot />");
    await writeFile(path.join(outputs, ".preview", "arm.viewer.urdf"), "<robot />");
    await writeFile(path.join(outputs, ".preview", "cart.viewer.sdf"), "<sdf />");
    await writeFile(path.join(outputs, ".preview", "arm-meshes", "base.stl"), "solid base");
    await writeFile(path.join(outputs, "arm.viewer.urdf"), "<robot />");
    await writeFile(path.join(outputs, "cart.viewer.sdf"), "<sdf />");
    await writeFile(path.join(outputs, "arm-viewer-meshes", "base.stl"), "solid base");

    const artifacts = await listArtifactsForJob(root, "job-1");

    expect(artifacts.map((artifact) => artifact.path)).toEqual(["arm.urdf"]);
  });

  it("rejects artifact path traversal", () => {
    expect(() => resolveArtifactPath("/tmp/root", "job-1", "../secret.txt")).toThrow(
      /Invalid artifact path/
    );
  });

  it("classifies robot description files as CAD Explorer previewable artifacts", () => {
    expect(getArtifactKind("arm.urdf")).toBe("cad");
    expect(getArtifactKind("planning.srdf")).toBe("cad");
    expect(getArtifactKind("world.sdf")).toBe("cad");
  });
});
