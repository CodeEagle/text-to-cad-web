type JobStatus = "queued" | "running" | "succeeded" | "failed" | "idle";

const LABELS: Record<JobStatus, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "完成",
  failed: "失败",
  idle: "空闲"
};

export function StatusPill({ status }: { status?: string }) {
  const s = (status ?? "idle") as JobStatus;

  if (s === "running" || s === "queued") {
    return (
      <span className="chip terra">
        <span className="dot pulse" />
        {LABELS[s]}
      </span>
    );
  }
  if (s === "succeeded") {
    return (
      <span className="chip sage">
        <span className="dot sage" />
        {LABELS[s]}
      </span>
    );
  }
  if (s === "failed") {
    return (
      <span className="chip bad">
        <span className="dot danger" />
        {LABELS[s]}
      </span>
    );
  }
  return (
    <span className="chip">
      <span className="dot ink" />
      {LABELS.idle}
    </span>
  );
}
