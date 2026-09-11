package attachmentmigration

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"server/internal/attachmentstore"
)

type memoryStore map[string][]byte

func (s memoryStore) Put(_ context.Context, k string, b []byte) error {
	s[k] = append([]byte(nil), b...)
	return nil
}
func (s memoryStore) Get(_ context.Context, k string, max int64) ([]byte, error) {
	b, ok := s[k]
	if !ok {
		return nil, attachmentstore.ErrNotFound
	}
	if int64(len(b)) > max {
		return nil, attachmentstore.ErrIntegrity
	}
	return b, nil
}
func fixtureManifest() (Manifest, memoryStore) {
	content := []byte("private attachment evidence")
	sum := sha256.Sum256(content)
	digest := hex.EncodeToString(sum[:])
	f := File{ID: 19, Size: int64(len(content)), SHA256: digest, Key: attachmentstore.MigrationKey(19, digest)}
	m := Manifest{Format: Format, Database: "plush_erp_attachment_test", Files: []File{f}, Bytes: f.Size}
	m.Fingerprint = Fingerprint(m.Database, m.Files)
	return m, memoryStore{f.Key: content}
}
func TestBackupRestorePreservesKeysAndRejectsCorruption(t *testing.T) {
	ctx := context.Background()
	m, source := fixtureManifest()
	dir := filepath.Join(t.TempDir(), "backup")
	if err := Backup(ctx, source, m, dir); err != nil {
		t.Fatal(err)
	}
	restored, err := ReadManifest(filepath.Join(dir, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !SameFiles(m, restored) {
		t.Fatal("backup metadata changed")
	}
	target := memoryStore{}
	if err := Restore(ctx, target, restored, dir); err != nil {
		t.Fatal(err)
	}
	if err := Verify(ctx, target, m); err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(dir, filepath.Base(m.Files[0].Key))
	if err := os.WriteFile(name, make([]byte, m.Files[0].Size), 0600); err != nil {
		t.Fatal(err)
	}
	if err := Restore(ctx, memoryStore{}, restored, dir); err == nil {
		t.Fatal("corrupt backup restored")
	}
	if err := Backup(ctx, source, m, dir); err == nil {
		t.Fatal("existing backup overwritten")
	}
	info, err := os.Stat(filepath.Join(dir, "manifest.json"))
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("manifest must be private")
	}
}
func TestFailedBackupHasNoCompletionManifest(t *testing.T) {
	m, source := fixtureManifest()
	source[m.Files[0].Key] = []byte("corrupt")
	dir := filepath.Join(t.TempDir(), "backup")
	if err := Backup(context.Background(), source, m, dir); err == nil {
		t.Fatal("corruption accepted")
	}
	if _, err := os.Stat(filepath.Join(dir, "manifest.json")); !os.IsNotExist(err) {
		t.Fatal("partial backup published")
	}
}
func TestManifestRejectsTraversalAndStaleProof(t *testing.T) {
	m, _ := fixtureManifest()
	original := m.Fingerprint
	m.Files[0].SHA256 = "bad"
	if Fingerprint(m.Database, m.Files) == original {
		t.Fatal("file change did not invalidate proof")
	}
	m.Files[0].Key = "../../secret"
	m.Fingerprint = Fingerprint(m.Database, m.Files)
	name := filepath.Join(t.TempDir(), "manifest.json")
	if err := WriteManifest(name, m); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadManifest(name); err == nil {
		t.Fatal("unsafe manifest accepted")
	}
}
