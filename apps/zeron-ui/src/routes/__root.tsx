import { Outlet, createRootRoute, redirect } from "@tanstack/react-router";

import { resolveInitialServerAuthGateState } from "../environments/primary";
import { GUEST_PAGE_PATH } from "../guestPage";
import { hasHostedPairingRequest, isHostedStaticApp } from "../hostedPairing";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    if (location.pathname === GUEST_PAGE_PATH) {
      return {
        authGateState: { status: "guest" } as const,
      };
    }

    if (location.pathname === "/pair" && hasHostedPairingRequest(new URL(window.location.href))) {
      return {
        authGateState: { status: "hosted-pairing" } as const,
      };
    }

    if (isHostedStaticApp()) {
      return {
        authGateState: { status: "hosted-static" } as const,
      };
    }

    const authGateState = await resolveInitialServerAuthGateState();
    return { authGateState };
  },
  component: RootView,
});

function RootView() {
  return <Outlet />;
}

declare module "@tanstack/react-router" {
  interface Register {
    // filled by router.ts
  }
}

// Keep /pair as the only unauthenticated entry; everything else needs a session.
export function requireAuthenticated(authGateState: {
  readonly status: string;
}): void {
  if (authGateState.status !== "authenticated" && authGateState.status !== "hosted-static") {
    throw redirect({ to: "/pair", replace: true });
  }
}
