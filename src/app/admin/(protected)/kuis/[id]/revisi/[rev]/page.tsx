import { notFound } from "next/navigation";
import { AdminQuizEditorClient } from "@/components/admin/AdminQuizEditorClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { getAdminQuizRevisionDetailAsync } from "@/modules/admin/quiz-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editor Revisi Kuis | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminQuizRevisionPage({
  params,
}: {
  params: Promise<{ id: string; rev: string }>;
}) {
  const { id, rev } = await params;
  const session = await resolveAdminSessionState();
  const detail = await getAdminQuizRevisionDetailAsync(session, id, rev);

  if (!detail) {
    notFound();
  }

  return (
    <AdminQuizEditorClient
      key={`${detail.revision_id}:${detail.status}:${detail.reviews.length}:${detail.questions.length}:${detail.published_at ?? ""}`}
      detail={detail}
    />
  );
}
