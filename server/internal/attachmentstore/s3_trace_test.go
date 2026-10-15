package attachmentstore

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	oteltrace "go.opentelemetry.io/otel/trace"
)

func TestS3TraceCoversReadAndFailureWithoutObjectData(t *testing.T) {
	previous := otel.GetTracerProvider()
	defer otel.SetTracerProvider(previous)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	defer func() { _ = tp.Shutdown(context.Background()) }()
	otel.SetTracerProvider(tp)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("private-content"))
	}))
	defer ts.Close()
	store, err := New(Config{Endpoint: ts.URL, Bucket: "private-files", AccessKey: "private-access", SecretKey: "private-secret"})
	if err != nil {
		t.Fatal(err)
	}
	ctx, parent := tp.Tracer("test.request").Start(context.Background(), "request")
	got, err := store.Get(ctx, NewKey(), 32)
	if err != nil || string(got) != "private-content" {
		t.Fatalf("read changed: %v", err)
	}
	if _, err := store.Get(ctx, "../private-secret", 32); !errors.Is(err, ErrIntegrity) {
		t.Fatal("validation changed")
	}
	spans := recorder.Ended()
	if len(spans) != 2 || spans[0].Status().Code != codes.Ok || spans[1].Status().Code != codes.Error {
		t.Fatal("read outcome is absent")
	}
	for _, span := range spans {
		if span.Name() != "attachment.s3.get" || span.SpanKind() != oteltrace.SpanKindClient || span.Parent().SpanID() != parent.SpanContext().SpanID() {
			t.Fatal("S3 is not a client child span")
		}
		for _, attr := range span.Attributes() {
			if strings.Contains(attr.Value.String(), "private-") {
				t.Fatal("S3 trace contains object data or credentials")
			}
		}
		if strings.Contains(span.Status().Description, "private-") {
			t.Fatal("S3 trace contains private error text")
		}
	}
	parent.End()
}
