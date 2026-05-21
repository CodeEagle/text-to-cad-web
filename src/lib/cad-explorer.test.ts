import { describe, expect, it } from "vitest";

import { isCadExplorerSupportedPath, parseCadExplorerOutput, withCadExplorerEmbedMode } from "./cad-explorer";

describe("cad explorer", () => {
  it("detects CAD Explorer supported artifacts", () => {
    expect(isCadExplorerSupportedPath("/tmp/model.step")).toBe(true);
    expect(isCadExplorerSupportedPath("/tmp/model.STL")).toBe(true);
    expect(isCadExplorerSupportedPath("/tmp/notes.md")).toBe(false);
  });

  it("parses dev:ensure JSON output", () => {
    expect(
      parseCadExplorerOutput(
        JSON.stringify({
          action: "started",
          url: "http://127.0.0.1:4178/?file=model.step",
          server: {
            rootPath: "/tmp/models",
            port: 4178
          }
        })
      )
    ).toMatchObject({
      action: "started",
      url: "http://127.0.0.1:4178/?file=model.step"
    });
  });

  it("builds a dedicated embedded preview URL", () => {
    expect(withCadExplorerEmbedMode("http://127.0.0.1:4178/?file=model.step&theme=dark")).toBe(
      "http://127.0.0.1:4178/?file=model.step&theme=dark&preview=1&embed=1&hideTopologyStatus=1"
    );
  });
});
