package biz

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"
)

func TestFinishedGoodsDeliveryProcessRunsLocalGoldenChain(t *testing.T) {
	sourceType := QualityInspectionSourceShipment
	sourceID := 9001
	inspectionType := QualityInspectionTypeFinishedGoods
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{
		inspection: &QualityInspection{
			ID:             8001,
			InventoryLotID: 7001,
			SourceType:     &sourceType,
			SourceID:       &sourceID,
			InspectionType: &inspectionType,
			Status:         QualityInspectionStatusSubmitted,
		},
	}
	operationalFactRepo := &finishedGoodsDeliveryGoldenChainOperationalFactRepo{
		shipment: &Shipment{
			ID:         9001,
			ShipmentNo: "SHIP-GOLDEN-001",
			CustomerID: processTestIntPtr(501),
			Status:     ShipmentStatusDraft,
		},
	}
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              31,
			ProcessKey:      ProcessKeyFinishedGoodsDelivery,
			ProcessVersion:  "v1",
			BusinessRefType: "shipment",
			BusinessRefID:   9001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                41,
				ProcessInstanceID: 31,
				NodeKey:           "finished_goods_quality",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandFinishedGoodsQualityDecide,
				},
			},
			{
				ID:                42,
				ProcessInstanceID: 31,
				NodeKey:           "shipment_finance_release",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandShipmentFinanceRelease,
				},
			},
			{
				ID:                43,
				ProcessInstanceID: 31,
				NodeKey:           "shipment_execution",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandShipmentShip,
				},
			},
			{
				ID:                44,
				ProcessInstanceID: 31,
				NodeKey:           "receivable_lead",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandFinanceReceivableLead,
				},
			},
			{
				ID:                45,
				ProcessInstanceID: 31,
				NodeKey:           "end",
				NodeType:          ProcessNodeTypeEnd,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterQualityInspectionProcessDomainCommandHandlers(processRuntimeUC, NewInventoryUsecase(inventoryRepo)); err != nil {
		t.Fatalf("register quality handlers failed: %v", err)
	}
	operationalFactUC := NewOperationalFactUsecase(operationalFactRepo)
	if err := RegisterShipmentProcessDomainCommandHandlers(processRuntimeUC, operationalFactUC); err != nil {
		t.Fatalf("register shipment handlers failed: %v", err)
	}
	if err := RegisterFinanceProcessDomainCommandHandlers(processRuntimeUC, operationalFactUC); err != nil {
		t.Fatalf("register finance handlers failed: %v", err)
	}

	qualityNode := executeFinishedGoodsGoldenCommand(t, processRuntimeUC, &ProcessDomainCommandExecution{
		ProcessInstanceID:     31,
		ProcessNodeInstanceID: 41,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandFinishedGoodsQualityDecide,
		IdempotencyKey:        "process:31:node:41:finished-goods-quality",
		Payload: map[string]any{
			"shipment_id":           float64(9001),
			"quality_inspection_id": float64(8001),
			"finished_goods_lot_id": float64(7001),
			"result":                QualityInspectionResultPass,
			"defect_rate_operator":  QualityInspectionDefectRateOperatorApprox,
			"defect_rate_percent":   "5",
			"decision_note":         "成品质检通过，进入财务放行",
		},
	})
	if qualityNode.Outcome == nil || *qualityNode.Outcome != FinishedGoodsQualityProcessCommandOutcomePassed {
		t.Fatalf("expected finished goods quality pass outcome, got %#v", qualityNode)
	}
	assertFinishedGoodsProcessNode(t, processRepo, 42, ProcessNodeStatusActive, 2)
	if inventoryRepo.passInput == nil || inventoryRepo.passInput.InspectionID != 8001 {
		t.Fatalf("expected shipment-linked finished goods quality decision, got %#v", inventoryRepo.passInput)
	}
	if inventoryRepo.rejectInput != nil || inventoryRepo.postCalled {
		t.Fatalf("finished goods quality must not reject or post inventory, reject=%#v post=%v", inventoryRepo.rejectInput, inventoryRepo.postCalled)
	}

	financeReleaseNode := executeFinishedGoodsGoldenCommand(t, processRuntimeUC, &ProcessDomainCommandExecution{
		ProcessInstanceID:     31,
		ProcessNodeInstanceID: 42,
		ExpectedVersion:       2,
		CommandKey:            ProcessDomainCommandShipmentFinanceRelease,
		IdempotencyKey:        "process:31:node:42:finance-release",
		Payload: map[string]any{
			"shipment_id": float64(9001),
		},
	})
	if financeReleaseNode.Outcome == nil || *financeReleaseNode.Outcome != ShipmentProcessCommandOutcomeFinanceReleased {
		t.Fatalf("expected finance release outcome, got %#v", financeReleaseNode)
	}
	assertFinishedGoodsProcessNode(t, processRepo, 43, ProcessNodeStatusActive, 2)
	if operationalFactRepo.shippedShipmentID != 0 {
		t.Fatalf("finance release must not ship inventory, got shipment id %d", operationalFactRepo.shippedShipmentID)
	}

	shipmentNode := executeFinishedGoodsGoldenCommand(t, processRuntimeUC, &ProcessDomainCommandExecution{
		ProcessInstanceID:     31,
		ProcessNodeInstanceID: 43,
		ExpectedVersion:       2,
		CommandKey:            ProcessDomainCommandShipmentShip,
		IdempotencyKey:        "process:31:node:43:shipment-ship",
		Payload: map[string]any{
			"shipment_id": float64(9001),
		},
	})
	if shipmentNode.Outcome == nil || *shipmentNode.Outcome != ShipmentProcessCommandOutcomeShipped {
		t.Fatalf("expected shipment shipped outcome, got %#v", shipmentNode)
	}
	assertFinishedGoodsProcessNode(t, processRepo, 44, ProcessNodeStatusActive, 2)
	if operationalFactRepo.shippedShipmentID != 9001 || operationalFactRepo.shipment.Status != ShipmentStatusShipped {
		t.Fatalf("expected shipment fact to be shipped, id=%d shipment=%#v", operationalFactRepo.shippedShipmentID, operationalFactRepo.shipment)
	}

	receivableNode := executeFinishedGoodsGoldenCommand(t, processRuntimeUC, &ProcessDomainCommandExecution{
		ProcessInstanceID:     31,
		ProcessNodeInstanceID: 44,
		ExpectedVersion:       2,
		CommandKey:            ProcessDomainCommandFinanceReceivableLead,
		IdempotencyKey:        "process:31:node:44:receivable-lead",
		Payload: map[string]any{
			"shipment_id":          float64(9001),
			"receivable_source_no": "AR-GOLDEN-001",
			"currency":             "CNY",
			"expected_amount":      "12888.00",
			"lead_note":            "本地黄金链路应收草稿",
		},
	})
	if receivableNode.Outcome == nil || *receivableNode.Outcome != FinanceProcessCommandOutcomeReceivableLeadCreated {
		t.Fatalf("expected receivable lead outcome, got %#v", receivableNode)
	}
	assertFinishedGoodsProcessNode(t, processRepo, 45, ProcessNodeStatusCompleted, 3)
	if processRepo.process == nil || processRepo.process.Status != ProcessStatusCompleted {
		t.Fatalf("expected process completed after receivable lead, got %#v", processRepo.process)
	}
	if operationalFactRepo.createdFinanceFact == nil ||
		operationalFactRepo.createdFinanceFact.FactType != FinanceFactReceivable ||
		operationalFactRepo.createdFinanceFact.SourceType == nil ||
		*operationalFactRepo.createdFinanceFact.SourceType != ShipmentSourceType ||
		operationalFactRepo.createdFinanceFact.SourceID == nil ||
		*operationalFactRepo.createdFinanceFact.SourceID != 9001 ||
		!operationalFactRepo.createdFinanceFact.Amount.Equal(decimal.RequireFromString("12888.00")) ||
		operationalFactRepo.createdFinanceFact.IdempotencyKey != "process:31:node:44:receivable-lead" {
		t.Fatalf("expected shipment receivable draft create input, got %#v", operationalFactRepo.createdFinanceFact)
	}
	if operationalFactRepo.postedFinanceFactID != 0 ||
		operationalFactRepo.settledFinanceFactID != 0 ||
		operationalFactRepo.cancelledFinanceFactID != 0 {
		t.Fatalf("receivable lead must not post/settle/cancel finance fact, post=%d settle=%d cancel=%d",
			operationalFactRepo.postedFinanceFactID,
			operationalFactRepo.settledFinanceFactID,
			operationalFactRepo.cancelledFinanceFactID,
		)
	}
	if processRepo.linkedRef == nil || processRepo.linkedRef.RefType != "finance_fact" || processRepo.linkedRef.RefID != 3001 {
		t.Fatalf("expected receivable finance fact linked ref, got %#v", processRepo.linkedRef)
	}
}

