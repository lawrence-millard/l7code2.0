import { createFileRoute } from "@tanstack/react-router";

import { AgentProjectsPage } from "../components/agentProjects/AgentProjectsPage";

export const Route = createFileRoute("/_chat/agent-projects/$projectId")({
  component: AgentProjectsPage,
});
