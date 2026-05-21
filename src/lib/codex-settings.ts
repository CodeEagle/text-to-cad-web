export const CODEX_MODELS = [
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    shortLabel: "5.5"
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    shortLabel: "5.4"
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    shortLabel: "5.4 Mini"
  },
  {
    id: "gpt-5.3-codex",
    label: "GPT-5.3 Codex",
    shortLabel: "5.3 Codex"
  },
  {
    id: "gpt-5.3-codex-spark",
    label: "GPT-5.3 Codex Spark",
    shortLabel: "5.3 Spark"
  },
  {
    id: "gpt-5.2",
    label: "GPT-5.2",
    shortLabel: "5.2"
  }
] as const;

export const CODEX_REASONING_EFFORTS = [
  { id: "low", label: "低" },
  { id: "medium", label: "中" },
  { id: "high", label: "高" },
  { id: "xhigh", label: "超高" }
] as const;

export type CodexModel = (typeof CODEX_MODELS)[number]["id"];
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number]["id"];

export const DEFAULT_CODEX_MODEL: CodexModel = "gpt-5.5";
export const DEFAULT_CODEX_REASONING_EFFORT: CodexReasoningEffort = "xhigh";

export function isCodexModel(value: unknown): value is CodexModel {
  return typeof value === "string" && CODEX_MODELS.some((model) => model.id === value);
}

export function isCodexReasoningEffort(value: unknown): value is CodexReasoningEffort {
  return typeof value === "string" && CODEX_REASONING_EFFORTS.some((effort) => effort.id === value);
}

export function codexModelLabel(modelId: string | undefined): string {
  return CODEX_MODELS.find((model) => model.id === modelId)?.label ?? modelId ?? CODEX_MODELS[0].label;
}

export function codexModelShortLabel(modelId: string | undefined): string {
  return CODEX_MODELS.find((model) => model.id === modelId)?.shortLabel ?? modelId ?? CODEX_MODELS[0].shortLabel;
}

export function codexReasoningEffortLabel(effortId: string | undefined): string {
  return (
    CODEX_REASONING_EFFORTS.find((effort) => effort.id === effortId)?.label ??
    CODEX_REASONING_EFFORTS[0].label
  );
}
