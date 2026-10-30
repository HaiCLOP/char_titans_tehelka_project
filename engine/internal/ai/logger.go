package ai

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

// LogRow is one ai_logs insert.
type LogRow struct {
	Purpose   string  `json:"purpose"`
	Provider  string  `json:"provider"`
	Model     string  `json:"model"`
	KeyLabel  string  `json:"key_label"`
	LatencyMs int64   `json:"latency_ms"`
	Status    string  `json:"status"`
	Error     *string `json:"error"`
}

// LogSink persists a batch of rows (PostgREST insert in production).
type LogSink func(ctx context.Context, rows []LogRow) error

// AsyncLogger buffers ai_logs rows in a channel and flushes them in the background.
// Log never blocks: if the buffer is full the row is dropped and counted.
type AsyncLogger struct {
	ch      chan LogRow
	sink    LogSink
	log     *slog.Logger
	dropped atomic.Int64
	failed  atomic.Int64
	written atomic.Int64
	done    chan struct{}
	once    sync.Once
}

func NewAsyncLogger(sink LogSink, size int, log *slog.Logger) *AsyncLogger {
	if size <= 0 {
		size = 1024
	}
	if log == nil {
		log = slog.Default()
	}
	l := &AsyncLogger{ch: make(chan LogRow, size), sink: sink, log: log, done: make(chan struct{})}
	go l.loop()
	return l
}

// Log enqueues an attempt. Safe on a nil receiver.
func (l *AsyncLogger) Log(purpose Purpose, a Attempt) {
	if l == nil {
		return
	}
	row := LogRow{Purpose: string(purpose), Provider: a.Provider, Model: a.Model, KeyLabel: a.KeyLabel, LatencyMs: a.LatencyMs, Status: a.Status}
	if a.Error != "" {
		e := a.Error
		row.Error = &e
	}
	defer func() { recover() }() // send on closed channel after Close → drop
	select {
	case l.ch <- row:
	default:
		l.dropped.Add(1)
	}
}

func (l *AsyncLogger) loop() {
	defer close(l.done)
	batch := make([]LogRow, 0, 50)
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	flush := func() {
		if len(batch) == 0 || l.sink == nil {
			batch = batch[:0]
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err := l.sink(ctx, batch)
		cancel()
		if err != nil {
			l.failed.Add(int64(len(batch)))
			l.log.Warn("ai_logs flush failed", "rows", len(batch), "err", err.Error())
		} else {
			l.written.Add(int64(len(batch)))
		}
		batch = make([]LogRow, 0, 50)
	}
	for {
		select {
		case row, ok := <-l.ch:
			if !ok {
				flush()
				return
			}
			batch = append(batch, row)
			if len(batch) >= 50 {
				flush()
			}
		case <-tick.C:
			flush()
		}
	}
}

// Close flushes queued rows, waiting at most timeout.
func (l *AsyncLogger) Close(timeout time.Duration) {
	if l == nil {
		return
	}
	l.once.Do(func() { close(l.ch) })
	select {
	case <-l.done:
	case <-time.After(timeout):
	}
}

type LogMetrics struct {
	Queued  int   `json:"queued"`
	Written int64 `json:"written"`
	Dropped int64 `json:"dropped"`
	Failed  int64 `json:"failed"`
}

func (l *AsyncLogger) Metrics() LogMetrics {
	if l == nil {
		return LogMetrics{}
	}
	return LogMetrics{Queued: len(l.ch), Written: l.written.Load(), Dropped: l.dropped.Load(), Failed: l.failed.Load()}
}
