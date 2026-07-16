package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

type stubDebugJSONRPCRepo struct{}

func (s stubDebugJSONRPCRepo) SeedBusinessChainDebugData(_ context.Context, plan biz.DebugSeedPlan, _ int) (*biz.DebugBusinessChainSeedResult, error) {
	return &biz.DebugBusinessChainSeedResult{
		ScenarioKey: plan.ScenarioKey,
		DebugRunID:  plan.DebugRunID,
		CreatedRecords: []biz.DebugCreatedRecord{
			{ID: 1, ModuleKey: "project-orders", DocumentNo: "DBG-RUN-API-ORDENG-01", Title: "[DEBUG] API"},
		},
		CreatedTasks: []biz.DebugCreatedTask{
			{ID: 1, TaskCode: "DBG-RUN-API-ORDENG-ENG", TaskGroup: "engineering_material"},
		},
		NextCheckpoints: plan.NextCheckpoints,
		CleanupToken:    plan.CleanupToken,
		Warnings:        plan.Warnings,
	}, nil
}

func (s stubDebugJSONRPCRepo) CleanupBusinessChainDebugData(_ context.Context, in biz.DebugBusinessChainCleanupInput) (*biz.DebugBusinessChainCleanupResult, error) {
	return &biz.DebugBusinessChainCleanupResult{
		DebugRunID:     in.DebugRunID,
		DryRun:         in.DryRun,
		MatchedRecords: []biz.DebugMatchedRecord{},
	}, nil
}

func (s stubDebugJSONRPCRepo) ClearBusinessData(_ context.Context, in biz.DebugBusinessDataClearInput) (*biz.DebugBusinessDataClearResult, error) {
	deletedCounts := map[string]int{}
	deletedTotal := 0
	clearedTableNames := []string{}
	if !in.DryRun {
		deletedCounts["workflow_tasks"] = 2
		deletedTotal = 2
		clearedTableNames = append(clearedTableNames, "workflow_tasks")
	}
	return &biz.DebugBusinessDataClearResult{
		DryRun:            in.DryRun,
		MatchedCounts:     map[string]int{"workflow_tasks": 2},
		MatchedTotal:      2,
		DeletedCounts:     deletedCounts,
		DeletedTotal:      deletedTotal,
		ClearedTableNames: clearedTableNames,
	}, nil
}

func TestJsonrpcDispatcher_DebugSeedAndCleanupDisabledByConfig(t *testing.T) {
	j := newDebugJSONRPCTestData(biz.DebugSafetyConfig{
		Environment:    "local",
		SeedEnabled:    false,
		CleanupEnabled: false,
		CleanupScope:   biz.DebugDefaultCleanupScope,
	})
	ctx := debugJSONRPCAdminContext()
	seedParams := mustStruct(t, map[string]any{
		"scenarioKey": "order_approval_engineering",
		"debugRunId":  "RUN-API01",
	})

	_, seedRes, err := j.handleDebug(ctx, "rebuild_business_chain_scenario", "1", seedParams)
	if err != nil {
		t.Fatalf("seed api returned error: %v", err)
	}
	if seedRes == nil || seedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected seed permission denied, got %#v", seedRes)
	}

	cleanupParams := mustStruct(t, map[string]any{
		"debugRunId": "RUN-API01",
		"dryRun":     true,
	})
	_, cleanupRes, err := j.handleDebug(ctx, "clear_business_chain_scenario", "2", cleanupParams)
	if err != nil {
		t.Fatalf("cleanup api returned error: %v", err)
	}
	if cleanupRes == nil || cleanupRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected cleanup permission denied, got %#v", cleanupRes)
	}

	_, clearRes, err := j.handleDebug(ctx, "clear_business_data", "3", nil)
	if err != nil {
		t.Fatalf("clear business data api returned error: %v", err)
	}
	if clearRes == nil || clearRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected clear business data permission denied, got %#v", clearRes)
	}
}

func TestJsonrpcDispatcher_DebugCleanupRejectsMissingRunID(t *testing.T) {
	j := newDebugJSONRPCTestData(biz.DebugSafetyConfig{
		Environment:    "local",
		CleanupEnabled: true,
		CleanupScope:   biz.DebugDefaultCleanupScope,
	})

	_, res, err := j.handleDebug(debugJSONRPCAdminContext(), "clear_business_chain_scenario", "1", mustStruct(t, map[string]any{
		"dryRun": true,
	}))
	if err != nil {
		t.Fatalf("cleanup api returned error: %v", err)
	}
	if res == nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param, got %#v", res)
	}
}

func TestJsonrpcDispatcher_DebugSeedReturnsScenarioRunRecordsAndTasks(t *testing.T) {
	j := newDebugJSONRPCTestData(biz.DebugSafetyConfig{
		Environment: "local",
		SeedEnabled: true,
	})

	_, res, err := j.handleDebug(debugJSONRPCAdminContext(), "rebuild_business_chain_scenario", "1", mustStruct(t, map[string]any{
		"scenarioKey": "order_approval_engineering",
		"debugRunId":  "RUN-API01",
	}))
	if err != nil {
		t.Fatalf("seed api returned error: %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", res)
	}
	data := res.Data.AsMap()
	if data["scenarioKey"] != "order_approval_engineering" || data["debugRunId"] != "RUN-API01" {
		t.Fatalf("unexpected identity %#v", data)
	}
	if records, ok := data["createdRecords"].([]any); !ok || len(records) == 0 {
		t.Fatalf("expected createdRecords, got %#v", data["createdRecords"])
	}
	if tasks, ok := data["createdTasks"].([]any); !ok || len(tasks) == 0 {
		t.Fatalf("expected createdTasks, got %#v", data["createdTasks"])
	}
}

