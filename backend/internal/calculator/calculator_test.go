package calculator

import (
	"errors"
	"math"
	"testing"
)

func TestOperations(t *testing.T) {
	tests := []struct {
		name     string
		op       string
		operands []float64
		want     float64
		wantErr  error
	}{
		{"add integers", "add", []float64{2, 3}, 5, nil},
		{"add decimals", "add", []float64{0.5, 0.25}, 0.75, nil},
		{"add negatives", "add", []float64{-4, -6}, -10, nil},
		{"subtract", "subtract", []float64{10, 4}, 6, nil},
		{"subtract to negative", "subtract", []float64{4, 10}, -6, nil},
		{"multiply", "multiply", []float64{6, 7}, 42, nil},
		{"multiply by zero keeps positive zero", "multiply", []float64{0, -5}, 0, nil},
		{"divide", "divide", []float64{10, 4}, 2.5, nil},
		{"divide negative", "divide", []float64{-9, 3}, -3, nil},
		{"divide by zero", "divide", []float64{1, 0}, 0, ErrDivisionByZero},
		{"zero divided by zero", "divide", []float64{0, 0}, 0, ErrDivisionByZero},
		{"power", "power", []float64{2, 10}, 1024, nil},
		{"power with negative exponent", "power", []float64{2, -2}, 0.25, nil},
		{"power of zero to zero", "power", []float64{0, 0}, 1, nil},
		{"zero to a negative power", "power", []float64{0, -1}, 0, ErrDivisionByZero},
		{"negative base with fractional exponent", "power", []float64{-8, 0.5}, 0, ErrUndefinedResult},
		{"power overflow", "power", []float64{10, 400}, 0, ErrOutOfRange},
		{"square root", "sqrt", []float64{81}, 9, nil},
		{"square root of zero", "sqrt", []float64{0}, 0, nil},
		{"square root of negative", "sqrt", []float64{-1}, 0, ErrNegativeSquareRoot},
		{"percentage", "percentage", []float64{15, 200}, 30, nil},
		{"percentage of negative", "percentage", []float64{50, -80}, -40, nil},
		{"multiplication overflow", "multiply", []float64{math.MaxFloat64, 2}, 0, ErrOutOfRange},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			op, ok := Lookup(tt.op)
			if !ok {
				t.Fatalf("operation %q not registered", tt.op)
			}

			got, err := op.Apply(tt.operands...)

			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("expected error %v, got %v (result %v)", tt.wantErr, err, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("got %v, want %v", got, tt.want)
			}
			if math.Signbit(got) && got == 0 {
				t.Errorf("got negative zero, want positive zero")
			}
		})
	}
}

func TestApplyRejectsWrongOperandCount(t *testing.T) {
	add, _ := Lookup("add")
	if _, err := add.Apply(1); !errors.Is(err, ErrOperandCount) {
		t.Errorf("add with one operand: expected ErrOperandCount, got %v", err)
	}

	sqrt, _ := Lookup("sqrt")
	if _, err := sqrt.Apply(4, 2); !errors.Is(err, ErrOperandCount) {
		t.Errorf("sqrt with two operands: expected ErrOperandCount, got %v", err)
	}
}

func TestLookupUnknown(t *testing.T) {
	if _, ok := Lookup("modulo"); ok {
		t.Error("expected unknown operation to be missing")
	}
}

func TestListIsOrderedAndIsACopy(t *testing.T) {
	ops := List()
	want := []string{"add", "subtract", "multiply", "divide", "power", "sqrt", "percentage"}
	if len(ops) != len(want) {
		t.Fatalf("got %d operations, want %d", len(ops), len(want))
	}
	for i, name := range want {
		if ops[i].Name != name {
			t.Errorf("position %d: got %q, want %q", i, ops[i].Name, name)
		}
	}

	ops[0].Name = "changed"
	if List()[0].Name != "add" {
		t.Error("List must return a copy that callers cannot mutate")
	}
}

func TestNames(t *testing.T) {
	want := "add, subtract, multiply, divide, power, sqrt, percentage"
	if got := Names(); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}
