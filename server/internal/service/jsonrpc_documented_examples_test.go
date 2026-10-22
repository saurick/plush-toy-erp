package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

type documentedRPCExample struct {
	Params  map[string]any `json:"params"`
	Data    any            `json:"data"`
	Message string         `json:"message"`
	Verify  *struct {
		Test string `json:"test"`
		Case string `json:"case"`
	} `json:"verification"`
}

func documentedRPCProjection(expected, actual any, path string) error {
	switch want := expected.(type) {
	case map[string]any:
		got, ok := actual.(map[string]any)
		if !ok {
			return fmt.Errorf("%s: expected object, got %T", path, actual)
		}
		for key, value := range want {
			found, present := got[key]
			if !present {
				return fmt.Errorf("%s.%s: missing field", path, key)
			}
			if err := documentedRPCProjection(value, found, path+"."+key); err != nil {
				return err
			}
		}
	case []any:
		got, ok := actual.([]any)
		if !ok || len(got) < len(want) || len(want) == 0 && len(got) != 0 {
			return fmt.Errorf("%s: example array does not match actual response", path)
		}
		for i, value := range want {
			if err := documentedRPCProjection(value, got[i], fmt.Sprintf("%s[%d]", path, i)); err != nil {
				return err
			}
		}
	default:
		if !reflect.DeepEqual(expected, actual) {
			return fmt.Errorf("%s: example value or type differs from actual response (expected %T, got %T)", path, expected, actual)
		}
	}
	return nil
}

// The repository returns deterministic domain fixtures. Requests still pass
// through the real handler, authorization, usecase and JSON serialization.
type documentedInventoryRepo struct{ biz.InventoryRepo }

func (*documentedInventoryRepo) ListInventoryLotsForAccess(context.Context, biz.InventoryLotFilter, biz.WarehouseDataScope) ([]*biz.InventoryLot, int, error) {
	at := time.Date(2026, 6, 17, 8, 0, 0, 0, time.UTC)
	return []*biz.InventoryLot{{ID: 1, StockCategory: "MAIN", SubjectType: "MATERIAL", SubjectID: 1, LotNo: "INV-LEDGER-LOT-001", SupplierLotNo: inventoryStringPtr("SUP-LOT-001"), Status: "ACTIVE", Version: 1, ReceivedAt: &at, CreatedAt: at, UpdatedAt: at}}, 1, nil
}

func (*documentedInventoryRepo) ListInventoryBalancesForAccess(context.Context, biz.InventoryBalanceFilter, biz.WarehouseDataScope) ([]*biz.InventoryBalance, int, error) {
	return []*biz.InventoryBalance{{ID: 2, SubjectType: "PRODUCT", SubjectID: 1, WarehouseID: 2, UnitID: 1, Quantity: decimal.RequireFromString("12.5"), ActiveReservedQuantity: decimal.NewFromInt(4), AvailableQuantity: decimal.RequireFromString("8.5"), ReadyToShipQuantity: decimal.RequireFromString("8.5"), UpdatedAt: time.Date(2026, 6, 17, 8, 0, 0, 0, time.UTC)}}, 1, nil
}

func (*documentedInventoryRepo) ListInventoryTxnsForAccess(context.Context, biz.InventoryTxnFilter, biz.WarehouseDataScope) ([]*biz.InventoryTxn, int, error) {
	lotID, sourceID, lineID, actorID := 1, 77, 88, 9
	return []*biz.InventoryTxn{{ID: 1, StockCategory: "MAIN", SubjectType: "MATERIAL", SubjectID: 1, WarehouseID: 1, LotID: &lotID, TxnType: "IN", Direction: 1, Quantity: decimal.RequireFromString("12.5"), UnitID: 1, SourceType: "MANUAL_SEED", SourceID: &sourceID, SourceLineID: &lineID, IdempotencyKey: "test-1", OccurredAt: time.Date(2026, 6, 17, 9, 30, 0, 0, time.UTC), CreatedAt: time.Date(2026, 6, 17, 8, 0, 0, 0, time.UTC), CreatedBy: &actorID, Note: inventoryStringPtr("ledger seed")}}, 1, nil
}