func executeFinishedGoodsGoldenCommand(t *testing.T, uc *ProcessRuntimeUsecase, in *ProcessDomainCommandExecution) *ProcessNodeInstance {
	t.Helper()
	node, err := uc.ExecuteDomainCommandNode(context.Background(), in, 7)
	if err != nil {
		t.Fatalf("execute %s failed: %v", in.CommandKey, err)
	}
	if node == nil {
		t.Fatalf("execute %s returned nil node", in.CommandKey)
	}
	return node
}

func assertFinishedGoodsProcessNode(t *testing.T, repo *memProcessRuntimeRepo, nodeID int, status string, version int) {
	t.Helper()
	for _, node := range repo.nodes {
		if node == nil || node.ID != nodeID {
			continue
		}
		if node.Status != status || node.Version != version {
			t.Fatalf("expected node %d status=%s version=%d, got %#v", nodeID, status, version, node)
		}
		return
	}
	t.Fatalf("node %d not found", nodeID)
}

type finishedGoodsDeliveryGoldenChainOperationalFactRepo struct {
	OperationalFactRepo
	shipment               *Shipment
	fetchedShipmentIDs     []int
	shippedShipmentID      int
	createdFinanceFact     *FinanceFactCreate
	postedFinanceFactID    int
	settledFinanceFactID   int
	cancelledFinanceFactID int
}

