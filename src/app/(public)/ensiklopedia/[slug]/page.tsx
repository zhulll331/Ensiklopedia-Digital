import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import {
  getPublishedChapterBySlugAsync,
  listGlossaryTermsAsync,
  listPublishedChaptersAsync,
} from "@/modules/content/service";
import { LocalBookmarkButton } from "@/components/LocalBookmarkButton";

export const revalidate = 60;

export default async function ChapterReaderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const chapter = await getPublishedChapterBySlugAsync(slug);
  if (!chapter) {
    notFound();
  }

  const [allChapters, allGlossary] = await Promise.all([
    listPublishedChaptersAsync(),
    listGlossaryTermsAsync(),
  ]);
  const currentIdx = allChapters.findIndex((c) => c.slug === chapter.slug);
  const prevChapter = currentIdx > 0 ? allChapters[currentIdx - 1] : null;
  const nextChapter =
    currentIdx >= 0 && currentIdx < allChapters.length - 1
      ? allChapters[currentIdx + 1]
      : null;

  const relatedGlossary = allGlossary.filter((g) =>
    chapter.glossary_slugs.includes(g.slug)
  );

  return (
    <div className="mx-auto max-w-[75rem] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/ensiklopedia"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#1f4d38] underline"
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Semua Bab Buku Digital
        </Link>
        <LocalBookmarkButton slug={chapter.slug} />
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Daftar isi samping */}
        <aside aria-label="Daftar Isi Bab" className="lg:col-span-4">
          <div className="sticky top-24 space-y-4 rounded-[24px] border border-[#d6cec1] bg-white p-5">
            <h2 className="text-base font-bold text-[#1f2a24]">Daftar Bab</h2>
            <ol className="flex list-none flex-col gap-2 p-0 text-sm">
              {allChapters.map((item) => {
                const isCurrent = item.slug === chapter.slug;
                return (
                  <li key={item.id}>
                    <Link
                      href={`/ensiklopedia/${item.slug}`}
                      aria-current={isCurrent ? "page" : undefined}
                      className={
                        isCurrent
                          ? "block rounded-xl bg-[#dcebdd] px-3 py-2.5 font-bold text-[#1f4d38] no-underline"
                          : "block rounded-xl px-3 py-2.5 font-semibold text-[#3a4640] no-underline hover:bg-[#faf6ee]"
                      }
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>

        {/* Kolom baca utama (maks 720px / 68ch sesuai desain (5).md) */}
        <article className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8 lg:col-span-8">
          <header className="space-y-3 border-b border-[#efeae2] pb-5">
            <span className="inline-block rounded-full bg-[#dcebdd] px-3 py-1 text-xs font-bold text-[#1f4d38]">
              Kelas {chapter.target_grades.join(" & ")} • {chapter.reading_minutes}{" "}
              menit baca
            </span>
            <h1>{chapter.title}</h1>
            <p className="max-w-[68ch] text-base font-semibold text-[#3a4640]">
              {chapter.summary}
            </p>
          </header>

          <div className="max-w-[68ch] space-y-4 text-[1.125rem] leading-[1.75] text-[#1f2a24]">
            {chapter.paragraphs.map((para, index) => (
              <p key={index}>{para}</p>
            ))}
          </div>

          {relatedGlossary.length > 0 ? (
            <section
              aria-labelledby="glosarium-bab"
              className="rounded-2xl bg-[#faf6ee] p-5"
            >
              <h2 id="glosarium-bab" className="text-base font-bold text-[#1f2a24]">
                Kata Penting di Bab Ini
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                {relatedGlossary.map((g) => (
                  <div key={g.id}>
                    <dt className="inline font-bold text-[#1f4d38]">
                      {g.term}:{" "}
                    </dt>
                    <dd className="inline text-[#3a4640]">
                      {g.simple_definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <aside className="flex items-start gap-3 rounded-2xl bg-[#f6dfd2] p-4 text-sm font-semibold text-[#8f3d1b]">
            <ShieldAlert size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
            <p>{chapter.preservation_note}</p>
          </aside>

          <section aria-labelledby="sumber-bab" className="border-t border-[#efeae2] pt-4">
            <h2 id="sumber-bab" className="text-sm font-bold text-[#5b6760]">
              Rujukan Sumber
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#5b6760]">
              {chapter.sources.map((src) => (
                <li key={src.id}>
                  {src.citation_text} ({src.locator})
                </li>
              ))}
            </ul>
          </section>

          <nav
            aria-label="Navigasi antar bab"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efeae2] pt-5"
          >
            {prevChapter ? (
              <Link href={`/ensiklopedia/${prevChapter.slug}`} className="btn-secondary">
                <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
                Bab Sebelumnya
              </Link>
            ) : (
              <span />
            )}

            {nextChapter ? (
              <Link href={`/ensiklopedia/${nextChapter.slug}`} className="btn-primary">
                Bab Berikutnya
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            ) : (
              <Link href="/kuis" className="btn-primary">
                Coba Kuisnya
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
