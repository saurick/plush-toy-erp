// Package attachmentmigration moves attachment bytes without changing business rows.
// Atlas owns the subsequent metadata conversion and removal of the bytea column.
package attachmentmigration

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"server/internal/attachmentstore"
)

const Format = "plush.attachment-objects/v1"
const MaxFileBytes = 5 * 1024 * 1024

type File struct {
	ID     int64  `json:"id"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
	Key    string `json:"key"`
}

type Manifest struct {
	Format             string    `json:"format"`
	Database           string    `json:"database"`
	Fingerprint        string    `json:"fingerprint"`
	StorageIdentity    string    `json:"storageIdentity"`
	CreatedAt          time.Time `json:"createdAt"`
	Files              []File    `json:"files"`
	Bytes              int64     `json:"bytes"`
	HasDatabaseContent bool      `json:"hasDatabaseContent"`
}

func Fingerprint(database string, files []File) string {
	var lines []string
	for _, f := range files {
		lines = append(lines, fmt.Sprintf("%d:%d:%s", f.ID, f.Size, f.SHA256))
	}
	sum := sha256.Sum256([]byte(database + "\n" + strings.Join(lines, "\n")))
	return hex.EncodeToString(sum[:])
}

func StorageIdentity(c attachmentstore.Config) string {
	sum := sha256.Sum256([]byte(strings.TrimRight(c.Endpoint, "/") + "\n" + c.Bucket))
	return hex.EncodeToString(sum[:])
}

func Inspect(ctx context.Context, db *sql.DB, expectedDatabase string) (Manifest, error) {
	m := Manifest{Format: Format, Files: []File{}}
	if err := db.QueryRowContext(ctx, "SELECT current_database()").Scan(&m.Database); err != nil {
		return m, errors.New("cannot read database identity")
	}
	if m.Database != expectedDatabase || expectedDatabase == "" {
		return m, errors.New("database identity does not match -database")
	}
	if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'business_attachments' AND column_name = 'content')`).Scan(&m.HasDatabaseContent); err != nil {
		return m, err
	}
	keyColumn := "object_key"
	if m.HasDatabaseContent {
		keyColumn = "''"
	}
	rows, err := db.QueryContext(ctx, "SELECT id, file_size, sha256, "+keyColumn+" FROM business_attachments ORDER BY id")
	if err != nil {
		return m, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var f File
		if err := rows.Scan(&f.ID, &f.Size, &f.SHA256, &f.Key); err != nil {
			return m, err
		}
		if m.HasDatabaseContent {
			f.Key = attachmentstore.MigrationKey(f.ID, f.SHA256)
		}
		digest, err := hex.DecodeString(f.SHA256)
		if f.ID <= 0 || f.Size <= 0 || f.Size > MaxFileBytes || err != nil || len(digest) != sha256.Size || strings.ToLower(f.SHA256) != f.SHA256 || !attachmentstore.ValidKey(f.Key) {
			return m, errors.New("invalid attachment metadata; migration stopped")
		}
		m.Files = append(m.Files, f)
		m.Bytes += f.Size
	}
	if err := rows.Err(); err != nil {
		return m, err
	}
	m.Fingerprint = Fingerprint(m.Database, m.Files)
	return m, nil
}

func ValidateBytes(f File, content []byte) error {
	sum := sha256.Sum256(content)
	if int64(len(content)) != f.Size || hex.EncodeToString(sum[:]) != f.SHA256 {
		return fmt.Errorf("attachment %d failed size/SHA-256 verification", f.ID)
	}
	return nil
}

