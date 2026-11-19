import { MediaTabsClient } from "@/components/MediaTabsClient";
import {
  listClearedGalleryMediaAsync,
  listGlossaryTermsAsync,
  listPublishedVideosAsync,
} from "@/modules/content/service";

export const revalidate = 60;

export const metadata = {
  title: "Media Belajar | EDMB",
};

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const initialTab =
    params.tab === "video"
      ? "video"
      : params.tab === "glosarium"
        ? "glosarium"
        : "galeri";

  const [gallery, videos, glossary] = await Promise.all([
    listClearedGalleryMediaAsync(),
    listPublishedVideosAsync(),
    listGlossaryTermsAsync(),
  ]);

  return (
    <div className="mx-auto max-w-[75rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.08em] text-[#1f4d38] uppercase">
          Galeri, Video &amp; Glosarium
        </p>
        <h1>Media Belajar</h1>
        <p className="max-w-[68ch] text-[#3a4640]">
          Kumpulan ilustrasi berlabel, video edukasi dengan transkrip, serta
          glosarium A–Z dengan bahasa sederhana untuk siswa kelas III dan IV.
        </p>
      </header>

      <MediaTabsClient
        gallery={gallery}
        videos={videos}
        glossary={glossary}
        initialTab={initialTab}
      />
    </div>
  );
}
