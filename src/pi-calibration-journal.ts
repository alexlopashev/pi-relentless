import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { planPiCalibration } from "./pi-calibration-plan.js";
import { CodingCalibrationJournal } from "./coding-calibration-journal.js";

type Context = Parameters<typeof planPiCalibration>[1];
const check = (context: Pick<Context, "signal" | "isProjectTrusted">) => {
  if (!context.isProjectTrusted() || context.signal?.aborted)
    throw new Error("Project no longer active or trusted");
};
export async function createPiCalibration(text: string, context: Context) {
  const plan = await planPiCalibration(text, context);
  const root = await realpath(context.cwd);
  check(context);
  if (plan.contract.cases.some((item) => item.request.sourceRoot !== root))
    throw new Error("Project root changed");
  const journal = new CodingCalibrationJournal(
    join(root, ".harness/calibration.sqlite"),
  );
  try {
    const state = journal.register(plan.contract);
    return {
      ...state,
      persisted: true as const,
      dispatched: false as const,
      artifactsVerified: false as const,
    };
  } finally {
    journal.close();
  }
}
export async function readPiCalibration(
  id: string,
  context: Omit<Context, "models">,
) {
  check(context);
  if (!id || id.length > 200) throw new Error("Invalid cohort ID");
  const root = await realpath(context.cwd);
  check(context);
  const journal = new CodingCalibrationJournal(
    join(root, ".harness/calibration.sqlite"),
    { readOnly: true },
  );
  try {
    const state = journal.read(id);
    if (
      state.plan.contract.cases.some((item) => item.request.sourceRoot !== root)
    )
      throw new Error("Cohort belongs to another project");
    return {
      ...state,
      persisted: true as const,
      dispatched: false as const,
      artifactsVerified: false as const,
    };
  } finally {
    journal.close();
  }
}
