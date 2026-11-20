package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

type documentedProductionOrderCall struct {
	Request struct {
		JSONRPC string         `json:"jsonrpc"`
		Method  string         `json:"method"`
		Params  map[string]any `json:"params"`
		ID      string         `json:"id"`
	}
	Response map[string]any
}

func readDocumentedProductionOrderCalls(t *testing.T) map[string]*documentedProductionOrderCall {
	t.Helper()
	content, err := os.ReadFile("../../docs/api.md")
	if err != nil {
		t.Fatal(err)
	}
	calls := make(map[string]*documentedProductionOrderCall)
	scanner := bufio.NewScanner(strings.NewReader(string(content)))
	var method, section string
	var block []string
	inJSON := false
	for scanner.Scan() {
		line := scanner.Text()
		if inJSON {
			if line != "```" {
				block = append(block, line)
				continue
			}
			inJSON = false
			if method == "" {
				continue
			}
			call := calls[method]
			if call == nil {
				call = &documentedProductionOrderCall{}
				calls[method] = call
			}
			var err error
			switch section {
			case "请求参数":
				err = json.Unmarshal([]byte(strings.Join(block, "\n")), &call.Request)
			case "返回结果":
				err = json.Unmarshal([]byte(strings.Join(block, "\n")), &call.Response)
			}
			if err != nil {
				t.Fatalf("%s %s: %v", method, section, err)
			}
			continue
		}
		if strings.HasPrefix(line, "#### ") {
			method = ""
			if _, tail, found := strings.Cut(line, "`production_order."); found {
				method, _, _ = strings.Cut(tail, "`")
			}
		} else if strings.HasPrefix(line, "### ") {
			method = ""
		} else if strings.HasPrefix(line, "##### ") {
			section = strings.TrimPrefix(line, "##### ")
		} else if line == "```json" {
			inJSON = true
			block = nil
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if inJSON || len(calls) != 8 {
		t.Fatalf("incomplete production documentation: %d methods, open fence=%v", len(calls), inJSON)
	}
	return calls
}

// Projections can omit audit fields, but their fields and types must exist in
// the real handler response.
func assertProductionDocumentProjection(t *testing.T, path string, expected, actual any) {
	t.Helper()
	switch sample := expected.(type) {
	case map[string]any:
		value, ok := actual.(map[string]any)
		if !ok {
			t.Fatalf("%s: expected object, got %T", path, actual)
		}
		for key, child := range sample {
			got, exists := value[key]
			if !exists {
				t.Fatalf("%s.%s: documented field absent", path, key)
			}
			assertProductionDocumentProjection(t, path+"."+key, child, got)
		}
	case []any:
		value, ok := actual.([]any)
		if !ok {
			t.Fatalf("%s: expected array, got %T", path, actual)
		}
		if len(sample) > 0 {
			if len(value) == 0 {
				t.Fatalf("%s: expected a projected array item", path)
			}
			assertProductionDocumentProjection(t, path+"[]", sample[0], value[0])
		}
	case string:
		if _, ok := actual.(string); !ok {
			t.Fatalf("%s: expected string, got %T", path, actual)
		}
	case float64:
		if _, ok := actual.(float64); !ok {
			t.Fatalf("%s: expected JSON number, got %T", path, actual)
		}
	default:
		t.Fatalf("%s: unsupported projection type %T", path, expected)
	}
}

func TestProductionOrderDocumentedRequestsAndResponseProjections(t *testing.T) {
	calls := readDocumentedProductionOrderCalls(t)
	d, productID, unitID, bomID := newProductionOrderJSONRPCTestData(t,
		biz.PermissionPMCPlanRead, biz.PermissionPMCPlanCreate, biz.PermissionPMCPlanUpdate,
		biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskComplete,
	)
	ctx := workflowJSONRPCAdminContext()
	run := func(method string, orderID, version int) *v1.JsonrpcResult {
		t.Helper()
		call := calls[method]
		if call == nil || call.Request.JSONRPC != "2.0" || call.Request.Method != method || call.Request.ID == "" {
			t.Fatalf("%s: invalid documented envelope", method)
		}
		raw, _ := json.Marshal(call.Request.Params)
		var params map[string]any
		if err := json.Unmarshal(raw, &params); err != nil {
			t.Fatal(err)
		}
		if _, exists := params["production_order_id"]; exists {
			params["production_order_id"] = float64(orderID)
		}
		if _, exists := params["expected_version"]; exists {
			params["expected_version"] = float64(version)
		}
		if items, ok := params["items"].([]any); ok {
			for _, rawItem := range items {
				item := rawItem.(map[string]any)
				item["product_id"], item["unit_id"], item["bom_header_id"] = float64(productID), float64(unitID), float64(bomID)
			}
		}
		_, result, err := d.handleProductionOrder(ctx, method, call.Request.ID, mustJSONRPCStruct(t, params))
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("%s: documented request failed: %#v %v", method, result, err)
		}
		sample, ok := call.Response["result"].(map[string]any)
		if !ok || sample["code"] != float64(0) {
			t.Fatalf("%s: invalid documented response", method)
		}
		assertProductionDocumentProjection(t, method+".result.data", sample["data"], result.Data.AsMap())
		return result
	}

	created := run("create_production_order", 0, 0)
	orderID := jsonRPCInt(t, jsonRPCNestedMap(t, created, "production_order"), "id")
	run("get_production_order", orderID, 1)
	run("list_production_orders", orderID, 1)
	run("list_production_order_reference_options", orderID, 1)
	saved := run("save_production_order", orderID, 1)
	version := jsonRPCInt(t, jsonRPCNestedMap(t, saved, "production_order"), "version")
	released := run("release_production_order", orderID, version)
	version = jsonRPCInt(t, jsonRPCNestedMap(t, released, "production_order"), "version")
	_, tasks, err := d.handleWorkflow(ctx, "list_tasks", "doc-source-tasks", mustJSONRPCStruct(t, map[string]any{
		"task_group":  biz.WorkflowSourceTaskProductionSchedulingGroup,
		"source_type": biz.WorkflowSourceTaskProductionOrderSourceType, "source_id": float64(orderID),
		"limit": float64(20),
	}))
	if err != nil || tasks.Code != errcode.OK.Code {
		t.Fatalf("read source task: %#v %v", tasks, err)
	}
	for _, value := range tasks.Data.AsMap()["tasks"].([]any) {
		task := value.(map[string]any)
		_, completed, err := d.handleWorkflow(ctx, "complete_task_action", "doc-complete-task", mustJSONRPCStruct(t, map[string]any{
			"task_id": task["id"], "expected_version": task["version"],
			"idempotency_key": "doc-complete-scheduling", "action_key": "complete",
			"payload": map[string]any{"feedback": "模拟排产确认"},
		}))
		if err != nil || completed.Code != errcode.OK.Code {
			t.Fatalf("complete source task: %#v %v", completed, err)
		}
	}
	wip, err := d.productionOrderUC.GetProductionWIP(ctx, orderID)
	if err != nil {
		t.Fatal(err)
	}
	reason := "模拟短关闭，撤销未开工批次"
	for _, batch := range wip.Batches {
		_, err := d.productionOrderUC.CancelProductionWIPBatch(ctx, &biz.ProductionWIPAction{
			ProductionOrderID: orderID, BatchID: batch.ID, ExpectedVersion: batch.Version,
			ActorID: 7, IdempotencyKey: fmt.Sprintf("doc-cancel-unstarted-%d", batch.ID), Reason: &reason,
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	run("close_production_order", orderID, version)

	params := productionOrderCreateParams(productID, unitID, bomID, "doc-cancel-source")
	params["order_no"] = "MO-DEMO-CANCEL"
	_, cancelSource, err := d.handleProductionOrder(ctx, "create_production_order", "doc-cancel-source", mustJSONRPCStruct(t, params))
	if err != nil || cancelSource.Code != errcode.OK.Code {
		t.Fatalf("create cancel source: %#v %v", cancelSource, err)
	}
	run("cancel_production_order", jsonRPCInt(t, jsonRPCNestedMap(t, cancelSource, "production_order"), "id"), 1)
}
