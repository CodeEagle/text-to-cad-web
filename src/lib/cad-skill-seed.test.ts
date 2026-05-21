import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { seedBundledCadSkills } from "./cad-skill-seed";

describe("seedBundledCadSkills", () => {
  it("copies vendored CAD skills into the runtime Codex home", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cad-skill-seed-"));
    const sourceSkill = path.join(root, "vendor", "text-to-cad-skills", "urdf");
    const codexHome = path.join(root, "codex-home");
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(path.join(sourceSkill, "SKILL.md"), "name: urdf\n");

    const seededCount = await seedBundledCadSkills({ dataRoot: root, projectRoot: root, codexHome });

    expect(seededCount).toBe(1);
    await expect(readFile(path.join(codexHome, "skills", "urdf", "SKILL.md"), "utf8")).resolves.toBe("name: urdf\n");
  });

  it("leaves existing runtime skills untouched", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cad-skill-seed-"));
    const sourceSkill = path.join(root, "vendor", "text-to-cad-skills", "urdf");
    const targetSkill = path.join(root, "codex-home", "skills", "urdf");
    await mkdir(sourceSkill, { recursive: true });
    await mkdir(targetSkill, { recursive: true });
    await writeFile(path.join(sourceSkill, "SKILL.md"), "name: bundled\n");
    await writeFile(path.join(targetSkill, "SKILL.md"), "name: existing\n");

    const seededCount = await seedBundledCadSkills({
      projectRoot: root,
      dataRoot: root,
      codexHome: path.join(root, "codex-home")
    });

    expect(seededCount).toBe(0);
    await expect(readFile(path.join(targetSkill, "SKILL.md"), "utf8")).resolves.toBe("name: existing\n");
  });

  it("prefers updated runtime resources and overwrites stale runtime skills", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cad-skill-seed-"));
    const bundledSkill = path.join(root, "vendor", "text-to-cad-skills", "urdf");
    const updatedSkill = path.join(root, "resources", "text-to-cad-skills", "urdf");
    const targetSkill = path.join(root, "codex-home", "skills", "urdf");
    await mkdir(bundledSkill, { recursive: true });
    await mkdir(updatedSkill, { recursive: true });
    await mkdir(targetSkill, { recursive: true });
    await writeFile(path.join(bundledSkill, "SKILL.md"), "name: bundled\n");
    await writeFile(path.join(updatedSkill, "SKILL.md"), "name: updated\n");
    await writeFile(path.join(targetSkill, "SKILL.md"), "name: stale\n");
    await writeFile(
      path.join(root, "resources", "text-to-cad-resources.json"),
      `${JSON.stringify({ commit: "abc", skills: ["urdf"] })}\n`
    );

    const seededCount = await seedBundledCadSkills({
      codexHome: path.join(root, "codex-home"),
      dataRoot: root,
      projectRoot: root
    });

    expect(seededCount).toBe(1);
    await expect(readFile(path.join(targetSkill, "SKILL.md"), "utf8")).resolves.toBe("name: updated\n");
    await expect(readFile(path.join(root, "codex-home", "text-to-cad-resources.json"), "utf8")).resolves.toContain("abc");

    const nextSeededCount = await seedBundledCadSkills({
      codexHome: path.join(root, "codex-home"),
      dataRoot: root,
      projectRoot: root
    });
    expect(nextSeededCount).toBe(0);
  });
});
