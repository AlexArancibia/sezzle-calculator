// Package calculator holds the arithmetic core of the service.
//
// It has no knowledge of HTTP or storage: every operation is a pure function
// that either returns a finite result or a typed error, which keeps it easy to
// test and to reuse from other transports.
package calculator

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

// Errors returned by operations. Callers match them with errors.Is and decide
// how to present them; the API turns them into HTTP 422 with a user-facing
// message.
var (
	ErrDivisionByZero     = errors.New("division by zero")
	ErrNegativeSquareRoot = errors.New("square root of a negative number")
	ErrUndefinedResult    = errors.New("result is not a real number")
	ErrOutOfRange         = errors.New("result is out of range")
	ErrOperandCount       = errors.New("wrong number of operands")
)

// Operation describes one calculator operation.
type Operation struct {
	Name   string `json:"name"`   // identifier used in the API path, e.g. "add"
	Label  string `json:"label"`  // human readable name, e.g. "Addition"
	Symbol string `json:"symbol"` // symbol shown in the UI, e.g. "+"
	Arity  int    `json:"arity"`  // number of operands: 1 or 2

	apply func(operands []float64) (float64, error)
}

// Apply runs the operation and guarantees the result is a finite number.
func (op Operation) Apply(operands ...float64) (float64, error) {
	if len(operands) != op.Arity {
		return 0, fmt.Errorf("%w: %s expects %d, got %d", ErrOperandCount, op.Name, op.Arity, len(operands))
	}

	result, err := op.apply(operands)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(result) {
		return 0, ErrUndefinedResult
	}
	if math.IsInf(result, 0) {
		return 0, ErrOutOfRange
	}
	if result == 0 {
		// Normalise negative zero (e.g. 0 * -1) so clients never see "-0".
		result = 0
	}
	return result, nil
}

// operations is the ordered list of supported operations. Adding a new one is
// a single entry here; the API and the UI pick it up automatically.
var operations = []Operation{
	{Name: "add", Label: "Addition", Symbol: "+", Arity: 2, apply: binary(func(a, b float64) (float64, error) {
		return a + b, nil
	})},
	{Name: "subtract", Label: "Subtraction", Symbol: "−", Arity: 2, apply: binary(func(a, b float64) (float64, error) {
		return a - b, nil
	})},
	{Name: "multiply", Label: "Multiplication", Symbol: "×", Arity: 2, apply: binary(func(a, b float64) (float64, error) {
		return a * b, nil
	})},
	{Name: "divide", Label: "Division", Symbol: "÷", Arity: 2, apply: binary(func(a, b float64) (float64, error) {
		if b == 0 {
			return 0, ErrDivisionByZero
		}
		return a / b, nil
	})},
	{Name: "power", Label: "Exponentiation", Symbol: "xʸ", Arity: 2, apply: binary(func(a, b float64) (float64, error) {
		if a == 0 && b < 0 {
			// 0 raised to a negative power is 1 / 0.
			return 0, ErrDivisionByZero
		}
		return math.Pow(a, b), nil
	})},
	{Name: "sqrt", Label: "Square root", Symbol: "√", Arity: 1, apply: func(o []float64) (float64, error) {
		if o[0] < 0 {
			return 0, ErrNegativeSquareRoot
		}
		return math.Sqrt(o[0]), nil
	}},
	{Name: "percentage", Label: "Percentage (a% of b)", Symbol: "%", Arity: 2, apply: binary(func(a, b float64) (float64, error) {
		return a * b / 100, nil
	})},
}

var byName = func() map[string]Operation {
	m := make(map[string]Operation, len(operations))
	for _, op := range operations {
		m[op.Name] = op
	}
	return m
}()

// Lookup returns the operation registered under name.
func Lookup(name string) (Operation, bool) {
	op, ok := byName[name]
	return op, ok
}

// Names returns the operation names in display order, e.g. for error messages.
func Names() string {
	names := make([]string, len(operations))
	for i, op := range operations {
		names[i] = op.Name
	}
	return strings.Join(names, ", ")
}

// List returns all supported operations in display order.
func List() []Operation {
	out := make([]Operation, len(operations))
	copy(out, operations)
	return out
}

func binary(f func(a, b float64) (float64, error)) func([]float64) (float64, error) {
	return func(o []float64) (float64, error) { return f(o[0], o[1]) }
}
