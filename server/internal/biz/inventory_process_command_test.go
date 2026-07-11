package biz

import (
	"context"
	"errors"
	"testing"
)

func TestInventoryProcessDomainCommandPostInboundBindsUsecase(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &inventoryPostInboundProcessInventoryRepoStub{
		postedReceipt: &PurchaseReceipt{
			ID:        6001,
			ReceiptNo: "PR-PROCESS-INBOUND-001",
			Status:    PurchaseReceiptStatusPosted,
		},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ProcessKey:      "material_supply",
			ProcessVersion:  "v1",
			BusinessRefType: "purchase_receipt",
			BusinessRefID:   6001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "warehouse_inbound",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandInventoryPostInbound,
				},
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterInventoryProcessDomainCommandHandlers(processRuntimeUC, NewInventoryUsecase(inventoryRepo)); err != nil {
		t.Fatalf("register inventory process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandInventoryPostInbound,
		IdempotencyKey:        "process:10:node:20:inventory-post-inbound",
		Payload: map[string]any{
			"purchase_receipt_id": float64(6001),
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute inventory post inbound domain command failed: %v", err)
	}
	if inventoryRepo.postedReceiptID != 6001 {
		t.Fatalf("expected purchase receipt id 6001 to be posted, got %d", inventoryRepo.postedReceiptID)
	}
	if node == nil || node.Outcome == nil || *node.Outcome != InventoryProcessCommandOutcomeInboundPosted {
		t.Fatalf("expected inbound posted process outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != InventoryProcessCommandOutcomeInboundPosted {
		t.Fatalf("expected process node completed with inbound posted outcome, got %#v", processRepo.completedNode)
	}
}

func TestInventoryProcessDomainCommandPostInboundRejectsMismatchedBusinessRef(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &inventoryPostInboundProcessInventoryRepoStub{
		postedReceipt: &PurchaseReceipt{ID: 6001, Status: PurchaseReceiptStatusPosted},
	}
	handler := &inventoryPostInboundProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_order", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandInventoryPostInbound,
		IdempotencyKey:  "process:10:node:20:inventory-post-inbound",
		Payload:         map[string]any{"purchase_receipt_id": float64(6001)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected business ref type mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandInventoryPostInbound,
		IdempotencyKey:  "process:10:node:20:inventory-post-inbound",
		Payload:         map[string]any{"purchase_receipt_id": float64(6002)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected payload purchase receipt mismatch rejected, got %v", err)
	}
	if inventoryRepo.postedReceiptID != 0 {
		t.Fatalf("mismatched command must not post purchase receipt, got %d", inventoryRepo.postedReceiptID)
	}
}

func TestInventoryProcessDomainCommandPostInboundRequiresReceipt(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &inventoryPostInboundProcessInventoryRepoStub{}
	handler := &inventoryPostInboundProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandInventoryPostInbound,
		IdempotencyKey:  "process:10:node:20:inventory-post-inbound",
		Payload:         map[string]any{},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing purchase receipt rejected, got %v", err)
	}
	if inventoryRepo.postedReceiptID != 0 {
		t.Fatalf("invalid command must not post purchase receipt, got %d", inventoryRepo.postedReceiptID)
	}
}

func TestInventoryProcessDomainCommandPostInboundRejectsLegacyID(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &inventoryPostInboundProcessInventoryRepoStub{
		postedReceipt: &PurchaseReceipt{ID: 6001, Status: PurchaseReceiptStatusPosted},
	}
	handler := &inventoryPostInboundProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandInventoryPostInbound,
		IdempotencyKey:  "process:10:node:20:inventory-post-inbound",
		Payload:         map[string]any{"id": float64(6001)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected legacy id to be rejected, got %v", err)
	}
	if inventoryRepo.postedReceiptID != 0 {
		t.Fatalf("legacy id command must not post purchase receipt, got %d", inventoryRepo.postedReceiptID)
	}
}

type inventoryPostInboundProcessInventoryRepoStub struct {
	InventoryRepo
	postedReceipt   *PurchaseReceipt
	postedReceiptID int
}

func (r *inventoryPostInboundProcessInventoryRepoStub) PostPurchaseReceipt(_ context.Context, receiptID int) (*PurchaseReceipt, error) {
	r.postedReceiptID = receiptID
	if r.postedReceipt == nil || r.postedReceipt.ID != receiptID {
		return nil, ErrPurchaseReceiptNotFound
	}
	copied := *r.postedReceipt
	return &copied, nil
}

func (r *inventoryPostInboundProcessInventoryRepoStub) GetPurchaseReceipt(_ context.Context, receiptID int) (*PurchaseReceipt, error) {
	if r.postedReceipt == nil || r.postedReceipt.ID != receiptID {
		return nil, ErrPurchaseReceiptNotFound
	}
	copied := *r.postedReceipt
	return &copied, nil
}

func (r *inventoryPostInboundProcessInventoryRepoStub) EvaluatePurchaseReceiptQualityGate(_ context.Context, receiptID int) (*PurchaseReceiptQualityGate, error) {
	if r.postedReceipt == nil || r.postedReceipt.ID != receiptID {
		return nil, ErrPurchaseReceiptNotFound
	}
	return &PurchaseReceiptQualityGate{
		PurchaseReceiptID: receiptID,
		Outcome:           PurchaseReceiptQualityGateReady,
		TotalLines:        1,
		PassedLines:       1,
	}, nil
}
