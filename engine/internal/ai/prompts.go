package ai

import "strings"

// IntakePromptVersion tracks src/lib/ai/prompts/intake.ts (INTAKE_PROMPT_VERSION).
const IntakePromptVersion = "intake-v2"

const strictAssameseRule = "\n- PREVIOUS ANSWER USED BENGALI LETTERS. Rewrite all Assamese text with ৰ for 'r' and ৱ for 'w'. Never output র."

// IntakeSystem is a port of intakeSystem() in src/lib/ai/prompts/intake.ts (v2 rules).
func IntakeSystem(strict bool) string {
	var b strings.Builder
	b.WriteString(`You triage campus complaints at Dibrugarh University, Assam.
The student may write in Assamese, English, romanised Assamese, or send only a photo.
Return JSON only, matching the schema exactly.

Rules:
- category must be one of: ` + strings.Join(Categories, ", ") + `.
- priority: 1 = safety/health risk or many people affected now (exposed wires, no drinking water in a hostel, fire risk); 2 = blocks daily life; 3 = inconvenient; 4 = cosmetic.
- is_urgent: true only for immediate danger to people right now: fire, smoke, injury, violence, threats, medical emergency, live exposed wires. If is_urgent then priority must be 1.
- is_sensitive_suggested: true for harassment, threats, stalking, ragging, abuse, mental health or other personal/safety matters that should be visible only to admins.
- Never invent a building or room. location_hint only if written or clearly visible, else null.
- If only a photo: describe the visible problem; do not guess beyond what is visible; lower confidence.
- Assamese fields MUST be in Assamese (অসমীয়া), not Bengali. Use ৰ (not র) and ৱ. Natural, simple campus Assamese.
- Use these fixed terms: ` + glossaryText() + `.
- Keep titles under 10 words. Summaries factual, no blame, no personal data.`)
	if strict {
		b.WriteString(strictAssameseRule)
	}
	b.WriteString(`

Example:
Input: "হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই"
Output: {"title_en":"No water in hostel bathroom for 3 days","title_as":"হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই","summary_en":"The hostel bathroom has had no water supply for three days.","summary_as":"হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী যোগান বন্ধ হৈ আছে।","category":"water_supply","priority":2,"priority_reason_en":"Basic need affecting hostel residents for days","location_hint":"Hostel","is_abusive":false,"has_personal_data":false,"confidence":0.9,"is_urgent":false,"is_sensitive_suggested":false}`)
	return b.String()
}

func intakeUserText(text, locationName string) string {
	if strings.TrimSpace(text) == "" {
		text = "(no text, photo only)"
	}
	s := "Complaint text: " + text
	if locationName != "" {
		s += "\nSelected location: " + locationName
	}
	return s
}

// intakeSchema is the Gemini responseSchema (OpenAPI subset) for Intake.
func intakeSchema() map[string]any {
	str := func(desc string) map[string]any { return map[string]any{"type": "STRING", "description": desc} }
	boolean := func(desc string) map[string]any { return map[string]any{"type": "BOOLEAN", "description": desc} }
	return map[string]any{
		"type": "OBJECT",
		"properties": map[string]any{
			"title_en":               str("Short English title"),
			"title_as":               str("Short Assamese title, Assamese script using ৰ and ৱ"),
			"summary_en":             str("1-2 sentence English summary of the problem"),
			"summary_as":             str("Same summary in Assamese"),
			"category":               map[string]any{"type": "STRING", "format": "enum", "enum": Categories},
			"priority":               map[string]any{"type": "INTEGER", "description": "1 critical (safety/health risk), 2 high, 3 medium, 4 low"},
			"priority_reason_en":     str("Why this priority, in English"),
			"location_hint":          map[string]any{"type": "STRING", "nullable": true, "description": "Building/place mentioned or visible, else null"},
			"is_abusive":             boolean("Abusive language or personal attacks"),
			"has_personal_data":      boolean("Contains phone numbers or other personal data"),
			"confidence":             map[string]any{"type": "NUMBER"},
			"is_urgent":              boolean("Immediate danger to people right now"),
			"is_sensitive_suggested": boolean("Harassment, threats or personal/safety matter: admins only"),
		},
		"required": []string{
			"title_en", "title_as", "summary_en", "summary_as", "category", "priority", "priority_reason_en",
			"location_hint", "is_abusive", "has_personal_data", "confidence", "is_urgent", "is_sensitive_suggested",
		},
		"propertyOrdering": []string{
			"title_en", "title_as", "summary_en", "summary_as", "category", "priority", "priority_reason_en",
			"location_hint", "is_abusive", "has_personal_data", "confidence", "is_urgent", "is_sensitive_suggested",
		},
	}
}

// ---------- daily brief ----------

const dailyBriefSystem = `You write a short morning brief for campus complaint administrators at Dibrugarh University, Assam.
Input is JSON statistics for the last 24 hours plus overall open counts.
Return JSON only: {"en":[3 strings],"as":[3 strings]}.
Rules:
- Exactly 3 bullets per language, each under 25 words, factual, based only on the numbers given. No invented numbers.
- Bullet 1: overall load (open, overdue). Bullet 2: the biggest category or location. Bullet 3: one concrete suggestion.
- "as" is the same 3 bullets in Assamese (অসমীয়া), not Bengali. Use ৰ (not র) and ৱ.
- Use these fixed terms: `

func dailyBriefPrompt(strict bool) string {
	s := dailyBriefSystem + glossaryText() + "."
	if strict {
		s += strictAssameseRule
	}
	return s
}

func dailyBriefSchema() map[string]any {
	arr := map[string]any{"type": "ARRAY", "items": map[string]any{"type": "STRING"}}
	return map[string]any{
		"type":       "OBJECT",
		"properties": map[string]any{"en": arr, "as": arr},
		"required":   []string{"en", "as"},
	}
}
