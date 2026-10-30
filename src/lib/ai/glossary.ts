// Fixed Assamese wording for campus terms so every AI output stays consistent.
// Replaces a human reviewer — extend it as the team spots better terms.
export const GLOSSARY: [string, string][] = [
  ["hostel", "হোষ্টেল"], ["mess", "মেছ"], ["warden", "ৱাৰ্ডেন"], ["library", "পুথিভঁৰাল"],
  ["classroom", "শ্ৰেণীকোঠা"], ["department", "বিভাগ"], ["exam", "পৰীক্ষা"], ["bathroom", "বাথৰুম"],
  ["toilet", "শৌচাগাৰ"], ["water supply", "পানী যোগান"], ["drinking water", "খোৱা পানী"], ["leak", "পানী সৰা"],
  ["electricity", "বিদ্যুৎ"], ["power cut", "বিদ্যুৎ বিচ্ছিন্ন"], ["fan", "পংখা"], ["light", "লাইট"],
  ["Wi-Fi", "ৱাই-ফাই"], ["internet", "ইণ্টাৰনেট"], ["garbage", "আৱৰ্জনা"], ["dustbin", "ডাষ্টবিন"],
  ["drain", "নলা"], ["road", "পথ"], ["broken", "ভগা"], ["not working", "চলা নাই"], ["repair", "মেৰামতি"],
  ["urgent", "জৰুৰী"], ["security", "সুৰক্ষা"], ["canteen", "কেণ্টিন"], ["food", "খাদ্য"], ["complaint", "অভিযোগ"],
];
export const glossaryText = () => GLOSSARY.map(([en, as]) => `${en} = ${as}`).join("; ");
