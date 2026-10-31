import type { CommandCodeSettings } from "../settings.ts";

/** Prefer an explicit binaryPath; else probe cmd → command-code → Windows cmdc. */
export function resolveCommandCodeBinary(
  binaryPath: string | null | undefined,
  platform: NodeJS.Platform = process.platform,
): string {
  const configured = binaryPath?.trim();
  if (configured) return configured;
  if (platform === "win32") return "cmdc";
  return "cmd";
}

export const COMMAND_CODE_BINARY_CANDIDATES = ["cmd", "command-code", "cmdc"] as const;

export function commandCodeBinaryFromSettings(settings: Pick<CommandCodeSettings, "binaryPath">): string {
  return resolveCommandCodeBinary(settings.binaryPath);
}