func documentedRPCFixture(t *testing.T, key string) (*jsonrpcDispatcher, context.Context) {
	t.Helper()
	if key == "sales_order.export_sales_orders" {
		d, _ := salesOrderExportRPCFixture(t, biz.PermissionSalesOrderRead)
		return d, workflowJSONRPCAdminContext()
	}
	logger := log.NewStdLogger(io.Discard)
	if strings.HasPrefix(key, "inventory.") {
		return &jsonrpcDispatcher{log: log.NewHelper(logger), adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWarehouseInventoryRead)}, adminManageUC: newAllWarehouseScopeAdminUsecase(), inventoryUC: biz.NewInventoryUsecase(&documentedInventoryRepo{})}, workflowJSONRPCAdminContext()
	}
	repo := newMemAdminManageRepoForData()
	actor := &biz.AdminUser{ID: 1, Username: "admin", Permissions: []string{biz.PermissionSystemAuditRead}}
	if key == "admin.set_role_settings" {
		actor.Username = "operator"
		actor.Roles = []biz.AdminRole{{Key: biz.AdminRoleKey}}
		actor.Permissions = []string{biz.PermissionSystemRolePermissionManage}
	}
	if key == "admin.me" {
		actor.Username = "employee"
		actor.Permissions = nil
		actor.ERPPreferences = biz.AdminERPPreferences{
			ColumnOrders: map[string][]string{"customers": {"name"}}, HiddenColumns: map[string][]string{"customers": {"status"}},
			Appearance: biz.AdminERPAppearance{ThemeMode: "dark", Accent: "purple", Density: "compact", TableLines: "grid"},
		}
	}
	repo.admins[1] = actor
	at := time.Date(2026, 10, 19, 15, 16, 22, 0, time.FixedZone("CST", 8*60*60))
	repo.auditLogs = []biz.RuntimeAuditEvent{{ID: 1, EventType: "admin_control_plane", EventKey: "admin_user.password.reset", Source: "admin_manage", Payload: map[string]any{"action": "admin_user.password.reset", "actor": map[string]any{"username": "admin"}, "target": map[string]any{"type": "admin_user", "key": "demo_debug"}, "before": map[string]any{"password_reset": false}, "after": map[string]any{"password_reset": true}}, CreatedAt: at}}
	return &jsonrpcDispatcher{log: log.NewHelper(logger), adminReader: repo, adminManageUC: biz.NewAdminManageUsecase(repo, logger, nil)}, biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: actor.Username, Role: biz.RoleAdmin})
}

func documentedRPCCall(t *testing.T, dispatcher *jsonrpcDispatcher, ctx context.Context, key string, params map[string]any) *v1.JsonrpcResult {
	t.Helper()
	domain, method, _ := strings.Cut(key, ".")
	input, err := structpb.NewStruct(params)
	if err != nil {
		t.Fatal(err)
	}
	var result *v1.JsonrpcResult
	if domain == "inventory" {
		_, result, err = dispatcher.handleInventory(ctx, method, "documented-example", input)
	} else if domain == "sales_order" {
		_, result, err = dispatcher.Handle(ctx, domain, "2.0", method, "documented-example", input)
	} else {
		_, result, err = dispatcher.handleAdmin(ctx, method, "documented-example", input)
	}
	if err != nil || result == nil {
		t.Fatalf("%s: handler returned nil or transport error: %v", key, err)
	}
	return result
}

