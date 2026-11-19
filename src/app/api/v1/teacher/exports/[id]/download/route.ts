import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { downloadTeacherCsvExportAsync } from "@/modules/learning/service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const { id } = await context.params;
    const job = await downloadTeacherCsvExportAsync(teacherId, id);

    return new NextResponse(job.csv_content, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rekap-tugas-${job.assignment_id}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return mapLearningError(err);
  }
}
