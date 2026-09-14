package database

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
)

func TestSnapshotConsistentDuringWALWrites(t *testing.T) {
	path := filepath.Join(t.TempDir(), "live.db")
	db, err := NewDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.conn.Exec("CREATE TABLE balances (id INTEGER PRIMARY KEY,value INTEGER); INSERT INTO balances VALUES (1,0),(2,0)"); err != nil {
		t.Fatal(err)
	}
	writer, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer writer.Close()
	writer.SetMaxOpenConns(1)
	var wg sync.WaitGroup
	var stop atomic.Bool
	var writes atomic.Int64
	wg.Add(1)
	go func() {
		defer wg.Done()
		for !stop.Load() {
			if _, err := writer.Exec("BEGIN; UPDATE balances SET value=value+1 WHERE id=1; UPDATE balances SET value=value-1 WHERE id=2; COMMIT"); err != nil {
				t.Error(err)
				return
			}
			writes.Add(1)
		}
	}()
	defer func() { stop.Store(true); wg.Wait() }()
	for i := 0; i < 5; i++ {
		out := filepath.Join(t.TempDir(), "snapshot.db")
		release, err := db.Snapshot(context.Background(), out)
		if err != nil {
			t.Fatal(err)
		}
		release()
		check, err := sql.Open("sqlite", out)
		if err != nil {
			t.Fatal(err)
		}
		var sum int
		err = check.QueryRow("SELECT SUM(value) FROM balances").Scan(&sum)
		check.Close()
		if err != nil || sum != 0 {
			t.Fatalf("inconsistent snapshot: %d %v", sum, err)
		}
		info, err := os.Stat(out)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0077 != 0 {
			t.Fatal("snapshot accessible by other users")
		}
	}
	if writes.Load() == 0 {
		t.Fatal("fixture did not overlap writes")
	}
}
