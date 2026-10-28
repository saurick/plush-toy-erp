package server

import (
	"context"
	"io"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	kratoserrors "github.com/go-kratos/kratos/v2/errors"
)

func TestRequestTimeoutFilterKeepsOrdinaryDeadlineAndExtendsAttachments(t *testing.T) {
	for _, tc := range []struct {
		path string
		want time.Duration
	}{
		{"/rpc/admin", 45 * time.Second},
		{"/rpc/attachment", biz.BusinessAttachmentRequestTimeoutSeconds * time.Second},
	} {
		t.Run(tc.path, func(t *testing.T) {
			handler := RequestTimeoutFilter(45 * time.Second)(stdhttp.HandlerFunc(func(_ stdhttp.ResponseWriter, r *stdhttp.Request) {
				deadline, ok := r.Context().Deadline()
				remaining := time.Until(deadline)
				if !ok || remaining > tc.want || remaining < tc.want-time.Second {
					t.Fatalf("request deadline = %v, expected %v", remaining, tc.want)
				}
			}))
			handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(stdhttp.MethodPost, tc.path, nil))
		})
	}
}

func TestRequestTimeoutFilterRetainsParentCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	handler := RequestTimeoutFilter(45 * time.Second)(stdhttp.HandlerFunc(func(_ stdhttp.ResponseWriter, r *stdhttp.Request) {
		if r.Context().Err() != context.Canceled {
			t.Fatal("attachment timeout must not detach a canceled request")
		}
	}))
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(stdhttp.MethodPost, "/rpc/attachment", nil).WithContext(ctx))
}

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
