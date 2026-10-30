// Package supa is a tiny PostgREST client for Supabase using the service-role key.
// The key is only ever placed in request headers; it is never logged or returned.
package supa

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	base string // <SUPABASE_URL>
	key  string
	http *http.Client
}

// Error is a non-2xx PostgREST response. Body is the (truncated) server message.
type Error struct {
	Status int
	Body   string
}

func (e *Error) Error() string { return fmt.Sprintf("postgrest %d: %s", e.Status, e.Body) }

func New(baseURL, serviceKey string, hc *http.Client) *Client {
	if hc == nil {
		hc = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{base: strings.TrimRight(baseURL, "/"), key: serviceKey, http: hc}
}

// Configured reports whether URL and key are present.
func (c *Client) Configured() bool { return c != nil && c.base != "" && c.key != "" }

// BaseURL is the Supabase project URL (no secrets).
func (c *Client) BaseURL() string { return c.base }

func (c *Client) do(ctx context.Context, method, path string, q url.Values, body any, prefer string, out any) error {
	if !c.Configured() {
		return fmt.Errorf("supabase not configured")
	}
	u := c.base + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rd)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.key)
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("postgrest %s %s: %w", method, path, stripURL(err))
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 {
		msg := string(data)
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return &Error{Status: res.StatusCode, Body: msg}
	}
	if out != nil && len(bytes.TrimSpace(data)) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

// stripURL keeps transport errors short and free of query strings.
func stripURL(err error) error {
	if ue, ok := err.(*url.Error); ok {
		return fmt.Errorf("%s: %w", ue.Op, ue.Err)
	}
	return err
}

// Select GETs /rest/v1/<table>?<q> into out (a pointer to a slice).
func (c *Client) Select(ctx context.Context, table string, q url.Values, out any) error {
	return c.do(ctx, http.MethodGet, "/rest/v1/"+table, q, nil, "", out)
}

// Insert POSTs rows. out may be nil (return=minimal).
func (c *Client) Insert(ctx context.Context, table string, rows any, out any) error {
	prefer := "return=minimal"
	if out != nil {
		prefer = "return=representation"
	}
	return c.do(ctx, http.MethodPost, "/rest/v1/"+table, nil, rows, prefer, out)
}

// Upsert POSTs rows merging on the primary key.
func (c *Client) Upsert(ctx context.Context, table string, rows any) error {
	return c.do(ctx, http.MethodPost, "/rest/v1/"+table, nil, rows, "resolution=merge-duplicates,return=minimal", nil)
}

// Patch updates rows matching filter q. If out is non-nil, the updated rows are returned.
func (c *Client) Patch(ctx context.Context, table string, q url.Values, body any, out any) error {
	prefer := "return=minimal"
	if out != nil {
		prefer = "return=representation"
	}
	return c.do(ctx, http.MethodPatch, "/rest/v1/"+table, q, body, prefer, out)
}

// RPC calls a Postgres function: POST /rest/v1/rpc/<fn>.
func (c *Client) RPC(ctx context.Context, fn string, params any, out any) error {
	if params == nil {
		params = map[string]any{}
	}
	return c.do(ctx, http.MethodPost, "/rest/v1/rpc/"+fn, nil, params, "", out)
}

// Ping checks that PostgREST answers with our key.
func (c *Client) Ping(ctx context.Context) error {
	var rows []map[string]any
	return c.Select(ctx, "ai_providers", url.Values{"select": {"id"}, "limit": {"1"}}, &rows)
}

// Download fetches a private Storage object (bucket/path) with the service key.
func (c *Client) Download(ctx context.Context, bucket, path string, maxBytes int64) ([]byte, string, error) {
	if !c.Configured() {
		return nil, "", fmt.Errorf("supabase not configured")
	}
	esc := make([]string, 0)
	for _, seg := range strings.Split(path, "/") {
		esc = append(esc, url.PathEscape(seg))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/storage/v1/object/"+url.PathEscape(bucket)+"/"+strings.Join(esc, "/"), nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("apikey", c.key)
	req.Header.Set("Authorization", "Bearer "+c.key)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, "", stripURL(err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return nil, "", &Error{Status: res.StatusCode, Body: "storage download failed"}
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxBytes+1))
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > maxBytes {
		return nil, "", fmt.Errorf("object larger than %d bytes", maxBytes)
	}
	return data, res.Header.Get("Content-Type"), nil
}
