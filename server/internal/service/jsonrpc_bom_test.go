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

	j := newBOMJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey},
		biz.PermissionBOMRead,
		biz.PermissionBOMCreate,
		biz.PermissionBOMUpdate,
		biz.PermissionBOMActivate,
	))
	adminCtx := workflowJSONRPCAdminContext()

	_, invalidDateRes, err := j.handleBOM(adminCtx, "save_bom_with_items", "invalid-date", mustJSONRPCStruct(t, map[string]any{
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

	_, draftRes, err := j.handleBOM(adminCtx, "save_bom_with_items", "1", mustJSONRPCStruct(t, map[string]any{
		"product_id":      float64(fixtures.productID),
		"version":         "V1",
		"source_order_no": "WL260102",
		"quantity_text":   "3030",
		"spare_text":      "备品 30",
		"print_date":      "2026-01-19",
		"designer":        "罗伟",
		"maker":           "成慧怡",
		"auditor":         "审核人",
		"hair_direction":  "单方向",
		"note":            "首版工程资料",
		"items": []any{map[string]any{
			"material_id":               float64(fixtures.materialID),
			"quantity":                  "1.25",
			"unit_id":                   float64(fixtures.unitID),
			"loss_rate":                 "0.10",
			"position":                  "面料",
			"piece_count":               "2",
			"total_usage_snapshot":      "378.75",
			"process_base":              "布底贴12g纸朴",
			"process_method":            "热裁",
			"production_operation_code": biz.ProductionWIPOperationFabricProcessing,
		}},
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
	if draft["source_order_no"] != "WL260102" || draft["designer"] != "罗伟" {
		t.Fatalf("expected engineering header fields in BOM draft, got %#v", draft)
	}
	if _, exists := draft["item_count"]; exists {
		t.Fatalf("create response must not report an unloaded list item count: %#v", draft)
	}
	items, ok := draft["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected aggregate save item, got %#v", draft["items"])
	}
	item, ok := items[0].(map[string]any)
	if !ok {
		t.Fatalf("expected aggregate item map, got %#v", items[0])
	}
	if item["piece_count"] != "2" || item["process_method"] != "热裁" || item["production_operation_code"] != biz.ProductionWIPOperationFabricProcessing {
		t.Fatalf("expected engineering item fields in BOM item, got %#v", item)
	}
	if editVersion, ok := draft["edit_version"].(float64); !ok || editVersion <= 0 {
		t.Fatalf("expected positive edit_version, got %#v", draft["edit_version"])
	}

	_, activeRes, err := j.handleBOM(adminCtx, "activate_bom_version", "3", mustJSONRPCStruct(t, map[string]any{"id": float64(headerID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	active := jsonRPCNestedMap(t, activeRes, "bom_version")
	if status := active["status"]; status != biz.BOMStatusActive {
		t.Fatalf("expected active status, got %#v", status)
	}

	_, immutableRes, err := j.handleBOM(adminCtx, "save_bom_with_items", "4", mustJSONRPCStruct(t, map[string]any{
		"id":               float64(headerID),
		"expected_version": active["edit_version"],
		"product_id":       float64(fixtures.productID),
		"version":          "V1",
		"items":            []any{},
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
	if copyVersion["source_order_no"] != "WL260102" || copyVersion["designer"] != "罗伟" {
		t.Fatalf("expected copied engineering header fields, got %#v", copyVersion)
	}
	items, ok = copyVersion["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected copied item, got %#v", copyVersion["items"])
	}
	copiedItem, ok := items[0].(map[string]any)
	if !ok || copiedItem["piece_count"] != "2" || copiedItem["process_base"] != "布底贴12g纸朴" {
		t.Fatalf("expected copied engineering item fields, got %#v", items[0])
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
	listedVersions := listRes.Data.AsMap()["bom_versions"].([]any)
	if len(listedVersions) != 1 || listedVersions[0].(map[string]any)["item_count"] != float64(1) {
		t.Fatalf("expected active BOM item_count=1, got %#v", listedVersions)
	}
}

func TestJsonrpcDispatcher_BOMAPIRequiresDedicatedPermissions(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_bom_permissions")
	j := newBOMJSONRPCTestData(t, data, workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionBOMRead))

	_, createRes, err := j.handleBOM(workflowJSONRPCAdminContext(), "save_bom_with_items", "1", mustJSONRPCStruct(t, map[string]any{
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

func TestJsonrpcDispatcher_BOMAggregateSaveRequiresExpectedVersionAndMapsConflict(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_bom_aggregate_cas")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	j := newBOMJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.EngineeringRoleKey},
		biz.PermissionBOMCreate,
		biz.PermissionBOMUpdate,
	))
	adminCtx := workflowJSONRPCAdminContext()
	baseParams := map[string]any{
		"product_id": float64(fixtures.productID),
		"version":    "CAS-V1",
		"items": []any{map[string]any{
			"material_id": float64(fixtures.materialID),
			"quantity":    "1",
			"unit_id":     float64(fixtures.unitID),
			"loss_rate":   "0",
		}},
	}
	_, createResult, err := j.handleBOM(adminCtx, "save_bom_with_items", "create", mustJSONRPCStruct(t, baseParams))
	if err != nil || createResult == nil || createResult.Code != errcode.OK.Code {
		t.Fatalf("create aggregate BOM result=%#v err=%v", createResult, err)
	}
	created := jsonRPCNestedMap(t, createResult, "bom_version")
	headerID := jsonRPCInt(t, created, "id")
	expectedVersion := created["edit_version"]

	missingExpected := map[string]any{}
	for key, value := range baseParams {
		missingExpected[key] = value
	}
	missingExpected["id"] = float64(headerID)
	_, missingResult, err := j.handleBOM(adminCtx, "save_bom_with_items", "missing", mustJSONRPCStruct(t, missingExpected))
	if err != nil || missingResult == nil || missingResult.Code != errcode.InvalidParam.Code {
		t.Fatalf("missing expected_version result=%#v err=%v", missingResult, err)
	}

	updateParams := map[string]any{}
	for key, value := range baseParams {
		updateParams[key] = value
	}
	updateParams["id"] = float64(headerID)
	updateParams["expected_version"] = expectedVersion
	updateParams["version"] = "CAS-V2"
	_, updateResult, err := j.handleBOM(adminCtx, "save_bom_with_items", "update", mustJSONRPCStruct(t, updateParams))
	if err != nil || updateResult == nil || updateResult.Code != errcode.OK.Code {
		t.Fatalf("update aggregate BOM result=%#v err=%v", updateResult, err)
	}

	updateParams["version"] = "CAS-STALE"
	_, staleResult, err := j.handleBOM(adminCtx, "save_bom_with_items", "stale", mustJSONRPCStruct(t, updateParams))
	if err != nil || staleResult == nil || staleResult.Code != errcode.ResourceVersionConflict.Code || staleResult.Message != errcode.ResourceVersionConflict.Message {
		t.Fatalf("stale aggregate BOM result=%#v err=%v", staleResult, err)
	}
}

func TestJsonrpcDispatcher_BOMAPIRequiresEnabledModule(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_bom_module_gate")
	fixtures := createInventoryTestFixtures(t, ctx, client)

	j := newBOMJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.EngineeringRoleKey},
		biz.PermissionBOMRead,
		biz.PermissionBOMCreate,
		biz.PermissionBOMUpdate,
		biz.PermissionBOMActivate,
	))
	adminCtx := workflowJSONRPCAdminContext()
	createParams := mustJSONRPCStruct(t, map[string]any{
		"product_id": float64(fixtures.productID),
		"version":    "MODULE-GATE-V1",
	})

	readOnlyConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.material-bom-read-only",
		"material_bom",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyConfig)
	_, createRes, err := j.handleBOM(adminCtx, "save_bom_with_items", "read-only-create", createParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only material_bom create rejected, got %#v", createRes)
	}
	_, listRes, err := j.handleBOM(adminCtx, "list_bom_versions", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{
		"product_id": float64(fixtures.productID),
		"limit":      float64(20),
	}))
	if err != nil {
		t.Fatalf("expected nil err listing historical BOM versions, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_bom_versions to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.material-bom-enabled",
		"material_bom",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	enabledCreateParams := map[string]any{
		"product_id": float64(fixtures.productID),
		"version":    "MODULE-GATE-V1",
		"items": []any{map[string]any{
			"material_id": float64(fixtures.materialID),
			"quantity":    "2",
			"unit_id":     float64(fixtures.unitID),
			"loss_rate":   "0",
		}},
	}
	_, createRes, err = j.handleBOM(adminCtx, "save_bom_with_items", "enabled-create", mustJSONRPCStruct(t, enabledCreateParams))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled material_bom create OK, got %#v", createRes)
	}
	headerID := jsonRPCInt(t, jsonRPCNestedMap(t, createRes, "bom_version"), "id")

	disabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.material-bom-disabled",
		"material_bom",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledConfig)
	_, activateRes, err := j.handleBOM(adminCtx, "activate_bom_version", "disabled-activate", mustJSONRPCStruct(t, map[string]any{"id": float64(headerID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if activateRes == nil || activateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled material_bom activate rejected, got %#v", activateRes)
	}
	_, getRes, err := j.handleBOM(adminCtx, "get_bom_version", "read-after-disabled", mustJSONRPCStruct(t, map[string]any{"id": float64(headerID)}))
	if err != nil {
		t.Fatalf("expected nil err reading historical BOM version, got %v", err)
	}
	if getRes == nil || getRes.Code != errcode.OK.Code {
		t.Fatalf("expected get_bom_version to remain available for historical read, got %#v", getRes)
	}
	if status := jsonRPCNestedMap(t, getRes, "bom_version")["status"]; status != biz.BOMStatusDraft {
		t.Fatalf("disabled material_bom must not activate BOM version, got status=%#v", status)
	}
}

func TestJsonrpcDispatcher_BOMRetiredSplitWritesAreUnknown(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "jsonrpc_bom_retired_split_writes")
	j := newBOMJSONRPCTestData(t, data, workflowJSONRPCAdmin(
		[]string{biz.EngineeringRoleKey},
		biz.PermissionBOMCreate,
		biz.PermissionBOMUpdate,
	))
	for _, method := range []string{
		"create_bom_draft",
		"update_bom_draft",
		"add_bom_item",
		"update_bom_item",
		"delete_bom_item",
	} {
		_, result, err := j.handleBOM(workflowJSONRPCAdminContext(), method, method, nil)
		if err != nil {
			t.Fatalf("%s returned transport error: %v", method, err)
		}
		if result == nil || result.Code != errcode.UnknownMethod.Code {
			t.Fatalf("%s must be retired as unknown method, got %#v", method, result)
		}
	}
}

func newBOMJSONRPCTestData(t *testing.T, data *datarepo.Data, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(logger, "module", "service.jsonrpc.bom.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		inventoryUC:      biz.NewInventoryUsecase(datarepo.NewInventoryRepo(data, logger)),
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.material-bom-default-enabled",
		"material_bom",
		"enabled",
	))
	return dispatcher
}
