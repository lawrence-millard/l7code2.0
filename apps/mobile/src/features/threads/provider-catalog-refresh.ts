import type { EnvironmentId } from "@l7code/contracts";
import type { AtomCommandResult } from "@l7code/client-runtime/state/runtime";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@l7code/client-runtime/state/runtime";

type RefreshProvidersTarget = {
  readonly environmentId: EnvironmentId;
  readonly input: { readonly refreshModels: true };
};

export function createProviderCatalogRefreshRunner<Result>(
  refreshProviders: (target: RefreshProvidersTarget) => Promise<Result>,
) {
  let pending: Promise<Result> | null = null;

  return (environmentId: EnvironmentId): Promise<Result> => {
    if (pending) return pending;
    pending = refreshProviders({ environmentId, input: { refreshModels: true } }).finally(() => {
      pending = null;
    });
    return pending;
  };
}

export function providerCatalogRefreshError(
  result: AtomCommandResult<unknown, unknown>,
): string | null {
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "Provider discovery failed.";
}
