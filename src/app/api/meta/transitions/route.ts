import { failFrom, ok } from "@/lib/api";
import { listTransitions } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

// Allowed status moves (PRD 8.2): the same table the DB trigger enforces. Public.
export async function GET() {
  try {
    return ok(await listTransitions(await createClient()), { headers: { "cache-control": "public, max-age=300" } });
  } catch (e) {
    return failFrom(e, "load transitions");
  }
}
