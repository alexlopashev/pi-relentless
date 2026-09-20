import { z } from "zod";

const findingSchema = z
  .object({
    path: z.string().min(1).max(240),
    line: z.number().int().positive().refine(Number.isSafeInteger),
    message: z.string().min(1).max(2000),
  })
  .strict();

const reviewFindingsSchema = z
  .object({
    verdict: z.enum(["no_findings", "changes_requested"]),
    findings: z.array(findingSchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const empty = value.findings.length === 0;
    if ((value.verdict === "no_findings") !== empty) {
      context.addIssue({
        code: "custom",
        message: "Verdict contradicts findings",
      });
    }
  });

export type ReviewFindings = z.infer<typeof reviewFindingsSchema>;

export type ReviewValidationCode =
  | "output_too_large"
  | "invalid_json"
  | "invalid_schema"
  | "unknown_file"
  | "line_out_of_range";

export class ReviewValidationError extends Error {
  readonly code: ReviewValidationCode;

  static message(code: ReviewValidationCode): string {
    return code;
  }

  constructor(code: ReviewValidationCode) {
    super(ReviewValidationError.message(code));
    this.code = code;
  }
}

export function parseReviewFindings(
  output: string,
  files: Readonly<Record<string, string>>,
): ReviewFindings {
  if (new TextEncoder().encode(output).length > 65536) {
    throw new ReviewValidationError("output_too_large");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new ReviewValidationError("invalid_json");
  }

  const result = reviewFindingsSchema.safeParse(parsed);
  if (!result.success) {
    throw new ReviewValidationError("invalid_schema");
  }

  for (const finding of result.data.findings) {
    if (!Object.prototype.hasOwnProperty.call(files, finding.path)) {
      throw new ReviewValidationError("unknown_file");
    }
    const content = files[finding.path];
    if (content === undefined || finding.line > content.split("\n").length) {
      throw new ReviewValidationError("line_out_of_range");
    }
  }
  return result.data;
}
