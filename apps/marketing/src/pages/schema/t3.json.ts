import type { APIRoute } from "astro";

import { buildT3ProjectFileJsonSchema } from "@l7code/shared/l7ProjectFile";

export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildT3ProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
