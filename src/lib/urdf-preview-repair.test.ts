import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveArtifactPath } from "./artifacts";
import { repairUrdfPreviewArtifact } from "./urdf-preview-repair";

describe("urdf preview repair", () => {
  it("creates a catalog-visible mesh-based viewer URDF for primitive visuals", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-urdf-repair-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(outputs, { recursive: true });
    await writeFile(
      path.join(outputs, "arm.urdf"),
      `<?xml version="1.0"?>
<robot name="arm">
  <link name="base_link">
    <visual>
      <origin xyz="0 0 0.04" rpy="0 0 0"/>
      <geometry>
        <cylinder radius="0.09" length="0.08"/>
      </geometry>
    </visual>
  </link>
</robot>`
    );

    const repairedPath = await repairUrdfPreviewArtifact({
      artifactPath: "arm.urdf",
      dataRoot: root,
      jobId: "job-1"
    });

    expect(repairedPath).toBe("arm.viewer.urdf");
    const repaired = await readFile(resolveArtifactPath(root, "job-1", repairedPath), "utf8");
    expect(repaired).toContain('<mesh filename="arm-viewer-meshes/base_link-visual_0-0.stl" scale="1 1 1" />');
    const mesh = await readFile(resolveArtifactPath(root, "job-1", "arm-viewer-meshes/base_link-visual_0-0.stl"), "utf8");
    expect(mesh).toContain("solid base_link_visual_0");
  });

  it("does not repair URDF files that only use primitives in collision geometry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-urdf-repair-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(path.join(outputs, "meshes"), { recursive: true });
    await writeFile(
      path.join(outputs, "arm.urdf"),
      `<robot name="arm">
  <link name="base">
    <visual><geometry><mesh filename="meshes/base.stl"/></geometry></visual>
    <collision><geometry><cylinder radius="0.1" length="0.2"/></geometry></collision>
  </link>
</robot>`
    );

    await expect(
      repairUrdfPreviewArtifact({ artifactPath: "arm.urdf", dataRoot: root, jobId: "job-1" })
    ).resolves.toBe("arm.urdf");
  });

  it("leaves mesh-based URDF artifacts unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-urdf-repair-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(outputs, { recursive: true });
    await writeFile(
      path.join(outputs, "arm.urdf"),
      `<robot name="arm"><link name="base"><visual><geometry><mesh filename="meshes/base.stl"/></geometry></visual></link></robot>`
    );

    await expect(
      repairUrdfPreviewArtifact({ artifactPath: "arm.urdf", dataRoot: root, jobId: "job-1" })
    ).resolves.toBe("arm.urdf");
  });
});
