package ai

import (
	"regexp"
	"strings"
)

// Port of src/lib/ai/fallback.ts: deterministic bilingual keyword classifier, used
// only when every AI model is down. Urgent/sensitive keyword lists match the TS ones.
var fallbackRules = []struct {
	cat string
	re  *regexp.Regexp
}{
	{"water_supply", regexp.MustCompile(`(?i)water|পানী|pani`)},
	{"electrical", regexp.MustCompile(`(?i)electric|power|light|fan|wire|বিদ্যুৎ|লাইট|পংখা|তাঁৰ`)},
	{"it_network", regexp.MustCompile(`(?i)wi-?fi|internet|network|ৱাই-ফাই|ইণ্টাৰনেট`)},
	{"sanitation", regexp.MustCompile(`(?i)garbage|dustbin|toilet|dirty|smell|আৱৰ্জনা|শৌচাগাৰ|লেতেৰা`)},
	{"plumbing", regexp.MustCompile(`(?i)leak|pipe|tap|drain|নলা|পাইপ`)},
	{"mess_food", regexp.MustCompile(`(?i)mess|food|canteen|মেছ|খাদ্য|কেণ্টিন`)},
	{"safety_security", regexp.MustCompile(`(?i)unsafe|theft|fight|security|সুৰক্ষা|চুৰি`)},
	{"academic", regexp.MustCompile(`(?i)exam|class|teacher|result|পৰীক্ষা|শ্ৰেণী`)},
	{"infrastructure", regexp.MustCompile(`(?i)broken|road|door|window|bench|ভগা|পথ|দুৱাৰ`)},
}

var (
	urgentRe    = regexp.MustCompile(`(?i)fire|smoke|injur|bleed|accident|unconscious|faint|electrocut|violence|attack|threat|knife|weapon|জুই|ধোঁৱা|আঘাত|দুৰ্ঘটনা|অজ্ঞান|হিংসা|আক্ৰমণ|ভাবুকি|ছুৰী`)
	sensitiveRe = regexp.MustCompile(`(?i)harass|threat|stalk|ragging|abuse|molest|bully|suicid|unsafe|হাৰাশাস|ভাবুকি|ৰেগিং|নিৰ্যাতন|অসুৰক্ষিত`)
	phoneRe     = regexp.MustCompile(`\b\d{10}\b`)
)

func runes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// FallbackIntake classifies by keywords. Urgent forces priority 1.
func FallbackIntake(text string) Intake {
	cat := "other"
	for _, r := range fallbackRules {
		if r.re.MatchString(text) {
			cat = r.cat
			break
		}
	}
	short := runes(strings.TrimSpace(text), 80)
	if short == "" {
		short = "Photo complaint"
	}
	sumEn, sumAs := runes(text, 380), runes(text, 380)
	if sumEn == "" {
		sumEn = "Photo complaint awaiting AI analysis."
		sumAs = "ফটো অভিযোগ — এআই বিশ্লেষণৰ অপেক্ষাত।"
	}
	urgent := urgentRe.MatchString(text)
	priority, reason := 3, "Default priority (AI unavailable)"
	if urgent {
		priority, reason = 1, "Urgent keywords detected (AI unavailable)"
	}
	return Intake{
		TitleEn: short, TitleAs: short, SummaryEn: sumEn, SummaryAs: sumAs,
		Category: cat, Priority: priority, PriorityReasonEn: reason, LocationHint: nil,
		IsAbusive: false, HasPersonalData: phoneRe.MatchString(text), Confidence: 0.3,
		IsUrgent: urgent, IsSensitiveSuggested: sensitiveRe.MatchString(text),
	}
}
