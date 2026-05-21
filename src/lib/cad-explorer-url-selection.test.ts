import { describe, expect, it } from "vitest";

import { selectCadExplorerUrls } from "./cad-explorer-url-selection";

describe("selectCadExplorerUrls", () => {
  it("uses the embedded preview URL for iframes and the full URL for external opening", () => {
    expect(
      selectCadExplorerUrls({
        url: "http://127.0.0.1:4178/?file=model.step&theme=dark",
        embedUrl: "http://127.0.0.1:4178/?file=model.step&theme=dark&preview=1&embed=1&hideTopologyStatus=1"
      })
    ).toEqual({
      frameUrl: "http://127.0.0.1:4178/?file=model.step&theme=dark&preview=1&embed=1&hideTopologyStatus=1",
      openUrl: "http://127.0.0.1:4178/?file=model.step&theme=dark"
    });
  });

  it("falls back to the full URL when an embedded URL is unavailable", () => {
    expect(selectCadExplorerUrls({ url: "http://127.0.0.1:4178/?file=model.step" })).toEqual({
      frameUrl: "http://127.0.0.1:4178/?file=model.step",
      openUrl: "http://127.0.0.1:4178/?file=model.step"
    });
  });
});
