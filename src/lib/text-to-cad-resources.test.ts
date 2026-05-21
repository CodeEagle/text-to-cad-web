import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { getTextToCadResourceStatus, updateTextToCadResources } from "./text-to-cad-resources";

describe("text-to-cad resource updates", () => {
  it("downloads skills into runtime resources and syncs Codex home", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cad-resource-update-"));

    const status = await updateTextToCadResources({
      cloneRepository: async ({ checkoutDir }) => {
        const skillDir = path.join(checkoutDir, "skills", "urdf");
        await mkdir(skillDir, { recursive: true });
        await writeFile(path.join(skillDir, "SKILL.md"), "name: urdf updated\n");
        await mkdir(path.join(checkoutDir, "benchmarks"), { recursive: true });
        await writeFile(
          path.join(checkoutDir, "benchmarks", "10-planetary-gear-stage.md"),
          "# official benchmark\n"
        );
        await mkdir(path.join(checkoutDir, "docs", "public", "hero"), { recursive: true });
        await writeFile(
          path.join(checkoutDir, "docs", "public", "hero", "planetary_gear_assembly.step.js"),
          "export default {};\n"
        );
        return { commit: "0123456789abcdef0123456789abcdef01234567" };
      },
      dataRoot: root,
      now: new Date("2026-05-22T00:00:00.000Z"),
      ref: "main",
      repoUrl: "https://example.test/text-to-cad.git"
    });

    expect(status.source).toBe("updated");
    expect(status.commit).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(status.skills).toEqual(["urdf"]);
    expect(status.referencePaths).toEqual(["benchmarks", "docs/public/hero"]);
    expect(status.copiedSkillCount).toBe(1);
    await expect(
      readFile(path.join(root, "resources", "text-to-cad-skills", "urdf", "SKILL.md"), "utf8")
    ).resolves.toBe("name: urdf updated\n");
    await expect(
      readFile(path.join(root, "codex-home", "skills", "urdf", "SKILL.md"), "utf8")
    ).resolves.toBe("name: urdf updated\n");
    await expect(
      readFile(
        path.join(root, "resources", "text-to-cad-reference", "benchmarks", "10-planetary-gear-stage.md"),
        "utf8"
      )
    ).resolves.toBe("# official benchmark\n");
    await expect(
      readFile(
        path.join(
          root,
          "resources",
          "text-to-cad-reference",
          "docs",
          "public",
          "hero",
          "planetary_gear_assembly.step.js"
        ),
        "utf8"
      )
    ).resolves.toBe("export default {};\n");
    await expect(
      readFile(path.join(root, "resources", "text-to-cad-resources.json"), "utf8")
    ).resolves.toContain("0123456789abcdef0123456789abcdef01234567");
    await expect(
      readFile(path.join(root, "codex-home", "text-to-cad-resources.json"), "utf8")
    ).resolves.toContain("0123456789abcdef0123456789abcdef01234567");
  });

  it("reports bundled resources before an update", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cad-resource-status-"));
    const bundledRoot = path.join(root, "bundled-skills");
    const bundledSkill = path.join(bundledRoot, "cad");
    await mkdir(bundledSkill, { recursive: true });
    await writeFile(path.join(bundledSkill, "SKILL.md"), "name: cad\n");

    const previousBundledDir = process.env.TEXT_TO_CAD_BUNDLED_SKILLS_DIR;
    process.env.TEXT_TO_CAD_BUNDLED_SKILLS_DIR = bundledRoot;
    try {
      const status = await getTextToCadResourceStatus(root);
      expect(status.source).toBe("bundled");
      expect(status.commit).toBeUndefined();
      expect(status.skills).toEqual(["cad"]);
      expect(status.referencePaths).toEqual([]);
    } finally {
      if (previousBundledDir === undefined) {
        delete process.env.TEXT_TO_CAD_BUNDLED_SKILLS_DIR;
      } else {
        process.env.TEXT_TO_CAD_BUNDLED_SKILLS_DIR = previousBundledDir;
      }
    }
  });
});
