import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { getDataRoot } from "./paths";

const execFileAsync = promisify(execFile);

const EXPLORER_EXTENSIONS = new Set([
  ".3mf",
  ".dxf",
  ".glb",
  ".gltf",
  ".sdf",
  ".srdf",
  ".step",
  ".stl",
  ".stp",
  ".urdf"
]);

export type CadExplorerResult = {
  action: "started" | "reused";
  url: string;
  embedUrl?: string;
  server: {
    rootPath: string;
    port: number;
  };
};

type EnsureCadExplorerInput = {
  artifactPath: string;
  scanRoot: string;
};

export function isCadExplorerSupportedPath(filePath: string): boolean {
  return EXPLORER_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function parseCadExplorerOutput(stdout: string): CadExplorerResult {
  const payload = JSON.parse(stdout.trim()) as CadExplorerResult;
  if (!payload?.url || !payload.server?.rootPath || !Number.isInteger(payload.server.port)) {
    throw new Error("CAD Explorer did not return a valid URL.");
  }
  return payload;
}

function withCadExplorerTheme(url: string, theme = "dark"): string {
  const themedUrl = new URL(url);
  themedUrl.searchParams.set("theme", theme);
  return themedUrl.href;
}

export function withCadExplorerEmbedMode(url: string): string {
  const embedUrl = new URL(url);
  embedUrl.searchParams.set("preview", "1");
  embedUrl.searchParams.set("embed", "1");
  embedUrl.searchParams.set("hideTopologyStatus", "1");
  return embedUrl.href;
}

export async function ensureCadExplorer({
  artifactPath,
  scanRoot
}: EnsureCadExplorerInput): Promise<CadExplorerResult> {
  if (!isCadExplorerSupportedPath(artifactPath)) {
    throw new Error("This artifact type is not supported by CAD Explorer.");
  }

  const viewerDir = await resolveCadViewerDir();
  await assertViewerDependencies(viewerDir);

  const { stdout } = await execFileAsync(
    "npm",
    [
      "--silent",
      "--prefix",
      viewerDir,
      "run",
      "dev:ensure",
      "--",
      "--json",
      "--workspace-root",
      scanRoot,
      "--root-dir",
      ".",
      "--file",
      artifactPath
    ],
    {
      env: {
        ...process.env,
        EXPLORER_BIND_HOST:
          process.env.TEXT_TO_CAD_EXPLORER_BIND_HOST || process.env.EXPLORER_BIND_HOST || "127.0.0.1",
        EXPLORER_PUBLIC_HOST:
          process.env.TEXT_TO_CAD_EXPLORER_PUBLIC_HOST || process.env.EXPLORER_PUBLIC_HOST || "127.0.0.1",
        EXPLORER_SERVER_REGISTRY: path.join(getDataRoot(), "cad-explorer-servers.json"),
        EXPLORER_PORT: process.env.TEXT_TO_CAD_EXPLORER_PORT || process.env.EXPLORER_PORT || "4178",
        EXPLORER_PORT_END:
          process.env.TEXT_TO_CAD_EXPLORER_PORT_END || process.env.EXPLORER_PORT_END || "4218"
      },
      maxBuffer: 1024 * 1024,
      timeout: 45_000
    }
  );

  const explorer = parseCadExplorerOutput(stdout);
  const url = withCadExplorerTheme(explorer.url);
  return {
    ...explorer,
    url,
    embedUrl: withCadExplorerEmbedMode(url)
  };
}

async function resolveCadViewerDir(): Promise<string> {
  const candidates = [
    process.env.TEXT_TO_CAD_VIEWER_DIR,
    path.join(process.cwd(), "vendor", "cad-viewer"),
    path.join(process.cwd(), "skills", "render", "scripts", "viewer"),
    path.join(process.cwd(), ".agents", "skills", "render", "scripts", "viewer"),
    path.join(process.cwd(), ".agents", "skills", "cad", "explorer")
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const packageJson = path.join(candidate, "package.json");
    try {
      await access(packageJson);
      return candidate;
    } catch {
      // Try the next known layout.
    }
  }

  throw new Error("CAD Explorer viewer is not installed.");
}

async function assertViewerDependencies(viewerDir: string): Promise<void> {
  try {
    await access(path.join(viewerDir, "node_modules", "vite", "package.json"));
  } catch {
    throw new Error(`CAD Explorer dependencies are missing. Run: npm --prefix ${viewerDir} install`);
  }
}
