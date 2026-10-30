import type { NextRequest } from "next/server";
import { LocationItemSchema } from "@/lib/domain";
import { fail, ok } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

// Location search for the report Combobox, in both languages. Public (locations are readable by everyone).
export async function GET(req: NextRequest) {
  // Strip characters that have meaning in PostgREST filter syntax / LIKE patterns.
  const q = (req.nextUrl.searchParams.get("q") ?? "").replace(/[%_,()*\\"]/g, " ").trim().slice(0, 60);
  const supabase = await createClient();
  let query = supabase.from("locations").select("id, name_en, name_as, type").order("name_en");
  query = q ? query.or(`name_en.ilike.%${q}%,name_as.ilike.%${q}%`).limit(20) : query.limit(100);

  const { data, error } = await query;
  if (error) return fail("INTERNAL", "Could not load locations");
  const parsed = LocationItemSchema.array().safeParse(data ?? []);
  if (!parsed.success) return fail("INTERNAL", "Unexpected location data");
  return ok(parsed.data);
}
