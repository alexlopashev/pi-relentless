import {
  codingOutputReasonSchema,
  type CodingOutputReason,
} from "./coding-output-reason.js";
import { z } from "zod";
import { failureOriginSchema, type FailureOrigin } from "./failure-origin.js";
export const failureKind = z.enum([
  "quota",
  "outage",
  "timeout",
  "session",
  "context",
  "unavailable",
  "auth",
  "policy",
  "permission",
  "approval",
  "unknown",
  "invalid_output",
  "interrupted",
]);
export type FailureKind = z.infer<typeof failureKind>;
/** Only normalized codes cross the worker boundary; never persist arbitrary provider errors. */
export class Failure extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly retryAfterMs?: number,
    readonly origin?: FailureOrigin,
    readonly outputReason?: CodingOutputReason,
  ) {
    super(
      kind === "timeout"
        ? "Worker deadline exceeded"
        : `Worker failure: ${kind}`,
    );
    if (origin !== undefined) failureOriginSchema.parse(origin);
    if (outputReason !== undefined) {
      codingOutputReasonSchema.parse(outputReason);
      if (kind !== "unknown" || origin !== "coding_output")
        throw new Error("Output reason requires coding validation failure");
    }
  }
}
export function classify(error: unknown): Failure {
  if (error instanceof Failure) return error;
  // Deliberately conservative: prose is not sufficient authority for replay.
  return new Failure("unknown");
}
export function retryable(kind: FailureKind): boolean {
  return [
    "quota",
    "outage",
    "timeout",
    "session",
    "context",
    "unavailable",
    "invalid_output",
    "interrupted",
  ].includes(kind);
}
export function fromProviderMessage(message: string): Failure {
  if (
    /cyberPolicy|misalignmentPolicyViolation|policy (violation|denial)|safety policy|content[_ ]filter/i.test(
      message,
    )
  )
    return new Failure("policy");
  if (/permission denied|forbidden/i.test(message))
    return new Failure("permission");
  if (/waiting for approval|approval required/i.test(message))
    return new Failure("approval");
  // Pi flattens HTTP errors into this wrapper; retain the status for classification.
  const wrapped = /^OpenAI API error \((\d{3})\):\s*(.*)$/s.exec(message);
  if (wrapped?.[1] !== undefined && wrapped[2] !== undefined)
    return fromProviderMessage(`${wrapped[1]} ${wrapped[2]}`);
  if (
    /^(402|HTTP 402)\b/.test(message) &&
    /Grok Build usage balance exhausted/i.test(message)
  )
    return new Failure("quota");
  if (
    /^(Connection error\.?|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/i.test(
      message.trim(),
    )
  )
    return new Failure("outage");
  if (message.startsWith("Login required for ")) return new Failure("auth");
  if (message.startsWith("Unknown model ")) return new Failure("unavailable");
  if (/^(401|HTTP 401)\b/.test(message)) return new Failure("auth");
  if (/^(403|HTTP 403)\b/.test(message)) return new Failure("permission");
  if (/^(429|HTTP 429)\b/.test(message)) return new Failure("quota");
  if (/^(50[0234]|HTTP 50[0234])\b/.test(message)) return new Failure("outage");
  return new Failure("unknown");
}
export function fromProviderError(error: unknown, now = Date.now()): Failure {
  if (error instanceof Failure) return error;
  if (!error || typeof error !== "object") return new Failure("unknown");
  const code: unknown = Reflect.get(error, "code");
  const status: unknown = Reflect.get(error, "status");
  const message: unknown = Reflect.get(error, "message");
  const explicit: Record<string, FailureKind> = {
    cyberPolicy: "policy",
    misalignmentPolicyViolation: "policy",
    content_filter: "policy",
    rateLimitExceeded: "quota",
    usageLimitExceeded: "quota",
    serverOverloaded: "outage",
    contextWindowExceeded: "context",
    sessionNotFound: "session",
    modelNotFound: "unavailable",
    unauthorized: "auth",
    sessionBudgetExceeded: "approval",
  };
  const textFailure =
    typeof message === "string"
      ? fromProviderMessage(message)
      : new Failure("unknown");
  let kind = typeof code === "string" ? explicit[code] : undefined;
  if (status === 401 || status === 403)
    kind = mergeFailure(
      kind ? new Failure(kind) : undefined,
      new Failure(status === 403 ? "permission" : "auth"),
    ).kind;
  if (["policy", "permission", "approval", "auth"].includes(textFailure.kind))
    kind = mergeFailure(kind ? new Failure(kind) : undefined, textFailure).kind;
  kind ??=
    status === 429
      ? "quota"
      : status === 401
        ? "auth"
        : status === 403
          ? "permission"
          : typeof status === "number" && status >= 500 && status <= 599
            ? "outage"
            : textFailure.kind;
  const headers: unknown = Reflect.get(error, "headers");
  const after: unknown =
    headers instanceof Headers
      ? headers.get("retry-after")
      : headers && typeof headers === "object"
        ? Reflect.get(headers, "retry-after")
        : undefined;
  let delay: number | undefined;
  if (typeof after === "string") {
    const value = /^\d+(\.\d+)?$/.test(after)
      ? Number(after) * 1000
      : Date.parse(after) - now;
    if (
      Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER - now
    )
      delay = Math.ceil(value);
  }
  return new Failure(kind, delay);
}
/** Preserve actionable failures which arrive while transport cancellation is settling. */
export function mergeFailure(
  current: Failure | undefined,
  observed: Failure,
): Failure {
  const priority = (kind: FailureKind): number => {
    if (kind === "policy" || kind === "permission") return 5;
    if (["approval", "auth", "unknown"].includes(kind)) return 4;
    if (kind === "quota") return 3;
    if (kind === "interrupted" || kind === "timeout") return 1;
    return 2;
  };
  if (!current || priority(observed.kind) > priority(current.kind))
    return observed;
  if (
    current.kind === observed.kind &&
    (observed.retryAfterMs ?? 0) > (current.retryAfterMs ?? 0)
  )
    return observed;
  return current;
}
