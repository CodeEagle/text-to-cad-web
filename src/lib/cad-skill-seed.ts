import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getCodexHome,
  getDataRoot,
  getTextToCadResourceMetadataPath,
  getTextToCadSkillsResourceDir
} from "./paths";

export type SeedBundledCadSkillsOptions = {
  codexHome?: string;
  dataRoot?: string;
  force?: boolean;
  projectRoot?: string;
  sourceDir?: string;
};

export async function seedBundledCadSkills(options: SeedBundledCadSkillsOptions = {}): Promise<number> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const dataRoot = options.dataRoot ?? getDataRoot();
  const source = await resolveCadSkillsSourceDir({
    dataRoot,
    projectRoot,
    sourceDir: options.sourceDir
  });
  const codexHome = options.codexHome ?? getCodexHome(dataRoot);
  const force = options.force ?? (
    source.kind === "updated" && !(await codexHomeResourceMarkerMatches(dataRoot, codexHome))
  );

  const syncedCount = await syncCadSkillsToCodexHome({
    codexHome,
    force,
    sourceDir: source.dir
  });
  if (source.kind === "updated" && (force || syncedCount > 0)) {
    await writeCodexHomeResourceMarker(dataRoot, codexHome);
  }
  return syncedCount;
}

export async function syncCadSkillsToCodexHome({
  codexHome,
  force = false,
  sourceDir
}: {
  codexHome: string;
  force?: boolean;
  sourceDir: string;
}): Promise<number> {
  const targetSkillsDir = path.join(codexHome, "skills");
  let sourceEntries;
  try {
    sourceEntries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  await mkdir(targetSkillsDir, { recursive: true });

  let seededCount = 0;
  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const sourceSkillDir = path.join(sourceDir, entry.name);
    if (!(await hasSkillFile(sourceSkillDir))) {
      continue;
    }
    const targetDir = path.join(targetSkillsDir, entry.name);
    if (!force && (await hasSkillFile(targetDir))) {
      continue;
    }
    if (force) {
      await rm(targetDir, { recursive: true, force: true });
    }
    await cp(sourceSkillDir, targetDir, {
      recursive: true,
      errorOnExist: false,
      force: true
    });
    seededCount += 1;
  }

  return seededCount;
}

export async function listCadSkillIds(sourceDir: string): Promise<string[]> {
  let sourceEntries;
  try {
    sourceEntries = await readdir(sourceDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const ids: string[] = [];
  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (await hasSkillFile(path.join(sourceDir, entry.name))) {
      ids.push(entry.name);
    }
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

export async function resolveCadSkillsSourceDir({
  dataRoot = getDataRoot(),
  projectRoot = process.cwd(),
  sourceDir
}: {
  dataRoot?: string;
  projectRoot?: string;
  sourceDir?: string;
} = {}): Promise<{ dir: string; kind: "updated" | "bundled" }> {
  if (sourceDir && (await hasAnySkill(sourceDir))) {
    return { dir: sourceDir, kind: "updated" };
  }

  const updatedSkillsDir = getTextToCadSkillsResourceDir(dataRoot);
  if (await hasAnySkill(updatedSkillsDir)) {
    return { dir: updatedSkillsDir, kind: "updated" };
  }

  const configuredBundledDir = process.env.TEXT_TO_CAD_BUNDLED_SKILLS_DIR;
  if (configuredBundledDir && (await hasAnySkill(configuredBundledDir))) {
    return { dir: configuredBundledDir, kind: "bundled" };
  }

  return { dir: path.join(projectRoot, "vendor", "text-to-cad-skills"), kind: "bundled" };
}

async function hasAnySkill(sourceDir: string): Promise<boolean> {
  return (await listCadSkillIds(sourceDir)).length > 0;
}

export async function writeCodexHomeResourceMarker(dataRoot: string, codexHome: string): Promise<void> {
  try {
    const metadata = await readFile(getTextToCadResourceMetadataPath(dataRoot), "utf8");
    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, "text-to-cad-resources.json"), metadata);
  } catch {
    // Resource metadata is best-effort. Missing metadata should not block jobs.
  }
}

async function codexHomeResourceMarkerMatches(dataRoot: string, codexHome: string): Promise<boolean> {
  try {
    const source = JSON.parse(await readFile(getTextToCadResourceMetadataPath(dataRoot), "utf8")) as { commit?: string };
    const target = JSON.parse(
      await readFile(path.join(codexHome, "text-to-cad-resources.json"), "utf8")
    ) as { commit?: string };
    return Boolean(source.commit && source.commit === target.commit);
  } catch {
    return false;
  }
}

async function hasSkillFile(skillDir: string): Promise<boolean> {
  try {
    const skillFile = await stat(path.join(skillDir, "SKILL.md"));
    return skillFile.isFile();
  } catch {
    return false;
  }
}
