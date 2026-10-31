import { useState } from "react";

export function Composer(props: {
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly trailing?: React.ReactNode;
  readonly onSend: (text: string) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const canSend = text.trim().length > 0 && !props.disabled && !sending;

  const submit = async () => {
    if (!canSend) return;
    const value = text.trim();
    setSending(true);
    try {
      await props.onSend(value);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="z-composer-dock">
      <div className="z-glass z-composer">
        <textarea
          value={text}
          placeholder={props.placeholder ?? "Message the agent…"}
          disabled={props.disabled || sending}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="z-composer-bar">
          <div>{props.trailing}</div>
          <button type="button" className="z-send" disabled={!canSend} onClick={() => void submit()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
