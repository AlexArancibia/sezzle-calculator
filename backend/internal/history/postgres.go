package history

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schema string

// PostgresStore is a Store backed by PostgreSQL.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore connects to the database and applies the schema. The
// schema is idempotent (CREATE ... IF NOT EXISTS), so running it on every
// start is safe and keeps setup to a single command.
func NewPostgresStore(ctx context.Context, databaseURL string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	if _, err := pool.Exec(ctx, schema); err != nil {
		pool.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &PostgresStore{pool: pool}, nil
}

// Close releases the connection pool.
func (s *PostgresStore) Close() {
	s.pool.Close()
}

// Save inserts c and returns it with the ID and timestamp set by the database.
func (s *PostgresStore) Save(ctx context.Context, c Calculation) (Calculation, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO calculations (operation, operand_a, operand_b, result)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_at`,
		c.Operation, c.A, c.B, c.Result,
	).Scan(&c.ID, &c.CreatedAt)
	if err != nil {
		return Calculation{}, fmt.Errorf("insert calculation: %w", err)
	}
	return c, nil
}

// Recent returns up to limit calculations, newest first.
func (s *PostgresStore) Recent(ctx context.Context, limit int) ([]Calculation, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, operation, operand_a, operand_b, result, created_at
		 FROM calculations
		 ORDER BY created_at DESC, id DESC
		 LIMIT $1`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("query calculations: %w", err)
	}
	defer rows.Close()

	out := make([]Calculation, 0, limit)
	for rows.Next() {
		var c Calculation
		if err := rows.Scan(&c.ID, &c.Operation, &c.A, &c.B, &c.Result, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan calculation: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
