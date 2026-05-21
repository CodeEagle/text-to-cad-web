"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Download, FileCode2, Image as ImageIcon, Layers, RefreshCw } from "lucide-react";

import { ArtifactPreviewPanel } from "@/components/artifact-preview-panel";
import { StatusPill } from "@/components/status-pill";
import { cadSkillLabel, type CadSkillId } from "@/lib/cad-skills";
import { selectPreviewArtifact, type PreviewArtifact } from "@/lib/preview-artifacts";

type Artifact = {
  name: string;
  path: string;
  size: number;
  kind: PreviewArtifact["kind"];
  downloadUrl: string;
  hasAnimation?: boolean;
};

type Job = {
  id: string;
  title: string;
  prompt: string;
  skillId?: CadSkillId;
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: string;
  artifactCount: number;
  artifacts?: Artifact[];
  logTail?: string;
};

export function ArtifactsBrowser() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0],
    [jobs, selectedJobId]
  );
  const previewArtifact = selectPreviewArtifact(selectedJob?.artifacts);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setSelectedJobId(search.get("job") ?? "");
    void refreshJobs();
  }, []);

  async function refreshJobs() {
    setLoading(true);
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const body = (await response.json()) as { jobs: Job[] };
      setJobs(body.jobs);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="artifacts-layout">
      <aside className="card jobs-list">
        <div className="panel-title">
          <h2>任务 · {jobs.length}</h2>
          <button aria-label="刷新任务" className="ibtn" onClick={refreshJobs} type="button">
            <RefreshCw className={loading ? "spin" : ""} size={14} />
          </button>
        </div>
        {jobs.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: "8px 4px 0" }}>
            还没有 CAD 任务，请先在工作台发起一次生成。
          </p>
        ) : null}
        <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
          {jobs.map((job) => (
            <button
              className={job.id === selectedJob?.id ? "job-row selected" : "job-row"}
              key={job.id}
              onClick={() => setSelectedJobId(job.id)}
              type="button"
            >
              <span className="job-row-title">{job.title}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusPill status={job.status} />
                <span className="job-row-meta">{cadSkillLabel(job.skillId)}</span>
                <span className="job-row-meta">
                  {job.artifactCount} 个文件
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <article className="card artifact-detail">
        {selectedJob ? (
          <>
            <header className="detail-header">
              <div>
                <p className="eyebrow">
                  <StatusPill status={selectedJob.status} />
                </p>
                <h2 style={{ marginTop: 8 }}>{selectedJob.title}</h2>
              </div>
              <div className="detail-actions">
                <span className="timestamp">
                  {new Date(selectedJob.createdAt).toLocaleString()}
                </span>
                {selectedJob.artifacts?.length ? (
                  <a
                    className="btn sm"
                    href={`/api/jobs/${encodeURIComponent(selectedJob.id)}/download`}
                  >
                    <Download size={14} />
                    全部下载
                  </a>
                ) : null}
              </div>
            </header>

            <ArtifactPreviewPanel
              artifact={previewArtifact}
              emptyText="这个任务还没有可预览的成品。"
              jobId={selectedJob.id}
            />

            {selectedJob.artifacts?.length ? (
              <div className="artifact-table" style={{ marginTop: 18 }}>
                {selectedJob.artifacts.map((artifact) => (
                  <a
                    className="artifact-row"
                    href={`${artifact.downloadUrl}?download=1`}
                    key={artifact.path}
                  >
                    <span className="file-icon">
                      <ArtifactIcon kind={artifact.kind} />
                    </span>
                    <span className="file-name">{artifact.path}</span>
                    <span className="file-size">{formatBytes(artifact.size)}</span>
                    <Download color="var(--ink-3)" size={15} />
                  </a>
                ))}
              </div>
            ) : null}

            {selectedJob.logTail ? (
              <details style={{ marginTop: 18 }}>
                <summary style={{ cursor: "pointer", color: "var(--ink-2)" }}>
                  Codex 日志
                </summary>
                <pre className="log-tail">{selectedJob.logTail}</pre>
              </details>
            ) : null}
          </>
        ) : (
          <ArtifactPreviewPanel emptyText="选择一个任务来查看生成文件。" />
        )}
      </article>
    </section>
  );
}

function ArtifactIcon({ kind }: { kind: Artifact["kind"] }) {
  if (kind === "image") return <ImageIcon size={16} />;
  if (kind === "source" || kind === "log") return <FileCode2 size={16} />;
  if (kind === "mesh") return <Layers size={16} />;
  return <Box size={16} />;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
