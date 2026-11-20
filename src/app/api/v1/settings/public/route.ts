import { apiOk } from "@/lib/server/http";
import { getPublicSiteSettingsAsync } from "@/modules/admin/ops-service";
import { getPublishedStatsAsync } from "@/modules/content/service";

export async function GET() {
  const [stats, settings] = await Promise.all([
    getPublishedStatsAsync(),
    getPublicSiteSettingsAsync(),
  ]);

  return apiOk({
    app_name: "Ensiklopedia Digital Megalitik Banyuwangi",
    short_name: "EDMB",
    target_grades: [3, 4],
    hero: {
      greeting: "Selamat datang di EDMB",
      title: settings.hero_title,
      subtitle: settings.hero_subtitle,
      slogan: settings.hero_slogan,
    },
    stats,
    contact: {
      organization: settings.contact_org_name,
      privacy_email: settings.contact_email,
      privacy_notice_summary: settings.privacy_notice_summary,
    },
  });
}
