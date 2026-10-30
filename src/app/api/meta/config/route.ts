import { EmergencyContactSchema, type PublicConfig } from "@/lib/domain";
import { fail, ok } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

const KEYS = ["campus_security", "campus_emergency"] as const;

// Public app config: campus emergency contacts for the urgent banner (PRD rule 5).
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_config").select("key, value").in("key", [...KEYS]);
  if (error) return fail("INTERNAL", "Could not load config");

  const pick = (key: (typeof KEYS)[number]) => {
    const parsed = EmergencyContactSchema.safeParse(data?.find((r) => r.key === key)?.value);
    return parsed.success ? parsed.data : null;
  };
  return ok<PublicConfig>(
    { campus_security: pick("campus_security"), campus_emergency: pick("campus_emergency") },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