func TestRPCDocumentedExamples(t *testing.T) {
	raw, err := os.ReadFile("../../cmd/public-contracts/testdata/rpc_examples.json")
	if err != nil {
		t.Fatal(err)
	}
	var examples map[string]documentedRPCExample
	if err := json.Unmarshal(raw, &examples); err != nil {
		t.Fatal(err)
	}
	registered := []string{"admin.audit_logs", "admin.me", "admin.set_role_settings", "inventory.list_inventory_balances", "inventory.list_inventory_lots", "inventory.list_inventory_txns", "sales_order.export_sales_orders"}
	for _, key := range registered {
		t.Run(key, func(t *testing.T) {
			example, present := examples[key]
			if !present || example.Verify == nil || example.Verify.Test != "TestRPCDocumentedExamples" || example.Verify.Case != key {
				t.Fatalf("%s: executable documentation example is not registered", key)
			}
			t.Run("documented", func(t *testing.T) {
				dispatcher, ctx := documentedRPCFixture(t, key)
				result := documentedRPCCall(t, dispatcher, ctx, key, example.Params)
				if result.Code != errcode.OK.Code || result.Message != example.Message {
					t.Fatalf("%s: expected documented success, got code=%d message=%s", key, result.Code, result.Message)
				}
				if err := documentedRPCProjection(example.Data, result.Data.AsMap(), "result.data"); err != nil {
					t.Fatal(err)
				}
			})
			t.Run("anonymous", func(t *testing.T) {
				dispatcher, _ := documentedRPCFixture(t, key)
				result := documentedRPCCall(t, dispatcher, context.Background(), key, example.Params)
				if result.Code != errcode.AuthRequired.Code {
					t.Fatalf("expected AuthRequired, got %d", result.Code)
				}
			})
			t.Run("permission_or_account_boundary", func(t *testing.T) {
				dispatcher, ctx := documentedRPCFixture(t, key)
				actor := workflowJSONRPCAdmin(nil)
				want := errcode.PermissionDenied.Code
				if key == "admin.me" {
					actor.Disabled = true
					want = errcode.AdminDisabled.Code
				}
				dispatcher.adminReader = stubAdminAccountReader{admin: actor}
				result := documentedRPCCall(t, dispatcher, ctx, key, example.Params)
				if result.Code != want {
					t.Fatalf("expected permission/account denial %d, got %d", want, result.Code)
				}
			})
			if key == "inventory.list_inventory_lots" || key == "inventory.list_inventory_txns" {
				t.Run("invalid_date", func(t *testing.T) {
					dispatcher, ctx := documentedRPCFixture(t, key)
					result := documentedRPCCall(t, dispatcher, ctx, key, map[string]any{"date_from": "not-a-date"})
					if result.Code != errcode.InvalidParam.Code {
						t.Fatalf("expected InvalidParam, got %d", result.Code)
					}
				})
			}
			if key == "admin.set_role_settings" {
				t.Run("stale_version", func(t *testing.T) {
					dispatcher, ctx := documentedRPCFixture(t, key)
					first := documentedRPCCall(t, dispatcher, ctx, key, example.Params)
					if first.Code != errcode.OK.Code {
						t.Fatalf("first role update failed: %d", first.Code)
					}
					result := documentedRPCCall(t, dispatcher, ctx, key, example.Params)
					if result.Code != errcode.ResourceVersionConflict.Code {
						t.Fatalf("expected version conflict, got %d", result.Code)
					}
				})
				for _, condition := range []string{"missing_version", "null_version"} {
					t.Run(condition, func(t *testing.T) {
						dispatcher, ctx := documentedRPCFixture(t, key)
						params := make(map[string]any, len(example.Params))
						for name, value := range example.Params {
							params[name] = value
						}
						delete(params, "expected_version")
						if condition == "null_version" {
							params["expected_version"] = nil
						}
						result := documentedRPCCall(t, dispatcher, ctx, key, params)
						if result.Code != errcode.InvalidParam.Code {
							t.Fatalf("expected invalid version, got %d", result.Code)
						}
					})
				}
			}
		})
	}
	for key, example := range examples {
		if example.Verify != nil && example.Verify.Test == "TestRPCDocumentedExamples" {
			found := false
			for _, actual := range registered {
				found = found || actual == key
			}
			if !found {
				t.Fatalf("%s: registered example has no executable fixture", key)
			}
		}
	}
}

func TestRPCDocumentedProjectionRejectsSemanticDrift(t *testing.T) {
	want := map[string]any{"total": float64(24), "row": map[string]any{"note": nil}, "items": []any{map[string]any{"quantity": "12.5"}}}
	for _, actual := range []any{
		map[string]any{"total": "24", "row": map[string]any{"note": nil}, "items": []any{map[string]any{"quantity": "12.5"}}},
		map[string]any{"total": float64(24), "row": map[string]any{}, "items": []any{map[string]any{"quantity": "12.5"}}},
		map[string]any{"total": float64(24), "row": map[string]any{"note": nil}, "items": []any{map[string]any{"quantity": "99"}}},
	} {
		if documentedRPCProjection(want, actual, "data") == nil {
			t.Fatal("type, missing-null or business-value drift was accepted")
		}
	}
}
