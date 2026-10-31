import { createAgentProjectEnvironmentAtoms } from "@l7code/client-runtime/state/agentProjects";

import { connectionAtomRuntime } from "../connection/runtime";

export const agentProjectEnvironment = createAgentProjectEnvironmentAtoms(connectionAtomRuntime);
