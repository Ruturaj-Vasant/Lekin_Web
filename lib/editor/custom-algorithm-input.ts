export type ParsedCustomParameters =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

export function parseCustomParameters(source: string): ParsedCustomParameters {
  try {
    const parsed: unknown = JSON.parse(source);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false, message: "Parameters must be a JSON object, such as {}." };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false,
      message: `Parameters are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function customAlgorithmFilename(name: string): string {
  const safe = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safe || "custom-algorithm"}.py`;
}
