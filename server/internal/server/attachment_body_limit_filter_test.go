package server

import (
	"io"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"server/internal/biz"
)

func TestAttachmentBodyLimitFilterRejectsOversizedContentLengthBeforeHandler(t *testing.T) {
	called := false
	handler := AttachmentBodyLimitFilter()(stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {
		called = true
	}))
	req := httptest.NewRequest(stdhttp.MethodPost, "/rpc/attachment", strings.NewReader("{}"))
	req.ContentLength = biz.BusinessAttachmentMaxJSONRPCBodyBytes + 1
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if called {
		t.Fatal("oversized attachment request must not enter JSON-RPC handler")
	}
	if res.Code != stdhttp.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", res.Code, stdhttp.StatusRequestEntityTooLarge)
	}
}

func TestAttachmentBodyLimitFilterBoundsChunkedBody(t *testing.T) {
	handler := AttachmentBodyLimitFilter()(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		_, err := io.ReadAll(r.Body)
		if err == nil {
			t.Fatal("bounded reader must reject a body above the configured limit")
		}
		w.WriteHeader(stdhttp.StatusRequestEntityTooLarge)
	}))
	req := httptest.NewRequest(
		stdhttp.MethodPost,
		"/rpc/attachment",
		io.LimitReader(strings.NewReader(strings.Repeat("x", 1024)), biz.BusinessAttachmentMaxJSONRPCBodyBytes+1),
	)
	req.Body = io.NopCloser(io.LimitReader(zeroReader{}, biz.BusinessAttachmentMaxJSONRPCBodyBytes+1))
	req.ContentLength = -1
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if res.Code != stdhttp.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", res.Code, stdhttp.StatusRequestEntityTooLarge)
	}
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0
	}
	return len(p), nil
}
