import type { EnvironmentProject } from "@l7code/client-runtime/state/shell";
import type { EnvironmentId, ProjectId } from "@l7code/contracts";

import type { SpaceId, ZeronSpace } from "./types";

export function spaceIdFor(
  environmentId: EnvironmentId | string,
  projectId: ProjectId | string,
): SpaceId {
  return `${environmentId}:${projectId}`;
}

export function parseSpaceId(spaceId: string): {
  environmentId: string;
  projectId: string;
} | null {
  const split = spaceId.indexOf(":");
  if (split <= 0 || split === spaceId.length - 1) return null;
  return {
    environmentId: spaceId.slice(0, split),
    projectId: spaceId.slice(split + 1),
  };
}

export function projectToSpace(
  project: EnvironmentProject,
  environmentLabel = "Local",
): ZeronSpace {
  return {
    spaceId: spaceIdFor(project.environmentId, project.id),
    environmentId: project.environmentId,
    projectId: project.id,
    label: project.title?.trim() || project.workspaceRoot || "Untitled space",
    workspaceRoot: project.workspaceRoot,
    environmentLabel,
  };
}

export function filterSpaces(spaces: ReadonlyArray<ZeronSpace>, query: string): ZeronSpace[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...spaces];
  return spaces.filter(
    (space) =>
      space.label.toLowerCase().includes(q) ||
      space.workspaceRoot.toLowerCase().includes(q) ||
      space.environmentLabel.toLowerCase().includes(q),
  );
}
