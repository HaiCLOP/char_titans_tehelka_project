import type { Category, Intake } from "@/lib/domain";

// Deterministic bilingual keyword classifier — used only when every AI model is down.
const RULES: [Category, RegExp][] = [
  ["water_supply", /water|পানী|pani/i],
  ["electrical", /electric|power|light|fan|wire|বিদ্যুৎ|লাইট|পংখা|তাঁৰ/i],
  ["it_network", /wi-?fi|internet|network|ৱাই-ফাই|ইণ্টাৰনেট/i],
  ["sanitation", /garbage|dustbin|toilet|dirty|smell|আৱৰ্জনা|শৌচাগাৰ|লেতেৰা/i],
  ["plumbing", /leak|pipe|tap|drain|নলা|পাইপ/i],
  ["mess_food", /mess|food|canteen|মেছ|খাদ্য|কেণ্টিন/i],
  ["safety_security", /unsafe|theft|fight|security|সুৰক্ষা|চুৰি/i],
  ["academic", /exam|class|teacher|result|পৰীক্ষা|শ্ৰেণী/i],
  ["infrastructure", /broken|road|door|window|bench|ভগা|পথ|দুৱাৰ/i],
];

export function fallbackIntake(text: string): Intake {
  const category = RULES.find(([, re]) => re.test(text))?.[0] ?? "other";
  const short = text.trim().slice(0, 80) || "Photo complaint";
  return {
    title_en: short, title_as: short, summary_en: text.slice(0, 380) || "Photo complaint awaiting AI analysis.",
    summary_as: text.slice(0, 380) || "ফটো অভিযোগ — এআই বিশ্লেষণৰ অপেক্ষাত।",
    category, priority: 3, priority_reason_en: "Default priority (AI unavailable)", location_hint: null,
    is_abusive: false, has_personal_data: /\b\d{10}\b/.test(text), confidence: 0.3,
  };
}
