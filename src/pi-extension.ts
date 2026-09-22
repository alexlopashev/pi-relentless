import { discoverLocalModels } from "./local-discovery.js";
import { startPiProgress } from "./pi-progress.js";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { piReviewAuthentication } from "./pi-review-auth.js";
import { assessRoutes } from "./model-evidence.js";
import { projectPiInventory } from "./pi-inventory.js";
import { readPiGoalStatus } from "./pi-goal-status.js";
import { createPiGoal } from "./pi-goal-create.js";
import { resumePiGoal } from "./pi-goal-resume.js";
import { runPiGoal } from "./pi-goal-run.js";
import {
  proposePiConfig,
  applyPiConfigProposal,
  readPiConfigProposal,
} from "./pi-config-proposal.js";
import { stepPiGoal } from "./pi-goal-step.js";
import { collectPiGoalProgress } from "./pi-goal-collection.js";
import { syncPiGoalWork } from "./pi-goal-progress.js";
import { admitPiGoalWork } from "./pi-goal-admission.js";
import { createPiGoalWork } from "./pi-goal-work.js";
import { readPiCalibrationReport } from "./pi-calibration-report.js";
import { admitPiCalibration } from "./pi-calibration-admission.js";
import { stepPiCalibrationTrial } from "./pi-calibration-step.js";
import { assertPiDispatch } from "./pi-dispatch-policy.js";
import { z } from "zod";
import { preparePiCalibrationTrial } from "./pi-calibration-prepare.js";
import {
  createPiCalibration,
  readPiCalibration,
} from "./pi-calibration-journal.js";
import { planPiCalibration } from "./pi-calibration-plan.js";
import { loadPiEvidence } from "./pi-evidence.js";
import { createPiWork } from "./pi-work-create.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { catalogEfforts, readInventoryHealth } from "./inventory-runtime.js";
import type { CatalogEntry } from "./model-inventory.js";
import { piRoleCandidates } from "./pi-role-routing.js";
import { eligibleRoutes, route, taskSchema } from "./router.js";
import { projectRoles, loadPiProjectConfig } from "./pi-project-config.js";
import { PiSessionWork } from "./pi-session-work.js";
import { workflowCli } from "./workflow-cli.js";

interface Context {
  signal?: AbortSignal;
  cwd: string;
  isProjectTrusted(): boolean;
  models?(): {
    available: readonly CatalogEntry[];
    catalog?: readonly CatalogEntry[];
    scoped: readonly { provider: string; model: string; effort?: string }[];
  };
  ui: {
    notify(message: string, type: "info" | "error"): void;
    confirm?(title: string, message: string): Promise<boolean>;
  };
}

