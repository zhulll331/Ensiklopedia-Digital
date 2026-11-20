import { notFound } from "next/navigation";
import { AdminRevisionEditorClient } from "@/components/admin/AdminRevisionEditorClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { getAdminRevisionDetailAsync } from "@/modules/admin/cms-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Editor Revisi Konten | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminRevisionEditorPage({
  params,
}: {
  params: Promise<{ id: string; rev: string }>;
}) {
  const { id, rev } = await params;
  const session = await resolveAdminSessionState();
  const detail = await getAdminRevisionDetailAsync(session, id, rev);

  if (!detail) {
    notFound();
  }

  return (
    <AdminRevisionEditorClient
      key={`${detail.revision_id}:${detail.status}:${detail.reviews.length}:${detail.published_at ?? ""}`}
      detail={detail}
    />
  );
}
