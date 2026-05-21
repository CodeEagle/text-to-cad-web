"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Box, Download, ExternalLink, Eye, FileCode2, Layers, Loader2 } from "lucide-react";

import { selectCadExplorerUrls } from "@/lib/cad-explorer-url-selection";
import type { PreviewArtifact } from "@/lib/preview-artifacts";

type ArtifactPreviewPanelProps = {
  artifact?: PreviewArtifact;
  emptyText?: string;
  jobId?: string;
  title?: string;
};

type PreviewViewId = "iso" | "top" | "front" | "side";

const PREVIEW_VIEWS: Array<{ id: PreviewViewId; label: string; viewerView: string }> = [
  { id: "iso", label: "等轴", viewerView: "iso" },
  { id: "top", label: "顶视", viewerView: "top" },
  { id: "front", label: "前视", viewerView: "front" },
  { id: "side", label: "侧视", viewerView: "side" }
];

export function ArtifactPreviewPanel({
  artifact,
  emptyText = "生成的 CAD 预览会显示在这里。",
  jobId,
  title = "预览"
}: ArtifactPreviewPanelProps) {
  const artifactPath = artifact?.path ?? "";
  const canUseCadExplorer = Boolean(jobId && artifactPath && isCadExplorerArtifact(artifactPath));
  const [explorerUrl, setExplorerUrl] = useState("");
  const [explorerOpenUrl, setExplorerOpenUrl] = useState("");
  const [explorerError, setExplorerError] = useState("");
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [activeView, setActiveView] = useState<PreviewViewId>("iso");
  const [orbitPreviewExited, setOrbitPreviewExited] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!canUseCadExplorer || !jobId || !artifactPath) {
      setExplorerUrl("");
      setExplorerOpenUrl("");
      setExplorerError("");
      setExplorerLoading(false);
      return;
    }

    const controller = new AbortController();
    setExplorerUrl("");
    setExplorerOpenUrl("");
    setExplorerError("");
    setExplorerLoading(true);
    setActiveView("iso");
    setOrbitPreviewExited(false);

    fetch("/api/explorer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, artifactPath }),
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "启动 CAD Explorer 失败。");
        }
        const urls = selectCadExplorerUrls(body.explorer ?? {});
        setExplorerUrl(urls.frameUrl);
        setExplorerOpenUrl(urls.openUrl);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setExplorerError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setExplorerLoading(false);
        }
      });

    return () => controller.abort();
  }, [artifactPath, canUseCadExplorer, jobId]);

  const dims = useMemo(() => deriveDimensions(artifact?.name), [artifact?.name]);
  const previewSurfaceClassName = explorerUrl ? "preview-surface edge-to-edge" : "preview-surface";
  const sendExplorerMessage = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const selectView = useCallback((view: (typeof PREVIEW_VIEWS)[number]) => {
    setActiveView(view.id);
    setOrbitPreviewExited(true);
    sendExplorerMessage({ type: "text-to-cad:set-orbit-preview", active: false });
    sendExplorerMessage({ type: "text-to-cad:set-preview-mode", previewMode: false });
    sendExplorerMessage({ type: "text-to-cad:set-view", view: view.viewerView });
  }, [sendExplorerMessage]);

  const exitOrbitPreview = useCallback(() => {
    setOrbitPreviewExited(true);
    sendExplorerMessage({ type: "text-to-cad:set-orbit-preview", active: false });
    sendExplorerMessage({ type: "text-to-cad:set-preview-mode", previewMode: false });
  }, [sendExplorerMessage]);

  return (
    <section className="preview-panel" aria-label={title}>
      <div className="preview-toolbar">
        <span className="filename">{artifact?.name ?? "等待输出"}</span>
        {artifact ? (
          <>
            <span className="dot-sep" style={{ background: "var(--ink-4)", borderRadius: 99, height: 3, width: 3 }} />
            <span className="size">{formatBytes(artifact.size)}</span>
          </>
        ) : null}

        <div className="view-tabs" role="tablist" aria-label="视角">
          {PREVIEW_VIEWS.map((view) => (
            <button
              aria-selected={activeView === view.id}
              className={activeView === view.id ? "view-tab active" : "view-tab"}
              disabled={!explorerUrl}
              key={view.id}
              onClick={() => selectView(view)}
              role="tab"
              type="button"
            >
              {view.label}
            </button>
          ))}
          <button
            className="view-tab exit-orbit"
            disabled={!explorerUrl}
            onClick={exitOrbitPreview}
            type="button"
          >
            退出 Orbit
          </button>
        </div>

        {artifact ? (
          <div style={{ display: "flex", gap: 4 }}>
            {explorerUrl ? (
              <a
                aria-label="在新标签页打开 CAD Explorer"
                className="ibtn"
                href={explorerOpenUrl || explorerUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={15} />
              </a>
            ) : null}
            <a
              aria-label="下载成品"
              className="ibtn"
              href={`${artifact.downloadUrl}?download=1`}
            >
              <Download size={15} />
            </a>
          </div>
        ) : null}
      </div>

      <div className={previewSurfaceClassName}>
        {artifact ? (
          <ArtifactPreviewContent
            artifact={artifact}
            explorerError={explorerError}
            explorerLoading={explorerLoading}
            explorerUrl={explorerUrl}
            frameRef={frameRef}
            onExplorerLoad={() => {
              const selectedView = PREVIEW_VIEWS.find((view) => view.id === activeView);
              if (orbitPreviewExited) {
                sendExplorerMessage({ type: "text-to-cad:set-orbit-preview", active: false });
                sendExplorerMessage({ type: "text-to-cad:set-preview-mode", previewMode: false });
              }
              if (selectedView && activeView !== "iso") {
                sendExplorerMessage({ type: "text-to-cad:set-view", view: selectedView.viewerView });
              }
            }}
          />
        ) : (
          <EmptyPreview text={emptyText} />
        )}

        {dims ? <span className="dim-readout">{dims}</span> : null}
      </div>
    </section>
  );
}

