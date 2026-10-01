package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"calculator/internal/history"
)

const testKey = "test-key"

func newTestHandler(store history.Store) http.Handler {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return NewHandler(store, logger, Options{
		APIKeys:        []string{"other-key", testKey},
		AllowedOrigins: []string{"http://localhost:5173"},
	})
}

// do sends an authenticated request.
func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	return doWithKey(t, h, method, path, body, testKey)
}

func doWithKey(t *testing.T, h http.Handler, method, path, body, key string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set(apiKeyHeader, key)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(rec.Body).Decode(&v); err != nil {
		t.Fatalf("decode response %q: %v", rec.Body.String(), err)
	}
	return v
}

func TestCalculateSuccess(t *testing.T) {
	tests := []struct {
		name string
		path string
		body string
		want float64
	}{
		{"add", "/api/v1/calculate/add", `{"a": 2, "b": 3}`, 5},
		{"subtract", "/api/v1/calculate/subtract", `{"a": 2, "b": 3}`, -1},
		{"multiply", "/api/v1/calculate/multiply", `{"a": 2.5, "b": 4}`, 10},
		{"divide", "/api/v1/calculate/divide", `{"a": 10, "b": 4}`, 2.5},
		{"power", "/api/v1/calculate/power", `{"a": 2, "b": 8}`, 256},
		{"sqrt", "/api/v1/calculate/sqrt", `{"a": 16}`, 4},
		{"percentage", "/api/v1/calculate/percentage", `{"a": 20, "b": 50}`, 10},
		{"zero is a valid operand", "/api/v1/calculate/add", `{"a": 0, "b": 0}`, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, newTestHandler(history.NewMemoryStore()), http.MethodPost, tt.path, tt.body)
			if rec.Code != http.StatusOK {
				t.Fatalf("status %d, body %s", rec.Code, rec.Body)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("content type %q", ct)
			}
			got := decode[calculateResponse](t, rec)
			if got.Result != tt.want {
				t.Errorf("result %v, want %v", got.Result, tt.want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{"division by zero", "/api/v1/calculate/divide", `{"a": 1, "b": 0}`, 422, "division_by_zero"},
		{"negative square root", "/api/v1/calculate/sqrt", `{"a": -9}`, 422, "negative_square_root"},
		{"undefined power", "/api/v1/calculate/power", `{"a": -8, "b": 0.5}`, 422, "undefined_result"},
		{"overflow", "/api/v1/calculate/power", `{"a": 10, "b": 400}`, 422, "out_of_range"},
		{"unknown operation", "/api/v1/calculate/modulo", `{"a": 1, "b": 2}`, 404, "unknown_operation"},
		{"missing a", "/api/v1/calculate/add", `{"b": 2}`, 400, "missing_operand"},
		{"missing b", "/api/v1/calculate/add", `{"a": 2}`, 400, "missing_operand"},
		{"b on unary operation", "/api/v1/calculate/sqrt", `{"a": 4, "b": 2}`, 400, "unexpected_operand"},
		{"empty body", "/api/v1/calculate/add", ``, 400, "invalid_json"},
		{"malformed json", "/api/v1/calculate/add", `{"a": 1,`, 400, "invalid_json"},
		{"string operand", "/api/v1/calculate/add", `{"a": "1", "b": 2}`, 400, "invalid_json"},
		{"number too large", "/api/v1/calculate/add", `{"a": 1e400, "b": 2}`, 400, "invalid_json"},
		{"unknown field", "/api/v1/calculate/add", `{"a": 1, "b": 2, "c": 3}`, 400, "invalid_json"},
		{"two objects", "/api/v1/calculate/add", `{"a": 1, "b": 2}{"a": 3}`, 400, "invalid_json"},
		{"body too large", "/api/v1/calculate/add", `{"a": 1, "b": 2` + strings.Repeat(" ", 2048) + `}`, 400, "invalid_json"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, newTestHandler(history.NewMemoryStore()), http.MethodPost, tt.path, tt.body)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status %d, want %d, body %s", rec.Code, tt.wantStatus, rec.Body)
			}
			got := decode[errorBody](t, rec)
			if got.Error.Code != tt.wantCode {
				t.Errorf("code %q, want %q (message %q)", got.Error.Code, tt.wantCode, got.Error.Message)
			}
			if got.Error.Message == "" {
				t.Error("error message must not be empty")
			}
		})
	}
}

