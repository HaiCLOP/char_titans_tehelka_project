// Package workers runs the engine's periodic background jobs.
package workers

import (
	"context"
	"fmt"
	"log/slog"
	"runtime/debug"
	"sync"
	"time"
)

// Job is one periodic task. Run returns how many items it processed.
type Job struct {
	Name    string
	Every   time.Duration
	Timeout time.Duration
	Run     func(ctx context.Context) (int, error)
}

type Result struct {
	RanAt      time.Time `json:"ran_at"`
	DurationMs int64     `json:"duration_ms"`
	Processed  int       `json:"processed"`
	Error      string    `json:"error,omitempty"`
	Runs       int64     `json:"runs"`
}

type Runner struct {
	jobs         []Job
	initialDelay time.Duration
	log          *slog.Logger

	mu      sync.Mutex
	results map[string]Result
	wg      sync.WaitGroup
}

func NewRunner(log *slog.Logger, initialDelay time.Duration, jobs ...Job) *Runner {
	return &Runner{jobs: jobs, initialDelay: initialDelay, log: log, results: map[string]Result{}}
}

// Start launches one goroutine per job; they stop when ctx is cancelled.
func (r *Runner) Start(ctx context.Context) {
	for _, j := range r.jobs {
		r.wg.Add(1)
		go func(j Job) {
			defer r.wg.Done()
			t := time.NewTimer(r.initialDelay)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
				}
				r.RunOnce(ctx, j)
				t.Reset(j.Every)
			}
		}(j)
	}
}

// Wait blocks until all job goroutines have exited (after ctx cancel) or timeout.
func (r *Runner) Wait(timeout time.Duration) {
	done := make(chan struct{})
	go func() { r.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(timeout):
	}
}

// RunOnce executes a job with its own timeout, recovering panics.
func (r *Runner) RunOnce(parent context.Context, j Job) Result {
	timeout := j.Timeout
	if timeout <= 0 {
		timeout = 50 * time.Second
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	started := time.Now()
	var n int
	var err error
	func() {
		defer func() {
			if p := recover(); p != nil {
				err = fmt.Errorf("panic: %v", p)
				r.log.Error("worker panic", "job", j.Name, "panic", fmt.Sprint(p), "stack", string(debug.Stack()))
			}
		}()
		n, err = j.Run(ctx)
	}()
	res := Result{RanAt: started.UTC(), DurationMs: time.Since(started).Milliseconds(), Processed: n}
	if err != nil {
		res.Error = err.Error()
		r.log.Warn("worker failed", "job", j.Name, "err", res.Error, "processed", n)
	} else if n > 0 {
		r.log.Info("worker ran", "job", j.Name, "processed", n, "ms", res.DurationMs)
	}
	r.mu.Lock()
	res.Runs = r.results[j.Name].Runs + 1
	r.results[j.Name] = res
	r.mu.Unlock()
	return res
}

// Results returns the last result per job (jobs that never ran are present with zero values).
func (r *Runner) Results() map[string]*Result {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := map[string]*Result{}
	for _, j := range r.jobs {
		if res, ok := r.results[j.Name]; ok {
			c := res
			out[j.Name] = &c
		} else {
			out[j.Name] = nil
		}
	}
	return out
}
