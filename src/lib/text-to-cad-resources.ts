import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  listCadSkillIds,
  resolveCadSkillsSourceDir,
  syncCadSkillsToCodexHome,
  writeCodexHomeResourceMarker
} from "./cad-skill-seed";
import {
  getCodexHome,
  getDataRoot,
  getResourcesRoot,
  getTextToCadReferenceResourceDir,
  getTextToCadResourceMetadataPath,
  getTextToCadSkillsResourceDir
} from "./paths";

const execFileAsync = promisify(execFile);

const DEFAULT_TEXT_TO_CAD_REPO_URL = "https://github.com/earthtojake/text-to-cad.git";
const DEFAULT_TEXT_TO_CAD_REF = "main";
const TEXT_TO_CAD_REFERENCE_PATHS = [
  "README.md",
  "assets",
  "benchmarks",
  "docs/public/hero"
] as const;

export type TextToCadResourceMetadata = {
  commit: string;
  ref: string;
  referencePaths: string[];
  repoUrl: string;
  skills: string[];
  updatedAt: string;
};

export type TextToCadResourceStatus = {
  commit?: string;
  ref: string;
  repoUrl: string;
  skillCount: number;
  skills: string[];
  referenceDir: string;
  referencePaths: string[];
  source: "updated" | "bundled";
  sourceDir: string;
  updatedAt?: string;
};

export type TextToCadResourceUpdateResult = TextToCadResourceStatus & {
  copiedSkillCount: number;
};

type CloneRepositoryInput = {
  checkoutDir: string;
  ref: string;
  repoUrl: string;
};

type CloneRepository = (input: CloneRepositoryInput) => Promise<{ commit: string }>;

export type UpdateTextToCadResourcesOptions = {
  cloneRepository?: CloneRepository;
  dataRoot?: string;
  now?: Date;
  ref?: string;
  repoUrl?: string;
};

let activeUpdate: Promise<TextToCadResourceUpdateResult> | null = null;

export function getTextToCadRepoUrl(): string {
  return process.env.TEXT_TO_CAD_REPO_URL || DEFAULT_TEXT_TO_CAD_REPO_URL;
}

export function getTextToCadResourceRef(): string {
  return process.env.TEXT_TO_CAD_RESOURCE_REF || DEFAULT_TEXT_TO_CAD_REF;
}

export async function getTextToCadResourceStatus(
  dataRoot = getDataRoot()
): Promise<TextToCadResourceStatus> {
  const source = await resolveCadSkillsSourceDir({ dataRoot });
  const skills = await listCadSkillIds(source.dir);
  const metadata = await readResourceMetadata(dataRoot);

  return {
    commit: source.kind === "updated" ? metadata?.commit : undefined,
    ref: metadata?.ref || getTextToCadResourceRef(),
    repoUrl: metadata?.repoUrl || getTextToCadRepoUrl(),
    skillCount: skills.length,
    skills,
    referenceDir: getTextToCadReferenceResourceDir(dataRoot),
    referencePaths: metadata?.referencePaths || [],
    source: source.kind,
    sourceDir: source.dir,
    updatedAt: source.kind === "updated" ? metadata?.updatedAt : undefined
  };
}

export async function updateTextToCadResources(
  options: UpdateTextToCadResourcesOptions = {}
): Promise<TextToCadResourceUpdateResult> {
  if (activeUpdate) {
    return activeUpdate;
  }

  activeUpdate = performTextToCadResourceUpdate(options).finally(() => {
    activeUpdate = null;
  });
  return activeUpdate;
}

