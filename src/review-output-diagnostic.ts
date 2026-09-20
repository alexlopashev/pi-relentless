type ReviewOutputShape =
  "empty" | "fenced" | "json_like" | "other" | "oversized";

interface ReviewOutputDiagnostic {
  bytes: number;
  shape: ReviewOutputShape;
}

export function reviewOutputDiagnostic(output: string): ReviewOutputDiagnostic {
  const byteCount = new TextEncoder().encode(output).length;
  const bytes = Math.min(byteCount, 65537);

  if (byteCount > 65536) {
    return { bytes, shape: "oversized" };
  }

  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return { bytes, shape: "empty" };
  }
  if (trimmed.startsWith("```")) {
    return { bytes, shape: "fenced" };
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { bytes, shape: "json_like" };
  }
  return { bytes, shape: "other" };
}
