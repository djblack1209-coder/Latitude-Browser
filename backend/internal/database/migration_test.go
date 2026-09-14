package database

import (
	"path/filepath"
	"testing"
)

func TestMigrationRollsBackDDLDataAndVersion(t *testing.T) {
	for _, failure := range []string{"statement", "version"} {
		t.Run(failure, func(t *testing.T) {
			db, err := NewDB(filepath.Join(t.TempDir(), "migration.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if err := db.Migrate(); err != nil {
				t.Fatal(err)
			}
			if _, err := db.conn.Exec(`CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('old')`); err != nil {
				t.Fatal(err)
			}
			m := migration{version: 999, desc: "fixture", stmts: []string{`CREATE TABLE new_schema (value TEXT)`, `INSERT INTO preserved VALUES ('new')`}}
			if failure == "statement" {
				m.stmts = append(m.stmts, `INSERT INTO nonexistent VALUES (1)`)
			} else {
				if _, err := db.conn.Exec(`CREATE TRIGGER fail_version BEFORE INSERT ON schema_migrations WHEN NEW.version = 999 BEGIN SELECT RAISE(FAIL, 'injected version failure'); END`); err != nil {
					t.Fatal(err)
				}
			}
			if err := db.applyMigration(m); err == nil {
				t.Fatal("migration succeeded despite failure")
			}
			var count int
			if err := db.conn.QueryRow(`SELECT COUNT(*) FROM preserved`).Scan(&count); err != nil || count != 1 {
				t.Fatalf("business records changed: %d %v", count, err)
			}
			if err := db.conn.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name='new_schema'`).Scan(&count); err != nil || count != 0 {
				t.Fatalf("failed DDL remains: %d %v", count, err)
			}
			if err := db.conn.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version=999`).Scan(&count); err != nil || count != 0 {
				t.Fatalf("failed version marked complete: %d %v", count, err)
			}
			if failure == "statement" {
				m.stmts = m.stmts[:2]
			} else {
				if _, err := db.conn.Exec(`DROP TRIGGER fail_version`); err != nil {
					t.Fatal(err)
				}
			}
			if err := db.applyMigration(m); err != nil {
				t.Fatal(err)
			}
			if err := db.Migrate(); err != nil {
				t.Fatalf("restart is not idempotent: %v", err)
			}
			if err := db.conn.QueryRow(`SELECT COUNT(*) FROM preserved`).Scan(&count); err != nil || count != 2 {
				t.Fatalf("successful migration records: %d %v", count, err)
			}
		})
	}
}
