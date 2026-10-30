// Package config loads engine settings from the process environment, falling back to
// the web app's ../.env.local (relative to the working dir and to the executable).
package config

import (
	"bufio"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	SupabaseURL       string
	ServiceRoleKey    string
	AIKeysSecret      string
	GeminiAPIKeys     []string
	OpenRouterAPIKeys []string
	EngineSecret      string
	Port              int
	LogLevel          slog.Level
	EnvFiles          []string // .env files that were found and read (paths only)
}

// Load reads env + .env.local files. Real environment variables always win.
func Load() (*Config, error) {
	file := map[string]string{}
	var found []string
	for _, p := range candidateEnvFiles() {
		vals, err := ParseEnvFile(p)
		if err != nil {
			continue
		}
		found = append(found, p)
		for k, v := range vals {
			if _, ok := file[k]; !ok {
				file[k] = v
			}
		}
	}
	get := func(k string) string {
		if v, ok := os.LookupEnv(k); ok && v != "" {
			return v
		}
		return file[k]
	}

	c := &Config{
		SupabaseURL:       strings.TrimRight(get("NEXT_PUBLIC_SUPABASE_URL"), "/"),
		ServiceRoleKey:    get("SUPABASE_SERVICE_ROLE_KEY"),
		AIKeysSecret:      get("AI_KEYS_SECRET"),
		GeminiAPIKeys:     SplitList(get("GEMINI_API_KEYS")),
		OpenRouterAPIKeys: SplitList(get("OPENROUTER_API_KEYS")),
		EngineSecret:      get("ENGINE_SECRET"),
		Port:              8080,
		LogLevel:          slog.LevelInfo,
		EnvFiles:          found,
	}
	if p := get("ENGINE_PORT"); p != "" {
		n, err := strconv.Atoi(p)
		if err != nil || n <= 0 || n > 65535 {
			return nil, fmt.Errorf("ENGINE_PORT %q is not a valid port", p)
		}
		c.Port = n
	}
	switch strings.ToLower(get("ENGINE_LOG_LEVEL")) {
	case "debug":
		c.LogLevel = slog.LevelDebug
	case "warn", "warning":
		c.LogLevel = slog.LevelWarn
	case "error":
		c.LogLevel = slog.LevelError
	}
	if len(c.EngineSecret) < 16 {
		return nil, errors.New("ENGINE_SECRET must be set and at least 16 characters")
	}
	return c, nil
}

func candidateEnvFiles() []string {
	var out []string
	seen := map[string]bool{}
	add := func(p string) {
		abs, err := filepath.Abs(p)
		if err != nil || seen[abs] {
			return
		}
		seen[abs] = true
		out = append(out, abs)
	}
	add(filepath.Join("..", ".env.local"))
	if exe, err := os.Executable(); err == nil {
		add(filepath.Join(filepath.Dir(exe), "..", ".env.local"))
	}
	return out
}

// ParseEnvFile is a minimal KEY=VALUE parser: ignores blanks and # comments, strips
// an optional "export " prefix and matching surrounding quotes.
func ParseEnvFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return parseEnv(bufio.NewScanner(f))
}

func parseEnv(sc *bufio.Scanner) (map[string]string, error) {
	out := map[string]string{}
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(strings.TrimPrefix(sc.Text(), string(rune(0xFEFF))))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if len(v) >= 2 && (v[0] == '"' || v[0] == '\'') && v[len(v)-1] == v[0] {
			v = v[1 : len(v)-1]
		} else if i := strings.Index(v, " #"); i >= 0 {
			v = strings.TrimSpace(v[:i]) // trailing comment on an unquoted value
		}
		if k != "" {
			out[k] = v
		}
	}
	return out, sc.Err()
}

// SplitList splits a comma-separated list, trimming blanks.
func SplitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
