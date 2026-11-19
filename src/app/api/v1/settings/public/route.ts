import { apiOk } from "@/lib/server/http";
import { getPublishedStatsAsync } from "@/modules/content/service";

export async function GET() {
  const stats = await getPublishedStatsAsync();
  return apiOk({
    app_name: "Ensiklopedia Digital Megalitik Banyuwangi",
    short_name: "EDMB",
    target_grades: [3, 4],
    hero: {
      greeting: "Selamat datang di EDMB",
      title: "Menjelajah Jejak Megalitik Banyuwangi",
      subtitle:
        "Kenali peninggalan batu leluhur di Banyuwangi lewat buku digital ramah anak, peta wilayah umum, dan kuis interaktif.",
      slogan: "Kenali, Jaga, Lestarikan",
    },
    stats,
    contact: {
      organization: "[Nama Pengelola Resmi — belum diisi]",
      privacy_email: "[Email Kontak Privasi — belum diisi]",
    },
  });
}
