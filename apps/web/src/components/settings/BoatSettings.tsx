import type { BoatEnvironment, EnvironmentId } from "@l7code/contracts";
import { AuthOrchestrationReadScope, AuthSettingsWriteScope } from "@l7code/contracts";
import { CopyIcon, PlusIcon, RefreshCwIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { usePrimaryEnvironmentId, useEnvironments } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { boatEnvironment } from "~/state/boat";
import { useEnvironmentsWithScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

function useBoatHostEnvironmentId(): EnvironmentId | null {
  const primary = usePrimaryEnvironmentId();
  const { environments } = useEnvironments();
  const connected = environments.filter(
    (environment) => environment.connection.phase === "connected",
  );
  const readable = useEnvironmentsWithScope(connected, AuthOrchestrationReadScope);
  if (primary !== null && readable.has(primary)) return primary;
  return (
    connected.find((environment) => readable.has(environment.environmentId))?.environmentId ?? null
  );
}

function BoatApiKeyRow() {
  const updateSettings = useUpdateScopedSettings();
  const [draft, setDraft] = useState("");
  return (
    <SettingsRow
      {...searchableSetting("boat-api-key")}
      description="Boat bearer API key (`boat_…`). Required to create and host sandboxes for offline remotes."
      control={
        <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="password"
            value={draft}
            placeholder="boat_… (leave blank to keep saved key)"
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
          />
          <Button
            type="button"
            size="sm"
            disabled={draft.trim().length === 0}
            onClick={() => {
              updateSettings(
                { boat: { apiKey: draft.trim() } },
                { onFailed: () => undefined },
              );
              setDraft("");
            }}
          >
            Save
          </Button>
        </div>
      }
    />
  );
}

function BoatSandboxCard({
  environmentId,
  sandbox,
  canWrite,
}: {
  environmentId: EnvironmentId;
  sandbox: BoatEnvironment;
  canWrite: boolean;
}) {
  const stop = useAtomCommand(boatEnvironment.stop, { reportFailure: true });
  const resume = useAtomCommand(boatEnvironment.resume, { reportFailure: true });
  const refresh = useAtomCommand(boatEnvironment.refresh, { reportFailure: true });
  const remove = useAtomCommand(boatEnvironment.remove, { reportFailure: true });

  return (
    <div className="border-border/50 bg-background/40 flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{sandbox.label}</div>
          <div className="text-muted-foreground mt-0.5 text-xs">
            {sandbox.status} · {sandbox.sandboxId}
          </div>
          {sandbox.hostUrl ? (
            <code className="text-muted-foreground mt-1 block truncate text-[11px]">
              {sandbox.hostUrl}
            </code>
          ) : null}
          {sandbox.lastError ? (
            <div className="text-destructive mt-1 text-xs">{sandbox.lastError}</div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Refresh status"
            onClick={() =>
              void refresh({ environmentId, input: { sandboxId: sandbox.sandboxId } })
            }
          >
            <RefreshCwIcon />
          </Button>
          {canWrite && sandbox.status === "stopped" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void resume({ environmentId, input: { sandboxId: sandbox.sandboxId } })
              }
            >
              Resume
            </Button>
          ) : null}
          {canWrite &&
          (sandbox.status === "running" ||
            sandbox.status === "ready" ||
            sandbox.status === "idle") ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void stop({ environmentId, input: { sandboxId: sandbox.sandboxId } })}
            >
              <SquareIcon />
              Stop
            </Button>
          ) : null}
          {canWrite ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${sandbox.label}`}
              onClick={() =>
                void remove({ environmentId, input: { sandboxId: sandbox.sandboxId } })
              }
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      </div>
      {sandbox.wsBaseUrl || sandbox.hostUrl ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            const value = sandbox.wsBaseUrl ?? sandbox.hostUrl;
            if (value === null) return;
            void writeTextToClipboard(value)
              .then((ok) => {
                toastManager.add({
                  type: ok ? "success" : "error",
                  title: ok ? "Copied Boat URL" : "Could not copy",
                  description: ok
                    ? "Add it in Connections with a pairing code from the Boat L7 server."
                    : undefined,
                });
              })
              .catch(() => {
                toastManager.add({ type: "error", title: "Could not copy" });
              });
          }}
        >
          <CopyIcon />
          Copy hosted URL
        </Button>
      ) : null}
    </div>
  );
}

function BoatSandboxesSection() {
  const environmentId = useBoatHostEnvironmentId();
  const { environments } = useEnvironments();
  const writable = useEnvironmentsWithScope(
    environments.filter((environment) => environment.connection.phase === "connected"),
    AuthSettingsWriteScope,
  );
  const canWrite = environmentId !== null && writable.has(environmentId);
  const list = useEnvironmentQuery(
    environmentId === null ? null : boatEnvironment.list({ environmentId, input: undefined }),
  );
  const deploy = useAtomCommand(boatEnvironment.deploy, { reportFailure: true });
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <SettingsSection id="boat-sandboxes" title="Boat sandboxes">
      <p className="text-muted-foreground text-sm">
        Deploy a headless L7 server to a Boat sandbox, host its port as a stable{" "}
        <code>on.boat.dev</code> URL, then connect like any remote environment. Local stays the
        default; Boat is for when this machine is offline.
      </p>
      {environmentId === null ? (
        <p className="text-muted-foreground text-sm">Connect a local environment to manage Boat.</p>
      ) : (
        <>
          {canWrite ? (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                void deploy({
                  environmentId,
                  input: {
                    ...(label.trim().length > 0 ? { label: label.trim() } : {}),
                  },
                }).finally(() => {
                  setBusy(false);
                  setLabel("");
                });
              }}
            >
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  New Boat environment
                </span>
                <Input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Label (optional)"
                  maxLength={80}
                />
              </label>
              <Button type="submit" disabled={busy}>
                <PlusIcon />
                {busy ? "Deploying…" : "Run on Boat"}
              </Button>
            </form>
          ) : null}
          <div className="flex flex-col gap-2">
            {list.isPending && (list.data?.environments.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : null}
            {list.error !== null ? <p className="text-destructive text-sm">{list.error}</p> : null}
            {(list.data?.environments ?? []).map((sandbox) => (
              <BoatSandboxCard
                key={sandbox.sandboxId}
                environmentId={environmentId}
                sandbox={sandbox}
                canWrite={canWrite}
              />
            ))}
            {list.isSuccess && (list.data?.environments.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">
                No Boat sandboxes yet. Deploy one to keep working when this laptop is off.
              </p>
            ) : null}
          </div>
        </>
      )}
    </SettingsSection>
  );
}

export function BoatSettingsPanel() {
  useScopedSettings();
  return (
    <SettingsPageContainer>
      <SettingsSection id="boat" title="Boat">
        <BoatApiKeyRow />
        <SettingsRow
          {...searchableSetting("boat-local-vs-boat")}
          description="Use Local for this machine. Use Run on Boat below when you need a hosted remote that stays up after you close the laptop."
        />
      </SettingsSection>
      <BoatSandboxesSection />
    </SettingsPageContainer>
  );
}
