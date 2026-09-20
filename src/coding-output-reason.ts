import { z } from "zod";

export const codingOutputReasonSchema = z.enum([
  "invalid_reply",
  "invalid_json",
  "invalid_edits",
  "invalid_path",
  "missing_file",
  "invalid_replacement",
  "invalid_edit",
  "snapshot_required",
  "hash_mismatch",
  "text_occurrence",
  "overlapping_replacements",
  "aggregate_size",
  "file_size",
]);

export type CodingOutputReason = z.infer<typeof codingOutputReasonSchema>;

export class CodingEditError extends Error {
  readonly reason: CodingOutputReason;

  constructor(reason: CodingOutputReason, message: string) {
    super(message);
    this.reason = codingOutputReasonSchema.parse(reason);
  }
}
