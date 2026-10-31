import { useState } from "react";

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 12.5 14 7a3.2 3.2 0 1 1 4.5 4.5l-7.8 7.8a4.5 4.5 0 0 1-6.4-6.4l7.5-7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V5m0 0 6 6M12 5l-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Composer(props: {
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly modelLabel?: string | null;
  readonly layout?: "hero" | "thread";
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
    <div className="z-composer-dock" data-layout={props.layout ?? "hero"}>
      <div className="z-composer">
        <textarea
          value={text}
          placeholder={props.placeholder ?? "Do anything…"}
          disabled={props.disabled || sending}
          rows={2}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="z-composer-bar">
          <div className="z-composer-tools">
            <span className="z-icon-btn" title="Attachments">
              <PaperclipIcon />
            </span>
            {props.modelLabel ? (
              <span className="z-model-chip" title={props.modelLabel}>
                <span className="z-model-chip-dot" />
                {props.modelLabel}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="z-send"
            disabled={!canSend}
            aria-label={sending ? "Sending" : "Send"}
            onClick={() => void submit()}
          >
            <ArrowUpIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
