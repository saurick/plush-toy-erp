package data_test

import (
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"net/http"
	"server/internal/biz"
	"server/internal/data"
	"server/internal/data/model/ent"
	"server/internal/errcode"
	"strings"
	"testing"
	"time"
)

func TestSourceDocumentPostgresIntegrationPartnerReadIsolation(t *testing.T) {
	f := newIntegrationHTTP(t)
	f.password = "Sim-" + uuid.NewString()[:12]
	admin, adminID := f.actor(t, biz.SalesRoleKey)
	f.client.AdminUser.UpdateOneID(adminID).SetIsSuperAdmin(true).SaveX(t.Context())
	lines := make([]*ent.PurchaseOrderItem, 2)
	purchases := make([]*ent.PurchaseOrder, 2)
	customers := make([]*ent.Customer, 2)
	sales := make([]*ent.SalesOrder, 2)
	for i := range 2 {
		lines[i], _ = data.IntegrationPurchaseLine(t, f.client)
		purchases[i] = f.client.PurchaseOrder.GetX(t.Context(), lines[i].PurchaseOrderID)
		customers[i] = f.client.Customer.Create().SetCode("SIM-PARTNER-C-" + uuid.NewString()).SetName(fmt.Sprintf("模拟合作客户%c", 'A'+i)).SaveX(t.Context())
		sales[i] = f.client.SalesOrder.Create().SetOrderNo("SIM-PARTNER-SO-" + uuid.NewString()).SetCustomerID(customers[i].ID).SetOrderDate(time.Now()).SetLifecycleStatus(biz.SalesOrderStatusActive).SetNote("内部备注不公开").SaveX(t.Context())
		f.client.SalesOrderItem.Create().SetSalesOrderID(sales[i].ID).SetLineNo(1).SetUnitID(lines[i].UnitID).SetOrderedQuantity(decimal.NewFromInt(3)).SetRequestedProductName("模拟毛绒兔").SetUnitPrice(decimal.RequireFromString("1.25")).SetAmount(decimal.RequireFromString("3.75")).SetSampleNote("内部工程意见").SaveX(t.Context())
	}
	draft := f.client.SalesOrder.Create().SetOrderNo("SIM-PARTNER-DRAFT-" + uuid.NewString()).SetCustomerID(customers[0].ID).SetOrderDate(time.Now()).SetLifecycleStatus(biz.SalesOrderStatusDraft).SaveX(t.Context())
	type actor struct {
		label, kind, username string
		id, own, other        int
		caller                *integrationRPC
	}
	actors := make([]actor, 0, 4)
	for _, kind := range []string{"supplier", "customer"} {
		for i := range 2 {
			name := "sim_partner_" + strings.ReplaceAll(uuid.NewString(), "-", "")
			request := map[string]any{"display_name": fmt.Sprintf("模拟%s%c", kind, 'A'+i), "username": name, "password": f.password, "account_kind": kind}
			own, other := sales[i].ID, sales[1-i].ID
			if kind == "supplier" {
				request["supplier_id"] = purchases[i].SupplierID
				own, other = purchases[i].ID, purchases[1-i].ID
			} else {
				request["customer_id"] = customers[i].ID
			}
			created := requireIntegrationCode(t, admin, "admin", "create_partner", request, errcode.OK.Code).Result.Data.AsMap()["partner"].(map[string]any)
			caller := &integrationRPC{endpoint: f.endpoint, client: &http.Client{Timeout: 10 * time.Second}}
			login := requireIntegrationCode(t, caller, "auth", "partner_login", map[string]any{"username": name, "password": f.password}, errcode.OK.Code)
			caller.token = login.Result.Data.AsMap()["access_token"].(string)
			actors = append(actors, actor{label: fmt.Sprintf("%s_%c", kind, 'A'+i), kind: kind, username: name, id: int(created["id"].(float64)), own: own, other: other, caller: caller})
		}
	}
	beforeInventory, beforeFinance := f.client.InventoryTxn.Query().CountX(t.Context()), f.client.FinanceFact.Query().CountX(t.Context())
	t.Run("database_binding_constraints", func(t *testing.T) {
		for _, change := range []func(*ent.AdminUserCreate){
			func(q *ent.AdminUserCreate) { q.SetAccountKind(1) },
			func(q *ent.AdminUserCreate) { q.SetAccountKind(9) },
			func(q *ent.AdminUserCreate) {
				q.SetAccountKind(1).SetSupplierID(purchases[0].SupplierID).SetCustomerID(customers[0].ID)
			},
			func(q *ent.AdminUserCreate) {
				q.SetAccountKind(1).SetSupplierID(purchases[0].SupplierID).SetIsSuperAdmin(true)
			},
			func(q *ent.AdminUserCreate) { q.SetAccountKind(2).SetCustomerID(999999999) },
		} {
			q := f.client.AdminUser.Create().SetUsername("sim_invalid_db_" + uuid.NewString()).SetPasswordHash("fixture-not-a-login")
			change(q)
			if _, err := q.Save(t.Context()); !ent.IsConstraintError(err) {
				t.Fatalf("binding must fail at database boundary: %v", err)
			}
		}
	})
	for _, a := range actors {
		t.Run(a.label, func(t *testing.T) {
			list, get, key := "list_sales_orders", "get_sales_order", "sales_orders"
			if a.kind == "supplier" {
				list, get, key = "list_purchase_orders", "get_purchase_order", "purchase_orders"
			}
			me := requireIntegrationCode(t, a.caller, "partner", "me", map[string]any{}, errcode.OK.Code).Result.Data.AsMap()["partner"].(map[string]any)
			if me["account_kind"] != a.kind {
				t.Fatal("identity kind mismatch")
			}
			listed := requireIntegrationCode(t, a.caller, "partner", list, map[string]any{"limit": 1, "offset": 0}, errcode.OK.Code).Result.Data.AsMap()
			rows := listed[key].([]any)
			if listed["total"] != float64(1) || len(rows) != 1 || rows[0].(map[string]any)["id"] != float64(a.own) {
				t.Fatal("list or count escaped ownership")
			}
			detail := requireIntegrationCode(t, a.caller, "partner", get, map[string]any{"id": a.own}, errcode.OK.Code).Result.Data.AsMap()
			if len(detail["items"].([]any)) != 1 {
				t.Fatal("authorized detail is missing its line")
			}
			encoded, _ := json.Marshal(detail)
			for _, forbidden := range []string{"note", "sample_bom_id", "engineering_status", "import_source", "settled_by", "product_order_no_snapshot", "内部备注", "内部工程意见"} {
				if strings.Contains(string(encoded), forbidden) {
					t.Fatalf("private field leaked: %s", forbidden)
				}
			}
			foreign, err := a.caller.call(t.Context(), "partner", get, map[string]any{"id": a.other})
			if err != nil {
				t.Fatal(err)
			}
			missing, err := a.caller.call(t.Context(), "partner", get, map[string]any{"id": 999999999})
			if err != nil {
				t.Fatal(err)
			}
			if foreign.Result.Code == 0 || missing.Result.Code != foreign.Result.Code || foreign.Result.Data != nil || foreign.Result.Message != missing.Result.Message {
				t.Fatal("foreign object must be indistinguishable from missing")
			}
			for _, field := range []string{"supplier_id", "customer_id", "customer_key", "actor_id", "role", "account_kind", "ids"} {
				requireIntegrationCode(t, a.caller, "partner", list, map[string]any{field: a.other}, errcode.InvalidParam.Code)
			}
			otherOrderNo := sales[0].OrderNo
			if a.kind == "supplier" {
				otherOrderNo = purchases[0].PurchaseOrderNo
			}
			if a.own == sales[0].ID && a.kind == "customer" {
				otherOrderNo = sales[1].OrderNo
			}
			if a.own == purchases[0].ID && a.kind == "supplier" {
				otherOrderNo = purchases[1].PurchaseOrderNo
			}
			search := requireIntegrationCode(t, a.caller, "partner", list, map[string]any{"keyword": otherOrderNo}, errcode.OK.Code).Result.Data.AsMap()
			if search["total"] != float64(0) || len(search[key].([]any)) != 0 {
				t.Fatal("search leaked another organization")
			}
			for _, probe := range []struct{ domain, method string }{{"admin", "list"}, {"admin", "create_partner"}, {"auth", "me"}, {"masterdata", "list_customers"}, {"sales_order", "get_sales_order"}, {"sales_order", "save_sales_order_with_items"}, {"purchase_order", "get_purchase_order"}, {"purchase", "post_purchase_receipt"}, {"quality", "pass_quality_inspection"}, {"operational_fact", "ship_shipment"}, {"operational_fact", "post_finance_fact"}, {"workflow", "list_tasks"}, {"customer_config", "get_effective_session"}, {"attachment", "list_attachments"}, {"attachment", "download_attachment"}, {"debug", "ping"}, {"inventory", "list_inventory_balances"}, {"bom", "get_bom"}, {"production_order", "list_production_orders"}} {
				requireIntegrationCode(t, a.caller, probe.domain, probe.method, map[string]any{"id": a.other}, errcode.PermissionDenied.Code)
			}
			request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, f.endpoint+"/templates/render-pdf", strings.NewReader("{}"))
			if err != nil {
				t.Fatal(err)
			}
			request.Header.Set("Authorization", "Bearer "+a.caller.token)
			request.Header.Set("Content-Type", "application/json")
			response, err := a.caller.client.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			_ = response.Body.Close()
			if response.StatusCode != http.StatusUnauthorized {
				t.Fatalf("partner PDF route status=%d", response.StatusCode)
			}
			wrong := "list_purchase_orders"
			if a.kind == "supplier" {
				wrong = "list_sales_orders"
			}
			requireIntegrationCode(t, a.caller, "partner", wrong, map[string]any{}, errcode.PermissionDenied.Code)
			noLogin := &integrationRPC{endpoint: f.endpoint, client: a.caller.client}
			requireIntegrationCode(t, noLogin, "auth", "admin_login", map[string]any{"username": a.username, "password": f.password}, errcode.AuthLoginRejected.Code)
		})
	}
	requireIntegrationCode(t, actors[2].caller, "partner", "get_sales_order", map[string]any{"id": draft.ID}, errcode.InvalidParam.Code)
	t.Run("employee_boundary_and_binding", func(t *testing.T) {
		requireIntegrationCode(t, admin, "partner", "list_sales_orders", map[string]any{}, errcode.PermissionDenied.Code)
		listed := requireIntegrationCode(t, admin, "admin", "list", map[string]any{}, errcode.OK.Code).Result.Data.AsMap()["admins"].([]any)
		for _, row := range listed {
			for _, a := range actors {
				if row.(map[string]any)["id"] == float64(a.id) {
					t.Fatal("partner entered employee directory")
				}
			}
		}
		requireIntegrationCode(t, admin, "admin", "set_roles", map[string]any{"id": actors[0].id, "role_keys": []any{biz.SalesRoleKey}}, errcode.PermissionDenied.Code)
		before := f.client.AdminUser.Query().CountX(t.Context())
		for _, params := range []map[string]any{{"account_kind": "supplier", "supplier_id": purchases[0].SupplierID, "customer_id": customers[0].ID}, {"account_kind": "supplier", "supplier_id": 0}, {"account_kind": "customer", "customer_id": 999999999}, {"account_kind": "employee"}, {"account_kind": "supplier", "supplier_id": purchases[0].SupplierID, "role_keys": []any{biz.SalesRoleKey}}} {
			params["username"] = "sim_invalid_" + uuid.NewString()
			params["display_name"] = "模拟非法绑定"
			params["password"] = f.password
			reply, err := admin.call(t.Context(), "admin", "create_partner", params)
			if err != nil || reply.Result.Code == 0 {
				t.Fatal("invalid binding accepted")
			}
		}
		if f.client.AdminUser.Query().CountX(t.Context()) != before {
			t.Fatal("invalid binding left an account")
		}
	})
	t.Run("disable_reset_organization_and_logout", func(t *testing.T) {
		requireIntegrationCode(t, admin, "admin", "set_disabled", map[string]any{"id": actors[0].id, "disabled": true, "reason": "模拟合作访问撤回"}, errcode.OK.Code)
		requireIntegrationCode(t, actors[0].caller, "partner", "me", map[string]any{}, errcode.AuthInvalid.Code)
		requireIntegrationCode(t, admin, "admin", "set_disabled", map[string]any{"id": actors[0].id, "disabled": false, "reason": "模拟重新授权"}, errcode.OK.Code)
		requireIntegrationCode(t, actors[0].caller, "partner", "me", map[string]any{}, errcode.AuthInvalid.Code)
		supplier := f.client.Supplier.GetX(t.Context(), purchases[1].SupplierID)
		requireIntegrationCode(t, admin, "masterdata", "set_supplier_active", map[string]any{"id": supplier.ID, "active": false}, errcode.OK.Code)
		requireIntegrationCode(t, actors[1].caller, "partner", "me", map[string]any{}, errcode.AuthInvalid.Code)
		requireIntegrationCode(t, admin, "admin", "reset_password", map[string]any{"id": actors[2].id, "password": "SimReset-" + uuid.NewString()[:8]}, errcode.OK.Code)
		requireIntegrationCode(t, actors[2].caller, "partner", "me", map[string]any{}, errcode.AuthInvalid.Code)
		requireIntegrationCode(t, actors[3].caller, "auth", "logout", map[string]any{}, errcode.OK.Code)
		requireIntegrationCode(t, actors[3].caller, "partner", "me", map[string]any{}, errcode.AuthInvalid.Code)
	})
	if f.client.InventoryTxn.Query().CountX(t.Context()) != beforeInventory || f.client.FinanceFact.Query().CountX(t.Context()) != beforeFinance {
		t.Fatal("read-only partner calls changed facts")
	}
	for i, order := range sales {
		if f.client.SalesOrder.GetX(t.Context(), order.ID).Version != sales[i].Version {
			t.Fatal("partner read changed order version")
		}
	}
}
