package biz

import (
	"context"
	"errors"
	"testing"
)

func TestShipmentProcessDomainCommandShipBindsUsecase(t *testing.T) {
	ctx := context.Background()
	operationalFactRepo := &shipmentProcessOperationalFactRepoStub{
		shipment: &Shipment{
			ID:         9001,
			ShipmentNo: "SHIP-PROCESS-001",
			Status:     ShipmentStatusShipped,
		},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ProcessKey:      ProcessKeyFinishedGoodsDelivery,
			ProcessVersion:  "v1",
			BusinessRefType: "shipment",
			BusinessRefID:   9001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "shipment_execution",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandShipmentShip,
				},
			},
			{
				ID:                21,
				ProcessInstanceID: 10,
				NodeKey:           "receivable_lead",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandFinanceReceivableLead,
				},
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterShipmentProcessDomainCommandHandlers(processRuntimeUC, NewOperationalFactUsecase(operationalFactRepo)); err != nil {
		t.Fatalf("register shipment process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandShipmentShip,
		IdempotencyKey:        "process:10:node:20:shipment-ship",
		Payload: map[string]any{
			"shipment_id": float64(9001),
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute shipment ship domain command failed: %v", err)
	}
	if operationalFactRepo.shippedShipmentID != 9001 {
		t.Fatalf("expected shipment id 9001 to be shipped, got %d", operationalFactRepo.shippedShipmentID)
	}
	if node == nil || node.Outcome == nil || *node.Outcome != ShipmentProcessCommandOutcomeShipped {
		t.Fatalf("expected shipment shipped process outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != ShipmentProcessCommandOutcomeShipped {
		t.Fatalf("expected process node completed with shipment shipped outcome, got %#v", processRepo.completedNode)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != 21 {
		t.Fatalf("expected receivable_lead node to activate after shipment, got %#v", processRepo.activatedNode)
	}
}

func TestShipmentProcessDomainCommandFinanceReleaseBindsUsecase(t *testing.T) {
	ctx := context.Background()
	operationalFactRepo := &shipmentProcessOperationalFactRepoStub{
		shipment: &Shipment{
			ID:                   9001,
			ShipmentNo:           "SHIP-PROCESS-001",
			Status:               ShipmentStatusDraft,
			FinanceReleaseStatus: ShipmentFinanceReleaseStatusPending,
		},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ProcessKey:      ProcessKeyFinishedGoodsDelivery,
			ProcessVersion:  "v1",
			BusinessRefType: "shipment",
			BusinessRefID:   9001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                20,
				ProcessInstanceID: 10,
				NodeKey:           "shipment_finance_release",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandShipmentFinanceRelease,
				},
			},
			{
				ID:                21,
				ProcessInstanceID: 10,
				NodeKey:           "shipment_execution",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandShipmentShip,
				},
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterShipmentProcessDomainCommandHandlers(processRuntimeUC, NewOperationalFactUsecase(operationalFactRepo)); err != nil {
		t.Fatalf("register shipment process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandShipmentFinanceRelease,
		IdempotencyKey:        "process:10:node:20:shipment-finance-release",
		Payload: map[string]any{
			"shipment_id": float64(9001),
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute shipment finance release domain command failed: %v", err)
	}
	if operationalFactRepo.fetchedShipmentID != 9001 {
		t.Fatalf("expected shipment id 9001 to be checked, got %d", operationalFactRepo.fetchedShipmentID)
	}
	if operationalFactRepo.shippedShipmentID != 0 {
		t.Fatalf("finance release must not ship inventory, got shipment id %d", operationalFactRepo.shippedShipmentID)
	}
	if node == nil || node.Outcome == nil || *node.Outcome != ShipmentProcessCommandOutcomeFinanceReleased {
		t.Fatalf("expected shipment finance released process outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != ShipmentProcessCommandOutcomeFinanceReleased {
		t.Fatalf("expected process node completed with finance released outcome, got %#v", processRepo.completedNode)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != 21 {
		t.Fatalf("expected shipment_execution node to activate after finance release, got %#v", processRepo.activatedNode)
	}
}

func TestShipmentProcessDomainCommandFinanceReleaseRequiresDraftShipment(t *testing.T) {
	ctx := context.Background()
	operationalFactRepo := &shipmentProcessOperationalFactRepoStub{
		shipment: &Shipment{ID: 9001, Status: ShipmentStatusShipped},
	}
	handler := &shipmentFinanceReleaseProcessCommandHandler{uc: NewOperationalFactUsecase(operationalFactRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandShipmentFinanceRelease,
		IdempotencyKey:  "process:10:node:20:shipment-finance-release",
		Payload:         map[string]any{"shipment_id": float64(9001)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected shipped shipment finance release rejected, got %v", err)
	}
	if operationalFactRepo.shippedShipmentID != 0 {
		t.Fatalf("invalid finance release must not ship shipment, got %d", operationalFactRepo.shippedShipmentID)
	}
}

func TestShipmentProcessDomainCommandShipRejectsMismatchedBusinessRef(t *testing.T) {
	ctx := context.Background()
	operationalFactRepo := &shipmentProcessOperationalFactRepoStub{
		shipment: &Shipment{ID: 9001, Status: ShipmentStatusShipped},
	}
	handler := &shipmentShipProcessCommandHandler{uc: NewOperationalFactUsecase(operationalFactRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "sales_order", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandShipmentShip,
		IdempotencyKey:  "process:10:node:20:shipment-ship",
		Payload:         map[string]any{"shipment_id": float64(9001)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected business ref type mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandShipmentShip,
		IdempotencyKey:  "process:10:node:20:shipment-ship",
		Payload:         map[string]any{"shipment_id": float64(9002)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected payload shipment mismatch rejected, got %v", err)
	}
	if operationalFactRepo.shippedShipmentID != 0 {
		t.Fatalf("mismatched command must not ship shipment, got %d", operationalFactRepo.shippedShipmentID)
	}
}

func TestShipmentProcessDomainCommandShipRequiresShipment(t *testing.T) {
	ctx := context.Background()
	operationalFactRepo := &shipmentProcessOperationalFactRepoStub{}
	handler := &shipmentShipProcessCommandHandler{uc: NewOperationalFactUsecase(operationalFactRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandShipmentShip,
		IdempotencyKey:  "process:10:node:20:shipment-ship",
		Payload:         map[string]any{},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing shipment rejected, got %v", err)
	}
	if operationalFactRepo.shippedShipmentID != 0 {
		t.Fatalf("invalid command must not ship shipment, got %d", operationalFactRepo.shippedShipmentID)
	}
}

func TestShipmentProcessDomainCommandShipRejectsLegacyID(t *testing.T) {
	ctx := context.Background()
	operationalFactRepo := &shipmentProcessOperationalFactRepoStub{
		shipment: &Shipment{ID: 9001, Status: ShipmentStatusShipped},
	}
	handler := &shipmentShipProcessCommandHandler{uc: NewOperationalFactUsecase(operationalFactRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandShipmentShip,
		IdempotencyKey:  "process:10:node:20:shipment-ship",
		Payload:         map[string]any{"id": float64(9001)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected legacy id to be rejected, got %v", err)
	}
	if operationalFactRepo.shippedShipmentID != 0 {
		t.Fatalf("legacy id command must not ship shipment, got %d", operationalFactRepo.shippedShipmentID)
	}
}

type shipmentProcessOperationalFactRepoStub struct {
	OperationalFactRepo
	shipment          *Shipment
	fetchedShipmentID int
	shippedShipmentID int
}

func (r *shipmentProcessOperationalFactRepoStub) GetShipment(_ context.Context, shipmentID int) (*Shipment, error) {
	r.fetchedShipmentID = shipmentID
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, ErrShipmentNotFound
	}
	copied := *r.shipment
	return &copied, nil
}

func (r *shipmentProcessOperationalFactRepoStub) ShipShipment(_ context.Context, shipmentID int) (*Shipment, error) {
	r.shippedShipmentID = shipmentID
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, ErrShipmentNotFound
	}
	copied := *r.shipment
	return &copied, nil
}

func (r *shipmentProcessOperationalFactRepoStub) RecordShipmentFinanceReleaseProcessCommand(_ context.Context, shipmentID int, _ *ProcessDomainCommandInput, _ *ProcessDomainCommandResult, _ int) (*Shipment, error) {
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, ErrShipmentNotFound
	}
	r.shipment.FinanceReleaseStatus = ShipmentFinanceReleaseStatusApproved
	r.shipment.FinanceReleaseVersion++
	copied := *r.shipment
	return &copied, nil
}

func (r *shipmentProcessOperationalFactRepoStub) ShipShipmentForProcessCommand(ctx context.Context, shipmentID int, _ *ProcessDomainCommandInput, _ *ProcessDomainCommandResult, _ int) (*Shipment, error) {
	return r.ShipShipment(ctx, shipmentID)
}
