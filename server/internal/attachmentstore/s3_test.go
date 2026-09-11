package attachmentstore

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestS3ImmutableWriteAndBoundedRead(t *testing.T) {
	var stored []byte
	key := NewKey()
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 ") {
			t.Error("request is not signed")
		}
		if r.URL.Path != "/test-files/"+key {
			t.Errorf("unexpected object path: %s", r.URL.Path)
		}
		switch r.Method {
		case "PUT":
			if r.Header.Get("If-None-Match") != "*" || r.Header.Get("X-Amz-Checksum-Sha256") == "" {
				t.Error("missing immutable/checksum constraint")
			}
			if stored != nil {
				w.WriteHeader(412)
				_, _ = fmt.Fprint(w, `<Error><Code>PreconditionFailed</Code></Error>`)
				return
			}
			stored, _ = io.ReadAll(r.Body)
		case "GET":
			if stored == nil {
				w.WriteHeader(404)
				_, _ = fmt.Fprint(w, `<Error><Code>NoSuchKey</Code></Error>`)
				return
			}
			w.Header().Set("Content-Length", fmt.Sprint(len(stored)))
			_, _ = w.Write(stored)
		}
	}))
	defer ts.Close()
	s, err := New(Config{Endpoint: ts.URL, Bucket: "test-files", AccessKey: "test-access", SecretKey: "test-secret"})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := s.Get(ctx, key, 10); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if err := s.Put(ctx, key, []byte("first")); err != nil {
		t.Fatal(err)
	}
	if err := s.Put(ctx, key, []byte("first")); err != nil {
		t.Fatalf("replay: %v", err)
	}
	if err := s.Put(ctx, key, []byte("other")); err == nil {
		t.Fatal("overwrote existing object")
	}
	if _, err := s.Get(ctx, key, 4); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("oversized: %v", err)
	}
	got, err := s.Get(ctx, key, 5)
	if err != nil || !bytes.Equal(got, []byte("first")) {
		t.Fatalf("read: %q %v", got, err)
	}
	if _, err := s.Get(ctx, "../secret", 10); !errors.Is(err, ErrIntegrity) {
		t.Fatalf("unsafe key: %v", err)
	}
	ts.Close()
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := s.Get(cancelled, key, 5); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("unavailable: %v", err)
	}
}
