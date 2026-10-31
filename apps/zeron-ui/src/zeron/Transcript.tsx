import { scopeThreadRef } from "@l7code/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@l7code/contracts";

import { useQuietThreadVisibleTurnItems } from "../state/entities";

function itemText(item: {
  readonly type: string;
  readonly text?: string;
  readonly role?: string;
}): { role: "user" | "assistant"; text: string } | null {
  if (item.type === "user_message" && typeof item.text === "string") {
    return { role: "user", text: item.text };
  }
  if (item.type === "assistant_message" && typeof item.text === "string") {
    return { role: "assistant", text: item.text };
  }
  return null;
}

export function Transcript(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const items = useQuietThreadVisibleTurnItems(
    scopeThreadRef(props.environmentId, props.threadId),
  );

  const messages = items
    .map((entry) => itemText(entry.item as { type: string; text?: string }))
    .filter((value): value is { role: "user" | "assistant"; text: string } => value !== null);

  if (messages.length === 0) {
    return (
      <div className="z-transcript">
        <div className="z-empty" style={{ textAlign: "center", paddingTop: 48 }}>
          Send a message to start this session.
        </div>
      </div>
    );
  }

  return (
    <div className="z-transcript">
      {messages.map((message, index) => (
        <div key={`${message.role}-${index}`} className="z-msg" data-role={message.role}>
          <div className="z-msg-bubble">{message.text}</div>
        </div>
      ))}
    </div>
  );
}
