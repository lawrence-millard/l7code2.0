import type { AuthSessionState } from "@l7code/contracts";
import { squashAtomCommandFailure } from "@l7code/client-runtime/state/runtime";
import { useState } from "react";

import { connectPairing } from "../connection/onboarding";
import {
  submitServerAuthCredential,
  takePairingTokenFromUrl,
} from "../environments/primary";
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
      <div className="z-glass" style={{ width: "min(420px, 92vw)", padding: 24 }}>
        <div className="z-brand" style={{ paddingLeft: 0 }}>
          <div className="z-brand-name">L7</div>
          <div className="z-brand-mark">Pair</div>
        </div>
        <p style={{ color: "var(--z-text-muted)", marginTop: 0 }}>
          Paste the pairing token from the L7 server to attach this Zeron client.
        </p>
        <input
          className="z-search"
          style={{ borderRadius: 12, marginBottom: 12 }}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Pairing token"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        {error ? (
          <div style={{ color: "var(--z-danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>
        ) : null}
        <button type="button" className="z-send" disabled={busy} onClick={() => void submit()}>
          {busy ? "Pairing…" : "Pair device"}
        </button>
        <div className="z-status" style={{ paddingLeft: 0 }}>
          Auth: {props.auth.policy}
        </div>
      </div>
    </div>
  );
}

export function PairingPending() {
  return (
    <div className="z-app" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="z-status">Connecting…</div>
    </div>
  );
}
