package database

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
)

// Snapshot reserves the application's only SQLite connection. The caller must
// release it before acquiring other application locks. VACUUM INTO also gives
// a consistent view when an independent SQLite connection is writing in WAL.
func (d *DB) Snapshot(ctx context.Context, destination string) (func(), error) {
	conn, err := d.conn.Conn(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = conn.ExecContext(ctx, "VACUUM INTO ?", destination); err != nil {
		conn.Close()
		os.Remove(destination)
		return nil, fmt.Errorf("SQLite snapshot: %w", err)
	}
	if err = os.Chmod(destination, 0600); err != nil {
		conn.Close()
		os.Remove(destination)
		return nil, err
	}
	file, err := os.OpenFile(destination, os.O_RDWR, 0600)
	if err == nil {
		err = file.Sync()
		closeErr := file.Close()
		if err == nil {
			err = closeErr
		}
	}
	if err != nil {
		conn.Close()
		os.Remove(destination)
		return nil, err
	}
	if err = ValidateSnapshot(destination); err != nil {
		conn.Close()
		os.Remove(destination)
		return nil, err
	}
	return func() { conn.Close() }, nil
}

// Validation opens a private extracted copy and never changes the live DB.
func ValidateSnapshot(path string) error {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	info, err := os.Stat(absolute)
	if err != nil {
		return err
	}
	if info.Size() == 0 {
		return fmt.Errorf("empty SQLite snapshot")
	}
	conn, err := sql.Open("sqlite", absolute)
	if err != nil {
		return err
	}
	defer conn.Close()
	var integrity string
	if err = conn.QueryRow("PRAGMA integrity_check").Scan(&integrity); err != nil {
		return err
	}
	if integrity != "ok" {
		return fmt.Errorf("SQLite integrity check: %s", integrity)
	}
	rows, err := conn.Query("PRAGMA foreign_key_check")
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		return fmt.Errorf("SQLite snapshot has invalid foreign keys")
	}
	return rows.Err()
}

func (d *DB) FilePath() (string, error) {
	var path string
	err := d.conn.QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&path)
	return path, err
}
