package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"sync"
	"testing"

	"server/internal/attachmentstore"
)

type attachmentMemoryStore struct {
	mu     sync.Mutex
	files  map[string][]byte
	putErr error
	getErr error
}

func newAttachmentMemoryStore() *attachmentMemoryStore {
	return &attachmentMemoryStore{files: map[string][]byte{}}
}
func (s *attachmentMemoryStore) Put(_ context.Context, key string, content []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.putErr != nil {
		return s.putErr
	}
	s.files[key] = append([]byte(nil), content...)
	return nil
}
func (s *attachmentMemoryStore) Get(_ context.Context, key string, maximum int64) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.getErr != nil {
		return nil, s.getErr
	}
	content, ok := s.files[key]
	if !ok {
		return nil, attachmentstore.ErrNotFound
	}
	if int64(len(content)) > maximum {
		return nil, attachmentstore.ErrIntegrity
	}
	return append([]byte(nil), content...), nil
}
func attachmentSHA256(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}
func seedAttachmentObject(t *testing.T, store attachmentstore.Store, content []byte) string {
	t.Helper()
	key := attachmentstore.NewKey()
	if err := store.Put(context.Background(), key, content); err != nil {
		t.Fatal(err)
	}
	return key
}
func mustAttachmentBytes(t *testing.T, store attachmentstore.Store, key string, size int) []byte {
	t.Helper()
	content, err := store.Get(context.Background(), key, int64(size))
	if err != nil {
		t.Fatal(err)
	}
	return content
}
