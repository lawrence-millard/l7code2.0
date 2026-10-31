import type { SpaceId, ZeronSpace } from "../adapter";
import { Composer } from "./Composer";

export function NewSessionCanvas(props: {
  readonly spaces: ReadonlyArray<ZeronSpace>;
  readonly selectedSpaceId: SpaceId | null;
  readonly onSelectSpace: (spaceId: SpaceId) => void;
  readonly onSend: (text: string) => void | Promise<void>;
  readonly disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="z-hero">
        <div className="z-brand-mark">L7 Code</div>
        <h1>Zeron</h1>
        <p>
          Spaces and attention-sorted sessions over the L7 orchestration backend. Pick a space, then
          start a session.
        </p>
        <select
          className="z-select"
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
      </div>
      <Composer
        disabled={props.disabled || props.selectedSpaceId === null}
        placeholder={
          props.selectedSpaceId === null
            ? "Select a space to start a session…"
            : "Start a new session…"
        }
        onSend={props.onSend}
      />
    </div>
  );
}
