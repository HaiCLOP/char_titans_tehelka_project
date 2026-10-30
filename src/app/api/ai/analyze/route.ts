import { NextResponse } from "next/server";
import { AnalyzeRequestSchema } from "@/lib/domain";
import { analyzeComplaint } from "@/lib/ai/intake";
import { createClient } from "@/lib/supabase/server";

// Live AI preview while the student is writing. Submitting the complaint is a separate route (31 Oct).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const parsed = AnalyzeRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const result = await analyzeComplaint(parsed.data);
  return NextResponse.json(result);
}