func (r *finishedGoodsDeliveryGoldenChainOperationalFactRepo) GetShipment(_ context.Context, shipmentID int) (*Shipment, error) {
	r.fetchedShipmentIDs = append(r.fetchedShipmentIDs, shipmentID)
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, ErrShipmentNotFound
	}
	copied := *r.shipment
	return &copied, nil
}

func (r *finishedGoodsDeliveryGoldenChainOperationalFactRepo) ShipShipment(_ context.Context, shipmentID int) (*Shipment, error) {
	r.shippedShipmentID = shipmentID
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, ErrShipmentNotFound
	}
	r.shipment.Status = ShipmentStatusShipped
	copied := *r.shipment
	return &copied, nil
}

func (r *finishedGoodsDeliveryGoldenChainOperationalFactRepo) CreateFinanceFactDraft(_ context.Context, in *FinanceFactCreate) (*FinanceFact, error) {
	if r.shipment == nil || r.shipment.Status != ShipmentStatusShipped {
		return nil, ErrBadParam
	}
	copied := *in
	r.createdFinanceFact = &copied
	return &FinanceFact{
		ID:               3001,
		FactNo:           copied.FactNo,
		FactType:         copied.FactType,
		Status:           OperationalFactStatusDraft,
		CounterpartyType: copied.CounterpartyType,
		CounterpartyID:   copied.CounterpartyID,
		Amount:           copied.Amount,
		FeeAmount:        copied.FeeAmount,
		Currency:         copied.Currency,
		CollectionType:   copied.CollectionType,
		PaymentTerm:      copied.PaymentTerm,
		PaymentTermDays:  copied.PaymentTermDays,
		InvoiceCategory:  copied.InvoiceCategory,
		SourceType:       copied.SourceType,
		SourceID:         copied.SourceID,
		SourceLineID:     copied.SourceLineID,
		IdempotencyKey:   copied.IdempotencyKey,
		OccurredAt:       copied.OccurredAt,
		Note:             copied.Note,
	}, nil
}

func (r *finishedGoodsDeliveryGoldenChainOperationalFactRepo) PostFinanceFact(_ context.Context, id int) (*FinanceFact, error) {
	r.postedFinanceFactID = id
	return nil, ErrBadParam
}

func (r *finishedGoodsDeliveryGoldenChainOperationalFactRepo) SettleFinanceFact(_ context.Context, id int) (*FinanceFact, error) {
	r.settledFinanceFactID = id
	return nil, ErrBadParam
}

func (r *finishedGoodsDeliveryGoldenChainOperationalFactRepo) CancelPostedFinanceFact(_ context.Context, id int, _ int, _ string) (*FinanceFact, error) {
	r.cancelledFinanceFactID = id
	return nil, ErrBadParam
}
