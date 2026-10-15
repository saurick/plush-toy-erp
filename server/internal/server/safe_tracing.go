package server

import (
	"context"
	"errors"

	v1 "server/api/jsonrpc/v1"
	pkglogger "server/pkg/logger"

	"github.com/go-kratos/kratos/v2/middleware"
	"github.com/go-kratos/kratos/v2/middleware/tracing"
	"github.com/go-kratos/kratos/v2/transport"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"
)

var errObservedRequestFailure = errors.New("request failed")

func safeServerTracing(tp *sdktrace.TracerProvider) middleware.Middleware {
	tracer := tracing.NewTracer(oteltrace.SpanKindServer, tracing.WithTracerProvider(tp), tracing.WithPropagator(propagation.TraceContext{}))
	return func(handler middleware.Handler) middleware.Handler {
		return func(ctx context.Context, req any) (reply any, err error) {
			info, ok := transport.FromServerContext(ctx)
			if !ok {
				return handler(ctx, req)
			}
			ctx, span := tracer.Start(ctx, info.Operation(), info.RequestHeader())
			if requestID := pkglogger.RequestIDFromContext(ctx); requestID != "" {
				span.SetAttributes(attribute.String("http.request_id", requestID))
			}
			// Kratos normally only examines the Go error. Classify the RPC envelope
			// for tracing while preserving the actual reply and transport error.
			defer func() {
				outcome := requestOutcome(req, reply, err)
				span.SetAttributes(attribute.String("outcome", outcome))
				if rpcReq, ok := req.(*v1.PostJsonrpcRequest); ok {
					route, method := rpcTraceOperation(rpcReq, reply)
					span.SetName("rpc." + route + "." + method)
					span.SetAttributes(attribute.String("rpc.system", "jsonrpc"), attribute.String("rpc.service", route), attribute.String("rpc.method", method))
					if response, ok := reply.(*v1.PostJsonrpcReply); ok && response.GetResult() != nil {
						span.SetAttributes(attribute.Int64("rpc.result_code", int64(response.GetResult().GetCode())))
					}
				}
				var traceErr error
				if outcome == "error" {
					traceErr = errObservedRequestFailure
				}
				tracer.End(ctx, span, reply, traceErr)
			}()
			return handler(ctx, req)
		}
	}
}
