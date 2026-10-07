import type { ErrorResponse } from "@handsift/shared";
import { handleHealth } from "./handlers/health";

export function route(request: Request): Response {
  const { pathname } = new URL(request.url);

  if (request.method === "GET" && pathname === "/health") {
    return handleHealth();
  }

  const body: ErrorResponse = { error: "not_found" };
  return Response.json(body, { status: 404 });
}
