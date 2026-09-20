import { expect, test } from "vitest";
import { failureOriginSchema } from "../src/failure-origin.js";

test("failure origins admit only bounded enum values, never external error text", () => {
  for (const origin of [
    "job_validation",
    "worker_setup",
    "worker_inference",
    "output_limit",
    "provider_response",
    "cancellation_unsettled",
    "worker_protocol",
    "worker_exit",
    "observer",
  ])
    expect(failureOriginSchema.parse(origin)).toBe(origin);
  for (const value of ["secret", "", null, {}, "provider_response: secret"])
    expect(failureOriginSchema.safeParse(value).success).toBe(false);
});
