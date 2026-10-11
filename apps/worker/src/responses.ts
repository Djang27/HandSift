import type { ErrorCode, ErrorResponse } from "@handsift/shared";

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  upstream_error: 502,
  internal_error: 500,
};

export function errorResponse(error: ErrorCode, message?: string): Response {
  const body: ErrorResponse = message === undefined ? { error } : { error, message };
  return Response.json(body, { status: STATUS[error] });
}
