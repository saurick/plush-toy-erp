package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestJsonrpcDispatcher_BOMVersionLifecycle(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_bom_version")
	fixtures := createInventoryTestFixtures(t, ctx, client)

	j := newBOMJSONRPCTestData(data, workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey},
		biz.PermissionBOMRead,
		biz.PermissionBOMCreate,
		biz.PermissionBOMUpdate,
		biz.PermissionBOMActivate,
	))
	adminCtx := workflowJSONRPCAdminContext()

	_, invalidDateRes, err := j.handleBOM(adminCtx, "create_bom_draft", "invalid-date", mustJSONRPCStruct(t, map[string]any{
		"product_id":     float64(fixtures.productID),
		"version":        "BAD-DATE",
		"effective_from": "2026-06-17",
		"effective_to":   "2026-06-02",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidDateRes == nil || invalidDateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for reversed BOM effective dates, got %#v", invalidDateRes)
	}

	_, draftRes, err := j.handleBOM(adminCtx, "create_bom_draft", "1", mustJSONRPCStruct(t, map[string]any{
		"product_id": float64(fixtures.productID),
		"version":    "V1",
		"note":       "首版工程资料",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if draftRes == nil || draftRes.Code != errcode.OK.Code {
		t.Fatalf("expected create draft OK, got %#v", draftRes)
	}
	draft := jsonRPCNestedMap(t, draftRes, "bom_version")
	headerID := jsonRPCInt(t, draft, "id")
	if status := draft["status"]; status != biz.BOMStatusDraft {
		t.Fatalf("expected draft status, got %#v", status)
	}

	_, itemRes, err := j.handleBOM(adminCtx, "add_bom_item", "2", mustJSONRPCStruct(t, map[string]any{
		"bom_header_id": float64(headerID),
		"material_id":   float64(fixtures.materialID),
		"quantity":      "1.25",
		"unit_id":       float64(fixtures.unitID),
		"loss_rate":     "0.10",
		"position":      "面料",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if itemRes == nil || itemRes.Code != errcode.OK.Code {
		t.Fatalf("expected add item OK, got %#v", itemRes)
	}
	itemID := jsonRPCInt(t, jsonRPCNestedMap(t, itemRes, "bom_item"), "id")

	_, activeRes, err := j.handleBOM(adminCtx, "activate_bom_version", "3", mustJSONRPCStruct(t, map[string]any{"id": float64(headerID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	active := jsonRPCNestedMap(t, activeRes, "bom_version")
	if status := active["status"]; status != biz.BOMStatusActive {
		t.Fatalf("expected active status, got %#v", status)
	}

	_, immutableRes, err := j.handleBOM(adminCtx, "update_bom_item", "4", mustJSONRPCStruct(t, map[string]any{
		"id":          float64(itemID),
		"material_id": float64(fixtures.materialID),
		"quantity":    "1.5",
		"unit_id":     float64(fixtures.unitID),
		"loss_rate":   "0.02",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if immutableRes == nil || immutableRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected active BOM immutable rejection, got %#v", immutableRes)
	}

	_, copyRes, err := j.handleBOM(adminCtx, "copy_bom_version", "5", mustJSONRPCStruct(t, map[string]any{
		"source_id":  float64(headerID),
		"product_id": float64(fixtures.productID),
		"version":    "V2",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	copyVersion := jsonRPCNestedMap(t, copyRes, "bom_version")
	copyID := jsonRPCInt(t, copyVersion, "id")
	if status := copyVersion["status"]; status != biz.BOMStatusDraft {
		t.Fatalf("expected copied version draft, got %#v", status)
	}
	items, ok := copyVersion["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected copied item, got %#v", copyVersion["items"])
	}

	_, activateCopyRes, err := j.handleBOM(adminCtx, "activate_bom_version", "6", mustJSONRPCStruct(t, map[string]any{"id": float64(copyID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if status := jsonRPCNestedMap(t, activateCopyRes, "bom_version")["status"]; status != biz.BOMStatusActive {
		t.Fatalf("expected copied version active, got %#v", status)
	}
	oldHeader, err := j.inventoryUC.GetBOMVersion(ctx, headerID)
	if err != nil {
		t.Fatalf("get old version failed: %v", err)
	}
	if oldHeader.Header.Status != biz.BOMStatusArchived {
		t.Fatalf("expected old active version archived, got %s", oldHeader.Header.Status)
	}

	_, listRes, err := j.handleBOM(adminCtx, "list_bom_versions", "7", mustJSONRPCStruct(t, map[string]any{
		"product_id": float64(fixtures.productID),
		"status":     biz.BOMStatusActive,
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if total := jsonRPCInt(t, listRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one active BOM, got %d", total)
	}
}

func TestJsonrpcDispatcher_BOMAPIRequiresDedicatedPermissions(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_bom_permissions")
	j := newBOMJSONRPCTestData(data, workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionBOMRead))

	_, createRes, err := j.handleBOM(workflowJSONRPCAdminContext(), "create_bom_draft", "1", mustJSONRPCStruct(t, map[string]any{
		"product_id": float64(1),
		"version":    "V1",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected create permission denied, got %#v", createRes)
	}

	_, activateRes, err := j.handleBOM(workflowJSONRPCAdminContext(), "activate_bom_version", "2", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if activateRes == nil || activateRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected activate permission denied, got %#v", activateRes)
	}
}

func newBOMJSONRPCTestData(data *datarepo.Data, admin *biz.AdminUser) *jsonrpcDispatcher {
	logger := log.NewStdLogger(io.Discard)
	return &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(logger, "module", "service.jsonrpc.bom.test")),
		adminReader: stubAdminAccountReader{admin: admin},
		inventoryUC: biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger)),
	}
}
