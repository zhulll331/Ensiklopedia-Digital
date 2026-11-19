import "server-only";
import { apiError } from "@/lib/server/http";
import { DomainError } from "./server-store";

export function mapLearningError(err: unknown) {
  if (err instanceof DomainError) {
    return apiError(err.status, err.code, err.message, { noStore: true });
  }
  return apiError(
    503,
    "TEMPORARILY_UNAVAILABLE",
    "Layanan sedang mengalami gangguan sementara.",
    { noStore: true }
  );
}
