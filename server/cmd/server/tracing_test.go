package main

import (
	"context"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"
)

func TestBuildTraceSamplerSuppressesProbeRootsAndBoundsBackground(t *testing.T) {
	params := sdktrace.SamplingParameters{ParentContext: context.Background(), TraceID: oteltrace.TraceID{255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255}}
	for _, operation := range []string{"server.http.healthz", "server.http.readyz", "server.http.runtime_identity", "background.process_runtime.reconcile_workflow"} {
		params.Name = operation
		if buildTraceSampler(1).ShouldSample(params).Decision != sdktrace.Drop {
			t.Fatalf("noisy root %q received full sampling", operation)
		}
	}
	params.Name = "rpc.inventory.post_purchase_receipt"
	if buildTraceSampler(1).ShouldSample(params).Decision != sdktrace.RecordAndSample {
		t.Fatal("business tracing was suppressed")
	}
	params.Name = "server.http.healthz"
	params.ParentContext = oteltrace.ContextWithSpanContext(context.Background(), oteltrace.NewSpanContext(oteltrace.SpanContextConfig{
		TraceID: params.TraceID, SpanID: oteltrace.SpanID{2}, TraceFlags: oteltrace.FlagsSampled, Remote: true,
	}))
	if buildTraceSampler(0).ShouldSample(params).Decision != sdktrace.RecordAndSample {
		t.Fatal("parent decision was overridden for probe child")
	}
}

func TestInitTracerProviderConfiguresW3CPropagationWithoutBaggage(t *testing.T) {
	previousTP, previousPropagator := otel.GetTracerProvider(), otel.GetTextMapPropagator()
	defer func() { otel.SetTracerProvider(previousTP); otel.SetTextMapPropagator(previousPropagator) }()
	tp := initTracerProvider("trace-test", "", 0, log.NewStdLogger(io.Discard))
	defer func() { _ = tp.Shutdown(context.Background()) }()
	ctx := otel.GetTextMapPropagator().Extract(context.Background(), propagation.MapCarrier{
		"traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
		"baggage":     "private=value",
	})
	if oteltrace.SpanContextFromContext(ctx).TraceID().String() != "11111111111111111111111111111111" {
		t.Fatal("custom route propagation is not initialized")
	}
	for _, field := range otel.GetTextMapPropagator().Fields() {
		if field == "baggage" {
			t.Fatal("untrusted baggage is propagated")
		}
	}
}
