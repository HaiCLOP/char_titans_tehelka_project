package config

import (
	"bufio"
	"strings"
	"testing"
)

func TestParseEnv(t *testing.T) {
	in := "# comment\n\nA=1\nexport B=\"two words\"\nC='x=y'\nD=plain # trailing\n BAD LINE\nE=\n"
	m, err := parseEnv(bufio.NewScanner(strings.NewReader(in)))
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"A": "1", "B": "two words", "C": "x=y", "D": "plain", "E": ""}
	for k, v := range want {
		if m[k] != v {
			t.Errorf("%s = %q, want %q", k, m[k], v)
		}
	}
	if len(m) != len(want) {
		t.Errorf("got %d keys: %v", len(m), m)
	}
}

func TestSplitList(t *testing.T) {
	got := SplitList(" a, ,b,")
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("got %v", got)
	}
}

func TestLoadRequiresSecret(t *testing.T) {
	t.Setenv("ENGINE_SECRET", "short")
	if _, err := Load(); err == nil {
		t.Fatal("expected error for short ENGINE_SECRET")
	}
	t.Setenv("ENGINE_SECRET", "0123456789abcdef")
	t.Setenv("ENGINE_PORT", "9090")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != 9090 {
		t.Fatalf("port %d", c.Port)
	}
}