func TestRouterErrorsAreJSON(t *testing.T) {
	h := newTestHandler(history.NewMemoryStore())

	rec := do(t, h, http.MethodGet, "/api/v1/calculate/add", "")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status %d, want 405", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content type %q", ct)
	}
	if got := decode[errorBody](t, rec); got.Error.Code != "method_not_allowed" || !strings.Contains(got.Error.Message, "Use POST") {
		t.Errorf("unexpected body: %+v", got)
	}

	rec = do(t, h, http.MethodGet, "/api/v1/does-not-exist", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d, want 404", rec.Code)
	}
	if got := decode[errorBody](t, rec); got.Error.Code != "not_found" {
		t.Errorf("unexpected body: %+v", got)
	}
}

func TestErrorMessagesAreClearSentences(t *testing.T) {
	h := newTestHandler(history.NewMemoryStore())
	tests := map[string]string{
		`{"a": 1, "b": 0}`:     "Division by zero is not allowed.",
		`{"a": 1}`:             `Operand "b" is required for divide.`,
		`{"a": 1, "b": 2, "c"`: `The request body is not valid JSON. Send an object such as {"a": 1, "b": 2}.`,
	}
	for body, want := range tests {
		rec := do(t, h, http.MethodPost, "/api/v1/calculate/divide", body)
		if got := decode[errorBody](t, rec).Error.Message; got != want {
			t.Errorf("body %s: message %q, want %q", body, got, want)
		}
	}
}

func TestClassifyUnknownError(t *testing.T) {
	status, code, message := classify(errors.New("something new"))
	if status != http.StatusBadRequest || code != "invalid_request" || message == "" {
		t.Errorf("got %d %q %q", status, code, message)
	}
}

