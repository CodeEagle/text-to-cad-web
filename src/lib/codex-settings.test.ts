import { describe, expect, it } from "vitest";

import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING_EFFORT,
  codexModelShortLabel,
  codexReasoningEffortLabel,
  isCodexModel,
  isCodexReasoningEffort
} from "./codex-settings";

describe("codex settings", () => {
  it("recognizes supported model and reasoning effort values", () => {
    expect(isCodexModel(DEFAULT_CODEX_MODEL)).toBe(true);
    expect(isCodexReasoningEffort(DEFAULT_CODEX_REASONING_EFFORT)).toBe(true);
    expect(isCodexModel("not-a-model")).toBe(false);
    expect(isCodexReasoningEffort("extra-high")).toBe(false);
  });

  it("formats the compact selector labels", () => {
    expect(codexModelShortLabel("gpt-5.5")).toBe("5.5");
    expect(codexReasoningEffortLabel("xhigh")).toBe("超高");
  });
});
