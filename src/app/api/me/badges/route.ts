import { fail, ok, requireUser } from "@/lib/api";
import { MyBadgesSchema } from "@/lib/domain";

// The caller's own badges + weekly reporting streak (my_badges() reads only their own reports and "me too"s).
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { data, error } = await auth.supabase.rpc("my_badges");
  if (error) {
    console.warn("[badges] my_badges failed", error.code, error.message);
    return fail("INTERNAL", "Could not load your badges");
  }
  const parsed = MyBadgesSchema.safeParse(data);
  if (!parsed.success) return fail("INTERNAL", "Could not load your badges");
  return ok(parsed.data, { headers: { "cache-control": "private, no-store" } });
}
