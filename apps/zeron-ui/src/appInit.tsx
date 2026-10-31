import { createBrowserHistory, createHashHistory } from "@tanstack/react-router";

import { APP_BASE_NAME, APP_DISPLAY_NAME, APP_STAGE_LABEL } from "./branding";
import { resolveServerBackedAppDisplayName } from "./branding.logic";
import { isElectron } from "./env";
import {
  syncDocumentElectronPlatformClasses,
  syncDocumentWindowControlsOverlayClass,
} from "./lib/windowControlsOverlay";
import { startProviderAuthDelivery } from "./providerAuthDelivery";
import { getRouter, type AppRouter } from "./router";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { primaryServerConfigAtom } from "./state/server";

function startDocumentTitle(): void {
  appAtomRegistry.subscribe(
    primaryServerConfigAtom,
    (config) => {
      document.title = resolveServerBackedAppDisplayName({
        baseName: APP_BASE_NAME,
        fallbackDisplayName: APP_DISPLAY_NAME,
        fallbackStageLabel: APP_STAGE_LABEL,
        primaryServerVersion: config?.environment.serverVersion ?? null,
      });
    },
    { immediate: true },
  );
}

/** Starts app-lifetime services once and returns the router. */
export function startAppServices(): AppRouter {
  startProviderAuthDelivery();
  const router = getRouter(isElectron ? createHashHistory() : createBrowserHistory());

  if (isElectron) {
    syncDocumentElectronPlatformClasses(navigator.platform);
    syncDocumentWindowControlsOverlayClass();
  }

  startDocumentTitle();
  return router;
}
