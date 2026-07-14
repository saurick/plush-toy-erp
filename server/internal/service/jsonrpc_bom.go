package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleBOM(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.inventoryUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "list_bom_versions",
		"get_bom_version",
		"create_bom_draft",
		"update_bom_draft",
		"copy_bom_version",
		"activate_bom_version",
		"archive_bom_version":
		return d.handleBOMVersion(ctx, method, id, pm)
	case "add_bom_item",
		"update_bom_item",
		"delete_bom_item":
		return d.handleBOMItem(ctx, method, id, pm)
	default:
		return id, unknownBOMResult(method), nil
	}
}
