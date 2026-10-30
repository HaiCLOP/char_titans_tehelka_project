package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Produced by src/lib/ai/crypto.ts encryptKey logic (node:crypto) with testSecret.
const nodeFixture = "DLlValFBvFGyNss7.oI8sdPCP/LispPjULE+W1w==.AJKODWUHLncuHz1zjVjb19IzSaK9HXuxbo6SQd0="

func TestDecryptNodeFixture(t *testing.T) {
	got, err := DecryptKey(testSecret, nodeFixture)
	if err != nil {
		t.Fatal(err)
	}
	if got != "AIzaSyFAKE-key-for-tests-1234" {
		t.Fatalf("got %q", got)
	}
	if _, err := DecryptKey("wrong-secret-wrong-secret-wrong-secret", nodeFixture); err == nil {
		t.Fatal("wrong secret must fail")
	}
	enc, _ := EncryptKey(testSecret, "round trip")
	if back, err := DecryptKey(testSecret, enc); err != nil || back != "round trip" {
		t.Fatalf("round trip %q %v", back, err)
	}
}

func TestBengaliDriftTriggersStrictRetry(t *testing.T) {
	drifted := strings.ReplaceAll(validIntake, AssameseRa, BengaliRa)
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) {
		if strings.Contains(c.System, "PREVIOUS ANSWER USED BENGALI") {
			return 200, geminiText(validIntake)
		}
		return 200, geminiText(drifted)
	}}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, staticStore{providers: chain("intake", "google:m1")}, srv.URL, srv.URL, withGeminiKeys("k1"))
	res := NewAnalyzer(r).Analyze(context.Background(), IntakeInput{Text: "হোষ্টেলৰ বাথৰুমত পানী নাই"})
	if len(fg.calls) != 2 {
		t.Fatalf("calls %d, want 2", len(fg.calls))
	}
	if strings.Contains(fg.calls[0].System, "PREVIOUS ANSWER") || !strings.Contains(fg.calls[1].System, "PREVIOUS ANSWER USED BENGALI") {
		t.Fatal("second call must use the strict prompt, first must not")
	}
	if res.Source != "ai" || HasBengaliDrift(res.Intake.TitleAs+res.Intake.SummaryAs) || res.AssameseAutofixed {
		t.Fatalf("res %+v", res)
	}
	if len(res.Attempts) != 2 {
		t.Fatalf("attempts %d", len(res.Attempts))
	}
}

func TestBengaliDriftAutofixAsLastResort(t *testing.T) {
	drifted := strings.ReplaceAll(validIntake, AssameseRa, BengaliRa)
	fg := &fakeGemini{fn: func(geminiCall) (int, string) { return 200, geminiText(drifted) }}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, staticStore{providers: chain("intake", "google:m1")}, srv.URL, srv.URL, withGeminiKeys("k1"))
	res := NewAnalyzer(r).Analyze(context.Background(), IntakeInput{Text: "x y z"})
	if !res.AssameseAutofixed || HasBengaliDrift(res.Intake.TitleAs+res.Intake.SummaryAs) {
		t.Fatalf("res %+v", res)
	}
}

func TestFallbackWhenNoKeys(t *testing.T) {
	r := newRouter(t, staticStore{}, "http://127.0.0.1:1", "http://127.0.0.1:1")
	a := NewAnalyzer(r)
	res := a.Analyze(context.Background(), IntakeInput{Text: "No water in girls hostel washroom"})
	if res.Source != "fallback" || res.Model != "" || res.Intake.Category != "water_supply" || res.Intake.Priority != 3 {
		t.Fatalf("res %+v", res)
	}
	neg3 := a.Analyze(context.Background(), IntakeInput{Text: "Someone is threatening me near the gate"})
	if !neg3.Intake.IsUrgent || !neg3.Intake.IsSensitiveSuggested || neg3.Intake.Priority != 1 {
		t.Fatalf("NEG3 %+v", neg3.Intake)
	}
	as := FallbackIntake("গেটৰ ওচৰত মোক ভাবুকি দিছে")
	if !as.IsUrgent || !as.IsSensitiveSuggested {
		t.Fatalf("assamese threat %+v", as)
	}
	fire := FallbackIntake("হোষ্টেলত জুই লাগিছে")
	if !fire.IsUrgent || fire.Priority != 1 || fire.IsSensitiveSuggested {
		t.Fatalf("assamese fire %+v", fire)
	}
	photo := FallbackIntake("")
	if photo.TitleEn != "Photo complaint" || HasBengaliDrift(photo.SummaryAs) {
		t.Fatalf("photo %+v", photo)
	}
}

func TestParseIntakeRules(t *testing.T) {
	urgent := strings.Replace(strings.Replace(validIntake, `"is_urgent":false`, `"is_urgent":true`, 1), `"priority":2`, `"priority":3`, 1)
	it, err := ParseIntake(urgent)
	if err != nil || it.Priority != 1 {
		t.Fatalf("urgent must force priority 1: %+v %v", it, err)
	}
	for name, bad := range map[string]string{
		"priority 5":    strings.Replace(validIntake, `"priority":2`, `"priority":5`, 1),
		"priority 2.5":  strings.Replace(validIntake, `"priority":2`, `"priority":2.5`, 1),
		"missing title": strings.Replace(validIntake, `"title_en":"No water in hostel bathroom",`, "", 1),
		"not json":      "sorry, I cannot",
	} {
		if _, err := ParseIntake(bad); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
	if j := extractJSON("```json\n" + validIntake + "\n```"); j != validIntake {
		t.Fatalf("extractJSON: %q", j)
	}
}

func TestPromptHasV2Rules(t *testing.T) {
	p := IntakeSystem(false)
	for _, want := range []string{"is_urgent: true only for immediate danger", "is_sensitive_suggested: true for harassment", `"is_urgent":false,"is_sensitive_suggested":false}`, "water_supply, plumbing"} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt missing %q", want)
		}
	}
	if strings.Contains(p, "PREVIOUS ANSWER") {
		t.Error("non-strict prompt has strict rule")
	}
}
