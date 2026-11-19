import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ShieldAlert } from "lucide-react";
import {
  getMediaByIdAsync,
  getPublishedSiteBySlugAsync,
} from "@/modules/content/service";

export const revalidate = 60;

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getPublishedSiteBySlugAsync(slug);
  if (!site) {
    notFound();
  }

  const media = site.media_id ? await getMediaByIdAsync(site.media_id) : null;

  return (
    <div className="mx-auto max-w-[54rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/jelajah-situs"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#1f4d38] underline"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Kembali ke Jelajah Situs
      </Link>

      <article className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f6dfd2] px-3 py-1 text-xs font-bold text-[#8f3d1b]">
              {site.heritage_type}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#dcebdd] px-3 py-1 text-xs font-bold text-[#1f4d38]">
              <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
              {site.location.area_label}
            </span>
          </div>
          <h1>{site.title}</h1>
          <p className="text-sm font-semibold text-[#5b6760]">
            {site.location.precision_label} • Kelas {site.target_grades.join(" & ")}
          </p>
        </header>

        {media ? (
          <figure className="relative overflow-hidden rounded-2xl border border-[#efeae2] bg-[#faf6ee]">
            <span className="absolute top-3 left-3 rounded-full bg-[#fbefcf] px-3 py-1 text-xs font-bold text-[#8a5a00]">
              {media.badge}
            </span>
            <Image
              src={media.src}
              alt={media.alt_text}
              width={media.width}
              height={media.height}
              unoptimized
              className="aspect-video w-full object-cover"
            />
            <figcaption className="px-4 py-3 text-xs text-[#5b6760]">
              {media.caption} Kredit: {media.credit}
            </figcaption>
          </figure>
        ) : null}

        <section aria-labelledby="narasi-anak" className="space-y-3">
          <h2 id="narasi-anak" className="text-lg font-bold text-[#1f2a24]">
            Cerita Singkat
          </h2>
          <div className="max-w-[68ch] space-y-3 text-base leading-relaxed text-[#1f2a24]">
            {site.child_narration.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
        </section>

        <details className="rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4">
          <summary className="min-h-10 cursor-pointer text-sm font-bold text-[#1f4d38]">
            Untuk yang ingin tahu lebih (konteks ilmiah)
          </summary>
          <div className="mt-3 space-y-2 text-sm text-[#3a4640]">
            {site.scientific_context.map((p, idx) => (
              <p key={idx}>{p}</p>
            ))}
          </div>
        </details>

        <aside className="flex items-start gap-3 rounded-2xl bg-[#f6dfd2] p-4 text-sm font-semibold text-[#8f3d1b]">
          <ShieldAlert size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
          <p>{site.preservation_warning}</p>
        </aside>

        <section aria-labelledby="sumber-situs" className="border-t border-[#efeae2] pt-4">
          <h2 id="sumber-situs" className="text-sm font-bold text-[#5b6760]">
            Sumber &amp; Kredit
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#5b6760]">
            {site.sources.map((s) => (
              <li key={s.id}>
                {s.citation_text} ({s.locator})
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}
