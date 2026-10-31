/**
 * Content moderation: automated detection and filtering of abusive language and profanities
 * across English, Assamese, and Hinglish / Romanised terms.
 */

// Abusive word roots and slurs (English, Romanised Hindi/Assamese, Assamese script)
const ABUSIVE_PATTERNS: RegExp[] = [
  // English profanities and slurs
  /\b(fuck|fucking|fucker|motherfucker|bitch|bastard|asshole|dickhead|cunt|slut|whore|nigger|faggot|retard)\b/gi,
  /\b(shit|bullshit|damn|crap)\b/gi,
  // Romanised / Hinglish / Assamese abusive terms
  /\b(chutiya|chutiye|madarchod|bhenchod|bhenkelaude|bhosdike|bhosdi|harami|kutta|kutti|kamina|kamine|randi|saala|saali|suar|lauda|gaand|gandu)\b/gi,
  // Assamese script abusive words (strictly Assamese alphabet with ৰ and ৱ)
  /\b(কুত্তা|কুত্তী|হাৰামী|চাল্লা|চাল্লি|বেচ্যা|বেশ্যা|মাহীৰ\s*পো|কুকুৰৰ\s*পো|চুটিয়া)\b/gi,
];

/** Replaces inner characters of a matched abusive word with asterisks. */
function maskTerm(term: string): string {
  if (term.length <= 2) return "**";
  if (term.length === 3) return term[0] + "*" + term[2];
  return term[0] + "*".repeat(term.length - 2) + term[term.length - 1];
}

/**
 * Automatically filters abusive words from user text, returning the sanitized string
 * and whether any abusive terms were detected.
 */
export function filterAbusiveText(input: string): {
  cleanText: string;
  hasAbuse: boolean;
  matchCount: number;
} {
  if (!input || !input.trim()) {
    return { cleanText: input, hasAbuse: false, matchCount: 0 };
  }

  let cleaned = input;
  let matchesFound = 0;

  for (const pattern of ABUSIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, (match) => {
      matchesFound++;
      return maskTerm(match);
    });
  }

  return {
    cleanText: cleaned,
    hasAbuse: matchesFound > 0,
    matchCount: matchesFound,
  };
}

/** Returns true if the input text contains any abusive language or slurs. */
export function containsAbuse(input: string): boolean {
  if (!input) return false;
  return ABUSIVE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

