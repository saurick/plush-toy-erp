//go:build attachmentintegration

package attachmentstore

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"os"
	"testing"
)

// This test runs against the fixed SeaweedFS image in the isolated migration drill.
func TestS3Integration(t *testing.T) {
	if os.Getenv("ATTACHMENT_STORAGE_INTEGRATION") != "1" {
		t.Fatal("requires isolated S3 service")
	}
	c := ConfigFromEnv()
	s, err := New(c)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := s.Check(ctx); err != nil {
		t.Fatal(err)
	}
	key := NewKey()
	content := bytes.Repeat([]byte("image-fixture"), 50000)
	for range 2 {
		if err := s.Put(ctx, key, content); err != nil {
			t.Fatalf("PUT/replay: %v", err)
		}
	}
	if err := s.Put(ctx, key, []byte("overwrite")); err == nil {
		t.Fatal("immutable key was overwritten")
	}
	got, err := s.Get(ctx, key, int64(len(content)))
	if err != nil || !bytes.Equal(got, content) {
		t.Fatalf("GET: %v", err)
	}
	if _, err := s.Get(ctx, NewKey(), 10); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing object: %v", err)
	}
	if _, err := s.Get(ctx, key, 1); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("oversize object: %v", err)
	}
	resp, err := http.Get(c.Endpoint + "/" + c.Bucket + "/" + key)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("unsigned request returned %d", resp.StatusCode)
	}
}
