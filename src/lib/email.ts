import "server-only";

/**
 * Transactional email through Resend's REST API (no SDK). `RESEND_FROM` must be on a domain verified in
 * Resend; the default `onboarding@resend.dev` only delivers to the Resend account's own address.
 */
const FROM = process.env.RESEND_FROM || "CivicSense <onboarding@resend.dev>";

export const emailEnabled = Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("[email] send failed", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed", e instanceof Error ? e.message : e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Bilingual invite with the one-time sign-in link. */
export function inviteEmail(link: string, roleEn: string, roleAs: string) {
  const subject = "You're invited to CivicSense · CivicSense লৈ আমন্ত্ৰণ";
  const text = [
    `You have been added to CivicSense (Dibrugarh University) as ${roleEn}.`,
    `Open this link to sign in: ${link}`,
    "",
    `আপোনাক CivicSense-ত (ডিব্ৰুগড় বিশ্ববিদ্যালয়) ${roleAs} হিচাপে যোগ কৰা হৈছে।`,
    `ছাইন ইন কৰিবলৈ এই লিংকটো খোলক: ${link}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#111">
<p>You have been added to <b>CivicSense</b> (Dibrugarh University) as <b>${esc(roleEn)}</b>.</p>
<p lang="as">আপোনাক <b>CivicSense</b>-ত (ডিব্ৰুগড় বিশ্ববিদ্যালয়) <b>${esc(roleAs)}</b> হিচাপে যোগ কৰা হৈছে।</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Sign in · ছাইন ইন কৰক</a></p>
<p style="color:#666;font-size:13px">If you did not expect this, ignore this email. · আপুনি এইটো আশা কৰা নাছিল যদি, এই ইমেইলটো আওকাণ কৰক।</p>
</div>`;
  return { subject, html, text };
}
