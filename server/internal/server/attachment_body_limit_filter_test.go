package server

import (
	"io"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	kratoserrors "github.com/go-kratos/kratos/v2/errors"
)

func TestJSONRPCBodyLimitFilterRejectsOversizedAttachmentContentLengthBeforeHandler(t *testing.T) {
	called := false
	handler := JSONRPCBodyLimitFilter()(stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {
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

func TestJSONRPCBodyLimitFilterBoundsChunkedAttachmentBody(t *testing.T) {
	handler := JSONRPCBodyLimitFilter()(stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
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

func TestBoundedRequestDecoderReturnsPayloadTooLargeForChunkedBody(t *testing.T) {
	req := httptest.NewRequest(stdhttp.MethodPost, "/rpc/admin", nil)
	req.Header.Set("Content-Type", "application/json")
	req.Body = stdhttp.MaxBytesReader(
		httptest.NewRecorder(),
		io.NopCloser(io.LimitReader(zeroReader{}, maxJSONRPCRequestBodyBytes+1)),
		maxJSONRPCRequestBodyBytes,
	)
	var payload map[string]any

	err := BoundedRequestDecoder(req, &payload)
	serviceErr := kratoserrors.FromError(err)
	if serviceErr.Code != stdhttp.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d; err=%v", serviceErr.Code, stdhttp.StatusRequestEntityTooLarge, err)
	}
	if serviceErr.Reason != errcode.PayloadTooLarge.Name {
		t.Fatalf("reason = %q, want %q", serviceErr.Reason, errcode.PayloadTooLarge.Name)
	}
}

func TestJSONRPCBodyLimitFilterRejectsOrdinaryRPCAboveTwoMiB(t *testing.T) {
	called := false
	handler := JSONRPCBodyLimitFilter()(stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {
		called = true
	}))
	req := httptest.NewRequest(stdhttp.MethodPost, "/rpc/admin", strings.NewReader("{}"))
	req.ContentLength = maxJSONRPCRequestBodyBytes + 1
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if called {
		t.Fatal("oversized JSON-RPC request must not enter handler")
	}
	if res.Code != stdhttp.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want %d", res.Code, stdhttp.StatusRequestEntityTooLarge)
	}
}

func TestJSONRPCBodyLimitFilterLeavesNonRPCBodyUntouched(t *testing.T) {
	called := false
	handler := JSONRPCBodyLimitFilter()(stdhttp.HandlerFunc(func(stdhttp.ResponseWriter, *stdhttp.Request) {
		called = true
	}))
	req := httptest.NewRequest(stdhttp.MethodPost, "/templates/render-pdf", strings.NewReader("{}"))
	req.ContentLength = maxJSONRPCRequestBodyBytes + 1
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	if !called {
		t.Fatal("non-JSON-RPC request should not be handled by this filter")
	}
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0
	}
	return len(p), nil
}
