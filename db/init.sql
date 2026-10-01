-- Runs once, when the Postgres volume is first created.
-- A separate database keeps integration tests from wiping local history.
CREATE DATABASE calculator_test;
