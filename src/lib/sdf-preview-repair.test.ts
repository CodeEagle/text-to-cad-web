import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  needsSdfPreviewRepair,
  repairSdfPreviewArtifact,
  rewriteStaticPreviewSdf
} from "./sdf-preview-repair";

const simulatorSdf = `<?xml version="1.0"?>
<sdf version="1.12">
  <model name="cart">
    <link name="chassis" />
    <link name="caster" />
    <joint name="caster_ball_joint" type="ball">
      <parent>chassis</parent>
      <child>caster</child>
    </joint>
    <plugin filename="gz-sim-diff-drive-system" name="gz::sim::systems::DiffDrive">
      <left_joint>left_wheel_joint</left_joint>
    </plugin>
  </model>
</sdf>`;

describe("sdf-preview-repair", () => {
  it("rewrites simulator-only SDF features for CAD Explorer preview", () => {
    const repaired = rewriteStaticPreviewSdf(simulatorSdf);

    expect(repaired).toContain('<joint name="caster_ball_joint" type="fixed">');
    expect(repaired).not.toContain("<plugin");
    expect(needsSdfPreviewRepair(repaired)).toBe(false);
  });

  it("writes hidden viewer-safe SDF preview artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sdf-preview-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(outputs, { recursive: true });
    await writeFile(path.join(outputs, "cart.sdf"), simulatorSdf);

    const previewPath = await repairSdfPreviewArtifact({
      dataRoot: root,
      jobId: "job-1",
      artifactPath: "cart.sdf"
    });

    expect(previewPath).toBe("cart.viewer.sdf");
    const preview = await readFile(path.join(outputs, "cart.viewer.sdf"), "utf8");
    expect(preview).toContain('type="fixed"');
    expect(preview).not.toContain("gz-sim-diff-drive-system");
  });

  it("leaves viewer-safe SDF files unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sdf-preview-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(outputs, { recursive: true });
    await writeFile(path.join(outputs, "cart.sdf"), '<sdf version="1.12"><model name="cart"><link name="base" /></model></sdf>');

    await expect(
      repairSdfPreviewArtifact({
        dataRoot: root,
        jobId: "job-1",
        artifactPath: "cart.sdf"
      })
    ).resolves.toBe("cart.sdf");
  });

  it("removes stale hidden preview artifacts when SDF no longer needs repair", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sdf-preview-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(outputs, { recursive: true });
    await writeFile(path.join(outputs, "cart.sdf"), '<sdf version="1.12"><model name="cart"><link name="base" /></model></sdf>');
    await writeFile(path.join(outputs, "cart.viewer.sdf"), simulatorSdf);

    const previewPath = await repairSdfPreviewArtifact({
      dataRoot: root,
      jobId: "job-1",
      artifactPath: "cart.sdf"
    });

    expect(previewPath).toBe("cart.sdf");
    await expect(readFile(path.join(outputs, "cart.viewer.sdf"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});
