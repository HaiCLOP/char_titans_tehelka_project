// Command engine is the CivicSense backend engine: AI router + background workers.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"civicsense/engine/internal/ai"
	"civicsense/engine/internal/config"
	"civicsense/engine/internal/httpapi"
	"civicsense/engine/internal/supa"
	"civicsense/engine/internal/workers"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "engine:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db := supa.New(cfg.SupabaseURL, cfg.ServiceRoleKey, nil)
	if !db.Configured() {
		log.Warn("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing: DB features disabled, default model chains only")
	}
	if cfg.AIKeysSecret == "" {
		log.Warn("AI_KEYS_SECRET missing: encrypted ai_keys rows will be skipped")
	}

	var store ai.Store
	var sink ai.LogSink
	if db.Configured() {
		s := ai.SupaStore{DB: db}
		store, sink = s, s.LogSink()
	}
	logs := ai.NewAsyncLogger(sink, 2048, log)
	router := ai.NewRouter(ai.Options{
		Store: store, Secret: cfg.AIKeysSecret,
		GeminiKeys: cfg.GeminiAPIKeys, OpenRouterKeys: cfg.OpenRouterAPIKeys,
		Logs: logs, Log: log,
	})
	router.Reload(ctx)
	router.Start(ctx)
	analyzer := ai.NewAnalyzer(router)

	runner := workers.NewRunner(log, 10*time.Second)
	if db.Configured() {
		runner = workers.NewRunner(log, 10*time.Second, workers.Jobs(&workers.Deps{DB: db, Analyzer: analyzer})...)
	}
	runner.Start(ctx)

	api := &httpapi.Server{
		Secret: cfg.EngineSecret, DB: db, Router: router, Analyzer: analyzer,
		Logs: logs, Workers: runner, Log: log, Started: time.Now(),
	}
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           api.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("engine listening", "addr", srv.Addr, "version", httpapi.Version,
			"env_files", cfg.EnvFiles, "gemini_env_keys", len(cfg.GeminiAPIKeys), "openrouter_env_keys", len(cfg.OpenRouterAPIKeys))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		log.Info("shutting down")
	case err := <-errCh:
		if err != nil {
			stop()
			return err
		}
	}

	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		log.Warn("http shutdown", "err", err.Error())
	}
	runner.Wait(5 * time.Second) // ctx is cancelled, workers exit after their current tick
	logs.Close(3 * time.Second)
	log.Info("stopped")
	return nil
}
