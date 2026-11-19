import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";
import { threadTokenUsageRevision } from "@t3tools/client-runtime/state/thread-token-usage";
import { Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import { environmentShell } from "./shell";
import { environmentThreadDetails } from "./threads";
import { recordReviewTurnDiffAnswer } from "./reviewTurnDiffs";

export const orchestrationEnvironment = createOrchestrationEnvironmentAtoms(connectionAtomRuntime, {
  shellState: environmentShell.stateValueAtom,
  onCheckpointDiffAnswer: recordReviewTurnDiffAnswer,

  threadTokenUsageRevision: (ref) =>
    Atom.make((get) =>
      threadTokenUsageRevision(
        get(environmentThreadDetails.quietThreadAtom(ref))?.projection.providerTurns ?? [],
      ),
    ),
});
