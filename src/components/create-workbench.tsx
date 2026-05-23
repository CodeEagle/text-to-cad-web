"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  Download,
  FileCode2,
  Image as ImageIcon,
  Layers,
  Library,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Search,
  Trash2
} from "lucide-react";

import { ArtifactPreviewPanel } from "@/components/artifact-preview-panel";
import { StatusPill } from "@/components/status-pill";
import {
  CAD_SKILLS,
  DEFAULT_CAD_SKILL_ID,
  cadSkillLabel,
  cadSkillShortLabel,
  type CadSkillId
} from "@/lib/cad-skills";
import {
  CODEX_MODELS,
  CODEX_REASONING_EFFORTS,
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
  codexModelLabel,
  codexModelShortLabel,
  codexReasoningEffortLabel,
  type CodexModel,
  type CodexReasoningEffort
} from "@/lib/codex-settings";
import type { PromptExample } from "@/lib/examples";
import { selectPreviewArtifact, type PreviewArtifact } from "@/lib/preview-artifacts";

type BusyState = "job" | null;

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
  messages?: JobMessage[];
  runner?: "codex-app-server";
  skillId?: CadSkillId;
  model?: CodexModel;
  reasoningEffort?: CodexReasoningEffort;
  exampleId?: string;
  status: "queued" | "running" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  artifactCount: number;
  artifacts?: Artifact[];
  logTail?: string;
  error?: string;
  parentJobId?: string;
};

type JobMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  jobId?: string;
};

type MobileTab = "library" | "workspace";

