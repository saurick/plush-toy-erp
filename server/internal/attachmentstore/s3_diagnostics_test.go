package attachmentstore

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aws/smithy-go"
	"github.com/go-kratos/kratos/v2/log"
	pkglogger "server/pkg/logger"
)

func TestObjectFailuresKeepSafeClassificationAndUnavailableContract(t *testing.T) {
	for _, tc := range []struct {
		err    error
		reason string
	}{
		{fmt.Errorf("operation: %w", context.DeadlineExceeded), "timeout"},
		{context.Canceled, "canceled"},
		{&smithy.GenericAPIError{Code: "AccessDenied", Message: "private-upstream-payload"}, "access_denied"},
		{&smithy.GenericAPIError{Code: "SlowDown", Message: "private-upstream-payload"}, "throttled"},
		{errors.New("private-upstream-payload"), "upstream_error"},
	} {
		err := objectUnavailable(tc.err)
		if !errors.Is(err, ErrUnavailable) || !strings.Contains(err.Error(), tc.reason) || strings.Contains(err.Error(), "private-") {
			t.Fatal("unavailable contract or safe cause was lost")
		}
	}
}

func TestS3FailureLogsSafeDependencyEvidenceWithRequestCorrelation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(403)
		_, _ = fmt.Fprint(w, `<Error><Code>AccessDenied</Code><Message>private-credential-and-object-content</Message></Error>`)
	}))
	defer server.Close()
	store, err := New(Config{Endpoint: server.URL, Bucket: "test-files", AccessKey: "private-access", SecretKey: "private-secret"})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	store.log = log.NewHelper(log.NewStdLogger(&output))
	ctx := pkglogger.WithRequestID(context.Background(), "req-storage")
	_, err = store.Get(ctx, NewKey(), 10)
	if !errors.Is(err, ErrUnavailable) {
		t.Fatalf("got %v", err)
	}
	text := output.String()
	for _, want := range []string{"dependency=attachment_s3", "reason=access_denied", "operation=get", "request_id=req-storage", "dependency_outcome=error", "latency="} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if strings.Contains(text, "private-") || strings.Contains(text, "attachments/") || strings.Contains(text, " outcome=error") {
		t.Fatal("unsafe or duplicated dependency evidence")
	}
	before := output.Len()
	store.observeFailure(ctx, "get", time.Now(), nil)
	if output.Len() != before {
		t.Fatal("successful dependency call emitted failure")
	}
}