func TestJsonrpcDispatcher_DebugClearBusinessDataReturnsCounts(t *testing.T) {
	j := newDebugJSONRPCTestData(biz.DebugSafetyConfig{
		Environment:              "local",
		BusinessDataClearEnabled: true,
	})

	_, res, err := j.handleDebug(debugJSONRPCAdminContext(), "clear_business_data", "1", nil)
	if err != nil {
		t.Fatalf("clear business data api returned error: %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", res)
	}
	data := res.Data.AsMap()
	if data["dryRun"] != true || data["matchedTotal"] != float64(2) || data["deletedTotal"] != float64(0) {
		t.Fatalf("unexpected default dry run result %#v", data)
	}
	counts, ok := data["matchedCounts"].(map[string]any)
	if !ok || counts["workflow_tasks"] != float64(2) {
		t.Fatalf("unexpected matchedCounts %#v", data["matchedCounts"])
	}
}

func TestJsonrpcDispatcher_DebugClearBusinessDataRequiresExactConfirmation(t *testing.T) {
	j := newDebugJSONRPCTestData(biz.DebugSafetyConfig{
		Environment:              "local",
		BusinessDataClearEnabled: true,
	})
	ctx := debugJSONRPCAdminContext()

	_, rejected, err := j.handleDebug(ctx, "clear_business_data", "1", mustStruct(t, map[string]any{
		"dryRun":       false,
		"confirmation": "CLEAR_ALL_BUSINESS_DATA",
	}))
	if err != nil {
		t.Fatalf("clear business data rejection returned error: %v", err)
	}
	if rejected == nil || rejected.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid confirmation rejection, got %#v", rejected)
	}

	_, accepted, err := j.handleDebug(ctx, "clear_business_data", "2", mustStruct(t, map[string]any{
		"dryRun":       false,
		"confirmation": biz.DebugBusinessDataClearConfirmation,
	}))
	if err != nil {
		t.Fatalf("clear business data returned error: %v", err)
	}
	if accepted == nil || accepted.Code != errcode.OK.Code {
		t.Fatalf("expected exact confirmation accepted, got %#v", accepted)
	}
	data := accepted.Data.AsMap()
	if data["dryRun"] != false || data["matchedTotal"] != float64(2) || data["deletedTotal"] != float64(2) {
		t.Fatalf("unexpected destructive clear result %#v", data)
	}
}

func TestJsonrpcDispatcher_DebugCapabilitiesDescribeBusinessClearSafety(t *testing.T) {
	j := newDebugJSONRPCTestData(biz.DebugSafetyConfig{
		Environment:              "dev",
		DatabaseName:             "plush_erp_acceptance_20260715_v3_dev",
		BusinessDataClearEnabled: true,
	})

	_, res, err := j.handleDebug(debugJSONRPCAdminContext(), "capabilities", "1", nil)
	if err != nil {
		t.Fatalf("debug capabilities returned error: %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected capabilities OK, got %#v", res)
	}
	data := res.Data.AsMap()
	if data["databaseName"] != "plush_erp_acceptance_20260715_v3_dev" {
		t.Fatalf("missing sanitized database identity %#v", data)
	}
	for _, forbiddenKey := range []string{"dsn", "postgresDsn", "databaseDsn", "databaseUser", "databasePassword"} {
		if _, ok := data[forbiddenKey]; ok {
			t.Fatalf("debug capabilities exposed forbidden connection field %q: %#v", forbiddenKey, data)
		}
	}
	if data["businessDataClearAllowed"] != true || data["businessDataClearDryRunDefault"] != true {
		t.Fatalf("unexpected business clear capabilities %#v", data)
	}
	if data["businessDataClearConfirmation"] != biz.DebugBusinessDataClearConfirmation || data["destructiveRemoteDenied"] != true {
		t.Fatalf("missing business clear confirmation or remote deny contract %#v", data)
	}
}

func newDebugJSONRPCTestData(config biz.DebugSafetyConfig) *jsonrpcDispatcher {
	return &jsonrpcDispatcher{
		log: log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.debug.test")),
		adminReader: stubAdminAccountReader{admin: &biz.AdminUser{
			ID:       7,
			Username: "admin",
			Roles: []biz.AdminRole{
				{Key: biz.DebugOperatorRoleKey, Name: "调试操作员"},
			},
			Permissions: []string{
				biz.PermissionERPBusinessChainDebugRead,
				biz.PermissionDebugBusinessChainRead,
				biz.PermissionDebugBusinessChainRun,
				biz.PermissionDebugSeed,
				biz.PermissionDebugCleanup,
				biz.PermissionDebugBusinessClear,
			},
		}},
		debugUC: biz.NewDebugUsecase(stubDebugJSONRPCRepo{}, config),
	}
}

func debugJSONRPCAdminContext() context.Context {
	return biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
}

func mustStruct(t *testing.T, value map[string]any) *structpb.Struct {
	t.Helper()
	out, err := structpb.NewStruct(value)
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}
	return out
}
