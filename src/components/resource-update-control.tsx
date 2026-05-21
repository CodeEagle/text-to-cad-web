"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, PackageCheck, RefreshCw } from "lucide-react";

type ResourceStatus = {
  commit?: string;
  ref: string;
  repoUrl: string;
  skillCount: number;
  skills: string[];
  source: "updated" | "bundled";
  sourceDir: string;
  updatedAt?: string;
  copiedSkillCount?: number;
};

export function ResourceUpdateControl() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ResourceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/resources/text-to-cad", { cache: "no-store" });
      const body = (await response.json()) as { status?: ResourceStatus; error?: string };
      if (!response.ok || !body.status) {
        throw new Error(body.error ?? "读取资源状态失败。");
      }
      setStatus(body.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateResources() {
    setUpdating(true);
    setMessage("");
    try {
      const response = await fetch("/api/resources/text-to-cad", {
        method: "POST"
      });
      const body = (await response.json()) as { status?: ResourceStatus; error?: string };
      if (!response.ok || !body.status) {
        throw new Error(body.error ?? "更新资源失败。");
      }
      setStatus(body.status);
      setMessage(`已同步 ${body.status.copiedSkillCount ?? body.status.skillCount} 个 skill。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  }

  const sourceLabel = status?.source === "updated" ? "已更新" : "内置版本";
  const shortCommit = status?.commit ? status.commit.slice(0, 7) : "bundled";

  return (
    <div className="resource-update">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={open ? "account-trigger active" : "account-trigger"}
        onClick={() => setOpen((value) => !value)}
        title="更新 earthtojake/text-to-cad 资源"
        type="button"
      >
        <PackageCheck size={15} />
        <span>资源</span>
      </button>

      {open ? (
        <section className="resource-popover card" role="dialog" aria-label="Text-to-CAD 资源">
          <div className="resource-popover-head">
            <div>
              <p className="eyebrow">Text-to-CAD 资源</p>
              <h2>{sourceLabel}</h2>
            </div>
            <button
              aria-label="刷新资源状态"
              className="ibtn"
              disabled={loading || updating}
              onClick={refreshStatus}
              type="button"
            >
              <RefreshCw className={loading ? "spin" : ""} size={14} />
            </button>
          </div>

          <div className="resource-facts">
            <span>skills</span>
            <strong>{status?.skillCount ?? "-"}</strong>
            <span>ref</span>
            <strong>{status?.ref ?? "main"}</strong>
            <span>commit</span>
            <strong className="mono">{shortCommit}</strong>
            <span>更新时间</span>
            <strong>{status?.updatedAt ? formatDate(status.updatedAt) : "随应用内置"}</strong>
          </div>

          {status?.skills?.length ? (
            <div className="resource-skills" aria-label="已安装技能">
              {status.skills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          ) : null}

          <div className="resource-actions">
            <a
              className="btn sm ghost"
              href="https://github.com/earthtojake/text-to-cad"
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={14} />
              GitHub
            </a>
            <button
              className="btn sm primary"
              disabled={updating}
              onClick={updateResources}
              type="button"
            >
              {updating ? <RefreshCw className="spin" size={14} /> : <CheckCircle2 size={14} />}
              {updating ? "更新中" : "更新资源"}
            </button>
          </div>

          {message ? <p className={message.startsWith("已") ? "resource-message good" : "resource-message bad"}>{message}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
