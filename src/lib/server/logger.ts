import "server-only";

const SENSITIVE_KEYS = new Set([
  "cookie",
  "authorization",
  "token",
  "join_token",
  "join_code",
  "student_name",
  "corrected_name",
  "answers",
  "password",
  "secret",
]);

/**
 * Menyensor field sensitif sebelum menulis log terstruktur (SEC-24).
 */
export function sanitizeLogMetadata(
  input: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeLogMetadata(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function logServerEvent(event: {
  request_id: string;
  route: string;
  action: string;
  outcome: "success" | "denied" | "error";
  status: number;
  metadata?: Record<string, unknown>;
}) {
  const line = JSON.stringify({
    timestamp_utc: new Date().toISOString(),
    request_id: event.request_id,
    route: event.route,
    action: event.action,
    outcome: event.outcome,
    status: event.status,
    metadata: event.metadata ? sanitizeLogMetadata(event.metadata) : {},
  });
  if (event.outcome === "error") {
    console.error(line);
  } else {
    console.info(line);
  }
}
