import { apiOk } from "@/lib/server/http";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";

export async function POST() {
  const supabase = await createAdultSessionSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  return apiOk({ signed_in: false }, { noStore: true });
}
