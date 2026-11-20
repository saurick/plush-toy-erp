package server

import (
	"context"
	"fmt"
	"runtime"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware"
	"github.com/go-kratos/kratos/v2/middleware/recovery"
)

// Recovery runs inside completion logging and tracing so a panic follows the
// same failure accounting as other requests. Panic values may contain payloads.
func safeServerRecovery(logger log.Logger) middleware.Middleware {
	return func(handler middleware.Handler) middleware.Handler {
		return func(ctx context.Context, req any) (reply any, err error) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logRecoveredPanic(ctx, logger, recovered)
					reply, err = nil, recovery.ErrUnknownRequest
				}
			}()
			return handler(ctx, req)
		}
	}
}

func logRecoveredPanic(ctx context.Context, logger log.Logger, recovered any) {
	stack := make([]byte, 64<<10)
	n := runtime.Stack(stack, false)
	log.NewHelper(log.WithContext(ctx, logger)).Errorw(
		"msg", "request panic recovered",
		"panic_type", fmt.Sprintf("%T", recovered),
		"stack", string(stack[:n]),
	)
}