/** Explicit user commands; extension loading never dispatches workers. */
export async function relentlessCommand(
  args: string,
  context: Context,
  execute?: (args: string[], root: string) => Promise<unknown>,
): Promise<void> {
  if (context.signal?.aborted) return;
  if (!context.isProjectTrusted()) {
    context.ui.notify("Relentless requires a trusted Pi project.", "error");
    return;
  }
  if (args.trim() === "inventory" || args.trim().startsWith("inventory ")) {
    try {
      const tokens = args.trim().split(/\s+/u);
      if (
        tokens.length > 2 ||
        (tokens[1] !== undefined && !/^(0|[1-9][0-9]*)$/u.test(tokens[1]))
      )
        throw new Error("Invalid inventory offset");
      const offset = Number(tokens[1] ?? 0);
      if (!Number.isSafeInteger(offset))
        throw new Error("Invalid inventory offset");
      const project = await loadPiProjectConfig(context.cwd, true);
      if (
        context.signal?.aborted ||
        !context.isProjectTrusted() ||
        !context.models
      )
        throw new Error("Missing active project inventory");
      const snapshot = readInventoryHealth(
        join(context.cwd, ".harness/ledger.sqlite"),
        join(context.cwd, ".harness/coding.sqlite"),
      );
      const result = projectPiInventory(
        project,
        context.models(),
        snapshot.health,
        Date.now(),
      );
      if (context.signal?.aborted || !context.isProjectTrusted()) return;
      const localDiscovery =
        offset === 0
          ? await discoverLocalModels(project?.localDiscovery, context.signal)
          : undefined;
      if (context.signal?.aborted || !context.isProjectTrusted()) return;
      context.ui.notify(
        JSON.stringify(
          {
            ...result,
            ...(localDiscovery === undefined ? {} : { localDiscovery }),
            unconfiguredAvailable: result.unconfiguredAvailable.slice(
              offset,
              offset + 20,
            ),
            unconfiguredTotal: result.unconfiguredAvailable.length,
            unconfiguredOffset: offset,
            nextOffset:
              offset + 20 < result.unconfiguredAvailable.length
                ? offset + 20
                : null,
            cooldownSource: snapshot.source,
          },
          null,
          2,
        ),
        "info",
      );
    } catch {
      context.ui.notify(
        "Relentless inventory unavailable. Check project configuration, Pi session models and intact health journals. No providers were probed.",
        "error",
      );
    }
    return;
  }
  if (
    args.trim().startsWith("review-auth-status ") ||
    args.trim().startsWith("review-auth-retry ")
  ) {
    try {
      const tokens = args.trim().split(/\s+/u);
      const retry = tokens[0] === "review-auth-retry";
      if (
        tokens.length !== (retry ? 3 : 2) ||
        !tokens[1] ||
        (retry && !/^[a-f0-9]{64}$/.test(tokens[2] ?? ""))
      )
        throw new Error("Invalid auth recovery command");
      const result = await piReviewAuthentication(
        tokens[1],
        context,
        retry ? tokens[2] : undefined,
      );
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless authentication recovery unavailable; require an intact setup-auth failure, current workflow digest and remaining review budget. No work was dispatched.",
        "error",
      );
    }
    return;
  }
  if (args.trim().startsWith("goal-status ")) {
    try {
      const tokens = args.trim().split(/\s+/u);
      if (tokens.length !== 2 || !tokens[1]) throw new Error("Invalid goal ID");
      const result = await readPiGoalStatus(tokens[1], context);
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless goal status unavailable. Check the goal ID, project trust and journal integrity. No work was started.",
        "error",
      );
    }
    return;
  }
  if (args.trim().startsWith("goal-create ")) {
    try {
      const result = await createPiGoal(args.trim().slice(12), context);
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless goal creation failed. Supply a valid goal contract without config in an active trusted project with configured routing. No workers were started.",
        "error",
      );
    }
    return;
  }
  if (
    args.trim().startsWith("config-propose ") ||
    args.trim().startsWith("config-apply ")
  ) {
    try {
      const propose = args.trim().startsWith("config-propose ");
      const result = await (propose ? proposePiConfig : applyPiConfigProposal)(
        args.trim().slice(propose ? 15 : 13),
        context,
      );
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless configuration proposal was not applied; require an intact proposal, unchanged settings, active trust and interactive confirmation. Inspect current settings before retrying.",
        "error",
      );
    }
    return;
  }
  if (
    args.trim().startsWith("calibration-prepare ") ||
    args.trim().startsWith("calibration-step ")
  ) {
    try {
      const step = args.trim().startsWith("calibration-step ");
      const text = args.trim().slice(step ? 17 : 20);
      if (Buffer.byteLength(text) > 65536)
        throw new Error("Input exceeds limit");
      const input = z
        .strictObject({
          cohortId: z.string().min(1).max(200),
          trialId: z.string().regex(/^[0-9a-f]{64}$/),
        })
        .parse(JSON.parse(text) as unknown);
      const result = await (
        step ? stepPiCalibrationTrial : preparePiCalibrationTrial
      )(input.cohortId, input.trialId, {
        ...context,
        isProjectTrusted: () => context.isProjectTrusted(),
        models: () => {
          if (!context.models) throw new Error("Missing Pi models");
          return context.models();
        },
      });
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless trial preparation or advancement failed; inspect saved pins, permissions and verification artifacts before retrying.",
        "error",
      );
    }
    return;
  }
  if (args.trim().startsWith("calibration-admit ")) {
    try {
      const result = await admitPiCalibration(args.trim().slice(18), {
        ...context,
        isProjectTrusted: () => context.isProjectTrusted(),
      });
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless calibration admission failed; require a complete prospective cohort with intact independent review and verification proofs.",
        "error",
      );
    }
    return;
  }
  if (args.trim().startsWith("calibration-report ")) {
    try {
      const result = await readPiCalibrationReport(args.trim().slice(19), {
        ...context,
        isProjectTrusted: () => context.isProjectTrusted(),
      });
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless cohort accounting failed; inspect journal integrity and trial bindings.",
        "error",
      );
    }
    return;
  }
  if (args.trim().startsWith("calibration-status ")) {
    try {
      const result = await readPiCalibration(args.trim().slice(19), {
        ...context,
        isProjectTrusted: () => context.isProjectTrusted(),
      });
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless calibration inspection failed; check the cohort ID and project journal.",
        "error",
      );
    }
    return;
  }
  if (
    args.trim().startsWith("calibration-plan ") ||
    args.trim().startsWith("calibration-create ")
  ) {
    const create = args.trim().startsWith("calibration-create ");
    try {
      const result = await (create ? createPiCalibration : planPiCalibration)(
        args.trim().slice(create ? 19 : 17),
        {
          ...context,
          isProjectTrusted: () => context.isProjectTrusted(),
          models: () => {
            if (!context.models) throw new Error("Missing Pi models");
            return context.models();
          },
        },
      );
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Relentless calibration planning or creation failed; check cases, project roles, Pi scope and independent reviewers.",
        "error",
      );
    }
    return;
  }
  if (
    args.trim().startsWith("goal-step ") ||
    args.trim().startsWith("goal-run ")
  ) {
    try {
      const tokens = args.trim().split(/\s+/u);
      if (tokens.length !== 2 || !tokens[1] || !context.models)
        throw new Error("Expected goal ID and Pi registry");
      const goalContext = {
        ...context,
        models: () => {
          if (!context.models) throw new Error("Missing Pi models");
          return context.models();
        },
        isProjectTrusted: () => context.isProjectTrusted(),
      };
      const result =
        tokens[0] === "goal-run"
          ? await runPiGoal(tokens[1], goalContext, {
              progress: (state) => {
                context.ui.notify(JSON.stringify(state, null, 2), "info");
              },
            })
          : await stepPiGoal(tokens[1], goalContext);
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Goal execution stopped; inspect goal and workflow journals before continuing.",
        "error",
      );
    }
    return;
  }
  if (
    args.trim().startsWith("goal-admit ") ||
    args.trim().startsWith("goal-sync ")
  ) {
    try {
      const tokens = args.trim().split(/\s+/u);
      if (tokens.length !== 2 || !tokens[1])
        throw new Error("Expected coding ID");
      const result = await (
        tokens[0] === "goal-sync" ? syncPiGoalWork : admitPiGoalWork
      )(tokens[1], context);
      context.ui.notify(JSON.stringify(result, null, 2), "info");
    } catch {
      context.ui.notify(
        "Goal operation failed; check current goal and workflow evidence.",
        "error",
      );
    }
    return;
  }
  if (
    args.trim().startsWith("create ") ||
    args.trim().startsWith("goal-work ")
  ) {
    try {
      if (!context.models) throw new Error("Missing Pi models");
      const fromGoal = args.trim().startsWith("goal-work ");
      const result = await (fromGoal ? createPiGoalWork : createPiWork)(
        args.trim().slice(fromGoal ? 10 : 7),
        {
          ...context,
          isProjectTrusted: () => context.isProjectTrusted(),
          models: () => {
            if (!context.models) throw new Error("Missing Pi models");
            return context.models();
          },
        },
      );
      context.ui.notify(
        JSON.stringify(result, null, 2),
        result.phase === "creation_incomplete" ? "error" : "info",
      );
    } catch {
      context.ui.notify(
        "Relentless creation failed; check task, project policy and independent review availability.",
        "error",
      );
    }
    return;
  }
  if (args.trim().startsWith("explain-proposal ")) {
    try {
      const match = /^explain-proposal\s+(\S+)\s+(\S+)\s+([\s\S]+)$/u.exec(
        args.trim(),
      );
      if (!match?.[1] || !match[2] || !match[3])
        throw new Error("Invalid proposed explanation command");
      const proposal = await readPiConfigProposal(match[1], context);
      const role = projectRoles.parse(match[2]);
      const task = taskSchema.parse(JSON.parse(match[3]) as unknown);
      if (!task.optimization || !context.models)
        throw new Error("Optimization policy and Pi models required");
      const configured = proposal.after;
      const project = await loadPiEvidence(context.cwd, configured);
      const models = context.models();
      const health = readInventoryHealth(
        join(context.cwd, ".harness/ledger.sqlite"),
        join(context.cwd, ".harness/coding.sqlite"),
      );
      const now = Date.now();
      const candidates = piRoleCandidates(
        project,
        role,
        models.available,
        models.scoped,
        health.health,
        now,
      );
      const routes = eligibleRoutes(
        task,
        candidates,
        project.routing.allowMetered,
      );
      const assessments = assessRoutes(
        routes,
        project.routing.observations ?? [],
        task.optimization,
        now,
      );
      await readPiConfigProposal(match[1], context);
      if (!context.isProjectTrusted() || context.signal?.aborted)
        throw new Error("Project no longer active");
      context.ui.notify(
        JSON.stringify(
          {
            role,
            policy: task.optimization,
            eligibleRoutes: routes.length,
            assessments,
            capacity: "unverified",
            dispatched: false,
            configured: false,
            proposed: true,
            proposalId: match[1],
          },
          null,
          2,
        ),
        "info",
      );
    } catch {
      context.ui.notify(
        "No permitted proposed role route; check proposal freshness, project policy, Pi scope, availability and evidence.",
        "error",
      );
    }
    return;
  }
  if (args.trim().startsWith("route ") || args.trim().startsWith("explain ")) {
    try {
      const explain = args.trim().startsWith("explain ");
      const match = /^(?:route|explain)\s+(\S+)\s+([\s\S]+)$/u.exec(
        args.trim(),
      );
      const role = projectRoles.parse(match?.[1]);
      const task = taskSchema.parse(
        JSON.parse(match?.[2] ?? "null") as unknown,
      );
      const configured = await loadPiProjectConfig(context.cwd, true);
      if (!configured || !context.models)
        throw new Error("Missing project policy or Pi models");
      const project = await loadPiEvidence(context.cwd, configured);
      const models = context.models();
      const health = readInventoryHealth(
        join(context.cwd, ".harness/ledger.sqlite"),
        join(context.cwd, ".harness/coding.sqlite"),
      );
      const now = Date.now();
      const candidates = piRoleCandidates(
        project,
        role,
        models.available,
        models.scoped,
        health.health,
        now,
      );
      if (explain) {
        if (!task.optimization) throw new Error("Optimization policy required");
        const routes = eligibleRoutes(
          task,
          candidates,
          project.routing.allowMetered,
        );
        const assessments = assessRoutes(
          routes,
          project.routing.observations ?? [],
          task.optimization,
          now,
        );
        if (!context.isProjectTrusted() || context.signal?.aborted)
          throw new Error("Project no longer active");
        context.ui.notify(
          JSON.stringify(
            {
              role,
              policy: task.optimization,
              eligibleRoutes: routes.length,
              assessments,
              capacity: "unverified",
              dispatched: false,
              configured: false,
            },
            null,
            2,
          ),
          "info",
        );
        return;
      }
      const selected = route(
        task,
        candidates,
        project.routing.allowMetered,
        project.routing.observations,
        now,
      );
      context.ui.notify(
        JSON.stringify(
          {
            role,
            candidate: selected.candidate.name,
            provider: selected.candidate.provider,
            model: selected.candidate.model,
            billing: selected.candidate.billing,
            effort: selected.effort,
            basis: task.optimization
              ? project.evidence?.calibrations?.length
                ? "local_calibration_and_configured_evidence"
                : project.evidence
                  ? "local_evaluation_and_configured_evidence"
                  : "configured_workload_evidence"
              : "configured_policy",
            capacity: "unverified",
            dispatched: false,
          },
          null,
          2,
        ),
        "info",
      );
    } catch {
      context.ui.notify(
        "No permitted role route; check project policy, Pi scope, availability and evidence.",
        "error",
      );
    }
    return;
  }
  if (args.trim() === "config") {
    try {
      const config = await loadPiProjectConfig(context.cwd, true);
      context.ui.notify(
        config
          ? JSON.stringify(config, null, 2)
          : "No relentless section in project Pi settings.",
        "info",
      );
    } catch {
      context.ui.notify("Invalid Relentless project configuration.", "error");
    }
    return;
  }
  const [command, id, ...extra] = args.trim().split(/\s+/u);
  if (
    !id ||
    !command ||
    (command === "run-verified"
      ? extra.length !== 1
      : extra.length > 0 || (command !== "status" && command !== "resume"))
  ) {
    context.ui.notify(
      "Usage: /relentless explain <role> <task-json-with-optimization> | /relentless explain-proposal <proposal-id> <role> <task-json-with-optimization> | /relentless inventory | /relentless goal-status <goal-id> | /relentless goal-create <contract-json> | /relentless goal-run <goal-id> | /relentless config-propose <relentless-json> | /relentless config-apply <proposal-id> | /relentless goal-step <goal-id> | /relentless goal-sync <coding-id> | /relentless goal-admit <coding-id> | /relentless goal-work <goal-task-json> | /relentless calibration-plan <suite-json> | /relentless create <task-json> | /relentless status <coding-id> | /relentless resume <coding-id> | /relentless run-verified <coding-id> <execution.json>",
      "info",
    );
    return;
  }
  try {
    const result = await (execute
      ? execute([command, id, ...extra], context.cwd)
      : workflowCli([command, id, ...extra], context.cwd, {
          beforeVerification: () => {
            if (!context.isProjectTrusted() || context.signal?.aborted)
              return Promise.reject(
                new Error("Project no longer active or trusted"),
              );
            return Promise.resolve();
          },
          ...(context.signal ? { signal: context.signal } : {}),
          beforeDispatch: (role, selection, config) =>
            assertPiDispatch(context, role, selection, config),
        }));
    context.ui.notify(JSON.stringify(result, null, 2), "info");
  } catch {
    context.ui.notify(
      "Relentless command failed; inspect the project journal using the CLI.",
      "error",
    );
  } finally {
    if (command === "resume" || command === "run-verified") {
      const progress = await collectPiGoalProgress(id, context);
      if (progress === "pending" && !context.signal?.aborted)
        context.ui.notify(
          "Relentless goal progress is pending; reconcile the workflow if needed, then run /relentless goal-sync with this coding ID.",
          "error",
        );
    }
  }
}

