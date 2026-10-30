import { createBoatEnvironmentAtoms } from "@l7code/client-runtime/state/boat";

import { connectionAtomRuntime } from "../connection/runtime";

export const boatEnvironment = createBoatEnvironmentAtoms(connectionAtomRuntime);
