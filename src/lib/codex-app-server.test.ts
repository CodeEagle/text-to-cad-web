import { describe, expect, it } from "vitest";

import { buildCodexAppServerArgs } from "./codex-app-server";

describe("buildCodexAppServerArgs", () => {
  it("starts Codex through the app-server stdio protocol", () => {
    expect(buildCodexAppServerArgs()).toEqual(["app-server", "--listen", "stdio://"]);
  });
});
