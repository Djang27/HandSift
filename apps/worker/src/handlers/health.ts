import type { HealthResponse } from "@handsift/shared";

export function handleHealth(): Response {
  const body: HealthResponse = { status: "ok" };
  return Response.json(body);
}
