CREATE TABLE IF NOT EXISTS calculations (
    id          BIGSERIAL PRIMARY KEY,
    operation   TEXT             NOT NULL,
    operand_a   DOUBLE PRECISION NOT NULL,
    operand_b   DOUBLE PRECISION,
    result      DOUBLE PRECISION NOT NULL,
    created_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calculations_created_at_idx ON calculations (created_at DESC);
