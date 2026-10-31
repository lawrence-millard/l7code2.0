import type { ZeronSession } from "../adapter";

export function SessionList(props: {
  readonly sessions: ReadonlyArray<ZeronSession>;
  readonly activeThreadId: string | null;
  readonly onSelect: (session: ZeronSession) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 0, flex: 1 }}>
      <div className="z-section-label">Sessions</div>
      <div className="z-list">
        {props.sessions.length === 0 ? (
          <div className="z-empty">No sessions in this space.</div>
        ) : (
          props.sessions.map((session) => (
            <button
              key={`${session.environmentId}:${session.threadId}`}
              type="button"
              className="z-row"
              data-active={props.activeThreadId === session.threadId}
              onClick={() => props.onSelect(session)}
            >
              <span className="z-dot" data-attention={session.attention} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <div className="z-row-title">{session.title}</div>
                {session.preview ? <div className="z-row-meta">{session.preview}</div> : null}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
