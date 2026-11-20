package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"
)

// 只有请求本身已取消且错误链仅包含取消时，才从系统故障中分离。
// 该结果不承诺写入回滚；客户端仍须通过正式查询核对业务结果。
func canceledRequestResult(ctx context.Context, err error) *v1.JsonrpcResult {
	if ctx == nil || ctx.Err() != context.Canceled || !onlyContextCancellation(err, 0) {
		return nil
	}
	return &v1.JsonrpcResult{Code: errcode.RequestCanceled.Code, Message: errcode.RequestCanceled.Message}
}

func onlyContextCancellation(err error, depth int) bool {
	if err == nil || depth >= 32 {
		return false
	}
	if err == context.Canceled {
		return true
	}
	switch wrapped := err.(type) {
	case interface{ Unwrap() error }:
		return onlyContextCancellation(wrapped.Unwrap(), depth+1)
	case interface{ Unwrap() []error }:
		causes := wrapped.Unwrap()
		if len(causes) == 0 {
			return false
		}
		for _, cause := range causes {
			if !onlyContextCancellation(cause, depth+1) {
				return false
			}
		}
		return true
	default:
		return false
	}
}
