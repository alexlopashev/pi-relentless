export function oauthFreshness(
  type: string | undefined,
  expires: unknown,
  now: number,
  minValidityMs = 300000,
): "not_oauth" | "fresh" | "refresh_required" {
  if (
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(minValidityMs) ||
    now < 0 ||
    minValidityMs < 0 ||
    !Number.isSafeInteger(now + minValidityMs)
  ) {
    throw new RangeError("Invalid clock or validity window");
  }

  if (type !== "oauth") {
    return "not_oauth";
  }

  if (
    typeof expires === "number" &&
    Number.isFinite(expires) &&
    Number.isSafeInteger(expires) &&
    expires >= 0 &&
    expires > now + minValidityMs
  ) {
    return "fresh";
  }

  return "refresh_required";
}
