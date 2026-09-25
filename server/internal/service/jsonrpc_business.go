package service

import (
	"context"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleBusiness(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)

	if _, res := d.requireAdmin(ctx); res != nil {
		l.Warnf("[business] requireAdmin denied method=%s id=%s code=%d msg=%s", method, id, res.Code, res.Message)
		return id, res, nil
	}

	switch method {
	case "list_progress", "get_progress":
		return d.handleBusinessProgress(ctx, method, id, params)

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 business 接口 method=%s", method),
		}, nil
	}
}
