import type { SpaceId, ZeronSpace } from "../adapter";
import { Composer } from "./Composer";
import { DeviceIcon, FolderIcon } from "./icons";

export function NewSessionCanvas(props: {
  readonly spaces: ReadonlyArray<ZeronSpace>;
  readonly selectedSpaceId: SpaceId | null;
  readonly selectedSpace: ZeronSpace | null;
  readonly modelLabel?: string | null;
  readonly onSelectSpace: (spaceId: SpaceId) => void;
  readonly onSend: (text: string) => void | Promise<void>;
  readonly disabled?: boolean;
}) {
  return (
    <div className="z-hero-stage">
      <div className="z-hero-brand">
        <div className="z-hero-kicker">L7 Code</div>
        <h1>Zeron</h1>
      </div>
      <div className="z-hero-command">
        <div className="z-pill-row">
          <label className="z-pill">
            <FolderIcon />
            <select
              aria-label="Space"
              value={props.selectedSpaceId ?? ""}
              onChange={(event) => {
                if (event.target.value) props.onSelectSpace(event.target.value as SpaceId);
              }}
            >
              <option value="" disabled>
                Select a space
              </option>
              {props.spaces.map((space) => (
                <option key={space.spaceId} value={space.spaceId}>
                  {space.label}
                </option>
              ))}
            </select>
          </label>
          {props.selectedSpace ? (
            <span className="z-pill z-pill-muted" title={props.selectedSpace.workspaceRoot}>
              <DeviceIcon />
              {props.selectedSpace.environmentLabel}
            </span>
          ) : null}
        </div>
        <Composer
          layout="hero"
          disabled={props.disabled || props.selectedSpaceId === null}
          modelLabel={props.modelLabel}
          placeholder={props.selectedSpaceId === null ? "Select a space to start…" : "Do anything…"}
          onSend={props.onSend}
        />
        <div className="z-footer-pill z-footer-pill-inline">
          <span className="z-model-chip-dot" />
          L7 orchestration · local by default
        </div>
      </div>
    </div>
  );
}
