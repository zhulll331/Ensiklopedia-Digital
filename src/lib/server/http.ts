import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "ACTION_NOT_ALLOWED"
  | "RESOURCE_NOT_FOUND"
  | "STATE_CONFLICT"
  | "REVISION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "TASK_UNAVAILABLE"
  | "ATTEMPT_EXPIRED"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE";

export interface ApiMeta {
  request_id: string;
  next_cursor?: string | null;
}

export function createRequestId(): string {
  return randomUUID();
}

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export function apiOk<T>(
  data: T,
  options?: {
    status?: number;
    requestId?: string;
    nextCursor?: string | null;
    noStore?: boolean;
    headers?: Record<string, string>;
  }
) {
  const request_id = options?.requestId ?? createRequestId();
  const meta: ApiMeta = { request_id };
  if (options?.nextCursor !== undefined) {
    meta.next_cursor = options.nextCursor;
  }

  const headers: Record<string, string> = {
    ...(options?.noStore ? NO_STORE_HEADERS : {}),
    ...(options?.headers ?? {}),
  };

  return NextResponse.json(
    { data, meta },
    {
      status: options?.status ?? 200,
      headers,
    }
  );
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  options?: {
    requestId?: string;
    fieldErrors?: Record<string, string>;
    noStore?: boolean;
    retryAfterSeconds?: number;
  }
) {
  const request_id = options?.requestId ?? createRequestId();
  const headers: Record<string, string> = {
    ...(options?.noStore ? NO_STORE_HEADERS : {}),
  };

  if (options?.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(options.retryAfterSeconds);
  }

  return NextResponse.json(
    {
      error: {
        code,
        message,
        request_id,
        field_errors: options?.fieldErrors ?? {},
      },
    },
    { status, headers }
  );
}
