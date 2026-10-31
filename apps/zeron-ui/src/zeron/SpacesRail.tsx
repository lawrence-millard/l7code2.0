import type { SpaceId, ZeronSpace } from "../adapter";

export function SpacesRail(props: {
  readonly spaces: ReadonlyArray<ZeronSpace>;
  readonly selectedSpaceId: SpaceId | null;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onSelect: (spaceId: SpaceId) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
      <div className="z-section-label">Spaces</div>
      <input
        className="z-search"
        value={props.query}
        onChange={(event) => props.onQueryChange(event.target.value)}
        placeholder="Search spaces"
        aria-label="Search spaces"
      />
      <div className="z-list" style={{ maxHeight: 168 }}>
        {props.spaces.length === 0 ? (
          <div className="z-empty">No spaces yet — open a project on the server.</div>
        ) : (
          props.spaces.map((space) => (
            <button
              key={space.spaceId}
              type="button"
              className="z-row"
              data-active={props.selectedSpaceId === space.spaceId}
              onClick={() => props.onSelect(space.spaceId)}
            >
              <span className="z-dot" data-attention="idle" />
              <span style={{ minWidth: 0, flex: 1 }}>
                <div className="z-row-title">{space.label}</div>
                <div className="z-row-meta">
                  {space.environmentLabel} · {space.workspaceRoot}
                </div>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
