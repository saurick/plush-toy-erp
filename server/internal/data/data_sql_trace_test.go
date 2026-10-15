package data

import (
	"context"
	"testing"

	"github.com/XSAM/otelsql"
	oteltrace "go.opentelemetry.io/otel/trace"
)

func TestPostgresSQLSpanOptionsDoNotRecordQueryText(t *testing.T) {
	opts := postgresSQLSpanOptions()

	if !opts.DisableQuery {
		t.Fatal("expected SQL trace query text to be disabled")
	}
	if opts.OmitConnQuery {
		t.Fatal("expected SQL query spans to remain enabled for timing and error attribution")
	}
	if !opts.OmitRows || !opts.OmitConnPrepare || !opts.OmitConnResetSession || !opts.OmitConnectorConnect {
		t.Fatalf("unexpected noisy SQL span options: %#v", opts)
	}
}

func TestPostgresSQLTraceRequiresOperationParent(t *testing.T) {
	filter := postgresSQLSpanOptions().SpanFilter
	if filter == nil || filter(context.Background(), otelsql.MethodConnQuery, "private-query", nil) {
		t.Fatal("unrelated background SQL creates root traces")
	}
	for _, flags := range []oteltrace.TraceFlags{0, oteltrace.FlagsSampled} {
		parent := oteltrace.NewSpanContext(oteltrace.SpanContextConfig{
			TraceID: oteltrace.TraceID{1}, SpanID: oteltrace.SpanID{2}, TraceFlags: flags,
		})
		ctx := oteltrace.ContextWithSpanContext(context.Background(), parent)
		if !filter(ctx, otelsql.MethodConnQuery, "private-query", nil) {
			t.Fatal("valid operation parent was discarded")
		}
	}
}
