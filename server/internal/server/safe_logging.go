package server

import (
	"context"
	"fmt"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	kratoserrors "github.com/go-kratos/kratos/v2/errors"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware"
	"github.com/go-kratos/kratos/v2/transport"
)

// safeServerLogging keeps transport evidence without serializing request bodies.
// JSON-RPC params can contain passwords, verification codes, tokens or customer data.
func safeServerLogging(logger log.Logger) middleware.Middleware {
	return func(handler middleware.Handler) middleware.Handler {
		return func(ctx context.Context, req any) (reply any, err error) {
			start := time.Now()
			kind := ""
			operation := ""
			if info, ok := transport.FromServerContext(ctx); ok {
				kind = info.Kind().String()
				operation = info.Operation()
			}

			reply, err = handler(ctx, req)
			sharedRuntimeMetricCounters.observeRPC(time.Since(start), err != nil)
			var code int32
			reason := ""
			if serviceErr := kratoserrors.FromError(err); serviceErr != nil {
				code = serviceErr.Code
				reason = serviceErr.Reason
			}
			level := log.LevelInfo
			if err != nil {
				level = log.LevelError
			}
			fields := []any{
				"msg", "request completed",
				"kind", "server",
				"component", kind,
				"operation", operation,
				"request", safeRequestSummary(req),
				"code", code,
				"reason", reason,
				"latency", time.Since(start).Seconds(),
			}
			if _, ok := req.(*v1.PostJsonrpcRequest); ok {
				response, _ := reply.(*v1.PostJsonrpcReply)
				outcome := "success"
				if err != nil || response == nil || response.GetResult() == nil || response.GetError() != "" || response.GetResult().GetCode() >= errcode.Internal.Code {
					outcome, level = "error", log.LevelError
				} else if response.GetResult().GetCode() != errcode.OK.Code {
					outcome, level = "rejected", log.LevelWarn
				}
				fields = append(fields, "outcome", outcome)
				if result := response.GetResult(); result != nil {
					fields = append(fields, "rpc_result_code", result.GetCode())
				}
			}
			log.NewHelper(log.WithContext(ctx, logger)).Log(level, fields...)
			return reply, err
		}
	}
}

func safeRequestSummary(req any) string {
	switch value := req.(type) {
	case *v1.PostJsonrpcRequest:
		if value == nil {
			return "jsonrpc.post"
		}
		return fmt.Sprintf("jsonrpc.post url=%s method=%s id=%s", value.GetUrl(), value.GetMethod(), value.GetId())
	default:
		return fmt.Sprintf("type=%T", req)
	}
}
