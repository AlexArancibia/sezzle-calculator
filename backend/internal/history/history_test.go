package history

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestMemoryStoreReturnsNewestFirst(t *testing.T) {
	store := NewMemoryStore()
	ctx := context.Background()

	for _, op := range []string{"add", "subtract", "multiply"} {
		if _, err := store.Save(ctx, Calculation{Operation: op}); err != nil {
			t.Fatalf("save: %v", err)
		}
	}

	got, err := store.Recent(ctx, 2)
	if err != nil {
		t.Fatalf("recent: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d items, want 2", len(got))
	}
	if got[0].Operation != "multiply" || got[1].Operation != "subtract" {
		t.Errorf("unexpected order: %q, %q", got[0].Operation, got[1].Operation)
	}
	if got[0].ID != 3 {
		t.Errorf("got id %d, want 3", got[0].ID)
	}
}

func TestMemoryStoreSetsTimestamp(t *testing.T) {
	store := NewMemoryStore()
	fixed := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	store.now = func() time.Time { return fixed }

	saved, _ := store.Save(context.Background(), Calculation{Operation: "add"})
	if !saved.CreatedAt.Equal(fixed) {
		t.Errorf("got %v, want %v", saved.CreatedAt, fixed)
	}
}

// TestPostgresStore runs against a real database. It is skipped unless
// TEST_DATABASE_URL is set (see `make test-integration`).
func TestPostgresStore(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping Postgres integration test")
	}

	ctx := context.Background()
	store, err := NewPostgresStore(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer store.Close()

	if _, err := store.pool.Exec(ctx, "TRUNCATE calculations"); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	b := 4.0
	first, err := store.Save(ctx, Calculation{Operation: "divide", A: 10, B: &b, Result: 2.5})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if first.ID == 0 || first.CreatedAt.IsZero() {
		t.Errorf("expected id and timestamp to be set, got %+v", first)
	}
	if _, err := store.Save(ctx, Calculation{Operation: "sqrt", A: 9, Result: 3}); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := store.Recent(ctx, 10)
	if err != nil {
		t.Fatalf("recent: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d rows, want 2", len(got))
	}
	if got[0].Operation != "sqrt" || got[0].B != nil {
		t.Errorf("newest row: got %+v", got[0])
	}
	if got[1].B == nil || *got[1].B != 4 {
		t.Errorf("oldest row should keep operand b: got %+v", got[1])
	}
}
