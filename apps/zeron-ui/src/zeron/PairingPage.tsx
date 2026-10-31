import type { AuthSessionState } from "@l7code/contracts";
import { squashAtomCommandFailure } from "@l7code/client-runtime/state/runtime";
import { useState } from "react";

import { connectPairing } from "../connection/onboarding";
import { submitServerAuthCredential, takePairingTokenFromUrl } from "../environments/primary";
import { useAtomCommand } from "../state/use-atom-command";

export function PairingPage(props: {
  readonly auth: AuthSessionState["auth"];
  readonly initialErrorMessage?: string;
  readonly onAuthenticated: () => void;
}) {
  const connect = useAtomCommand(connectPairing, { reportFailure: false });
  const [token, setToken] = useState(() => takePairingTokenFromUrl() ?? "");
  const [error, setError] = useState(props.initialErrorMessage ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = token.trim();
    if (!value) {
      setError("Enter a pairing token to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitServerAuthCredential(value);
      const result = await connect({});
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      props.onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="z-app" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="z-glass z-pair-card">
        <div className="z-brand" style={{ paddingLeft: 0, marginBottom: 10 }}>
          <div className="z-brand-mark-glyph">L7</div>
          <div className="z-brand-copy">
            <div className="z-brand-name">L7 Code</div>
            <div className="z-brand-mark">Pair device</div>
          </div>
        </div>
        <p>Paste the pairing token from the L7 server to attach this Zeron client.</p>
        <input
          className="z-search"
          style={{ borderRadius: 12 }}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Pairing token"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        {error ? (
          <div style={{ color: "var(--z-danger)", marginTop: 10, fontSize: 13 }}>{error}</div>
        ) : null}
        <div className="z-pair-actions">
          <span className="z-status" style={{ padding: 0, marginRight: "auto" }}>
            {props.auth.policy}
          </span>
          <button
            type="button"
            className="z-pair-submit"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Pairing…" : "Pair device"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PairingPending() {
  return (
    <div className="z-app" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="z-footer-pill">Connecting…</div>
    </div>
  );
}
