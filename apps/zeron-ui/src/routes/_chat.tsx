import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { ZeronShell } from "../zeron";

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ChatLayout,
});

function ChatLayout() {
  return (
    <>
      <ZeronShell />
      {/* Keep outlet mounted so nested routes register params for the shell. */}
      <div hidden>
        <Outlet />
      </div>
    </>
  );
}
