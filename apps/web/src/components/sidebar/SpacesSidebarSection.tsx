import type { EnvironmentId, EnvironmentMachineKind } from "@l7code/contracts";
import { FolderIcon, LayersIcon, SettingsIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { ProjectEnvironmentBadge } from "../ProjectEnvironmentBadge";
import { ProjectFavicon } from "../ProjectFavicon";
import { Button } from "../ui/button";

export type SpacesSidebarSectionProps = {
  readonly spaces: readonly SidebarProjectSnapshot[];
  readonly selectedSpaceKeys: readonly string[];
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly machineByEnvironmentId: ReadonlyMap<EnvironmentId, EnvironmentMachineKind>;
  readonly showEnvironments: boolean;
  readonly spaceQuery: string;
  readonly onSpaceQueryChange: (query: string) => void;
  readonly onSelectSpace: (spaceKey: string | null) => void;
  readonly onToggleSpace: (spaceKey: string) => void;
  readonly onSpaceSettings?: (space: SidebarProjectSnapshot) => void;
};

function spaceMatchesQuery(space: SidebarProjectSnapshot, query: string): boolean {
  if (query.length === 0) return true;
  const haystack = [
    space.displayName,
    ...space.memberProjectRefs.map((ref) => ref.environmentId),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/** Zeron-style Spaces rail: searchable (device, folder) rows above Sessions. */
export const SpacesSidebarSection = memo(function SpacesSidebarSection({
  spaces,
  selectedSpaceKeys,
  primaryEnvironmentId,
  machineByEnvironmentId,
  showEnvironments,
  spaceQuery,
  onSpaceQueryChange,
  onSelectSpace,
  onToggleSpace,
  onSpaceSettings,
}: SpacesSidebarSectionProps) {
  const filtered = spaces.filter((space) => spaceMatchesQuery(space, spaceQuery.trim()));
  const allSelected = selectedSpaceKeys.length === 0;

  return (
    <section
      aria-label="Spaces"
      className="flex flex-col gap-2 border-b border-sidebar-border/70 px-[var(--sidebar-content-inset)] pb-3"
      data-l7-spaces-rail=""
    >
      <div className="flex items-center gap-2 px-0.5 pt-1">
        <LayersIcon aria-hidden className="size-3.5 text-(--sidebar-icon-color)" />
        <h2 className="font-[family-name:var(--font-brand)] text-[0.68rem] font-semibold tracking-[0.14em] text-sidebar-muted-foreground uppercase">
          Spaces
        </h2>
      </div>
      <label className="flex h-8 items-center gap-2 rounded-lg border border-(--frost-sidebar-border) bg-[color-mix(in_oklab,var(--sidebar-control-surface)_70%,transparent)] px-2.5 text-sidebar-muted-foreground shadow-[inset_0_1px_0_var(--frost-elevation-1)] backdrop-blur-sm focus-within:border-ring/50 focus-within:text-sidebar-foreground">
        <FolderIcon className="size-3.5 shrink-0 text-(--sidebar-icon-color)" />
        <input
          aria-label="Search spaces"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-sidebar-muted-foreground/70"
          onChange={(event) => onSpaceQueryChange(event.currentTarget.value)}
          placeholder="Search spaces…"
          type="search"
          value={spaceQuery}
        />
      </label>
      <ul className="flex max-h-[9.5rem] flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5">
        <li>
          <button
            type="button"
            aria-pressed={allSelected}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
              allSelected
                ? "bg-[color-mix(in_oklab,var(--sidebar-row-selected)_88%,transparent)] text-sidebar-foreground shadow-[inset_0_0_0_1px_var(--frost-sidebar-border)]"
                : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
            )}
            onClick={() => onSelectSpace(null)}
          >
            <span className="truncate font-medium">All spaces</span>
          </button>
        </li>
        {filtered.map((space) => {
          const selected = selectedSpaceKeys.includes(space.projectKey);
          const deviceLabel =
            space.memberProjectRefs
              .map((ref) => ref.environmentId)
              .filter((id, index, all) => all.indexOf(id) === index)
              .slice(0, 1)
              .join("") || null;
          return (
            <li key={space.projectKey}>
              <button
                type="button"
                aria-pressed={selected}
                className={cn(
                  "group/space flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  selected
                    ? "bg-[color-mix(in_oklab,var(--sidebar-row-selected)_88%,transparent)] text-sidebar-foreground shadow-[inset_0_0_0_1px_var(--frost-sidebar-border)]"
                    : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
                )}
                onClick={(event) => {
                  if (event.shiftKey) {
                    onToggleSpace(space.projectKey);
                    return;
                  }
                  onSelectSpace(space.projectKey);
                }}
                onContextMenu={(event) => {
                  if (!onSpaceSettings) return;
                  event.preventDefault();
                  onSpaceSettings(space);
                }}
              >
                <ProjectFavicon project={space} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-sidebar-foreground">
                    {space.displayName}
                  </span>
                  {deviceLabel ? (
                    <span className="block truncate text-[0.68rem] text-sidebar-muted-foreground/80">
                      @ {deviceLabel}
                    </span>
                  ) : null}
                </span>
                {showEnvironments ? (
                  <ProjectEnvironmentBadge
                    group={space}
                    primaryEnvironmentId={primaryEnvironmentId}
                    machineByEnvironmentId={machineByEnvironmentId}
                  />
                ) : null}
                {onSpaceSettings ? (
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    tabIndex={-1}
                    aria-label={`Space settings for ${space.displayName}`}
                    className="opacity-0 transition-opacity group-hover/space:opacity-100 group-focus-within/space:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSpaceSettings(space);
                    }}
                  >
                    <SettingsIcon className="size-3.5" />
                  </Button>
                ) : null}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-2 py-2 text-xs text-sidebar-muted-foreground/70">No matching spaces</li>
        ) : null}
      </ul>
    </section>
  );
});
