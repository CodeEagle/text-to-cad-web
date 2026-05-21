import { describe, expect, it } from "vitest";

import { parseDeviceAuthOutput } from "./codex-output";

describe("parseDeviceAuthOutput", () => {
  it("extracts an OpenAI device login URL and user code from prose output", () => {
    const parsed = parseDeviceAuthOutput(`
      To sign in, open https://auth.openai.com/activate and enter code ABCD-EFGH.
      Waiting for authorization...
    `);

    expect(parsed).toEqual({
      verificationUri: "https://auth.openai.com/activate",
      userCode: "ABCD-EFGH"
    });
  });

  it("extracts labels when the CLI prints verification_uri and user_code fields", () => {
    const parsed = parseDeviceAuthOutput(`
      verification_uri: https://example.com/device
      user_code: WXYZ-1234
    `);

    expect(parsed).toEqual({
      verificationUri: "https://example.com/device",
      userCode: "WXYZ-1234"
    });
  });

  it("extracts the real code from current Codex CLI ANSI output", () => {
    const parsed = parseDeviceAuthOutput(`
      Welcome to Codex [v\u001b[90m0.132.0\u001b[0m]
      Follow these steps to sign in with ChatGPT using device code authorization:

      1. Open this link in your browser and sign in to your account
         \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m

      2. Enter this one-time code \u001b[90m(expires in 15 minutes)\u001b[0m
         \u001b[94mDBKH-0FT1C\u001b[0m
    `);

    expect(parsed).toEqual({
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "DBKH-0FT1C"
    });
  });
});
