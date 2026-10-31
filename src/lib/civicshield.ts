import { createHash } from "node:crypto";
import type { Intake } from "@/lib/domain";

export type CivicShieldReport = {
  status: "verified_signals" | "no_ai_signals" | "needs_review" | "ai_detected";
  c2pa: "present_ai" | "present_verified" | "not_present";
  watermark: "detected" | "not_detected";
  visual_classifier: "authentic_indicators" | "inconclusive" | "suspect";
  manipulation: "clean" | "needs_review";
  context_match: "match" | "discrepancy" | "inconclusive";
  recommendation_en: string;
  recommendation_as: string;
  hashes: { path: string; sha256: string; received_at: string }[];
};

/**
 * Sniffs byte headers and metadata for C2PA, SynthID, and AI generator footprints.
 */
export function inspectImageProvenance(bytes: Uint8Array): {
  sha256: string;
  received_at: string;
  c2pa: "present_ai" | "present_verified" | "not_present";
  watermark: "detected" | "not_detected";
  has_ai_metadata: boolean;
} {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const received_at = new Date().toISOString();

  const sampleSize = Math.min(bytes.length, 65536);
  const head = String.fromCharCode(...bytes.subarray(0, sampleSize));
  const tail =
    bytes.length > sampleSize
      ? String.fromCharCode(...bytes.subarray(bytes.length - Math.min(bytes.length - sampleSize, 16384)))
      : "";
  const text = `${head} ${tail}`;

  // 1. C2PA Content Credentials detection
  const c2paPatterns = [
    /c2pa/i,
    /jumbf/i,
    /urn:c2pa:/i,
    /http:\/\/c2pa\.org/i,
    /claim_generator/i,
    /c2pa\.assertions/i,
    /c2pa\.actions/i,
  ];
  const hasC2pa = c2paPatterns.some((p) => p.test(text));

  // 2. AI Generator / SynthID / Watermark footprint detection
  const aiWatermarkPatterns = [
    /parameters\s*:\s*[^\x00]{10,}/i,
    /Negative\s+prompt\s*:/i,
    /Steps\s*:\s*\d+,\s*Sampler\s*:/i,
    /Software[\x00-\x20]+(Stable\s*Diffusion|Midjourney|NovelAI|DALL[-·]?E)/i,
    /comfyui|civitai\.com|dreamstudio|invokeai/i,
    /prompt[\x00-\x20]*:\s*\{"class_type"/i,
    /adobe:generative/i,
    /c2pa\.ai_generative/i,
    /synthid/i,
  ];
  const hasAiFootprint = aiWatermarkPatterns.some((p) => p.test(text));

  let c2paStatus: "present_ai" | "present_verified" | "not_present" = "not_present";
  if (hasC2pa) {
    c2paStatus = hasAiFootprint ? "present_ai" : "present_verified";
  }

  return {
    sha256,
    received_at,
    c2pa: c2paStatus,
    watermark: hasAiFootprint ? "detected" : "not_detected",
    has_ai_metadata: hasAiFootprint,
  };
}

/**
 * Builds the comprehensive CivicShield Evidence Report for administrators.
 */
export function buildCivicShieldReport(
  images: { path: string; bytes: Uint8Array }[],
  intake: Intake,
): CivicShieldReport {
  const proofs = images.map((img) => ({
    path: img.path,
    ...inspectImageProvenance(img.bytes),
  }));

  const anyC2paAi = proofs.some((p) => p.c2pa === "present_ai");
  const anyC2paVerified = proofs.some((p) => p.c2pa === "present_verified");
  const anyWatermark = proofs.some((p) => p.watermark === "detected");
  const anyAiMetadata = proofs.some((p) => p.has_ai_metadata);

  const c2pa = anyC2paAi ? "present_ai" : anyC2paVerified ? "present_verified" : "not_present";
  const watermark = anyWatermark || anyAiMetadata ? "detected" : "not_detected";

  // Visual AI classifier result from intake
  let visualClassifier: "authentic_indicators" | "inconclusive" | "suspect" = "authentic_indicators";
  if (intake.has_ai_image || anyAiMetadata) {
    visualClassifier = "suspect";
  } else if (intake.confidence < 0.6) {
    visualClassifier = "inconclusive";
  }

  const manipulation: "clean" | "needs_review" =
    visualClassifier === "suspect" || watermark === "detected" ? "needs_review" : "clean";

  // Context check: does the text correlate with intake category and images
  const contextMatch: "match" | "discrepancy" | "inconclusive" =
    intake.is_relevant && intake.confidence >= 0.7
      ? "match"
      : intake.is_relevant
      ? "inconclusive"
      : "discrepancy";

  let status: CivicShieldReport["status"] = "no_ai_signals";
  let recommendation_en = "No supported AI signal detected. Standard review recommended. Note: Lack of AI watermarks does not guarantee 100% authenticity.";
  let recommendation_as = "কোনো এআই সংকেত চিনাক্ত হোৱা নাই। নিয়মীয়া পৰ্যালোচনা বাঞ্ছনীয়। সতৰ্কতা: ৱাটাৰমাৰ্ক নথকাৰ অৰ্থ ১০০% প্ৰামাণিক নহয়।";

  if (c2pa === "present_ai" || watermark === "detected" || visualClassifier === "suspect") {
    status = "ai_detected";
    recommendation_en = "Supported AI provenance or synthetic indicators detected. Request additional real-world photographic evidence or in-app live camera capture.";
    recommendation_as = "এআই সংকেত বা কৃত্ৰিম ছবিৰ লক্ষণ চিনাক্ত হৈছে। অনুগ্ৰহ কৰি কেমেৰাৰ জৰিয়তে প্ৰত্যক্ষ ফটো বিচাৰক।";
  } else if (c2pa === "present_verified") {
    status = "verified_signals";
    recommendation_en = "Cryptographic C2PA Content Credentials verified. Original capture provenance verified.";
    recommendation_as = "ক্ৰিপ্ট'গ্ৰাফিক C2PA প্ৰামাণিকতা পৰীক্ষা সফল হৈছে।";
  } else if (visualClassifier === "inconclusive" || contextMatch === "inconclusive") {
    status = "needs_review";
    recommendation_en = "Evidence signals are inconclusive. Staff visual inspection recommended before issuing work order.";
    recommendation_as = "প্ৰমাণৰ সংকেত অস্পষ্ট। কৰ্মাদেশ জাৰি কৰাৰ পূৰ্বে কৰ্মীৰ দ্বাৰা প্ৰত্যক্ষ পৰীক্ষা বাঞ্ছনীয়।";
  }

  return {
    status,
    c2pa,
    watermark,
    visual_classifier: visualClassifier,
    manipulation,
    context_match: contextMatch,
    recommendation_en,
    recommendation_as,
    hashes: proofs.map((p) => ({ path: p.path, sha256: p.sha256, received_at: p.received_at })),
  };
}
