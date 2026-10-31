import type { Category, Intake } from "@/lib/domain";
import { containsAbuse } from "@/lib/moderation";
import { isAssameseText } from "@/lib/utils";

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

const CATEGORY_NAMES: Record<Category, { en: string; as: string }> = {
  water_supply: { en: "Water supply issue", as: "পানী যোগান সমস্যা" },
  electrical: { en: "Electrical maintenance issue", as: "বিদ্যুৎ বিভাগৰ সমস্যা" },
  it_network: { en: "IT / Wi-Fi network issue", as: "আইটি আৰু নেটৱৰ্ক সমস্যা" },
  sanitation: { en: "Sanitation and waste issue", as: "চাফাই আৰু আৱৰ্জনা সমস্যা" },
  plumbing: { en: "Plumbing maintenance issue", as: "নলা আৰু পাইপলাইন সমস্যা" },
  mess_food: { en: "Mess and food service issue", as: "মেছ আৰু খাদ্য সেৱাৰ সমস্যা" },
  safety_security: { en: "Campus security issue", as: "চৌহদৰ সুৰক্ষা বিষয়" },
  academic: { en: "Academic facility issue", as: "শৈক্ষিক সুবিধাৰ সমস্যা" },
  infrastructure: { en: "Campus infrastructure issue", as: "আন্তঃগাঁথনি মেৰামতি সমস্যা" },
  hostel: { en: "Hostel facility issue", as: "হোষ্টেল ব্যৱস্থাপনা সমস্যা" },
  transport: { en: "Campus transport issue", as: "চৌহদৰ পৰিবহণ সমস্যা" },
  other: { en: "General campus issue", as: "চৌহদৰ সাধাৰণ সমস্যা" },
};

// Same keyword lists as engine/ so both fallbacks agree.
const URGENT = /fire|smoke|injur|bleed|accident|unconscious|faint|electrocut|violence|attack|threat|knife|weapon|জুই|ধোঁৱা|আঘাত|দুৰ্ঘটনা|অজ্ঞান|হিংসা|আক্ৰমণ|ভাবুকি|ছুৰী/i;
const SENSITIVE = /harass|threat|stalk|ragging|abuse|molest|bully|suicid|unsafe|হাৰাশাস|ভাবুকি|ৰেগিং|নিৰ্যাতন|অসুৰক্ষিত/i;
const IRRELEVANT = /^(asdf|test|xyz|qwerty|12345|\s*)+$|bitcoin|crypto|casino|loan|essay on|solve for x/i;

export function fallbackIntake(text: string): Intake {
  const category = RULES.find(([, re]) => re.test(text))?.[0] ?? "other";
  const trimmed = text.trim();
  const isUrgent = URGENT.test(text);
  const isIrrelevant = IRRELEVANT.test(trimmed);
  const isAbusive = containsAbuse(text);
  const isAssamese = isAssameseText(trimmed);

  let title_en: string;
  let title_as: string;
  let summary_en: string;
  let summary_as: string;

  const catInfo = CATEGORY_NAMES[category] ?? CATEGORY_NAMES.other;

  if (!trimmed) {
    // Empty text / Photo-only complaint fallback
    title_en = "Photo complaint";
    title_as = "ফটো অভিযোগ";
    summary_en = "Photo complaint awaiting AI analysis.";
    summary_as = "ফটো অভিযোগ — এআই বিশ্লেষণৰ অপেক্ষাত।";
  } else if (isAssamese) {
    // Assamese input: never copy Assamese into English fields
    title_as = trimmed.slice(0, 80);
    summary_as = trimmed.slice(0, 380);
    title_en = `${catInfo.en} (Assamese report)`;
    summary_en = "Original complaint submitted in Assamese. Translation is pending background processing.";
  } else {
    // English input: never copy English into Assamese fields
    title_en = trimmed.slice(0, 80);
    summary_en = trimmed.slice(0, 380);
    title_as = `${catInfo.as} (অনুবাদ বাকী)`;
    summary_as = "মূল অভিযোগটো ইংৰাজীত দাখিল কৰা হৈছে। অসমীয়া অনুবাদৰ কাম চলি আছে।";
  }

  return {
    title_en,
    title_as,
    summary_en,
    summary_as,
    category,
    priority: isUrgent ? 1 : 3,
    priority_reason_en: isUrgent ? "Possible emergency keywords (AI unavailable)" : "Default priority (AI unavailable)",
    location_hint: null,
    is_abusive: isAbusive,
    abusive_reason_en: isAbusive ? "Offensive or abusive language detected." : null,
    abusive_reason_as: isAbusive ? "আপত্তিজনক বা গালি-গালাজযুক্ত ভাষা চিনাক্ত হৈছে।" : null,
    has_personal_data: /\b\d{10}\b/.test(text),
    is_urgent: isUrgent,
    is_sensitive_suggested: SENSITIVE.test(text),
    confidence: 0.3,
    is_relevant: !isIrrelevant,
    rejection_reason_en: isIrrelevant ? "This submission does not appear to describe a campus facility or civic issue." : null,
    rejection_reason_as: isIrrelevant ? "এই লেখাটোৱে চৌহদৰ কোনো সমস্যা বা সেৱা সম্পৰ্কীয় বিষয় প্ৰকাশ কৰা নাই।" : null,
    has_abusive_image: false,
    has_explicit_image: false,
    has_ai_image: false,
    image_rejection_reason_en: null,
    image_rejection_reason_as: null,
  };
}
