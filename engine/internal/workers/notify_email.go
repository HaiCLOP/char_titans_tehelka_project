package workers

import (
	"context"
	"fmt"
	"html"
	"strings"
)

// ---------- 5. notification_email (Supabase Queues / pgmq, migration 19) ----------

// Messages are hidden for queueVisibility seconds after a read; one that was not acknowledged (send failed,
// engine crashed) shows up again and is retried. After queueMaxTries reads it is archived as dead.
const (
	queueBatch      = 20
	queueVisibility = 300
	queueMaxTries   = 6
)

type queuedNotification struct {
	MsgID          int64   `json:"msg_id"`
	ReadCt         int     `json:"read_ct"`
	NotificationID *int64  `json:"notification_id"`
	Email          *string `json:"email"`
	Lang           string  `json:"lang"`
	TitleEn        *string `json:"title_en"`
	TitleAs        *string `json:"title_as"`
	ComplaintID    *string `json:"complaint_id"`
	AlreadyRead    bool    `json:"already_read"`
	WantsEmail     bool    `json:"wants_email"`
}

// NotificationEmail drains the notification_email queue: email, then delete; failures stay queued.
func (d *Deps) NotificationEmail(ctx context.Context) (int, error) {
	if !d.Mail.Configured() {
		return 0, nil // no mail provider: messages wait in the queue until one is configured
	}
	var batch []queuedNotification
	if err := d.DB.RPC(ctx, "notification_queue_read", map[string]any{"qty": queueBatch, "vt": queueVisibility}, &batch); err != nil {
		return 0, fmt.Errorf("notification_queue_read: %w", err)
	}
	var done, dead []int64
	var firstErr error
	for _, m := range batch {
		switch {
		// Deleted notification, no address, opted out, or already seen in the app: nothing to send.
		case m.NotificationID == nil || m.Email == nil || *m.Email == "" || !m.WantsEmail || m.AlreadyRead:
			done = append(done, m.MsgID)
		case m.ReadCt > queueMaxTries:
			dead = append(dead, m.MsgID)
		default:
			subject, body, text := d.renderNotification(m)
			if err := d.Mail.Send(ctx, *m.Email, subject, body, text); err != nil {
				if firstErr == nil {
					firstErr = fmt.Errorf("send notification %d (try %d): %w", *m.NotificationID, m.ReadCt, err)
				}
				continue // stays in the queue; visible again after queueVisibility
			}
			done = append(done, m.MsgID)
		}
	}
	if len(done) > 0 {
		var n int
		if err := d.DB.RPC(ctx, "notification_queue_ack", map[string]any{"ids": done}, &n); err != nil {
			return 0, fmt.Errorf("notification_queue_ack: %w", err)
		}
	}
	if len(dead) > 0 {
		var n int
		if err := d.DB.RPC(ctx, "notification_queue_dead", map[string]any{"ids": dead}, &n); err != nil {
			return len(done), fmt.Errorf("notification_queue_dead: %w", err)
		}
	}
	return len(done), firstErr
}

func (d *Deps) renderNotification(m queuedNotification) (subject, body, text string) {
	en, as := deref(m.TitleEn), deref(m.TitleAs)
	title := en
	if m.Lang == "as" && as != "" {
		title = as
	}
	link := ""
	if d.SiteURL != "" && m.ComplaintID != nil {
		link = d.SiteURL + "/c/" + *m.ComplaintID
	}
	subject = "CivicSense: " + title
	var b strings.Builder
	b.WriteString(`<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#111">`)
	b.WriteString("<p><b>" + html.EscapeString(title) + "</b></p>")
	if other := map[bool]string{true: en, false: as}[m.Lang == "as"]; other != "" && other != title {
		b.WriteString(`<p style="color:#555">` + html.EscapeString(other) + "</p>")
	}
	if link != "" {
		b.WriteString(`<p><a href="` + html.EscapeString(link) + `" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Open · খোলক</a></p>`)
	}
	b.WriteString(`<p style="color:#666;font-size:13px">CivicSense · Dibrugarh University</p></div>`)
	text = title
	if link != "" {
		text += "\n" + link
	}
	return subject, b.String(), text
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
