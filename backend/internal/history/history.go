// Package history stores the calculations the service has performed.
package history

import (
	"context"
	"sync"
	"time"
)

// Calculation is one completed calculation.
type Calculation struct {
	ID        int64     `json:"id"`
	Operation string    `json:"operation"`
	A         float64   `json:"a"`
	B         *float64  `json:"b,omitempty"`
	Result    float64   `json:"result"`
	CreatedAt time.Time `json:"createdAt"`
}

// Store persists calculations. The API depends on this interface, not on a
// database, so handlers can be tested with the in-memory implementation.
type Store interface {
	Save(ctx context.Context, c Calculation) (Calculation, error)
	Recent(ctx context.Context, limit int) ([]Calculation, error)
}

// MemoryStore is a thread-safe in-memory Store. It is used in tests and as a
// fallback when no DATABASE_URL is configured.
type MemoryStore struct {
	mu     sync.Mutex
	items  []Calculation
	nextID int64
	now    func() time.Time
}

// NewMemoryStore returns an empty MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{nextID: 1, now: time.Now}
}

// Save stores c and returns it with its ID and timestamp set.
func (s *MemoryStore) Save(_ context.Context, c Calculation) (Calculation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	c.ID = s.nextID
	c.CreatedAt = s.now().UTC()
	s.nextID++
	s.items = append(s.items, c)
	return c, nil
}

// Recent returns up to limit calculations, newest first.
func (s *MemoryStore) Recent(_ context.Context, limit int) ([]Calculation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Calculation, 0, limit)
	for i := len(s.items) - 1; i >= 0 && len(out) < limit; i-- {
		out = append(out, s.items[i])
	}
	return out, nil
}
