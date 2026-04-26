package data

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
		DebugRunID: in.DebugRunID,
		DryRun:     in.DryRun,
		MatchedRecords: []biz.DebugMatchedRecord{
			{ID: 1, ModuleKey: "project-orders", DocumentNo: "DBG-RUN-API-ORDENG-01"},
		},
	}, nil
}

func (s stubDebugJSONRPCRepo) ClearBusinessData(_ context.Context) (*biz.DebugBusinessDataClearResult, error) {
	return &biz.DebugBusinessDataClearResult{
		DeletedCounts: map[string]int{
			"business_records": 4,
			"workflow_tasks":   2,
		},
		DeletedTotal:      6,
		ClearedTableNames: []string{"workflow_tasks", "business_records"},
	}, nil
}

func TestJsonrpcData_DebugSeedAndCleanupDisabledByConfig(t *testing.T) {
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

func TestJsonrpcData_DebugCleanupRejectsMissingRunID(t *testing.T) {
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

func TestJsonrpcData_DebugSeedReturnsScenarioRunRecordsAndTasks(t *testing.T) {
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

func TestJsonrpcData_DebugClearBusinessDataReturnsCounts(t *testing.T) {
	j := newDebugJSONRPCTestData(biz.DebugSafetyConfig{
		Environment:    "local",
		CleanupEnabled: true,
		CleanupScope:   biz.DebugDefaultCleanupScope,
	})

	_, res, err := j.handleDebug(debugJSONRPCAdminContext(), "clear_business_data", "1", nil)
	if err != nil {
		t.Fatalf("clear business data api returned error: %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", res)
	}
	data := res.Data.AsMap()
	if data["deletedTotal"] != float64(6) {
		t.Fatalf("unexpected deletedTotal %#v", data)
	}
	counts, ok := data["deletedCounts"].(map[string]any)
	if !ok || counts["business_records"] != float64(4) {
		t.Fatalf("unexpected deletedCounts %#v", data["deletedCounts"])
	}
}

func newDebugJSONRPCTestData(config biz.DebugSafetyConfig) *JsonrpcData {
	return &JsonrpcData{
		log: log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "data.jsonrpc.debug.test")),
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
