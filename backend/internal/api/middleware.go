package api

import (
	"crypto/subtle"
	"log/slog"
	"net/http"
	"slices"
	"strings"
)

// apiKeyHeader is the request header that carries the API key.
const apiKeyHeader = "X-API-Key"

// The middleware below is listed in the order requests go through it.

// withRecover turns a panic into a 500 response instead of dropping the
// connection, and logs it.
func withRecover(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				logger.Error("panic while handling request", "path", r.URL.Path, "panic", rec)
				writeError(w, http.StatusInternalServerError, "internal_error", "Something went wrong on our side. Please try again.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// withCORS lets browser clients on the allowed origins call the API.
// Preflight requests are answered here, before authentication, because
// browsers never send custom headers such as X-API-Key on a preflight.
func withCORS(allowedOrigins []string, next http.Handler) http.Handler {
	allowAny := slices.Contains(allowedOrigins, "*")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && (allowAny || slices.Contains(allowedOrigins, origin)) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, "+apiKeyHeader)
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		w.Header().Add("Vary", "Origin")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// withAPIKey requires a valid API key on every /api/ route. /health stays open
// so load balancers and Docker can probe the service without credentials.
//
// Keys are compared in constant time so response timing does not reveal how
// much of a guessed key was correct. With no keys configured every request is
// rejected (fail closed) rather than silently allowed.
func withAPIKey(keys []string, next http.Handler) http.Handler {
	valid := make([][]byte, 0, len(keys))
	for _, k := range keys {
		valid = append(valid, []byte(k))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		provided := []byte(r.Header.Get(apiKeyHeader))
		authorized := false
		for _, k := range valid {
			// Check every key, even after a match, so the loop always takes the same time.
			if subtle.ConstantTimeCompare(provided, k) == 1 {
				authorized = true
			}
		}
		if len(provided) == 0 || !authorized {
			w.Header().Set("WWW-Authenticate", `ApiKey header="`+apiKeyHeader+`"`)
			writeError(w, http.StatusUnauthorized, "unauthorized", "A valid API key is required in the "+apiKeyHeader+" header.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// withJSONErrors makes the router's own 404 and 405 responses, which Go writes
// as plain text, use the same JSON error shape as every other error.
func withJSONErrors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(&jsonErrorWriter{ResponseWriter: w, r: r}, r)
	})
}

type jsonErrorWriter struct {
	http.ResponseWriter
	r         *http.Request
	swallowed bool
}

func (w *jsonErrorWriter) WriteHeader(status int) {
	isPlain := strings.HasPrefix(w.Header().Get("Content-Type"), "text/plain")
	if !isPlain || (status != http.StatusNotFound && status != http.StatusMethodNotAllowed) {
		w.ResponseWriter.WriteHeader(status)
		return
	}
	w.swallowed = true
	if status == http.StatusNotFound {
		writeError(w.ResponseWriter, status, "not_found",
			"No endpoint matches "+w.r.Method+" "+w.r.URL.Path+". See /docs for the available endpoints.")
		return
	}
	writeError(w.ResponseWriter, status, "method_not_allowed",
		w.r.Method+" is not allowed on "+w.r.URL.Path+". Use "+w.Header().Get("Allow")+".")
}

func (w *jsonErrorWriter) Write(p []byte) (int, error) {
	if w.swallowed {
		// Drop the router's plain-text body; the JSON body was already written.
		return len(p), nil
	}
	return w.ResponseWriter.Write(p)
}
