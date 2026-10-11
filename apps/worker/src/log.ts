// Structured JSON logs, one object per event, collected by Workers Logs.
// Never pass raw IPs, full URLs with user data, or secrets in `fields`.

type LogValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogValue>;

export function logEvent(event: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

export function logError(event: string, error: unknown, fields: LogFields = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: "error", event, error: message, ...fields }));
}
