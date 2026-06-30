package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestPurchaseReceiptProcessDomainCommandCreateBindsUsecase(t *testing.T) {
	ctx := context.Background()
	receivedAt := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	inventoryRepo := &purchaseReceiptProcessInventoryRepoStub{warehouseActive: true}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ProcessKey:      "material_supply",
			ProcessVersion:  "v1",
			BusinessRefType: "purchase_order",
			BusinessRefID:   3001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "purchase_receipt_source",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandPurchaseReceiptCreate,
				},
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterPurchaseReceiptProcessDomainCommandHandlers(processRuntimeUC, NewInventoryUsecase(inventoryRepo)); err != nil {
		t.Fatalf("register purchase receipt process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandPurchaseReceiptCreate,
		IdempotencyKey:        "process:10:node:20:purchase-receipt-create",
		Payload: map[string]any{
			"purchase_order_id": float64(3001),
			"receipt_no":        "PR-PROCESS-001",
			"warehouse_id":      float64(7001),
			"received_at":       "2026-06-30",
			"note":              "到货来源流程生成",
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute purchase receipt create domain command failed: %v", err)
	}
	if inventoryRepo.createInput == nil {
		t.Fatal("expected purchase receipt usecase input")
	}
	if inventoryRepo.createInput.PurchaseOrderID != 3001 {
		t.Fatalf("expected purchase order id 3001, got %d", inventoryRepo.createInput.PurchaseOrderID)
	}
	if inventoryRepo.createInput.ReceiptNo != "PR-PROCESS-001" {
		t.Fatalf("expected receipt no from payload, got %q", inventoryRepo.createInput.ReceiptNo)
	}
	if inventoryRepo.createInput.WarehouseID != 7001 {
		t.Fatalf("expected warehouse id 7001, got %d", inventoryRepo.createInput.WarehouseID)
	}
	if !inventoryRepo.createInput.ReceivedAt.Equal(receivedAt) {
		t.Fatalf("expected received_at parsed as %s, got %s", receivedAt, inventoryRepo.createInput.ReceivedAt)
	}
	if inventoryRepo.createInput.Note == nil || *inventoryRepo.createInput.Note != "到货来源流程生成" {
		t.Fatalf("expected note from payload, got %#v", inventoryRepo.createInput.Note)
	}
	if inventoryRepo.postCalled {
		t.Fatal("purchase_receipt.create must not post inbound inventory")
	}
	if node == nil || node.Outcome == nil || *node.Outcome != PurchaseReceiptProcessCommandOutcomeCreated {
		t.Fatalf("expected purchase receipt created process outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != PurchaseReceiptProcessCommandOutcomeCreated {
		t.Fatalf("expected process node completed with purchase receipt outcome, got %#v", processRepo.completedNode)
	}
	if processRepo.linkedRef == nil {
		t.Fatal("expected process runtime to record generated purchase receipt ref")
	}
	if processRepo.linkedRef.ProcessInstanceID != 10 ||
		processRepo.linkedRef.RefType != "purchase_receipt" ||
		processRepo.linkedRef.RefID != 9001 ||
		processRepo.linkedRef.RefNo == nil ||
		*processRepo.linkedRef.RefNo != "PR-PROCESS-001" ||
		processRepo.linkedRef.SourceNodeKey != "purchase_receipt_source" ||
		processRepo.linkedRef.SourceCommandKey != ProcessDomainCommandPurchaseReceiptCreate {
		t.Fatalf("unexpected linked business ref: %#v", processRepo.linkedRef)
	}
}

func TestPurchaseReceiptProcessDomainCommandCreateRejectsMismatchedBusinessRef(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &purchaseReceiptProcessInventoryRepoStub{warehouseActive: true}
	handler := &purchaseReceiptCreateProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "sales_order", BusinessRefID: 3001},
		CommandKey:      ProcessDomainCommandPurchaseReceiptCreate,
		IdempotencyKey:  "process:10:node:20:purchase-receipt-create",
		Payload: map[string]any{
			"receipt_no":   "PR-PROCESS-001",
			"warehouse_id": float64(7001),
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected business ref type mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_order", BusinessRefID: 3001},
		CommandKey:      ProcessDomainCommandPurchaseReceiptCreate,
		IdempotencyKey:  "process:10:node:20:purchase-receipt-create",
		Payload: map[string]any{
			"purchase_order_id": float64(3002),
			"receipt_no":        "PR-PROCESS-001",
			"warehouse_id":      float64(7001),
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected payload purchase order mismatch rejected, got %v", err)
	}
	if inventoryRepo.createInput != nil {
		t.Fatalf("mismatched command must not create purchase receipt, got %#v", inventoryRepo.createInput)
	}
}

func TestPurchaseReceiptProcessDomainCommandCreateRequiresWarehouse(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &purchaseReceiptProcessInventoryRepoStub{warehouseActive: true}
	handler := &purchaseReceiptCreateProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_order", BusinessRefID: 3001},
		CommandKey:      ProcessDomainCommandPurchaseReceiptCreate,
		IdempotencyKey:  "process:10:node:20:purchase-receipt-create",
		Payload: map[string]any{
			"receipt_no": "PR-PROCESS-001",
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing warehouse rejected, got %v", err)
	}
	if inventoryRepo.createInput != nil {
		t.Fatalf("invalid command must not create purchase receipt, got %#v", inventoryRepo.createInput)
	}
}

type purchaseReceiptProcessInventoryRepoStub struct {
	InventoryRepo
	warehouseActive bool
	createInput     *PurchaseReceiptFromPurchaseOrderCreate
	postCalled      bool
}

func (r *purchaseReceiptProcessInventoryRepoStub) WarehouseIsActive(context.Context, int) (bool, error) {
	return r.warehouseActive, nil
}

func (r *purchaseReceiptProcessInventoryRepoStub) CreatePurchaseReceiptFromPurchaseOrder(_ context.Context, in *PurchaseReceiptFromPurchaseOrderCreate) (*PurchaseReceipt, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	copied := *in
	r.createInput = &copied
	return &PurchaseReceipt{
		ID:           9001,
		ReceiptNo:    in.ReceiptNo,
		Status:       PurchaseReceiptStatusDraft,
		ReceivedAt:   in.ReceivedAt,
		SupplierName: "采购供应商",
	}, nil
}

func (r *purchaseReceiptProcessInventoryRepoStub) PostPurchaseReceipt(context.Context, int) (*PurchaseReceipt, error) {
	r.postCalled = true
	return nil, errors.New("post purchase receipt must not be called by purchase_receipt.create")
}
