package ai

import "strings"

// Categories mirrors CATEGORIES in src/lib/domain.ts (order matters for the prompt).
var Categories = []string{
	"water_supply", "plumbing", "electrical", "sanitation", "hostel", "mess_food",
	"infrastructure", "it_network", "academic", "safety_security", "transport", "other",
}

func validCategory(c string) bool { return contains(Categories, c) }

// Glossary is a port of src/lib/ai/glossary.ts: fixed Assamese wording for campus terms.
var Glossary = [][2]string{
	{"hostel", "হোষ্টেল"}, {"mess", "মেছ"}, {"warden", "ৱাৰ্ডেন"}, {"library", "পুথিভঁৰাল"},
	{"classroom", "শ্ৰেণীকোঠা"}, {"department", "বিভাগ"}, {"exam", "পৰীক্ষা"}, {"bathroom", "বাথৰুম"},
	{"toilet", "শৌচাগাৰ"}, {"water supply", "পানী যোগান"}, {"drinking water", "খোৱা পানী"}, {"leak", "পানী সৰা"},
	{"electricity", "বিদ্যুৎ"}, {"power cut", "বিদ্যুৎ বিচ্ছিন্ন"}, {"fan", "পংখা"}, {"light", "লাইট"},
	{"Wi-Fi", "ৱাই-ফাই"}, {"internet", "ইণ্টাৰনেট"}, {"garbage", "আৱৰ্জনা"}, {"dustbin", "ডাষ্টবিন"},
	{"drain", "নলা"}, {"road", "পথ"}, {"broken", "ভগা"}, {"not working", "চলা নাই"}, {"repair", "মেৰামতি"},
	{"urgent", "জৰুৰী"}, {"security", "সুৰক্ষা"}, {"canteen", "কেণ্টিন"}, {"food", "খাদ্য"}, {"complaint", "অভিযোগ"},
}

func glossaryText() string {
	parts := make([]string, len(Glossary))
	for i, g := range Glossary {
		parts[i] = g[0] + " = " + g[1]
	}
	return strings.Join(parts, "; ")
}

// BengaliRa is U+09B0 (র). Assamese uses ৰ (U+09F0); র in Assamese output is a bug.
const (
	BengaliRa  = "র"
	AssameseRa = "ৰ"
)

func HasBengaliDrift(s string) bool { return strings.Contains(s, BengaliRa) }

func FixBengaliDrift(s string) string { return strings.ReplaceAll(s, BengaliRa, AssameseRa) }
