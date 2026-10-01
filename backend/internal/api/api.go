// Package api exposes the calculator over a JSON REST API.
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"calculator/internal/calculator"
	"calculator/internal/history"
)

const (
	maxBodyBytes        = 1 << 10 // a calculation request is a few bytes
	defaultHistoryLimit = 10
	maxHistoryLimit     = 100
)

// server holds the dependencies of the HTTP handlers.
type server struct {
	store  history.Store
	logger *slog.Logger
}

// Options configures the security of the handler.
type Options struct {
	// APIKeys are the keys accepted in the X-API-Key header. Empty means every
	// /api/ request is rejected.
	APIKeys []string
	// AllowedOrigins are the browser origins allowed by CORS; "*" allows any.
	AllowedOrigins []string
}

// NewHandler builds the HTTP handler with all routes and middleware.
//
// Middleware order, outermost first: recover from panics, answer CORS
// preflights, check the API key, turn router errors into JSON, then route.
func NewHandler(store history.Store, logger *slog.Logger, opts Options) http.Handler {
	s := &server{store: store, logger: logger}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /api/v1/operations", s.listOperations)
	mux.HandleFunc("POST /api/v1/calculate/{operation}", s.calculate)
	mux.HandleFunc("GET /api/v1/history", s.history)

	return withRecover(logger, withCORS(opts.AllowedOrigins, withAPIKey(opts.APIKeys, withJSONErrors(mux))))
}

// calculateRequest uses pointers so a missing operand can be told apart from
// an explicit 0.
type calculateRequest struct {
	A *float64 `json:"a"`
	B *float64 `json:"b"`
}

type calculateResponse struct {
	Operation string   `json:"operation"`
	A         float64  `json:"a"`
	B         *float64 `json:"b,omitempty"`
	Result    float64  `json:"result"`
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) listOperations(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"operations": calculator.List()})
}

func (s *server) calculate(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("operation")
	op, ok := calculator.Lookup(name)
	if !ok {
		writeError(w, http.StatusNotFound, "unknown_operation", fmt.Sprintf("Operation %q is not supported. Use one of: %s.", name, calculator.Names()))
		return
	}

	var req calculateRequest
	if apiErr := decodeJSON(w, r, &req); apiErr != nil {
		writeError(w, http.StatusBadRequest, apiErr.code, apiErr.message)
		return
	}

	operands, apiErr := validateOperands(op, req)
	if apiErr != nil {
		writeError(w, http.StatusBadRequest, apiErr.code, apiErr.message)
		return
	}

	result, err := op.Apply(operands...)
	if err != nil {
		status, code, message := classify(err)
		writeError(w, status, code, message)
		return
	}

	// History is best effort: a database problem must not fail a calculation
	// the user already got right, so it is logged instead of returned.
	if _, err := s.store.Save(r.Context(), history.Calculation{
		Operation: op.Name, A: *req.A, B: req.B, Result: result,
	}); err != nil {
		s.logger.Error("save calculation", "operation", op.Name, "error", err)
	}

	writeJSON(w, http.StatusOK, calculateResponse{Operation: op.Name, A: *req.A, B: req.B, Result: result})
}

func (s *server) history(w http.ResponseWriter, r *http.Request) {
	limit := defaultHistoryLimit
	if raw := r.URL.Query().Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > maxHistoryLimit {
			writeError(w, http.StatusBadRequest, "invalid_limit", fmt.Sprintf("The limit must be a whole number from 1 to %d.", maxHistoryLimit))
			return
		}
		limit = n
	}

	items, err := s.store.Recent(r.Context(), limit)
	if err != nil {
		s.logger.Error("load history", "error", err)
		writeError(w, http.StatusServiceUnavailable, "history_unavailable", "Calculation history is temporarily unavailable. Please try again shortly.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"calculations": items})
}

type apiError struct {
	code    string
	message string
}

func validateOperands(op calculator.Operation, req calculateRequest) ([]float64, *apiError) {
	if req.A == nil {
		return nil, &apiError{"missing_operand", `Operand "a" is required.`}
	}
	if op.Arity == 1 {
		if req.B != nil {
			return nil, &apiError{"unexpected_operand", fmt.Sprintf(`%s takes a single operand "a". Remove "b".`, op.Name)}
		}
		return []float64{*req.A}, nil
	}
	if req.B == nil {
		return nil, &apiError{"missing_operand", fmt.Sprintf(`Operand "b" is required for %s.`, op.Name)}
	}
	return []float64{*req.A, *req.B}, nil
}

// classify maps calculator errors to an HTTP status, a stable error code and
// a message written for the person using the API. The request itself was well
// formed, so math errors are 422 rather than 400.
func classify(err error) (status int, code, message string) {
	switch {
	case errors.Is(err, calculator.ErrDivisionByZero):
		return http.StatusUnprocessableEntity, "division_by_zero", "Division by zero is not allowed."
	case errors.Is(err, calculator.ErrNegativeSquareRoot):
		return http.StatusUnprocessableEntity, "negative_square_root", "The square root of a negative number is not a real number."
	case errors.Is(err, calculator.ErrUndefinedResult):
		return http.StatusUnprocessableEntity, "undefined_result", "This calculation has no real-number result."
	case errors.Is(err, calculator.ErrOutOfRange):
		return http.StatusUnprocessableEntity, "out_of_range", "The result is too large to represent."
	default:
		return http.StatusBadRequest, "invalid_request", "The request could not be processed."
	}
}

// decodeJSON reads a single JSON object into dst. Its failures are returned
// as user-facing messages, never as the decoder's internal wording.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) *apiError {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	invalid := func(message string) *apiError { return &apiError{"invalid_json", message} }

	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		var typeErr *json.UnmarshalTypeError
		switch {
		case errors.Is(err, io.EOF):
			return invalid(`The request body is empty. Send a JSON object such as {"a": 1, "b": 2}.`)
		case errors.As(err, &maxErr):
			return invalid(fmt.Sprintf("The request body must not be larger than %d bytes.", maxBodyBytes))
		case errors.As(err, &typeErr):
			// Also covers numbers too large for a float64, such as 1e400.
			return invalid(fmt.Sprintf("%q must be a number within the range of a double (about ±1.8e308).", typeErr.Field))
		case strings.HasPrefix(err.Error(), "json: unknown field "):
			return invalid(fmt.Sprintf(`Unknown field %s. Only "a" and "b" are allowed.`, strings.TrimPrefix(err.Error(), "json: unknown field ")))
		default:
			return invalid(`The request body is not valid JSON. Send an object such as {"a": 1, "b": 2}.`)
		}
	}
	if dec.More() {
		return invalid("The request body must contain a single JSON object.")
	}
	return nil
}

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, errorBody{Error: errorDetail{Code: code, Message: message}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
