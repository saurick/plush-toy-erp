package data_test

import (
	"fmt"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/adminuserrole"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/errcode"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func completeIntegrationTask(t *testing.T, caller *integrationRPC, source string, sourceID any, group string) {
	t.Helper()
	listed := requireIntegrationCode(t, caller, "workflow", "list_tasks", map[string]any{"source_type": source, "source_id": sourceID, "task_group": group, "limit": 100}, errcode.OK.Code)
	tasks := listed.Result.Data.AsMap()["tasks"].([]any)
	if len(tasks) != 1 {
		t.Fatalf("%s requires one task, got %d", group, len(tasks))
	}
	task := tasks[0].(map[string]any)
	request := map[string]any{"task_id": task["id"], "expected_version": task["version"], "action_key": "complete", "idempotency_key": "sim-task-" + uuid.NewString(), "payload": map[string]any{"feedback": "来源、数量和结算条件已核对"}}
	requireIntegrationCode(t, caller, "workflow", "complete_task_action", request, errcode.OK.Code)
	requireIntegrationCode(t, caller, "workflow", "complete_task_action", request, errcode.OK.Code)
}

func integrationDownstreamFulfillment(t *testing.T, f *integrationHTTPFixture, sales *integrationRPC, order, line map[string]any, productID, unitID, warehouseID int) {
	t.Helper()
	boss, _ := f.actor(t, biz.BossRoleKey)
	finance, financeID := f.actor(t, biz.FinanceRoleKey)
	warehouse, _ := f.actor(t, biz.WarehouseRoleKey)
	start := map[string]any{"sales_order_id": order["id"], "idempotency_key": "sim-order-start-" + uuid.NewString()}
	start["sales_order_id"] = order["id"].(float64) + .5
	requireIntegrationCode(t, sales, "customer_config", "start_sales_order_acceptance_process", start, errcode.InvalidParam.Code)
	start["sales_order_id"] = order["id"]
	started := requireIntegrationCode(t, sales, "customer_config", "start_sales_order_acceptance_process", start, errcode.OK.Code).Result.Data.AsMap()
	node := started["started_node"].(map[string]any)
	instance := started["process_instance"].(map[string]any)
	startReplay := requireIntegrationCode(t, sales, "customer_config", "start_sales_order_acceptance_process", start, errcode.OK.Code).Result.Data.AsMap()
	if startReplay["process_instance"].(map[string]any)["id"] != instance["id"] {
		t.Fatal("acceptance replay created another process instance")
	}
	submit := map[string]any{
		"process_instance_id": instance["id"], "process_node_instance_id": node["id"], "expected_version": node["version"], "sales_order_id": order["id"], "idempotency_key": "sim-order-submit-" + uuid.NewString(),
	}
	for _, field := range []string{"process_instance_id", "process_node_instance_id", "expected_version", "sales_order_id"} {
		valid := submit[field]
		submit[field] = valid.(float64) + .5
		requireIntegrationCode(t, sales, "customer_config", "execute_sales_order_acceptance_submit", submit, errcode.InvalidParam.Code)
		submit[field] = valid
	}
	requireIntegrationCode(t, sales, "customer_config", "execute_sales_order_acceptance_submit", submit, errcode.OK.Code)
	requireIntegrationCode(t, sales, "customer_config", "execute_sales_order_acceptance_submit", submit, errcode.OK.Code)
	completeIntegrationTask(t, boss, "sales_order", order["id"], "order_approval")
	active := integrationResult(t, requireIntegrationCode(t, sales, "sales_order", "get_sales_order", map[string]any{"id": order["id"]}, errcode.OK.Code), "sales_order")
	if active["lifecycle_status"] != biz.SalesOrderStatusActive {
		t.Fatalf("approved order is not active: %v", active["lifecycle_status"])
	}
	shipment := integrationResult(t, requireIntegrationCode(t, sales, "operational_fact", "create_shipment_with_items", map[string]any{
		"shipment_no": "SIM-SHIP-" + uuid.NewString(), "sales_order_id": order["id"], "customer_id": order["customer_id"], "idempotency_key": "sim-shipment-" + uuid.NewString(), "total_net_weight_g": "100",
		"items": []any{map[string]any{"sales_order_item_id": line["id"], "product_id": productID, "warehouse_id": warehouseID, "unit_id": unitID, "quantity": "10"}},
	}, errcode.OK.Code), "shipment")
	shipmentID := int(shipment["id"].(float64))
	assertFacts := func(quantity string, txns, facts int) {
		t.Helper()
		balance := f.client.InventoryBalance.Query().Where(inventorybalance.SubjectType(biz.InventorySubjectProduct), inventorybalance.SubjectID(productID), inventorybalance.WarehouseID(warehouseID)).OnlyX(t.Context())
		if !balance.Quantity.Equal(decimal.RequireFromString(quantity)) || f.client.InventoryTxn.Query().Where(inventorytxn.SubjectID(productID), inventorytxn.SubjectType(biz.InventorySubjectProduct)).CountX(t.Context()) != txns || f.client.FinanceFact.Query().Where(financefact.SourceType(biz.ShipmentSourceType), financefact.SourceID(shipmentID)).CountX(t.Context()) != facts {
			t.Fatal("downstream inventory or receivable changed outside its domain action")
		}
	}
	arRequest := map[string]any{"shipment_id": shipment["id"], "fact_no": "SIM-AR-" + uuid.NewString(), "idempotency_key": "sim-ar-" + uuid.NewString()}
	requireIntegrationCode(t, finance, "operational_fact", "create_receivable_from_shipment", arRequest, errcode.InvalidParam.Code)
	release := map[string]any{"shipment_id": shipment["id"].(float64) + .5, "idempotency_key": "sim-release-" + uuid.NewString()}
	requireIntegrationCode(t, sales, "customer_config", "start_finished_goods_delivery_process", release, errcode.InvalidParam.Code)
	release["shipment_id"] = shipment["id"]
	requireIntegrationCode(t, sales, "customer_config", "start_finished_goods_delivery_process", release, errcode.OK.Code)
	completeIntegrationTask(t, finance, "shipment", shipment["id"], "shipment_finance_approval")
	// Approval is coordination; inventory and receivables remain unchanged until
	// the owning domain action commits the actual shipment.
	assertFacts("10", 1, 0)
	requireIntegrationCode(t, finance, "operational_fact", "create_receivable_from_shipment", arRequest, errcode.InvalidParam.Code)
	for _, bad := range []any{shipment["id"].(float64) + .5, fmt.Sprint(shipment["id"]), true, nil} {
		requireIntegrationCode(t, sales, "operational_fact", "ship_shipment", map[string]any{"id": bad}, errcode.InvalidParam.Code)
	}
	concurrentIntegrationCalls(t, sales, "operational_fact", "ship_shipment", map[string]any{"id": shipment["id"]})
	assertFacts("0", 2, 0)
	requireIntegrationCode(t, warehouse, "operational_fact", "create_receivable_from_shipment", arRequest, errcode.PermissionDenied.Code)
	for _, bad := range []any{shipment["id"].(float64) + .5, fmt.Sprint(shipment["id"]), true, nil} {
		arRequest["shipment_id"] = bad
		requireIntegrationCode(t, finance, "operational_fact", "create_receivable_from_shipment", arRequest, errcode.InvalidParam.Code)
	}
	arRequest["shipment_id"] = shipment["id"]
	arPair := concurrentIntegrationCalls(t, finance, "operational_fact", "create_receivable_from_shipment", arRequest)
	ar := integrationResult(t, arPair[0], "finance_fact")
	replay := integrationResult(t, arPair[1], "finance_fact")
	if ar["id"] != replay["id"] || ar["amount"] != "12.3" || ar["payment_term_days"] != float64(30) || ar["counterparty_id"] != order["customer_id"] {
		t.Fatalf("source-derived receivable differs: %v", ar)
	}
	arRequest["note"] = "不同核对意图"
	requireIntegrationCode(t, finance, "operational_fact", "create_receivable_from_shipment", arRequest, errcode.IdempotencyConflict.Code)
	delete(arRequest, "note")
	post := map[string]any{"id": ar["id"], "expected_version": ar["version"]}
	concurrentIntegrationCalls(t, finance, "operational_fact", "post_finance_fact", post)
	assertFacts("0", 2, 1)
	stored := f.client.FinanceFact.GetX(t.Context(), int(ar["id"].(float64)))
	shipped := f.client.Shipment.GetX(t.Context(), shipmentID)
	if shipped.ShippedAt == nil {
		t.Fatal("shipment is missing its actual shipment timestamp")
	}
	at := shipped.ShippedAt.UTC()
	due := time.Date(at.Year(), at.Month()+1, 0, at.Hour(), at.Minute(), at.Second(), at.Nanosecond(), time.UTC).AddDate(0, 0, 30)
	if stored.Status != biz.OperationalFactStatusPosted || stored.Version != int(ar["version"].(float64))+1 || !stored.Amount.Equal(decimal.RequireFromString("12.30")) || !stored.OccurredAt.Equal(at) || stored.DueAt == nil || !stored.DueAt.Equal(due) {
		t.Fatal("posted receivable did not preserve the shipment amount and payment snapshot")
	}
	f.client.AdminUserRole.Delete().Where(adminuserrole.AdminUserID(financeID)).ExecX(t.Context())
	requireIntegrationCode(t, finance, "operational_fact", "create_receivable_from_shipment", arRequest, errcode.PermissionDenied.Code)
	requireIntegrationCode(t, finance, "operational_fact", "post_finance_fact", post, errcode.PermissionDenied.Code)
	assertFacts("0", 2, 1)
}
