import type { OrchestrationV2DomainEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { forkParked } from "../serverActivation.ts";
import { WebPushNotifications } from "./WebPushNotifications.ts";

/** Consume new completed-run events, including completion after checkpointing.
 * No snapshot replay: enabling notifications never alerts for old conversations.
 */
export const start = Effect.gen(function* () {
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectService.ProjectService;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const notifications = yield* WebPushNotifications;
  const environmentId = yield* environment.getEnvironmentId;
  const worker = yield* makeDrainableWorker((event: OrchestrationV2DomainEvent) =>
    Effect.gen(function* () {
      if (
        event.type !== "run.updated" ||
        event.payload.status !== "completed" ||
        event.payload.completedAt === null
      )
        return;
      const thread = yield* threads.getThreadShell(event.threadId);
      if (thread === null || thread.archivedAt !== null) return;
      const project = yield* projects.getById(thread.projectId);
      yield* notifications.complete({
        environmentId,
        threadId: event.threadId,
        runOrdinal: event.payload.ordinal,
        completedAt: DateTime.formatIso(event.payload.completedAt),
        title: thread.title.slice(0, 180),
        body: [
          "Agent turn completed.",
          Option.isSome(project) ? project.value.title : null,
          thread.branch,
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 300),
      });
    }).pipe(Effect.catch(() => Effect.logWarning("Unable to deliver completion notifications"))),
  );
  yield* forkParked(
    Stream.runForEach(threads.streamDomainEvents, (event) =>
      event.type === "run.updated" && event.payload.status === "completed"
        ? worker.enqueue(event)
        : Effect.void,
    ),
  );
});
