package service

import (
	"errors"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func unitQuantityErrorResult(err error) *v1.JsonrpcResult {
	var quantityErr *biz.UnitQuantityError
	if errors.As(err, &quantityErr) {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: quantityErr.Error()}
	}
	return nil
}
