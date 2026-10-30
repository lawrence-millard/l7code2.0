import { createFileRoute } from "@tanstack/react-router";

import { BoatSettingsPanel } from "../components/settings/BoatSettings";

export const Route = createFileRoute("/_chat/settings/boat")({
  component: BoatSettingsPanel,
});
