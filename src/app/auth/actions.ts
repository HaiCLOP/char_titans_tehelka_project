"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Signs the user out on this device. Use as a form action: `<form action={signOut}>`. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
