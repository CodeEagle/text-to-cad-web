import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";

import { CAD_SKILLS } from "./cad-skills";
import { PROMPT_EXAMPLES } from "./examples";

describe("prompt examples", () => {
  it("has at least one demo for every bundled CAD skill", () => {
    for (const skill of CAD_SKILLS) {
      expect(PROMPT_EXAMPLES.some((example) => example.skillId === skill.id)).toBe(true);
    }
  });

  it("keeps demo prompts in English while the surrounding UI can be localized", () => {
    for (const example of PROMPT_EXAMPLES) {
      expect(example.prompt).not.toMatch(/[\u3400-\u9fff]/);
    }
  });

  it("prompts the planetary gear demo to generate an animated STEP sidecar", () => {
    const example = PROMPT_EXAMPLES.find((candidate) => candidate.id === "planetary-gear-stage");

    expect(example?.prompt).toContain(".planetary_gear_stage.step.js");
    expect(example?.prompt).toMatch(/looping .*animation/i);
    expect(example?.prompt).toMatch(/feature refs/i);
    expect(example?.upstreamReferencePaths).toContain("benchmarks/10-planetary-gear-stage.md");
    expect(example?.upstreamReferencePaths).toContain("docs/public/hero/planetary_gear_assembly.step.js");
  });

  it("keeps robot planning demos tied to the official upstream visual target", () => {
    const urdfExample = PROMPT_EXAMPLES.find((candidate) => candidate.id === "urdf-two-link-arm");
    const srdfExample = PROMPT_EXAMPLES.find((candidate) => candidate.id === "srdf-two-link-planning");

    expect(urdfExample?.prompt).toContain("assets/urdf-demo.gif");
    expect(urdfExample?.prompt).toMatch(/Do not substitute an unrelated generic two-link arm/i);
    expect(urdfExample?.upstreamReferencePaths).toContain("assets/urdf-demo.gif");

    expect(srdfExample?.prompt).toContain("assets/srdf-moveit2-demo.gif");
    expect(srdfExample?.prompt).toMatch(/matching URDF robot package/i);
    expect(srdfExample?.prompt).toMatch(/do not generate a new unrelated two-link robot/i);
    expect(srdfExample?.upstreamReferencePaths).toContain("assets/srdf-moveit2-demo.gif");
  });

  it("points preview images at bundled public assets", () => {
    for (const example of PROMPT_EXAMPLES.filter((candidate) => candidate.previewImage)) {
      const previewImage = example.previewImage;
      expect(previewImage).toBeDefined();
      if (!previewImage) continue;
      expect(previewImage).toMatch(/^\/demo-previews\/.+\.jpg$/);
      expect(existsSync(path.join(process.cwd(), "public", previewImage.slice(1)))).toBe(true);
    }
  });
});
