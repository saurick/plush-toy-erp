package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestQualityInspectionProcessDomainCommandDecidePassBindsUsecase(t *testing.T) {
	ctx := context.Background()
	inspectedAt := time.Date(2026, 7, 1, 8, 30, 0, 0, time.UTC)
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{
		inspection: &QualityInspection{
			ID:                5001,
			PurchaseReceiptID: 6001,
			InventoryLotID:    7001,
			Status:            QualityInspectionStatusSubmitted,
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
				NodeKey:           "incoming_qc",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandQualityInspectionDecide,
				},
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterQualityInspectionProcessDomainCommandHandlers(processRuntimeUC, NewInventoryUsecase(inventoryRepo)); err != nil {
		t.Fatalf("register quality inspection process command handler failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:        "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"quality_inspection_id": float64(5001),
			"purchase_receipt_id":   float64(6001),
			"inventory_lot_id":      float64(7001),
			"result":                QualityInspectionResultConcession,
			"inspected_at":          "2026-07-01T08:30:00Z",
			"inspector_id":          float64(9001),
			"decision_note":         "让步接收，后续仓库按入库规则处理",
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute quality inspection decide domain command failed: %v", err)
	}
	if inventoryRepo.passInput == nil {
		t.Fatal("expected quality pass usecase input")
	}
	if inventoryRepo.passInput.InspectionID != 5001 {
		t.Fatalf("expected inspection id 5001, got %d", inventoryRepo.passInput.InspectionID)
	}
	if inventoryRepo.passInput.Result != QualityInspectionResultConcession {
		t.Fatalf("expected concession result, got %q", inventoryRepo.passInput.Result)
	}
	if !inventoryRepo.passInput.InspectedAt.Equal(inspectedAt) {
		t.Fatalf("expected inspected_at parsed as %s, got %s", inspectedAt, inventoryRepo.passInput.InspectedAt)
	}
	if inventoryRepo.passInput.InspectorID == nil || *inventoryRepo.passInput.InspectorID != 9001 {
		t.Fatalf("expected inspector id from payload, got %#v", inventoryRepo.passInput.InspectorID)
	}
	if inventoryRepo.passInput.DecisionNote == nil || *inventoryRepo.passInput.DecisionNote != "让步接收，后续仓库按入库规则处理" {
		t.Fatalf("expected decision note from payload, got %#v", inventoryRepo.passInput.DecisionNote)
	}
	if inventoryRepo.rejectInput != nil {
		t.Fatalf("concession decision must not call reject usecase, got %#v", inventoryRepo.rejectInput)
	}
	if inventoryRepo.postCalled {
		t.Fatal("quality_inspection.decide must not post inbound inventory")
	}
	if node == nil || node.Outcome == nil || *node.Outcome != QualityInspectionProcessCommandOutcomeConcession {
		t.Fatalf("expected quality concession process outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != QualityInspectionProcessCommandOutcomeConcession {
		t.Fatalf("expected process node completed with quality concession outcome, got %#v", processRepo.completedNode)
	}
}

func TestQualityInspectionProcessDomainCommandDecideRejectBindsUsecase(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{
		inspection: &QualityInspection{
			ID:                5002,
			PurchaseReceiptID: 6002,
			InventoryLotID:    7002,
			Status:            QualityInspectionStatusSubmitted,
		},
	}
	handler := &qualityInspectionDecideProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	result, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6002},
		CommandKey:      ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"id":                  float64(5002),
			"purchase_receipt_id": float64(6002),
			"inventory_lot_id":    float64(7002),
			"result":              QualityInspectionResultReject,
			"decision_note":       "拒收",
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute quality reject domain command failed: %v", err)
	}
	if inventoryRepo.rejectInput == nil {
		t.Fatal("expected quality reject usecase input")
	}
	if inventoryRepo.rejectInput.InspectionID != 5002 {
		t.Fatalf("expected inspection id 5002, got %d", inventoryRepo.rejectInput.InspectionID)
	}
	if inventoryRepo.rejectInput.Result != QualityInspectionResultReject {
		t.Fatalf("expected reject result, got %q", inventoryRepo.rejectInput.Result)
	}
	if inventoryRepo.passInput != nil {
		t.Fatalf("reject decision must not call pass usecase, got %#v", inventoryRepo.passInput)
	}
	if result == nil || result.Outcome != QualityInspectionProcessCommandOutcomeRejected {
		t.Fatalf("expected quality rejected outcome, got %#v", result)
	}
}

func TestQualityInspectionProcessDomainCommandDecideRejectsMismatchedStableRefs(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{
		inspection: &QualityInspection{
			ID:                5001,
			PurchaseReceiptID: 6001,
			InventoryLotID:    7001,
			Status:            QualityInspectionStatusSubmitted,
		},
	}
	handler := &qualityInspectionDecideProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_order", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"quality_inspection_id": float64(5001),
			"result":                QualityInspectionResultPass,
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected business ref type mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6002},
		CommandKey:      ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"quality_inspection_id": float64(5001),
			"result":                QualityInspectionResultPass,
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected process purchase receipt mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"quality_inspection_id": float64(5001),
			"purchase_receipt_id":   float64(6001),
			"inventory_lot_id":      float64(7002),
			"result":                QualityInspectionResultPass,
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected payload inventory lot mismatch rejected, got %v", err)
	}
	if inventoryRepo.passInput != nil || inventoryRepo.rejectInput != nil {
		t.Fatalf("mismatched command must not decide quality inspection, pass=%#v reject=%#v", inventoryRepo.passInput, inventoryRepo.rejectInput)
	}
}

