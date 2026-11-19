import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PracticeQuizClient } from "@/components/PracticeQuizClient";
import { getPublicPracticeQuizByIdAsync } from "@/modules/learning/service";

export const revalidate = 60;

export default async function PracticeQuizDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const quiz = await getPublicPracticeQuizByIdAsync(slug);
  if (!quiz) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[48rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/kuis"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#1f4d38] underline"
      >
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Kembali ke Menu Kuis
      </Link>

      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.08em] text-[#8a5a00] uppercase">
          Latihan Umum • Kelas {quiz.grade}
        </p>
        <h1>{quiz.title}</h1>
        <p className="text-sm text-[#3a4640]">{quiz.instructions}</p>
      </header>

      <PracticeQuizClient quiz={quiz} />
    </div>
  );
}