func TestCalculationIsSavedToHistory(t *testing.T) {
	store := history.NewMemoryStore()
	h := newTestHandler(store)

	do(t, h, http.MethodPost, "/api/v1/calculate/divide", `{"a": 9, "b": 3}`)
	do(t, h, http.MethodPost, "/api/v1/calculate/divide", `{"a": 1, "b": 0}`) // failed: not saved
	do(t, h, http.MethodPost, "/api/v1/calculate/sqrt", `{"a": 25}`)

	rec := do(t, h, http.MethodGet, "/api/v1/history", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	got := decode[struct {
		Calculations []history.Calculation `json:"calculations"`
	}](t, rec)
	if len(got.Calculations) != 2 {
		t.Fatalf("got %d calculations, want 2", len(got.Calculations))
	}
	if got.Calculations[0].Operation != "sqrt" || got.Calculations[0].Result != 5 {
		t.Errorf("newest entry: %+v", got.Calculations[0])
	}
	if got.Calculations[1].B == nil || *got.Calculations[1].B != 3 {
		t.Errorf("binary entry should keep b: %+v", got.Calculations[1])
	}
}

func TestHistoryLimit(t *testing.T) {
	h := newTestHandler(history.NewMemoryStore())
	for i := 0; i < 5; i++ {
		do(t, h, http.MethodPost, "/api/v1/calculate/add", `{"a": 1, "b": 1}`)
	}

	rec := do(t, h, http.MethodGet, "/api/v1/history?limit=3", "")
	got := decode[struct {
		Calculations []history.Calculation `json:"calculations"`
	}](t, rec)
	if len(got.Calculations) != 3 {
		t.Errorf("got %d calculations, want 3", len(got.Calculations))
	}

	for _, bad := range []string{"0", "101", "abc", "-1"} {
		rec := do(t, h, http.MethodGet, "/api/v1/history?limit="+bad, "")
		if rec.Code != http.StatusBadRequest {
			t.Errorf("limit=%s: status %d, want 400", bad, rec.Code)
		}
	}
}

type failingStore struct{}

func (failingStore) Save(context.Context, history.Calculation) (history.Calculation, error) {
	return history.Calculation{}, errors.New("database is down")
}

func (failingStore) Recent(context.Context, int) ([]history.Calculation, error) {
	return nil, errors.New("database is down")
}

func TestStorageFailureDoesNotFailCalculation(t *testing.T) {
	h := newTestHandler(failingStore{})

	rec := do(t, h, http.MethodPost, "/api/v1/calculate/add", `{"a": 1, "b": 2}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("calculate status %d, want 200", rec.Code)
	}

	rec = do(t, h, http.MethodGet, "/api/v1/history", "")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("history status %d, want 503", rec.Code)
	}
	if got := decode[errorBody](t, rec); got.Error.Code != "history_unavailable" {
		t.Errorf("code %q", got.Error.Code)
	}
}

func TestListOperations(t *testing.T) {
	rec := do(t, newTestHandler(history.NewMemoryStore()), http.MethodGet, "/api/v1/operations", "")
	got := decode[struct {
		Operations []struct {
			Name  string `json:"name"`
			Arity int    `json:"arity"`
		} `json:"operations"`
	}](t, rec)
	if len(got.Operations) != 7 {
		t.Fatalf("got %d operations, want 7", len(got.Operations))
	}
	if got.Operations[5].Name != "sqrt" || got.Operations[5].Arity != 1 {
		t.Errorf("unexpected operation: %+v", got.Operations[5])
	}
}

func TestHealth(t *testing.T) {
	rec := do(t, newTestHandler(history.NewMemoryStore()), http.MethodGet, "/health", "")
	if rec.Code != http.StatusOK {
		t.Errorf("status %d", rec.Code)
	}
}

func TestCORSPreflight(t *testing.T) {
	h := newTestHandler(history.NewMemoryStore())

	// Browsers send preflights without the API key, so they must pass.
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/calculate/add", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("status %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("allow origin %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, apiKeyHeader) {
		t.Errorf("allow headers %q must include %s", got, apiKeyHeader)
	}

	// Unknown origins get no CORS headers.
	req = httptest.NewRequest(http.MethodOptions, "/api/v1/calculate/add", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("unknown origin got allow origin %q", got)
	}
}

func TestCORSWildcard(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := NewHandler(history.NewMemoryStore(), logger, Options{APIKeys: []string{testKey}, AllowedOrigins: []string{"*"}})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://any.example")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://any.example" {
		t.Errorf("allow origin %q", got)
	}
}

func TestAPIKey(t *testing.T) {
	h := newTestHandler(history.NewMemoryStore())
	tests := []struct {
		name       string
		method     string
		path       string
		key        string
		wantStatus int
	}{
		{"missing key", http.MethodPost, "/api/v1/calculate/add", "", http.StatusUnauthorized},
		{"wrong key", http.MethodPost, "/api/v1/calculate/add", "nope", http.StatusUnauthorized},
		{"key with different case", http.MethodPost, "/api/v1/calculate/add", "TEST-KEY", http.StatusUnauthorized},
		{"valid key", http.MethodPost, "/api/v1/calculate/add", testKey, http.StatusOK},
		{"second configured key", http.MethodPost, "/api/v1/calculate/add", "other-key", http.StatusOK},
		{"history needs a key", http.MethodGet, "/api/v1/history", "", http.StatusUnauthorized},
		{"operations need a key", http.MethodGet, "/api/v1/operations", "", http.StatusUnauthorized},
		{"health is public", http.MethodGet, "/health", "", http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := doWithKey(t, h, tt.method, tt.path, `{"a": 1, "b": 2}`, tt.key)
			if rec.Code != tt.wantStatus {
				t.Fatalf("status %d, want %d (body %s)", rec.Code, tt.wantStatus, rec.Body)
			}
			if tt.wantStatus == http.StatusUnauthorized {
				if got := decode[errorBody](t, rec); got.Error.Code != "unauthorized" {
					t.Errorf("code %q", got.Error.Code)
				}
				if rec.Header().Get("WWW-Authenticate") == "" {
					t.Error("missing WWW-Authenticate header")
				}
			}
		})
	}
}

func TestNoConfiguredKeysRejectsEverything(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := NewHandler(history.NewMemoryStore(), logger, Options{})
	if rec := doWithKey(t, h, http.MethodGet, "/api/v1/operations", "", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("status %d, want 401", rec.Code)
	}
}

func TestPanicIsRecovered(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	h := withRecover(logger, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status %d, want 500", rec.Code)
	}
}