func TestQualityInspectionProcessDomainCommandDecideRequiresInspectionAndResult(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{}
	handler := &qualityInspectionDecideProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload:         map[string]any{"result": QualityInspectionResultPass},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing inspection id rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandQualityInspectionDecide,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload:         map[string]any{"quality_inspection_id": float64(5001)},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing result rejected, got %v", err)
	}
	if inventoryRepo.getCalled {
		t.Fatal("invalid quality command must not read or update the inspection")
	}
}

func TestFinishedGoodsQualityProcessDomainCommandDecideBindsShipmentLinkedInspection(t *testing.T) {
	ctx := context.Background()
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
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              11,
			ProcessKey:      ProcessKeyFinishedGoodsDelivery,
			ProcessVersion:  "v1",
			BusinessRefType: "shipment",
			BusinessRefID:   9001,
			ConfigRevision:  "yoyoosun-rev-1",
			Status:          ProcessStatusActive,
		},
		nodes: []*ProcessNodeInstance{
			{
				ID:                21,
				ProcessInstanceID: 11,
				NodeKey:           "finished_goods_quality",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusActive,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandFinishedGoodsQualityDecide,
				},
			},
			{
				ID:                22,
				ProcessInstanceID: 11,
				NodeKey:           "shipment_finance_release",
				NodeType:          ProcessNodeTypeDomainCommand,
				Status:            ProcessNodeStatusWaiting,
				Version:           1,
				PolicySnapshot: map[string]any{
					"command_key": ProcessDomainCommandShipmentFinanceRelease,
				},
			},
		},
	}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterQualityInspectionProcessDomainCommandHandlers(processRuntimeUC, NewInventoryUsecase(inventoryRepo)); err != nil {
		t.Fatalf("register quality process command handlers failed: %v", err)
	}

	node, err := processRuntimeUC.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     11,
		ProcessNodeInstanceID: 21,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandFinishedGoodsQualityDecide,
		IdempotencyKey:        "process:11:node:21:finished-goods-quality-decide",
		Payload: map[string]any{
			"shipment_id":           float64(9001),
			"quality_inspection_id": float64(8001),
			"finished_goods_lot_id": float64(7001),
			"result":                QualityInspectionResultPass,
			"decision_note":         "成品质检通过，进入财务放行",
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute finished goods quality domain command failed: %v", err)
	}
	if inventoryRepo.passInput == nil {
		t.Fatal("expected finished goods quality pass usecase input")
	}
	if inventoryRepo.passInput.InspectionID != 8001 {
		t.Fatalf("expected inspection id 8001, got %d", inventoryRepo.passInput.InspectionID)
	}
	if inventoryRepo.passInput.Result != QualityInspectionResultPass {
		t.Fatalf("expected pass result, got %q", inventoryRepo.passInput.Result)
	}
	if inventoryRepo.rejectInput != nil {
		t.Fatalf("pass decision must not call reject usecase, got %#v", inventoryRepo.rejectInput)
	}
	if inventoryRepo.postCalled {
		t.Fatal("finished_goods_quality.decide must not post inventory")
	}
	if node == nil || node.Outcome == nil || *node.Outcome != FinishedGoodsQualityProcessCommandOutcomePassed {
		t.Fatalf("expected finished goods quality pass process outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != FinishedGoodsQualityProcessCommandOutcomePassed {
		t.Fatalf("expected process node completed with finished goods quality outcome, got %#v", processRepo.completedNode)
	}
	if processRepo.activatedNode == nil || processRepo.activatedNode.ID != 22 {
		t.Fatalf("expected next finance release node activated, got %#v", processRepo.activatedNode)
	}
}

