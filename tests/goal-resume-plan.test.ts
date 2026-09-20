import { expect, test } from "vitest";
import {
  planGoalResume,
  goalResumeIntentSchema,
} from "../src/goal-resume-plan.js";
test("resume requires the exact active authorized revision and a live deadline", () => {
  const intent = { id: "goal", revision: 2 };
  const goal = { id: "goal", revision: 2, status: "active", deadlineAt: 200 };
  expect(planGoalResume(intent, goal, 100)).toBe("resume");
  expect(planGoalResume(intent, { ...goal, revision: 3 }, 100)).toBe(
    "goal_changed",
  );
  expect(planGoalResume(intent, { ...goal, id: "other" }, 100)).toBe(
    "goal_changed",
  );
  expect(planGoalResume(intent, { ...goal, status: "completed" }, 100)).toBe(
    "inactive",
  );
  expect(planGoalResume(intent, goal, 200)).toBe("expired");
  expect(
    planGoalResume(
      intent,
      { id: goal.id, revision: goal.revision, status: goal.status },
      999,
    ),
  ).toBe("resume");
});
test("invalid resume authority and clocks fail closed", () => {
  expect(() =>
    goalResumeIntentSchema.parse({ id: "x", revision: 0 }),
  ).toThrow();
  expect(() =>
    goalResumeIntentSchema.parse({ id: "x", revision: 1, enabled: true }),
  ).toThrow();
  expect(() =>
    planGoalResume(
      { id: "x", revision: 1 },
      { id: "x", revision: 1, status: "active" },
      NaN,
    ),
  ).toThrow();
});
