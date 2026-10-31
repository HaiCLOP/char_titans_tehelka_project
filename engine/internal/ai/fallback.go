package ai

import (
	"fmt"
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

var categoryNames = map[string]struct{ en, as string }{
	"water_supply":    {"Water supply issue", "পানী যোগান সমস্যা"},
	"electrical":      {"Electrical maintenance issue", "বিদ্যুৎ বিভাগৰ সমস্যা"},
	"it_network":      {"IT / Wi-Fi network issue", "আইটি আৰু নেটৱৰ্ক সমস্যা"},
	"sanitation":      {"Sanitation and waste issue", "চাফাই আৰু আৱৰ্জনা সমস্যা"},
	"plumbing":        {"Plumbing maintenance issue", "নলা আৰু পাইপলাইন সমস্যা"},
	"mess_food":       {"Mess and food service issue", "মেছ আৰু খাদ্য সেৱাৰ সমস্যা"},
	"safety_security": {"Campus security issue", "চৌহদৰ সুৰক্ষা বিষয়"},
	"academic":        {"Academic facility issue", "শৈক্ষিক সুবিধাৰ সমস্যা"},
	"infrastructure":  {"Campus infrastructure issue", "আন্তঃগাঁথনি মেৰামতি সমস্যা"},
	"hostel":          {"Hostel facility issue", "হোষ্টেল ব্যৱস্থাপনা সমস্যা"},
	"transport":       {"Campus transport issue", "চৌহদৰ পৰিবহণ সমস্যা"},
	"other":           {"General campus issue", "চৌহদৰ সাধাৰণ সমস্যা"},
}

var (
	urgentRe    = regexp.MustCompile(`(?i)fire|smoke|injur|bleed|accident|unconscious|faint|electrocut|violence|attack|threat|knife|weapon|জুই|ধোঁৱা|আঘাত|দুৰ্ঘটনা|অজ্ঞান|হিংসা|আক্ৰমণ|ভাবুকি|ছুৰী`)
	sensitiveRe = regexp.MustCompile(`(?i)harass|threat|stalk|ragging|abuse|molest|bully|suicid|unsafe|হাৰাশাস|ভাবুকি|ৰেগিং|নিৰ্যাতন|অসুৰক্ষিত`)
	phoneRe     = regexp.MustCompile(`\b\d{10}\b`)
)

func isAssamese(s string) bool {
	for _, r := range s {
		if r >= 0x0980 && r <= 0x09FF {
			return true
		}
	}
	return false
}

func runes(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// FallbackIntake classifies by keywords. Never copies English to Assamese or vice versa.
func FallbackIntake(text string) Intake {
	cat := "other"
	for _, r := range fallbackRules {
		if r.re.MatchString(text) {
			cat = r.cat
			break
		}
	}

	catInfo, ok := categoryNames[cat]
	if !ok {
		catInfo = categoryNames["other"]
	}

	trimmed := strings.TrimSpace(text)
	var titleEn, titleAs, sumEn, sumAs string

	if trimmed == "" {
		titleEn = "Photo complaint"
		titleAs = "ফটো অভিযোগ"
		sumEn = "Photo complaint awaiting AI analysis."
		sumAs = "ফটো অভিযোগ — এআই বিশ্লেষণৰ অপেক্ষাত।"
	} else if isAssamese(trimmed) {
		titleAs = runes(trimmed, 80)
		sumAs = runes(trimmed, 380)
		titleEn = fmt.Sprintf("%s (Assamese report)", catInfo.en)
		sumEn = "Original complaint submitted in Assamese. Translation is pending background processing."
	} else {
		titleEn = runes(trimmed, 80)
		sumEn = runes(trimmed, 380)
		titleAs = fmt.Sprintf("%s (অনুবাদ বাকী)", catInfo.as)
		sumAs = "মূল অভিযোগটো ইংৰাজীত দাখিল কৰা হৈছে। অসমীয়া অনুবাদৰ কাম চলি আছে।"
	}

	urgent := urgentRe.MatchString(text)
	priority, reason := 3, "Default priority (AI unavailable)"
	if urgent {
		priority, reason = 1, "Urgent keywords detected (AI unavailable)"
	}

	return Intake{
		TitleEn: titleEn, TitleAs: titleAs, SummaryEn: sumEn, SummaryAs: sumAs,
		Category: cat, Priority: priority, PriorityReasonEn: reason, LocationHint: nil,
		IsAbusive: false, HasPersonalData: phoneRe.MatchString(text), Confidence: 0.3,
		IsUrgent: urgent, IsSensitiveSuggested: sensitiveRe.MatchString(text),
		IsRelevant: true,
	}
}
