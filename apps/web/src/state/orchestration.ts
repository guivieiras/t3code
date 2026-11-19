import { ORCHESTRATION_V2_WS_METHODS } from "@t3tools/contracts";
import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";
import { threadTokenUsageRevision } from "@t3tools/client-runtime/state/thread-token-usage";
import { Atom } from "effect/reactivity";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";
import { environmentShell } from "./shell";
import { environmentThreadDetails } from "./threads";

export const orchestrationEnvironment = createOrchestrationEnvironmentAtoms(connectionAtomRuntime, {
  shellState: environmentShell.stateValueAtom,

  threadTokenUsageRevision: (ref) =>
    Atom.make((get) =>
      threadTokenUsageRevision(
        get(environmentThreadDetails.quietThreadAtom(ref))?.projection.providerTurns ?? [],
      ),
    ),
});

export const threadTitlesRead = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:orchestration:thread-titles-read",
  tag: ORCHESTRATION_V2_WS_METHODS.getThreadTitles,
});