func Export(ctx context.Context, db *sql.DB, store attachmentstore.Store, m Manifest) (Manifest, error) {
	if !m.HasDatabaseContent {
		return m, errors.New("database content has already been retired; use verify or backup")
	}
	for _, f := range m.Files {
		var content []byte
		if err := db.QueryRowContext(ctx, "SELECT content FROM business_attachments WHERE id = $1 AND sha256 = $2 AND file_size = $3", f.ID, f.SHA256, f.Size).Scan(&content); err != nil {
			return m, fmt.Errorf("attachment %d changed during export", f.ID)
		}
		if err := ValidateBytes(f, content); err != nil {
			return m, err
		}
		if err := store.Put(ctx, f.Key, content); err != nil {
			return m, fmt.Errorf("attachment %d export failed: %w", f.ID, err)
		}
	}
	if err := Verify(ctx, store, m); err != nil {
		return m, err
	}
	current, err := Inspect(ctx, db, m.Database)
	if err != nil {
		return m, err
	}
	if current.Fingerprint != m.Fingerprint {
		return m, errors.New("attachments changed during export; keep writers stopped and export again")
	}
	m.CreatedAt = time.Now().UTC()
	return m, nil
}

func Verify(ctx context.Context, store attachmentstore.Store, m Manifest) error {
	for _, f := range m.Files {
		content, err := store.Get(ctx, f.Key, f.Size)
		if err != nil {
			return fmt.Errorf("attachment %d object read failed: %w", f.ID, err)
		}
		if err := ValidateBytes(f, content); err != nil {
			return err
		}
	}
	return nil
}

func WriteManifest(name string, m Manifest) error {
	content, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return writeNewFile(name, append(content, '\n'))
}

func ReadManifest(name string) (Manifest, error) {
	var m Manifest
	content, err := os.ReadFile(name)
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(content, &m); err != nil {
		return m, err
	}
	if m.Format != Format || m.Fingerprint != Fingerprint(m.Database, m.Files) {
		return m, errors.New("invalid attachment manifest")
	}
	var lastID, total int64
	keys := map[string]bool{}
	for _, f := range m.Files {
		digest, err := hex.DecodeString(f.SHA256)
		if f.ID <= lastID || f.Size <= 0 || f.Size > MaxFileBytes || err != nil || len(digest) != 32 || !attachmentstore.ValidKey(f.Key) || keys[f.Key] {
			return m, errors.New("invalid attachment manifest file")
		}
		lastID = f.ID
		total += f.Size
		keys[f.Key] = true
	}
	if m.Bytes != total {
		return m, errors.New("invalid attachment manifest byte total")
	}
	return m, nil
}

func SameFiles(source, current Manifest) bool {
	if len(source.Files) != len(current.Files) {
		return false
	}
	for i := range source.Files {
		if source.Files[i] != current.Files[i] {
			return false
		}
	}
	return true
}

// Backup is paired with a database backup made while writers and object cleanup
// are stopped. A partial directory is not a backup: manifest.json is written last.
func Backup(ctx context.Context, store attachmentstore.Store, m Manifest, directory string) error {
	if err := os.Mkdir(directory, 0700); err != nil {
		return err
	}
	for _, f := range m.Files {
		content, err := store.Get(ctx, f.Key, f.Size)
		if err != nil {
			return err
		}
		if err := ValidateBytes(f, content); err != nil {
			return err
		}
		if err := writeNewFile(filepath.Join(directory, filepath.Base(f.Key)), content); err != nil {
			return err
		}
	}
	m.CreatedAt = time.Now().UTC()
	return WriteManifest(filepath.Join(directory, "manifest.json"), m)
}

func Restore(ctx context.Context, store attachmentstore.Store, m Manifest, directory string) error {
	for _, f := range m.Files {
		name := filepath.Join(directory, filepath.Base(f.Key))
		stat, err := os.Lstat(name)
		if err != nil || !stat.Mode().IsRegular() || stat.Size() != f.Size {
			return fmt.Errorf("attachment %d backup file invalid", f.ID)
		}
		content, err := os.ReadFile(name)
		if err != nil {
			return err
		}
		if err := ValidateBytes(f, content); err != nil {
			return err
		}
		if err := store.Put(ctx, f.Key, content); err != nil {
			return err
		}
	}
	return Verify(ctx, store, m)
}

func writeNewFile(name string, content []byte) error {
	f, err := os.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	_, writeErr := f.Write(content)
	if writeErr == nil {
		writeErr = f.Sync()
	}
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}