export function registerRelentless(
  pi: Pick<ExtensionAPI, "registerCommand" | "on">,
): void {
  const work = new PiSessionWork();
  let generation = 0;
  let sessionOpen = true;
  let stopProgress = () => {
    // No operation has acquired the footer yet.
  };
  const progress = (
    args: string,
    context: ExtensionContext,
    signal: AbortSignal,
    current: number,
  ) => {
    const [verb, id] = args.trim().split(/\s+/u);
    const label = [
      "goal-step",
      "goal-run",
      "resume",
      "run-verified",
      "config-apply",
    ].includes(verb ?? "")
      ? (verb ?? "command")
      : "command";
    const isCurrent = () => sessionOpen && current === generation;
    const isTrusted = () => context.isProjectTrusted();
    const read =
      id &&
      /^[a-f0-9-]{36}$/u.test(id) &&
      (verb === "goal-step" || verb === "goal-run")
        ? async () => {
            const status = await readPiGoalStatus(id, {
              cwd: context.cwd,
              signal,
              isProjectTrusted: () => isCurrent() && isTrusted(),
            });
            const phases = new Set(
              status.tasks.flatMap((task) =>
                task.work
                  .filter(
                    (item) =>
                      item.currentRevision &&
                      item.workflow?.currentCodingRevision,
                  )
                  .map((item) => item.workflow?.phase),
              ),
            );
            if (phases.has("reviewing") || phases.has("review"))
              return "Independent review";
            if (phases.has("coding")) return "Coding";
            if (phases.has("verification_required")) return "Verification";
            return "Reconciling goal";
          }
        : undefined;
    const stop = startPiProgress({
      label,
      signal,
      hasUI: context.hasUI,
      isCurrent,
      isTrusted,
      setStatus: (key, text) => {
        context.ui.setStatus(key, text);
      },
      ...(read ? { read } : {}),
    });
    stopProgress = stop;
    return stop;
  };
  pi.on("session_shutdown", () => {
    stopProgress();
    generation++;
    sessionOpen = false;
    work.stop();
  });
  pi.on("session_start", async (_event, context) => {
    stopProgress();
    generation++;
    const current = generation;
    sessionOpen = true;
    work.stop();
    work.start();
    const active = () =>
      sessionOpen &&
      current === generation &&
      !context.signal?.aborted &&
      context.isProjectTrusted();
    if (!active()) return;
    try {
      const project = await loadPiProjectConfig(context.cwd, true);
      if (!active() || !project?.resumeGoal) return;
      const resumeId = project.resumeGoal.id;
      // Keep startup responsive; the session slot tracks cancellation until settled.
      void work
        .run(async (signal) => {
          const combined = context.signal
            ? AbortSignal.any([signal, context.signal])
            : signal;
          const stop = progress(
            `goal-run ${resumeId}`,
            context,
            combined,
            current,
          );
          try {
            const result = await resumePiGoal({
              cwd: context.cwd,
              signal: combined,
              isProjectTrusted: () => active() && !combined.aborted,
              models: () => ({
                available: context.modelRegistry
                  .getAvailable()
                  .map((model) => ({
                    provider: model.provider,
                    model: model.id,
                    efforts: catalogEfforts(model),
                  })),
                scoped: context.scopedModels.map(
                  ({ model, thinkingLevel }) => ({
                    provider: model.provider,
                    model: model.id,
                    ...(thinkingLevel === undefined
                      ? {}
                      : { effort: thinkingLevel }),
                  }),
                ),
              }),
            });
            if (result && active() && !combined.aborted)
              context.ui.notify(JSON.stringify(result, null, 2), "info");
          } finally {
            stop();
          }
        })
        .catch(() => {
          if (active())
            context.ui.notify(
              "Relentless automatic resume stopped or another session operation is still settling; inspect the goal journal before resuming.",
              "error",
            );
        });
    } catch {
      if (active())
        context.ui.notify(
          "Relentless automatic resume could not read its project configuration.",
          "error",
        );
    }
  });
  pi.registerCommand("relentless", {
    description:
      "Inspect or advance the current project's durable Relentless workflow",
    handler: async (args, context) => {
      if (args.trim() === "pause") {
        if (!sessionOpen || !context.isProjectTrusted()) return;
        stopProgress();
        generation++;
        work.stop();
        work.start();
        context.ui.notify(
          "Relentless paused for this session. Saved restart opt-in remains for the next session; active work must settle before another command can run.",
          "info",
        );
        return;
      }
      const current = generation;
      try {
        await work.run(async (signal) => {
          const combined = context.signal
            ? AbortSignal.any([signal, context.signal])
            : signal;
          const stop = progress(args, context, combined, current);
          try {
            await relentlessCommand(args, {
              cwd: context.cwd,
              signal: combined,
              isProjectTrusted: () =>
                sessionOpen &&
                current === generation &&
                !combined.aborted &&
                context.isProjectTrusted(),
              ui: {
                confirm: async (title, message) => {
                  const active = () =>
                    !combined.aborted &&
                    current === generation &&
                    context.isProjectTrusted();
                  if (!context.hasUI || !active())
                    throw new Error("Interactive session required");
                  const answer = await context.ui.confirm(title, message);
                  if (!active())
                    throw new Error("Configuration review session changed");
                  return answer;
                },
                notify: (message, type) => {
                  if (!combined.aborted && current === generation)
                    context.ui.notify(message, type);
                },
              },
              models: () => ({
                ...(args.trim() === "inventory" ||
                args.trim().startsWith("inventory ")
                  ? {
                      catalog: context.modelRegistry.getAll().map((model) => ({
                        provider: model.provider,
                        model: model.id,
                        efforts: catalogEfforts(model),
                      })),
                    }
                  : {}),
                available: context.modelRegistry
                  .getAvailable()
                  .map((model) => ({
                    provider: model.provider,
                    model: model.id,
                    efforts: catalogEfforts(model),
                  })),
                scoped: context.scopedModels.map(
                  ({ model, thinkingLevel }) => ({
                    provider: model.provider,
                    model: model.id,
                    ...(thinkingLevel === undefined
                      ? {}
                      : { effort: thinkingLevel }),
                  }),
                ),
              }),
            });
          } finally {
            stop();
          }
        });
      } catch {
        if (sessionOpen && current === generation)
          context.ui.notify(
            "Relentless is busy or this session has closed.",
            "error",
          );
      }
    },
  });
}
