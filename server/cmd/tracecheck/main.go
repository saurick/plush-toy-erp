// server/cmd/tracecheck/main.go
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
)

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	// compose 里的 jaeger 在容器网络下是 jaeger:4318
	// 宿主机直连默认走 127.0.0.1:4318
	endpoint := getenv("OTLP_ENDPOINT", "127.0.0.1:4318")
	serviceName := getenv("TRACE_SERVICE_NAME", "plush-toy-erp-tracecheck")

	ctx := context.Background()

	exp, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint(endpoint),
		otlptracehttp.WithInsecure(),
	)
	if err != nil {
		panic(fmt.Errorf("create otlp exporter: %w", err))
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(resource.NewSchemaless(
			semconv.ServiceNameKey.String(serviceName),
		)),
	)
	defer func() { _ = tp.Shutdown(ctx) }()
	otel.SetTracerProvider(tp)

	tracer := otel.Tracer("plush-toy-erp-tracecheck")

	ctx, span := tracer.Start(ctx, "test-span")
	span.SetAttributes(
		attribute.String("plush-toy-erp.env", "test"),
		attribute.String("plush-toy-erp.component", "tracecheck"),
	)
	time.Sleep(500 * time.Millisecond)
	span.End()

	fmt.Println("trace sent, wait a few seconds then check Jaeger UI")

	// 等 flush
	time.Sleep(2 * time.Second)
}
