package service

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"
)

func TestRPCDocumentedBusinessQuickCounts(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "rpc_quick_counts")
	admin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey})
	admin.IsSuperAdmin = true
	d := newBOMJSONRPCTestData(t, data, admin)
	activateOperationalFactTestCustomerConfig(t, d, customerConfigPublishParamsWithRevisionAndModuleState(t, customerConfigPublishParams(t), "quick-counts-production", "production", "enabled"))
	logger := log.NewStdLogger(io.Discard)
	d.operationalFactUC = biz.NewOperationalFactUsecase(datarepo.NewOperationalFactRepo(data, logger))
	raw, err := os.ReadFile("../../cmd/public-contracts/testdata/rpc_examples.json")
	if err != nil {
		t.Fatal(err)
	}
	var examples map[string]documentedRPCExample
	if err := json.Unmarshal(raw, &examples); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"operational_fact.list_production_exceptions"} {
		t.Run(key, func(t *testing.T) {
			example, present := examples[key]
			if !present || example.Verify == nil || example.Verify.Test != "TestRPCDocumentedBusinessQuickCounts" || example.Verify.Case != key {
				t.Fatalf("%s: executable documentation example is not registered", key)
			}
			if example.Params["include_status_counts"] != true {
				t.Fatal("example must request counts")
			}
			t.Run("documented", func(t *testing.T) {
				d.adminReader = stubAdminAccountReader{admin: admin}
				result := businessQuickCountsRPCCall(t, d, workflowJSONRPCAdminContext(), key, example.Params)
				if result.Code != errcode.OK.Code || result.Message != example.Message {
					t.Fatalf("success code=%d message=%s", result.Code, result.Message)
				}
				if err := documentedRPCProjection(example.Data, result.Data.AsMap(), "result.data"); err != nil {
					t.Fatal(err)
				}
				if counts, ok := result.Data.AsMap()["status_counts"].(map[string]any); !ok || len(counts) != 0 {
					t.Fatalf("empty counts=%v", result.Data)
				}
			})
			t.Run("anonymous", func(t *testing.T) {
				d.adminReader = stubAdminAccountReader{admin: admin}
				result := businessQuickCountsRPCCall(t, d, context.Background(), key, example.Params)
				if result.Code != errcode.AuthRequired.Code {
					t.Fatalf("anonymous code=%d", result.Code)
				}
			})
			t.Run("permission_or_account_boundary", func(t *testing.T) {
				d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin(nil)}
				result := businessQuickCountsRPCCall(t, d, workflowJSONRPCAdminContext(), key, example.Params)
				if result.Code != errcode.PermissionDenied.Code {
					t.Fatalf("denied code=%d", result.Code)
				}
			})
			for _, condition := range []string{"counts_omitted", "counts_disabled"} {
				t.Run(condition, func(t *testing.T) {
					d.adminReader = stubAdminAccountReader{admin: admin}
					params := map[string]any{}
					if condition == "counts_disabled" {
						params["include_status_counts"] = false
					}
					result := businessQuickCountsRPCCall(t, d, workflowJSONRPCAdminContext(), key, params)
					if result.Code != errcode.OK.Code {
						t.Fatalf("unrequested code=%d", result.Code)
					}
					if _, exists := result.Data.AsMap()["status_counts"]; exists {
						t.Fatal("unrequested counts present")
					}
				})
			}
			t.Run("invalid_counts_boolean", func(t *testing.T) {
				d.adminReader = stubAdminAccountReader{admin: admin}
				result := businessQuickCountsRPCCall(t, d, workflowJSONRPCAdminContext(), key, map[string]any{"include_status_counts": "true"})
				if result.Code != errcode.InvalidParam.Code {
					t.Fatalf("invalid bool code=%d", result.Code)
				}
			})
			if strings.HasSuffix(key, "list_production_exceptions") {
				t.Run("invalid_handling_status", func(t *testing.T) {
					d.adminReader = stubAdminAccountReader{admin: admin}
					result := businessQuickCountsRPCCall(t, d, workflowJSONRPCAdminContext(), key, map[string]any{"include_status_counts": true, "handling_status": "APPROVED:unknown"})
					if result.Code != errcode.InvalidParam.Code {
						t.Fatalf("invalid projection code=%d", result.Code)
					}
				})
			}
		})
	}
}

func businessQuickCountsRPCCall(t *testing.T, d *jsonrpcDispatcher, ctx context.Context, key string, params map[string]any) *v1.JsonrpcResult {
	t.Helper()
	parts := strings.SplitN(key, ".", 2)
	handler := d.handleOperationalFact
	_, result, err := handler(ctx, parts[1], "counts", mustJSONRPCStruct(t, params))
	if err != nil || result == nil {
		t.Fatalf("result=%v err=%v", result, err)
	}
	return result
}