func TestFinishedGoodsQualityProcessDomainCommandDecideRejectsMismatchedShipmentRefs(t *testing.T) {
	ctx := context.Background()
	sourceType := QualityInspectionSourcePurchaseReceipt
	sourceID := 6001
	inspectionType := QualityInspectionTypeIncoming
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
	handler := &finishedGoodsQualityDecideProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 11, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandFinishedGoodsQualityDecide,
		IdempotencyKey:  "process:11:node:21:finished-goods-quality-decide",
		Payload: map[string]any{
			"shipment_id":           float64(9001),
			"quality_inspection_id": float64(8001),
			"finished_goods_lot_id": float64(7001),
			"result":                QualityInspectionResultPass,
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected purchase-receipt quality inspection rejected, got %v", err)
	}
	if inventoryRepo.passInput != nil || inventoryRepo.rejectInput != nil {
		t.Fatalf("mismatched finished goods command must not decide quality inspection, pass=%#v reject=%#v", inventoryRepo.passInput, inventoryRepo.rejectInput)
	}
}

type qualityInspectionProcessInventoryRepoStub struct {
	InventoryRepo
	inspection  *QualityInspection
	getCalled   bool
	passInput   *QualityInspectionDecision
	rejectInput *QualityInspectionDecision
	postCalled  bool
}

func (r *qualityInspectionProcessInventoryRepoStub) GetQualityInspection(_ context.Context, id int) (*QualityInspection, error) {
	r.getCalled = true
	if r.inspection == nil || r.inspection.ID != id {
		return nil, ErrQualityInspectionNotFound
	}
	copied := *r.inspection
	return &copied, nil
}

func (r *qualityInspectionProcessInventoryRepoStub) PassQualityInspection(_ context.Context, in *QualityInspectionDecision) (*QualityInspection, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	copiedInput := *in
	r.passInput = &copiedInput
	return &QualityInspection{
		ID:                in.InspectionID,
		PurchaseReceiptID: r.inspection.PurchaseReceiptID,
		InventoryLotID:    r.inspection.InventoryLotID,
		Status:            QualityInspectionStatusPassed,
		Result:            &copiedInput.Result,
		InspectedAt:       &copiedInput.InspectedAt,
		InspectorID:       copiedInput.InspectorID,
		DecisionNote:      copiedInput.DecisionNote,
	}, nil
}

func (r *qualityInspectionProcessInventoryRepoStub) RejectQualityInspection(_ context.Context, in *QualityInspectionDecision) (*QualityInspection, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	copiedInput := *in
	r.rejectInput = &copiedInput
	return &QualityInspection{
		ID:                in.InspectionID,
		PurchaseReceiptID: r.inspection.PurchaseReceiptID,
		InventoryLotID:    r.inspection.InventoryLotID,
		Status:            QualityInspectionStatusRejected,
		Result:            &copiedInput.Result,
		InspectedAt:       &copiedInput.InspectedAt,
		InspectorID:       copiedInput.InspectorID,
		DecisionNote:      copiedInput.DecisionNote,
	}, nil
}

func (r *qualityInspectionProcessInventoryRepoStub) PostPurchaseReceipt(context.Context, int) (*PurchaseReceipt, error) {
	r.postCalled = true
	return nil, errors.New("post purchase receipt must not be called by quality_inspection.decide")
}