export function CreateWorkbench({ examples }: { examples: PromptExample[] }) {
  const [selected, setSelected] = useState(examples[0]);
  const [selectedSkillId, setSelectedSkillId] = useState<CadSkillId>(
    examples[0]?.skillId ?? DEFAULT_CAD_SKILL_ID
  );
  const [prompt, setPrompt] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [sessions, setSessions] = useState<Job[]>([]);
  const [chatMessages, setChatMessages] = useState<JobMessage[]>([]);
  const [busy, setBusy] = useState<BusyState>(null);
  const [message, setMessage] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("workspace");
  // On mobile, chat is an overlay drawer on the workspace pane (collapsed by default).
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState("");
  const [codexModel, setCodexModel] = useState<CodexModel>(DEFAULT_CODEX_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<CodexReasoningEffort>(
    DEFAULT_CODEX_REASONING_EFFORT
  );
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);

  const jobIsRunning = job?.status === "queued" || job?.status === "running";
  const pollingJobId = jobIsRunning ? job?.id : "";
  const canSend = useMemo(
    () => prompt.trim().length > 0 && busy !== "job" && !jobIsRunning,
    [busy, jobIsRunning, prompt]
  );
  const previewArtifact = useMemo(() => selectPreviewArtifact(job?.artifacts), [job?.artifacts]);
  const displayedMessages = job?.messages ?? chatMessages;
  const chatRailClassName = [
    "chat-rail",
    historyPanelOpen ? "with-history" : "",
    chatOverlayOpen ? "overlay-open" : "overlay-collapsed"
  ].filter(Boolean).join(" ");
  const visibleExamples = useMemo(
    () => examples.filter((example) => example.skillId === selectedSkillId),
    [examples, selectedSkillId]
  );
  const historySessions = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    const filtered = query
      ? sessions.filter((session) => {
          const haystack = [
            session.title,
            session.prompt,
            session.id,
            session.skillId,
            lastUserMessage(session) ?? ""
          ].join("\n").toLowerCase();
          return haystack.includes(query);
        })
      : sessions;
    return filtered.slice(0, 24);
  }, [historyQuery, sessions]);

  // Mirror mobile-tab state to a body attribute so CSS can swap which pane is visible
  // on small screens. Falls back to "workspace" on unmount.
  useEffect(() => {
    document.body.setAttribute("data-mobile-tab", mobileTab);
    return () => {
      document.body.removeAttribute("data-mobile-tab");
    };
  }, [mobileTab]);

  useEffect(() => {
    void refreshSessions();
  }, []);

  useEffect(() => {
    if (!pollingJobId) {
      return;
    }
    const interval = window.setInterval(async () => {
      const next = await fetchJob(pollingJobId);
      if (next) {
        setJob(next);
        setChatMessages(next.messages ?? []);
        upsertSession(next);
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [pollingJobId]);


  async function refreshSessions() {
    setSessionsLoading(true);
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const body = (await response.json()) as { jobs?: Job[] };
      setSessions(body.jobs ?? []);
    } finally {
      setSessionsLoading(false);
    }
  }

  function upsertSession(nextJob: Job) {
    setSessions((current) => {
      const merged = [nextJob, ...current.filter((session) => session.id !== nextJob.id)];
      return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  function startNewSession() {
    setJob(null);
    setChatMessages([]);
    setPrompt("");
    setMessage("");
    setMobileTab("workspace");
    window.setTimeout(() => promptInputRef.current?.focus(), 0);
  }

  function openSession(session: Job) {
    setJob(session);
    setChatMessages(session.messages ?? []);
    setPrompt("");
    setMessage("");
    const sessionSkillId = session.skillId ?? DEFAULT_CAD_SKILL_ID;
    setSelectedSkillId(sessionSkillId);
    const matchedExample =
      (session.exampleId ? examples.find((example) => example.id === session.exampleId) : undefined) ??
      examples.find((example) => example.skillId === sessionSkillId) ??
      examples[0];
    if (matchedExample) {
      setSelected(matchedExample);
    }
    setMobileTab("workspace");
  }

  async function deleteSession(session: Job) {
    if (session.status === "queued" || session.status === "running") {
      setMessage("任务仍在运行，完成后再删除。");
      return;
    }
    const confirmed = window.confirm(`删除历史会话「${session.title}」？产物文件也会一起删除。`);
    if (!confirmed) {
      return;
    }

    setDeletingSessionId(session.id);
    setMessage("");
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(session.id)}`, {
        method: "DELETE"
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "删除历史会话失败。");
      }
      setSessions((current) => current.filter((item) => item.id !== session.id));
      if (job?.id === session.id) {
        setJob(null);
        setChatMessages([]);
        setPrompt("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingSessionId("");
    }
  }

  async function sendMessage() {
    const draft = prompt.trim();
    if (!draft) {
      return;
    }

    setBusy("job");
    setMessage("");
    try {
      const priorMessages = job?.messages ?? chatMessages;
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: draft,
          title: job ? `Edit ${job.title}` : selected?.title,
          exampleId: job ? undefined : selected?.id,
          parentJobId: job?.id,
          messages: priorMessages,
          skillId: selectedSkillId,
          model: codexModel,
          reasoningEffort
        })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "启动 CAD 任务失败。");
      }
      const nextJob = body.job as Job;
      setJob(nextJob);
      setChatMessages(nextJob.messages ?? []);
      upsertSession(nextJob);
      setPrompt("");
      // After firing a job from the mobile library tab, jump back to workspace.
      setMobileTab((tab) => (tab === "library" ? "workspace" : tab));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  function useExample(example: PromptExample) {
    setSelected(example);
    setSelectedSkillId(example.skillId);
    setJob(null);
    setChatMessages([]);
    setPrompt(example.prompt);
    setMessage("");
    setHistoryPanelOpen(false);
    setMobileTab("workspace");
    setChatOverlayOpen(true);
    window.setTimeout(() => promptInputRef.current?.focus(), 0);
  }

  function selectSkill(skillId: CadSkillId) {
    setSelectedSkillId(skillId);
    const firstExample = examples.find((example) => example.skillId === skillId);
    if (firstExample) {
      setSelected(firstExample);
    }
  }

  function onKeyDownComposer(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSend) {
        void sendMessage();
      }
    }
  }

  return (
    <main className="workbench">
      {/* ─── Left rail · Library ──────────────────────────────────── */}
      <aside className="rail">
        <div className="skill-picker" aria-label="选择 CAD 技能">
          <span className="eyebrow">技能 · {CAD_SKILLS.length}</span>
          <div className="skill-list">
            {CAD_SKILLS.map((skill) => (
              <button
                aria-current={skill.id === selectedSkillId ? "true" : undefined}
                className={skill.id === selectedSkillId ? "skill-btn selected" : "skill-btn"}
                key={skill.id}
                onClick={() => selectSkill(skill.id)}
                title={skill.description}
                type="button"
              >
                <span>{skill.label}</span>
                <small>{skill.shortLabel}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="rail-list scroll">
          <div className="rail-section-head">
            <span className="eyebrow">示例 · {visibleExamples.length}</span>
          </div>
          {visibleExamples.map((example) => (
            <button
              className={example.id === selected?.id ? "rail-row selected" : "rail-row"}
              key={example.id}
              onClick={() => useExample(example)}
              type="button"
            >
              <ExamplePreview example={example} />
              <span className="example-info">
                <span className="skill-badge">{cadSkillShortLabel(example.skillId)}</span>
                <span className="row-title">{example.title}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* ─── Center · Preview stage / Files (mobile) ───────────────── */}
      <section className="stage">
        <StageHeader
          job={job}
          model={job?.model ?? codexModel}
          reasoningEffort={job?.reasoningEffort ?? reasoningEffort}
          runnerLabel={job?.runner}
          skillId={job?.skillId ?? selectedSkillId}
        />

        <div className={job?.artifacts?.length ? "stage-canvas with-files" : "stage-canvas"}>
          <ArtifactPreviewPanel
            artifact={previewArtifact}
            emptyText={
              jobIsRunning
                ? "Codex 正在生成文件，写入成品后会自动预览。"
                : "发送一个 CAD 请求后会在这里预览。"
            }
            jobId={job?.id}
            title="实时预览"
          />

          {job?.artifacts?.length ? <FileStrip job={job} previewArtifact={previewArtifact} /> : null}
        </div>

        {job?.error ? <p className="error-text" style={{ marginTop: 10 }}>{job.error}</p> : null}

        {job?.logTail ? (
          <details className="stage-footer-hint" style={{ display: "block", marginTop: 12 }}>
            <summary style={{ cursor: "pointer", color: "var(--ink-2)" }}>
              Codex 日志 · <span className="mono">{job.id}</span>
            </summary>
            <pre className="log-tail" style={{ marginTop: 10 }}>{job.logTail}</pre>
          </details>
        ) : (
          <div className="stage-footer-hint">
            <span>拖拽旋转 · 滚轮缩放 · 双击聚焦。</span>
            {job?.parentJobId ? (
              <span className="right mono">基于 {job.parentJobId} 修改</span>
            ) : null}
          </div>
        )}
      </section>

      {/* ─── Right · Chat ──────────────────────────────────────────── */}
      <aside className={chatRailClassName}>
        <div className="chat-rail-head">
          <div>
            <span className="eyebrow">CAD 对话</span>
            <div className="chat-title">
              {displayedMessages.length
                ? `会话 · ${displayedMessages.length} 轮`
                : "新会话"}
            </div>
          </div>
          <span className="chat-meta-right">
            <button
              aria-pressed={historyPanelOpen}
              className={historyPanelOpen ? "account-trigger active" : "account-trigger"}
              onClick={() => setHistoryPanelOpen((open) => !open)}
              title="历史会话"
              type="button"
            >
              <Library size={15} />
              <span>历史</span>
            </button>
            <button
              aria-label="收起对话"
              className="chat-overlay-close"
              onClick={() => setChatOverlayOpen(false)}
              title="收起对话"
              type="button"
            >
              <ChevronDown size={16} />
            </button>
          </span>
        </div>

        {historyPanelOpen ? (
          <section className="session-panel full" aria-label="历史会话">
            <div className="session-panel-head">
              <div>
                <span className="eyebrow">历史会话 · {historySessions.length}</span>
                <p>切换上下文或继续修改。</p>
              </div>
              <button
                aria-label="刷新历史会话"
                className="ibtn"
                onClick={refreshSessions}
                type="button"
              >
                <RefreshCw className={sessionsLoading ? "spin" : ""} size={14} />
              </button>
            </div>
            <label className="history-search" aria-label="搜索历史会话">
              <Search size={14} />
              <input
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="搜索会话、任务、文件"
                type="search"
                value={historyQuery}
              />
            </label>
            <div className="session-list scroll">
              {historySessions.length ? (
                historySessions.map((session) => {
                  const sessionIsRunning = session.status === "queued" || session.status === "running";
                  const isDeleting = deletingSessionId === session.id;
                  return (
                    <div
                      className={session.id === job?.id ? "session-row selected" : "session-row"}
                      key={session.id}
                    >
                      <button
                        className="session-open"
                        onClick={() => openSession(session)}
                        type="button"
                      >
                        <span className="row-title">{session.title}</span>
                        <span className="row-body">{lastUserMessage(session) ?? session.prompt}</span>
                        <span className="session-meta">
                          <StatusPill status={session.status} />
                          <span>{session.artifactCount} 文件</span>
                          <span>{formatShortTime(session.createdAt)}</span>
                        </span>
                      </button>
                      <button
                        aria-label={`删除历史会话：${session.title}`}
                        className="session-delete"
                        disabled={sessionIsRunning || Boolean(deletingSessionId)}
                        onClick={() => deleteSession(session)}
                        title={sessionIsRunning ? "任务运行中，暂不能删除" : "删除历史会话"}
                        type="button"
                      >
                        {isDeleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="rail-empty">没有匹配的历史会话。</p>
              )}
            </div>
          </section>
        ) : null}

        {!historyPanelOpen ? (
          <>
            <div className="chat-history scroll">
              {displayedMessages.length ? (
                displayedMessages.map((chatMessage) => (
                  <article className={`chat-bubble ${chatMessage.role}`} key={chatMessage.id}>
                    <span className="role-tag">
                      {chatMessage.role === "user" ? "你" : "Codex"}
                    </span>
                    <p className="bubble">{chatMessage.content}</p>
                  </article>
                ))
              ) : (
                <div className="chat-empty">
                  <Sparkles size={22} color="var(--terracotta)" />
                  <p style={{ margin: 0 }}>选择一个示例，或直接描述你要生成的内容。</p>
                </div>
              )}
              {jobIsRunning ? (
                <div className="thinking">
                  <span className="dot pulse" />
                  Codex 正在思考…
                </div>
              ) : null}
            </div>

            <div className="composer-wrap">
              <div className="composer">
                <textarea
                  id="prompt"
                  ref={promptInputRef}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={onKeyDownComposer}
                  placeholder={
                    job
                      ? "把孔改成 10 mm，并添加沉头结构…"
                      : "描述你要生成的 CAD / 机器人 / 加工任务…"
                  }
                  spellCheck={false}
                  value={prompt}
                />
                <div className="composer-row">
                  <button
                    className="ibtn"
                    onClick={startNewSession}
                    type="button"
                    title="新建会话"
                    aria-label="新建会话"
                  >
                    <Plus size={15} />
                  </button>
                  <span className="grow" />
                  <span className="kbd-hint">⌘ ↵</span>
                  <CodexSettingsMenu
                    disabled={jobIsRunning}
                    model={codexModel}
                    onModelChange={setCodexModel}
                    onReasoningEffortChange={setReasoningEffort}
                    reasoningEffort={reasoningEffort}
                  />
                  <button
                    className="btn primary sm"
                    disabled={!canSend}
                    onClick={sendMessage}
                    type="button"
                  >
                    {busy === "job" ? <Loader2 className="spin" size={14} /> : <Send size={14} />}
                    {job ? "发送修改" : "生成"}
                  </button>
                </div>
              </div>
              {message ? <p className="error-text" style={{ marginTop: 8 }}>{message}</p> : null}
            </div>
          </>
        ) : null}
      </aside>

      {/* ─── Mobile chat overlay FAB (workspace mode only) ──────────── */}
      <button
        type="button"
        className={chatOverlayOpen ? "chat-overlay-fab is-hidden" : "chat-overlay-fab"}
        aria-label="展开对话"
        aria-expanded={chatOverlayOpen}
        onClick={() => setChatOverlayOpen(true)}
      >
        <MessageSquare size={20} />
        {jobIsRunning ? <span className="chat-overlay-fab-badge" /> : null}
      </button>

      {/* ─── Mobile bottom tab bar ─────────────────────────────────── */}
      <nav className="mobile-tabbar" aria-label="移动端分区">
        <TabBtn
          icon={<Layers size={20} />}
          label="工作区"
          active={mobileTab === "workspace"}
          onClick={() => setMobileTab("workspace")}
        />
        <TabBtn
          icon={<Library size={20} />}
          label="示例"
          active={mobileTab === "library"}
          onClick={() => setMobileTab("library")}
        />
      </nav>
    </main>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function CodexSettingsMenu({
  disabled,
  model,
  onModelChange,
  onReasoningEffortChange,
  reasoningEffort
}: {
  disabled: boolean;
  model: CodexModel;
  onModelChange: (model: CodexModel) => void;
  onReasoningEffortChange: (effort: CodexReasoningEffort) => void;
  reasoningEffort: CodexReasoningEffort;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="codex-settings">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="codex-settings-trigger"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title={disabled ? "Codex 正在运行" : "模型和推理强度"}
        type="button"
      >
        <span className="model-short">{codexModelShortLabel(model)}</span>
        <span className="effort-short">{codexReasoningEffortLabel(reasoningEffort)}</span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div className="codex-settings-menu" role="menu">
          <p className="menu-heading">推理强度</p>
          <div className="menu-options">
            {CODEX_REASONING_EFFORTS.map((effort) => (
              <button
                aria-checked={effort.id === reasoningEffort}
                className={effort.id === reasoningEffort ? "menu-option selected" : "menu-option"}
                key={effort.id}
                onClick={() => {
                  onReasoningEffortChange(effort.id);
                  setOpen(false);
                }}
                role="menuitemradio"
                type="button"
              >
                <span>{effort.label}</span>
                {effort.id === reasoningEffort ? <Check size={17} /> : null}
              </button>
            ))}
          </div>

          <div className="menu-divider" />
          <p className="menu-heading">模型</p>
          <div className="menu-options">
            {CODEX_MODELS.map((candidate) => (
              <button
                aria-checked={candidate.id === model}
                className={candidate.id === model ? "menu-option selected" : "menu-option"}
                key={candidate.id}
                onClick={() => {
                  onModelChange(candidate.id);
                  setOpen(false);
                }}
                role="menuitemradio"
                type="button"
              >
                <span>{codexModelLabel(candidate.id)}</span>
                {candidate.id === model ? <Check size={17} /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StageHeader({
  job,
  model,
  reasoningEffort,
  runnerLabel,
  skillId
}: {
  job: Job | null;
  model: CodexModel;
  reasoningEffort: CodexReasoningEffort;
  runnerLabel?: string;
  skillId: CadSkillId;
}) {
  const title = job?.title ?? "未命名 CAD 任务";
  const splitTitle = useMemo(() => {
    if (!title) return { head: "未命名", tail: " CAD 任务" };
    const words = title.split(/\s+/);
    if (words.length === 1) return { head: words[0], tail: "" };
    return { head: words[0], tail: " " + words.slice(1).join(" ") };
  }, [title]);

  return (
    <div className="stage-header">
      <div className="stage-meta-row">
        <span className="eyebrow">工作区</span>
        <span className="dot-sep" />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {cadSkillLabel(skillId)}
        </span>
        {job ? (
          <>
            <span className="dot-sep" />
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{job.id}</span>
          </>
        ) : null}
        {runnerLabel ? (
          <>
            <span className="dot-sep" />
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>app-server</span>
          </>
        ) : null}
        <span className="dot-sep" />
        <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {codexModelShortLabel(model)} · {codexReasoningEffortLabel(reasoningEffort)}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <StatusPill status={job?.status} />
        </span>
      </div>

      <div className="stage-title-row">
        <h1 className="display">
          <em>{splitTitle.head}</em>
          {splitTitle.tail}
        </h1>
      </div>
    </div>
  );
}

function FileStrip({
  job,
  previewArtifact
}: {
  job: Job;
  previewArtifact?: PreviewArtifact;
}) {
  const artifacts = job.artifacts ?? [];
  if (!artifacts.length) {
    return null;
  }
  return (
    <div className="file-strip">
      <a
        className="file-chip download-all"
        href={`/api/jobs/${encodeURIComponent(job.id)}/download`}
        title="下载全部成品"
      >
        <span className="file-chip-icon">
          <Download size={14} />
        </span>
        <span className="name">全部下载</span>
      </a>
      {artifacts.map((artifact) => {
        const selected = previewArtifact?.path === artifact.path;
        return (
          <a
            className={selected ? "file-chip selected" : "file-chip"}
            href={`${artifact.downloadUrl}?download=1`}
            key={artifact.path}
            title={`下载 ${artifact.name}`}
          >
            <span className="file-chip-icon">
              <FileKindIcon kind={artifact.kind} />
            </span>
            <span className="name">{artifact.name}</span>
            <span className="size">{formatBytes(artifact.size)}</span>
          </a>
        );
      })}
      <span style={{ flex: 1 }} />
    </div>
  );
}

function FileKindIcon({ kind }: { kind: Artifact["kind"] }) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "source" || kind === "log") return <FileCode2 size={14} />;
  if (kind === "mesh") return <Layers size={14} />;
  return <Box size={14} />;
}

function ExamplePreview({ example }: { example: PromptExample }) {
  const className = example.previewImage
    ? `example-preview preview-${example.id} with-image`
    : `example-preview preview-${example.id}`;

  return (
    <span className={className} aria-hidden="true">
      {example.previewImage ? <img alt="" loading="lazy" src={example.previewImage} /> : null}
      <span className="preview-part a" />
      <span className="preview-part b" />
      <span className="preview-part c" />
      <span className="preview-part d" />
    </span>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" });
}

function lastUserMessage(job: Job): string | null {
  const messages = job.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && message.content.trim()) {
      return message.content;
    }
  }
  return null;
}

function TabBtn({
  icon,
  label,
  active,
  badge,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      type="button"
    >
      <span style={{ position: "relative", display: "inline-flex" }}>
        {icon}
        {badge ? (
          <span
            style={{
              background: "var(--terracotta)",
              borderRadius: 99,
              height: 6,
              position: "absolute",
              right: -2,
              top: -2,
              width: 6
            }}
          />
        ) : null}
      </span>
      <span className="tab-label">{label}</span>
    </button>
  );
}

async function fetchJob(id: string): Promise<Job | null> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { job: Job };
  return body.job;
}
