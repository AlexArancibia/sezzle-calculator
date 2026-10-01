package main

import (
	"slices"
	"testing"
)

func TestSplitList(t *testing.T) {
	if got, want := splitList(" a, b ,,c "), []string{"a", "b", "c"}; !slices.Equal(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if splitList("") != nil {
		t.Error("empty input should give nil")
	}
}

func TestEnvFallsBackWhenUnset(t *testing.T) {
	t.Setenv("CALCULATOR_TEST_VALUE", "")
	if got := env("CALCULATOR_TEST_VALUE", "fallback"); got != "fallback" {
		t.Errorf("env = %q, want the fallback", got)
	}
	t.Setenv("CALCULATOR_TEST_VALUE", "set")
	if got := env("CALCULATOR_TEST_VALUE", "fallback"); got != "set" {
		t.Errorf("env = %q, want the value", got)
	}
}
