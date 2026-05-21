export type DeviceAuthDetails = {
  verificationUri: string;
  userCode: string;
};

const URL_PATTERN = /https?:\/\/[^\s)"'<]+/i;
const LABELED_URL_PATTERN =
  /(?:verification[_\s-]*(?:uri|url)|device[_\s-]*(?:uri|url)|login[_\s-]*url|url)\s*[:=]\s*(https?:\/\/[^\s)"'<]+)/i;
const LABELED_CODE_PATTERN =
  /(?:^|\n)\s*(?:user[_\s-]*code|device[_\s-]*code|verification[_\s-]*code|code)\s*[:=]\s*([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})*)/i;
const NEXT_LINE_CODE_PATTERN =
  /enter(?:\s+this)?(?:\s+one-time)?\s+code[^\n]*(?:\n\s*)+([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})*)/i;
const INLINE_CODE_PATTERN = /enter\s+code\s+([A-Z0-9]{4,}(?:-[A-Z0-9]{4,})*)/i;
const ANSI_PATTERN = /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function parseDeviceAuthOutput(output: string): DeviceAuthDetails | null {
  const cleanOutput = output.replace(ANSI_PATTERN, "");
  const verificationUri =
    cleanOutput.match(LABELED_URL_PATTERN)?.[1] ?? cleanOutput.match(URL_PATTERN)?.[0];
  const userCode =
    cleanOutput.match(LABELED_CODE_PATTERN)?.[1] ??
    cleanOutput.match(INLINE_CODE_PATTERN)?.[1] ??
    cleanOutput.match(NEXT_LINE_CODE_PATTERN)?.[1];

  if (!verificationUri || !userCode) {
    return null;
  }

  return {
    verificationUri: verificationUri.replace(/[.,;:]+$/, ""),
    userCode: userCode.toUpperCase()
  };
}
