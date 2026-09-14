package snapshot

import (
	"archive/zip"
	"bytes"
	"testing"
)

func TestArchiveWriterAndImporterShareNamespaceRules(t *testing.T) {
	for _, names := range [][]string{{"A", "a"}, {"file/child", "file"}, {"file", "file/child"}, {"bad:name"}} {
		t.Run(names[0], func(t *testing.T) {
			var out bytes.Buffer
			w, err := NewArchiveWriter(&out, DefaultArchiveLimits())
			if err != nil {
				t.Fatal(err)
			}
			failed := false
			for _, name := range names {
				if _, err := w.CreateHeader(&zip.FileHeader{Name: name}); err != nil {
					failed = true
					break
				}
			}
			closeErr := w.Close()
			if !failed && closeErr == nil {
				t.Fatal("writer accepted nonportable namespace")
			}
		})
	}
}

func TestArchiveWriterRejectsChangedSourceLength(t *testing.T) {
	for _, content := range []string{"x", "xxx"} {
		t.Run(content, func(t *testing.T) {
			var out bytes.Buffer
			w, err := NewArchiveWriter(&out, DefaultArchiveLimits())
			if err != nil {
				t.Fatal(err)
			}
			entry, err := w.CreateHeader(&zip.FileHeader{Name: "file", UncompressedSize64: 2})
			if err != nil {
				t.Fatal(err)
			}
			_, writeErr := entry.Write([]byte(content))
			closeErr := w.Close()
			if writeErr == nil && closeErr == nil {
				t.Fatal("changed source length returned success")
			}
		})
	}
}