function ArtifactPreviewContent({
  artifact,
  explorerError,
  explorerLoading,
  explorerUrl,
  frameRef,
  onExplorerLoad
}: {
  artifact: PreviewArtifact;
  explorerError: string;
  explorerLoading: boolean;
  explorerUrl: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onExplorerLoad: () => void;
}) {
  if (artifact.kind === "image") {
    return <img alt={artifact.name} src={artifact.downloadUrl} />;
  }

  if (isCadExplorerArtifact(artifact.path)) {
    if (explorerUrl) {
      return (
        <iframe
          className="cad-explorer-frame"
          onLoad={onExplorerLoad}
          ref={frameRef}
          src={explorerUrl}
          title={`${artifact.name} 的 CAD Explorer 预览`}
        />
      );
    }
    if (explorerLoading) {
      return (
        <div className="preview-placeholder">
          <Loader2 className="spin" size={36} />
          <p>正在启动 CAD Explorer…</p>
          <strong>{artifact.path}</strong>
        </div>
      );
    }
  }

  const Icon =
    artifact.kind === "source" || artifact.kind === "log"
      ? FileCode2
      : artifact.kind === "mesh"
        ? Layers
        : Box;
  return (
    <div className="preview-placeholder">
      <Icon size={40} color="var(--ink-3)" />
      <p style={{ margin: 0 }}>{explorerError || labelForKind(artifact.kind)}</p>
      <strong>{artifact.path}</strong>
      <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
        <a className="btn sm" href={artifact.downloadUrl} rel="noreferrer" target="_blank">
          <Eye size={14} />
          打开
        </a>
        <a className="btn sm" href={`${artifact.downloadUrl}?download=1`}>
          <Download size={14} />
          下载
        </a>
      </div>
    </div>
  );
}

function EmptyPreview({ text }: { text: string }) {
  return (
    <div className="preview-placeholder">
      <PaperBlock />
      <p style={{ margin: 0 }}>{text}</p>
    </div>
  );
}

function PaperBlock() {
  // Faint iso wireframe to give the empty state more grounding than a bare icon
  return (
    <svg width="120" height="84" viewBox="0 0 120 84" fill="none" stroke="var(--ink-4)" strokeWidth="1.2" aria-hidden="true">
      <polygon points="28,32 60,18 92,32 60,46" fill="var(--paper-2)" />
      <polygon points="28,32 60,46 60,70 28,56" fill="var(--paper-3)" />
      <polygon points="92,32 60,46 60,70 92,56" fill="var(--paper-4)" />
    </svg>
  );
}

function labelForKind(kind: PreviewArtifact["kind"]): string {
  if (kind === "cad") return "CAD 导出已就绪";
  if (kind === "mesh") return "网格文件已就绪";
  if (kind === "source") return "源文件已就绪";
  if (kind === "log") return "日志文件已就绪";
  return "成品已就绪";
}

function isCadExplorerArtifact(filePath: string): boolean {
  return /\.(3mf|dxf|glb|gltf|sdf|srdf|step|stl|stp|urdf)$/i.test(filePath);
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function deriveDimensions(name?: string): string | null {
  if (!name) return null;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["step", "stp", "stl", "3mf", "glb", "gltf"].includes(ext)) {
    return ext.toUpperCase() + " · CAD 几何";
  }
  if (["urdf", "srdf", "sdf"].includes(ext)) {
    return ext.toUpperCase() + " · 机器人描述";
  }
  if (ext === "scad") return "OpenSCAD 源文件";
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return "渲染图片";
  return null;
}
