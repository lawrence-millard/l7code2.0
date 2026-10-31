import { createOrchestrationEnvironmentAtoms } from "@l7code/client-runtime/state/orchestration";

import { connectionAtomRuntime } from "../connection/runtime";
import { recordReviewTurnDiffAnswer } from "./reviewTurnDiffs";

export const orchestrationEnvironment = createOrchestrationEnvironmentAtoms(connectionAtomRuntime, {
  onCheckpointDiffAnswer: recordReviewTurnDiffAnswer,
});
