package workers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"civicsense/engine/internal/mail"
	"civicsense/engine/internal/supa"
)

// Queue: msg 1 sends fine, msg 2's send fails (stays queued), msg 3 was read in the app (acked, no email),
// msg 4 exceeded the tries (archived).
func TestNotificationEmail(t *testing.T) {
	var mu sync.Mutex
	bodies := map[string]string{}
	db := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies[r.URL.Path] = string(b)
		mu.Unlock()
		switch r.URL.Path {
		case "/rest/v1/rpc/notification_queue_read":
			_, _ = io.WriteString(w, `[
				{"msg_id":1,"read_ct":1,"notification_id":10,"email":"ok@x.test","lang":"as","title_en":"CS-1: Assigned","title_as":"CS-1: দায়িত্ব","complaint_id":"c1","already_read":false,"wants_email":true},
				{"msg_id":2,"read_ct":2,"notification_id":11,"email":"fail@x.test","lang":"en","title_en":"CS-2: Resolved","title_as":null,"complaint_id":"c2","already_read":false,"wants_email":true},
				{"msg_id":3,"read_ct":1,"notification_id":12,"email":"seen@x.test","lang":"en","title_en":"x","title_as":null,"complaint_id":null,"already_read":true,"wants_email":true},
				{"msg_id":4,"read_ct":7,"notification_id":13,"email":"old@x.test","lang":"en","title_en":"x","title_as":null,"complaint_id":null,"already_read":false,"wants_email":true}]`)
		default:
			_, _ = io.WriteString(w, `1`)
		}
	}))
	defer db.Close()
	var sent []string
	resend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var m struct {
			To      []string `json:"to"`
			Subject string   `json:"subject"`
		}
		_ = json.NewDecoder(r.Body).Decode(&m)
		if m.To[0] == "fail@x.test" {
			w.WriteHeader(500)
			return
		}
		mu.Lock()
		sent = append(sent, m.To[0]+"|"+m.Subject)
		mu.Unlock()
	}))
	defer resend.Close()
	m := mail.New("re_test", "")
	m.Endpoint = resend.URL
	d := &Deps{DB: supa.New(db.URL, "service-key", nil), Mail: m, SiteURL: "https://cs.test"}

	n, err := d.NotificationEmail(context.Background())
	if n != 2 || err == nil || !strings.Contains(err.Error(), "notification 11") {
		t.Fatalf("n=%d err=%v", n, err)
	}
	if len(sent) != 1 || sent[0] != "ok@x.test|CivicSense: CS-1: দায়িত্ব" {
		t.Fatalf("sent=%v", sent)
	}
	if got := bodies["/rest/v1/rpc/notification_queue_ack"]; got != `{"ids":[1,3]}` {
		t.Fatalf("ack=%s", got)
	}
	if got := bodies["/rest/v1/rpc/notification_queue_dead"]; got != `{"ids":[4]}` {
		t.Fatalf("dead=%s", got)
	}
}

func TestNotificationEmailWithoutProvider(t *testing.T) {
	d := &Deps{Mail: mail.New("", "")}
	if n, err := d.NotificationEmail(context.Background()); n != 0 || err != nil {
		t.Fatalf("n=%d err=%v", n, err)
	}
}
