import type { EnvironmentId, ProjectId } from "@l7code/contracts";

/**
 * Zeron "space" ≈ one environment + project pair on the existing read model.
 * Stable key matches sidebar scoped project keys.
 */
export type SpaceId = `${string}:${string}`;

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
