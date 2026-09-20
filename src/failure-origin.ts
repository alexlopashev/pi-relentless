import { z } from "zod";

export const failureOriginSchema = z.enum([
  "job_validation",
  "worker_setup",
  "coding_workspace",
  "coding_checks",
  "coding_authority",
  "coding_output",
  "coding_publication",
  "worker_inference",
  "output_limit",
  "provider_response",
  "cancellation_unsettled",
  "worker_protocol",
  "worker_exit",
  "observer",
]);

export type FailureOrigin = z.infer<typeof failureOriginSchema>;
