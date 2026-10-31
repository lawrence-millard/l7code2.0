import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";

import { PairingPage, PairingPending } from "../zeron/PairingPage";

export const Route = createFileRoute("/pair")({
  beforeLoad: async ({ context }) => {
    const { authGateState } = context;
    if (
      authGateState.status === "authenticated" ||
      authGateState.status === "hosted-static" ||
      authGateState.status === "guest"
    ) {
      throw redirect({ to: "/", replace: true });
    }
    return { authGateState };
  },
  component: PairRouteView,
  pendingComponent: PairingPending,
});

function PairRouteView() {
  const router = useRouter();
  const { authGateState } = Route.useRouteContext();

  if (!authGateState || authGateState.status === "hosted-pairing") {
    return (
      <div className="z-app" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="z-status">Hosted pairing is not used in L7 Zeron mode.</div>
      </div>
    );
  }

  if (authGateState.status !== "requires-auth") {
    return <PairingPending />;
  }

  return (
    <PairingPage
      auth={authGateState.auth}
      onAuthenticated={() => {
        router.history.replace("/");
        router.history.flush();
        window.location.reload();
      }}
    />
  );
}
