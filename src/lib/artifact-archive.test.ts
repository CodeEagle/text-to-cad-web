import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createArtifactsZip } from "./artifact-archive";

describe("artifact archive", () => {
  it("creates a zip containing visible artifacts only", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cad-archive-"));
    const outputs = path.join(root, "jobs", "job-1", "outputs");
    await mkdir(outputs, { recursive: true });
    await writeFile(path.join(outputs, "part.step"), "ISO-10303");
    await writeFile(path.join(outputs, ".part.step.glb"), "hidden glb");
    await writeFile(path.join(outputs, "README.md"), "readme");

    const archive = await createArtifactsZip(root, "job-1");
    const text = archive.toString("latin1");

    expect(text).toContain("part.step");
    expect(text).toContain("README.md");
    expect(text).not.toContain(".part.step.glb");
  });
});