async function performTextToCadResourceUpdate({
  cloneRepository = cloneTextToCadRepository,
  dataRoot = getDataRoot(),
  now = new Date(),
  ref = getTextToCadResourceRef(),
  repoUrl = getTextToCadRepoUrl()
}: UpdateTextToCadResourcesOptions): Promise<TextToCadResourceUpdateResult> {
  const resourcesRoot = getResourcesRoot(dataRoot);
  await mkdir(resourcesRoot, { recursive: true });

  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "text-to-cad-resources-"));
  const checkoutDir = path.join(tmpRoot, "repo");
  const tmpSkillsDir = path.join(resourcesRoot, `.text-to-cad-skills-${process.pid}-${Date.now()}`);
  const tmpReferenceDir = path.join(resourcesRoot, `.text-to-cad-reference-${process.pid}-${Date.now()}`);

  try {
    const { commit } = await cloneRepository({ checkoutDir, ref, repoUrl });
    const checkoutSkillsDir = path.join(checkoutDir, "skills");
    const skills = await listCadSkillIds(checkoutSkillsDir);
    if (skills.length === 0) {
      throw new Error("Downloaded earthtojake/text-to-cad archive does not contain skills.");
    }

    await rm(tmpSkillsDir, { recursive: true, force: true });
    await cp(checkoutSkillsDir, tmpSkillsDir, {
      recursive: true,
      errorOnExist: false,
      force: true
    });
    const referencePaths = await copyTextToCadReferences(checkoutDir, tmpReferenceDir);

    const runtimeSkillsDir = getTextToCadSkillsResourceDir(dataRoot);
    await rm(runtimeSkillsDir, { recursive: true, force: true });
    await rename(tmpSkillsDir, runtimeSkillsDir);
    const runtimeReferenceDir = getTextToCadReferenceResourceDir(dataRoot);
    await rm(runtimeReferenceDir, { recursive: true, force: true });
    await rename(tmpReferenceDir, runtimeReferenceDir);

    const copiedSkillCount = await syncCadSkillsToCodexHome({
      codexHome: getCodexHome(dataRoot),
      force: true,
      sourceDir: runtimeSkillsDir
    });

    const metadata: TextToCadResourceMetadata = {
      commit,
      ref,
      referencePaths,
      repoUrl,
      skills,
      updatedAt: now.toISOString()
    };
    await writeFile(getTextToCadResourceMetadataPath(dataRoot), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeCodexHomeResourceMarker(dataRoot, getCodexHome(dataRoot));

    return {
      commit,
      copiedSkillCount,
      ref,
      referenceDir: runtimeReferenceDir,
      referencePaths,
      repoUrl,
      skillCount: skills.length,
      skills,
      source: "updated",
      sourceDir: runtimeSkillsDir,
      updatedAt: metadata.updatedAt
    };
  } finally {
    await rm(tmpSkillsDir, { recursive: true, force: true });
    await rm(tmpReferenceDir, { recursive: true, force: true });
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

async function cloneTextToCadRepository({
  checkoutDir,
  ref,
  repoUrl
}: CloneRepositoryInput): Promise<{ commit: string }> {
  await execFileAsync("git", [
    "clone",
    "--depth",
    "1",
    "--filter=blob:none",
    "--sparse",
    "--branch",
    ref,
    repoUrl,
    checkoutDir
  ], {
    maxBuffer: 1024 * 1024 * 8,
    timeout: 120_000
  });
  await execFileAsync(
    "git",
    [
      "-C",
      checkoutDir,
      "sparse-checkout",
      "set",
      "--skip-checks",
      "skills",
      ...TEXT_TO_CAD_REFERENCE_PATHS
    ],
    {
      maxBuffer: 1024 * 1024 * 8,
      timeout: 120_000
    }
  );
  const { stdout } = await execFileAsync("git", ["-C", checkoutDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000
  });
  const commit = stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error("Unable to resolve earthtojake/text-to-cad commit.");
  }
  return { commit };
}

async function copyTextToCadReferences(checkoutDir: string, targetDir: string): Promise<string[]> {
  const copiedPaths: string[] = [];
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  for (const relativePath of TEXT_TO_CAD_REFERENCE_PATHS) {
    const sourcePath = path.join(checkoutDir, relativePath);
    const targetPath = path.join(targetDir, relativePath);
    if (await copyIfExists(sourcePath, targetPath)) {
      copiedPaths.push(relativePath);
    }
  }

  return copiedPaths;
}

async function copyIfExists(sourcePath: string, targetPath: string): Promise<boolean> {
  try {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, {
      recursive: true,
      errorOnExist: false,
      force: true
    });
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: string }).code === "ENOENT" || (error as { code?: string }).code === "ENOTDIR")
  );
}

async function readResourceMetadata(dataRoot: string): Promise<TextToCadResourceMetadata | null> {
  try {
    const payload = JSON.parse(
      await readFile(getTextToCadResourceMetadataPath(dataRoot), "utf8")
    ) as TextToCadResourceMetadata;
    if (!payload?.commit || !Array.isArray(payload.skills)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
