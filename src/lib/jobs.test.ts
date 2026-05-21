import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildAgentPrompt, deleteJob, listJobs, type JobRecord } from "./jobs";

describe("buildAgentPrompt", () => {
  it("includes previous output context for follow-up edits", () => {
    const job: JobRecord = {
      id: "follow-up",
      title: "Edit bracket",
      prompt: "Make the mounting holes 10 mm instead.",
      parentJobId: "original",
      status: "queued",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      artifactCount: 0
    };

    const prompt = buildAgentPrompt(job);

    expect(prompt).toContain("./inputs/previous-job/outputs");
    expect(prompt).toContain("Make the mounting holes 10 mm instead.");
    expect(prompt).toContain("This is a follow-up edit");
  });

  it("does not tell runtime jobs to install skills over the network", () => {
    const job: JobRecord = {
      id: "offline",
      title: "Offline generation",
      prompt: "Create a bracket.",
      status: "queued",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      artifactCount: 0
    };

    const prompt = buildAgentPrompt(job);

    expect(prompt).not.toMatch(/npx|skills add|npm install|registry\.npmjs\.org/i);
    expect(prompt).toContain("Do not run network installation commands");
  });

  it("includes the chat history for conversational CAD edits", () => {
    const job: JobRecord = {
      id: "chat-edit",
      title: "Edit bracket",
      prompt: "Make the holes countersunk and regenerate the exports.",
      status: "queued",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      artifactCount: 0,
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Create a flat bracket with four holes.",
          createdAt: "2026-05-21T00:00:00.000Z"
        },
        {
          id: "m2",
          role: "assistant",
          content: "Generated 5 artifact files.",
          createdAt: "2026-05-21T00:01:00.000Z"
        },
        {
          id: "m3",
          role: "user",
          content: "Make the holes countersunk and regenerate the exports.",
          createdAt: "2026-05-21T00:02:00.000Z"
        }
      ]
    };

    const prompt = buildAgentPrompt(job);

    expect(prompt).toContain("Conversation so far:");
    expect(prompt).toContain("User: Create a flat bracket with four holes.");
    expect(prompt).toContain("Codex: Generated 5 artifact files.");
    expect(prompt).toContain("Current user request:");
    expect(prompt).toContain("Make the holes countersunk and regenerate the exports.");
  });

  it("includes the selected CAD skill in the agent prompt", () => {
    const job: JobRecord = {
      id: "urdf-job",
      title: "URDF robot",
      prompt: "Create a two-link robot.",
      skillId: "urdf",
      status: "queued",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      artifactCount: 0
    };

    const prompt = buildAgentPrompt(job);

    expect(prompt).toContain("Selected CAD Skill:");
    expect(prompt).toContain("- id: urdf");
    expect(prompt).toContain("Use the urdf skill as the primary workflow");
  });

  it("asks mechanism jobs to create CAD Explorer STEP animation sidecars", () => {
    const job: JobRecord = {
      id: "animated-gear",
      title: "Animated gear",
      prompt: "Create a planetary gear assembly.",
      status: "queued",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      artifactCount: 0
    };

    const prompt = buildAgentPrompt(job);

    expect(prompt).toContain(".<step-stem>.step.js");
    expect(prompt).toContain("parameters and animations");
    expect(prompt).toContain("viewer-time transforms");
  });

  it("ties example jobs to official upstream reference inputs", () => {
    const job: JobRecord = {
      id: "srdf-example",
      title: "MoveIt2 planning semantics",
      prompt: "Use the selected example.",
      exampleId: "srdf-two-link-planning",
      skillId: "srdf",
      status: "queued",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      artifactCount: 0
    };

    const prompt = buildAgentPrompt(job);

    expect(prompt).toContain("Official upstream example reference:");
    expect(prompt).toContain("./inputs/text-to-cad-reference/manifest.md");
    expect(prompt).toContain("Do not replace an official demo target");
    expect(prompt).toContain("SRDF must sit on top of an existing matching URDF");
  });
});

describe("deleteJob", () => {
  it("removes a finished job directory and excludes it from history", async () => {
    const root = await mkdirTempRoot();
    const job: JobRecord = {
      id: "finished-job",
      title: "Finished job",
      prompt: "Create a bracket.",
      status: "succeeded",
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-21T00:00:00.000Z",
      finishedAt: "2026-05-21T00:01:00.000Z",
      artifactCount: 0
    };
    const jobDir = path.join(root, "jobs", job.id);
    await mkdir(path.join(jobDir, "outputs"), { recursive: true });
    await writeFile(path.join(jobDir, "job.json"), `${JSON.stringify(job, null, 2)}\n`);
    await writeFile(path.join(jobDir, "outputs", "notes.txt"), "generated notes");

    await deleteJob(root, job.id);

    await expect(stat(jobDir)).rejects.toThrow();
    expect(await listJobs(root)).toEqual([]);
  });

  it("does not remove queued or running jobs", async () => {
    const root = await mkdirTempRoot();
    const job: JobRecord = {
      id: "running-job",
      title: "Running job",
      prompt: "Create a bracket.",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      artifactCount: 0
    };
    const jobDir = path.join(root, "jobs", job.id);
    await mkdir(path.join(jobDir, "outputs"), { recursive: true });
    await writeFile(path.join(jobDir, "job.json"), `${JSON.stringify(job, null, 2)}\n`);

    await expect(deleteJob(root, job.id)).rejects.toThrow(/still running/i);
    await expect(stat(jobDir)).resolves.toBeTruthy();
  });
});

async function mkdirTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "cad-jobs-"));
}
