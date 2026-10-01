// Command server runs the calculator REST API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"calculator/internal/api"
	"calculator/internal/history"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(logger); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	port := env("PORT", "8080")
	opts := api.Options{
		APIKeys:        splitList(os.Getenv("API_KEYS")),
		AllowedOrigins: splitList(env("CORS_ORIGINS", "http://localhost:5173")),
	}
	if len(opts.APIKeys) == 0 {
		// Fail closed: refuse to start an API that nobody could call, or that
		// someone might expect to be protected when it is not.
		return errors.New("API_KEYS must contain at least one key (comma-separated)")
	}

	store, closeStore, err := openStore(ctx, logger, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer closeStore()

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           api.NewHandler(store, logger, opts),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "port", port)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}

// openStore connects to Postgres when DATABASE_URL is set and otherwise falls
// back to memory, so the API can run with zero setup.
func openStore(ctx context.Context, logger *slog.Logger, databaseURL string) (history.Store, func(), error) {
	if databaseURL == "" {
		logger.Warn("DATABASE_URL not set; history is kept in memory and lost on restart")
		return history.NewMemoryStore(), func() {}, nil
	}

	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	store, err := history.NewPostgresStore(connectCtx, databaseURL)
	if err != nil {
		return nil, nil, err
	}
	logger.Info("connected to postgres")
	return store, store.Close, nil
}

// splitList parses a comma-separated setting such as "key1, key2" into its
// non-empty, trimmed parts.
func splitList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
