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
	case "list_bom_versions", "listBOMVersions",
		"get_bom_version", "getBOMVersion",
		"create_bom_draft", "createBOMDraft",
		"update_bom_draft", "updateBOMDraft",
		"copy_bom_version", "copyBOMVersion",
		"activate_bom_version", "activateBOMVersion",
		"archive_bom_version", "archiveBOMVersion":
		return d.handleBOMVersion(ctx, method, id, pm)
	case "add_bom_item", "addBOMItem",
		"update_bom_item", "updateBOMItem",
		"delete_bom_item", "deleteBOMItem":
		return d.handleBOMItem(ctx, method, id, pm)
	default:
		return id, unknownBOMResult(method), nil
	}
}
