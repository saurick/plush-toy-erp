package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestIncomingQualityGateProcessDomainCommandPassesOnlyAfterAggregateReady(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{
		qualityGate: &PurchaseReceiptQualityGate{
			PurchaseReceiptID: 6001,
			Outcome:           PurchaseReceiptQualityGateReady,
			TotalLines:        2,
			PassedLines:       2,
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
					"command_key": ProcessDomainCommandIncomingQualityGate,
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
		CommandKey:            ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:        "process:10:node:20:quality-inspection-aggregate-gate",
		Payload: map[string]any{
			"purchase_receipt_id": float64(6001),
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute incoming quality aggregate gate failed: %v", err)
	}
	if inventoryRepo.passInput != nil || inventoryRepo.rejectInput != nil {
		t.Fatalf("aggregate gate must not decide line inspections, pass=%#v reject=%#v", inventoryRepo.passInput, inventoryRepo.rejectInput)
	}
	if inventoryRepo.postCalled {
		t.Fatal("quality aggregate gate must not post inbound inventory")
	}
	if node == nil || node.Outcome == nil || *node.Outcome != IncomingQualityGateProcessCommandOutcomePassed {
		t.Fatalf("expected quality aggregate passed outcome, got %#v", node)
	}
	if processRepo.completedNode == nil || processRepo.completedNode.Outcome != IncomingQualityGateProcessCommandOutcomePassed {
		t.Fatalf("expected process node completed with aggregate passed outcome, got %#v", processRepo.completedNode)
	}
}

func TestFinishedGoodsQualityProcessDomainCommandReplaysPostgresMicrosecondTime(t *testing.T) {
	result := QualityInspectionResultPass
	sourceType := QualityInspectionSourceShipment
	inspectionType := QualityInspectionTypeFinishedGoods
	sourceID := 9001
	inspectorID := 7
	storedTime := time.Date(2026, 7, 10, 4, 34, 56, 123456000, time.UTC)
	handler := &finishedGoodsQualityDecideProcessCommandHandler{uc: NewInventoryUsecase(&qualityInspectionProcessInventoryRepoStub{
		inspection: &QualityInspection{
			ID: 8001, SourceType: &sourceType, SourceID: &sourceID, InspectionType: &inspectionType,
			InventoryLotID: 7001, Status: QualityInspectionStatusPassed, Result: &result,
			InspectedAt: &storedTime, InspectorID: &inspectorID,
		},
	})}
	in := &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 11, BusinessRefType: "shipment", BusinessRefID: 9001},
		CommandKey:      ProcessDomainCommandFinishedGoodsQualityDecide,
		IdempotencyKey:  "process:11:node:21:finished-goods-quality-decide",
		Payload: map[string]any{
			"shipment_id": 9001, "quality_inspection_id": 8001, "finished_goods_lot_id": 7001,
			"result": result, "inspected_at": "2026-07-10T12:34:56.123456789+08:00",
		},
	}
	if err := handler.ValidateProcessDomainCommand(context.Background(), in, inspectorID); err != nil {
		t.Fatalf("same explicit nanosecond timestamp must replay after PostgreSQL microsecond storage: %v", err)
	}
	parsed, err := processCommandOptionalTimeFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInspectedAt)
	if err != nil || !parsed.Equal(storedTime) || parsed.Nanosecond()%1000 != 0 {
		t.Fatalf("process command time must canonicalize to UTC microseconds, parsed=%v err=%v", parsed, err)
	}
	normalized, err := normalizeQualityInspectionDecision(QualityInspectionDecision{
		InspectionID: 8001,
		Result:       result,
		InspectedAt:  parsed,
	}, result)
	if err != nil || normalized.InspectedAtDefaulted {
		t.Fatalf("explicit inspected_at must remain strict after normalization, decision=%#v err=%v", normalized, err)
	}
}

func TestFinishedGoodsQualityProcessDomainCommandLegacyResultWithoutInspectedAtRequiresRecovery(t *testing.T) {
	tests := []struct {
		name   string
		status string
		result string
	}{
		{name: "passed", status: QualityInspectionStatusPassed, result: QualityInspectionResultPass},
		{name: "rejected", status: QualityInspectionStatusRejected, result: QualityInspectionResultReject},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sourceType := QualityInspectionSourceShipment
			inspectionType := QualityInspectionTypeFinishedGoods
			sourceID := 9001
			inspectorID := 7
			storedTime := time.Date(2026, 7, 10, 4, 34, 56, 123456000, time.UTC)
			repo := &qualityInspectionProcessInventoryRepoStub{
				inspection: &QualityInspection{
					ID: 8001, SourceType: &sourceType, SourceID: &sourceID, InspectionType: &inspectionType,
					InventoryLotID: 7001, Status: tt.status, Result: &tt.result,
					InspectedAt: &storedTime, InspectorID: &inspectorID,
				},
			}
			handler := &finishedGoodsQualityDecideProcessCommandHandler{uc: NewInventoryUsecase(repo)}
			_, err := handler.ExecuteProcessDomainCommand(context.Background(), &ProcessDomainCommandInput{
				ProcessInstance: &ProcessInstance{ID: 11, BusinessRefType: "shipment", BusinessRefID: 9001},
				CommandKey:      ProcessDomainCommandFinishedGoodsQualityDecide,
				IdempotencyKey:  "process:11:node:21:finished-goods-quality-decide",
				Payload: map[string]any{
					"shipment_id": 9001, "quality_inspection_id": 8001, "finished_goods_lot_id": 7001,
					"result": tt.result,
				},
			}, inspectorID)
			if !errors.Is(err, ErrProcessDomainCommandRecoveryRequired) {
				t.Fatalf("legacy decided inspection without inspected_at must require recovery, got %v", err)
			}
			if repo.passInput != nil || repo.rejectInput != nil {
				t.Fatalf("legacy recovery must stop before fact execution, pass=%#v reject=%#v", repo.passInput, repo.rejectInput)
			}
		})
	}
}

func TestFinishedGoodsQualityProcessDomainCommandCurrentClaimReconcilesDefaultedInspectedAt(t *testing.T) {
	result := QualityInspectionResultPass
	sourceType := QualityInspectionSourceShipment
	inspectionType := QualityInspectionTypeFinishedGoods
	sourceID := 9001
	inspectorID := 7
	storedTime := time.Date(2026, 7, 10, 4, 34, 56, 123456000, time.UTC)
	repo := &qualityInspectionProcessInventoryRepoStub{
		inspection: &QualityInspection{
			ID: 8001, SourceType: &sourceType, SourceID: &sourceID, InspectionType: &inspectionType,
			InventoryLotID: 7001, Status: QualityInspectionStatusPassed, Result: &result,
			InspectedAt: &storedTime, InspectorID: &inspectorID,
		},
	}
	payload := map[string]any{
		"shipment_id": 9001, "quality_inspection_id": 8001, "finished_goods_lot_id": 7001,
		"result": result,
	}
	idempotencyKey := "process:11:node:21:finished-goods-quality-decide"
	fingerprint, err := processDomainCommandFingerprint(ProcessDomainCommandFinishedGoodsQualityDecide, idempotencyKey, payload)
	if err != nil {
		t.Fatalf("build current command fingerprint: %v", err)
	}
	protocolVersion := ProcessDomainCommandProtocolVersionCurrent
	in := &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 11, BusinessRefType: "shipment", BusinessRefID: 9001},
		Node: &ProcessNodeInstance{
			ID: 21, ProcessInstanceID: 11, NodeKey: "finished_goods_quality",
			NodeType: ProcessNodeTypeDomainCommand, Status: ProcessNodeStatusActive, Version: 1,
			PolicySnapshot:               map[string]any{"command_key": ProcessDomainCommandFinishedGoodsQualityDecide},
			DomainCommandFingerprint:     &fingerprint,
			DomainCommandProtocolVersion: &protocolVersion,
		},
		CommandKey:     ProcessDomainCommandFinishedGoodsQualityDecide,
		IdempotencyKey: idempotencyKey,
		Payload:        payload,
	}
	handler := &finishedGoodsQualityDecideProcessCommandHandler{uc: NewInventoryUsecase(repo)}
	if _, err := handler.ExecuteProcessDomainCommand(context.Background(), in, inspectorID); err != nil {
		t.Fatalf("current claimed command must reconcile omitted inspected_at: %v", err)
	}
	if repo.passInput == nil || !repo.passInput.InspectedAtDefaulted || repo.passInput.InspectedAt.IsZero() {
		t.Fatalf("omitted inspected_at must keep defaulted-time metadata through normalization, input=%#v", repo.passInput)
	}
}

func TestIncomingQualityGateProcessDomainCommandRejectBlocksProcess(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{
		qualityGate: &PurchaseReceiptQualityGate{
			PurchaseReceiptID: 6002,
			Outcome:           PurchaseReceiptQualityGateRejected,
			TotalLines:        2,
			PassedLines:       1,
			RejectedLineIDs:   []int{12},
		},
	}
	handler := &incomingQualityGateProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	result, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6002},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:  "process:10:node:20:quality-inspection-aggregate-gate",
		Payload: map[string]any{
			"purchase_receipt_id": float64(6002),
		},
	}, 7)
	if err != nil {
		t.Fatalf("execute aggregate rejected gate failed: %v", err)
	}
	if inventoryRepo.passInput != nil || inventoryRepo.rejectInput != nil {
		t.Fatalf("aggregate gate must not decide line inspections")
	}
	if result == nil || result.Outcome != IncomingQualityGateProcessCommandOutcomeRejected || result.BlockReason == "" {
		t.Fatalf("expected explicit rejected blocking result, got %#v", result)
	}
}

func TestIncomingQualityGateProcessDomainCommandKeepsPendingNodeActive(t *testing.T) {
	handler := &incomingQualityGateProcessCommandHandler{uc: NewInventoryUsecase(&qualityInspectionProcessInventoryRepoStub{
		qualityGate: &PurchaseReceiptQualityGate{
			PurchaseReceiptID: 6003,
			Outcome:           PurchaseReceiptQualityGatePending,
			TotalLines:        2,
			PassedLines:       1,
			PendingLineIDs:    []int{22},
		},
	})}
	_, err := handler.ExecuteProcessDomainCommand(context.Background(), &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6003},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:  "process:10:node:20:quality-inspection-aggregate-gate",
		Payload:         map[string]any{"purchase_receipt_id": float64(6003)},
	}, 7)
	if !errors.Is(err, ErrPurchaseReceiptQualityPending) {
		t.Fatalf("expected pending aggregate gate, got %v", err)
	}
}

func TestIncomingQualityGateProcessRuntimeBlocksRejectedReceiptWithoutAdvancing(t *testing.T) {
	ctx := context.Background()
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6002, Status: ProcessStatusActive},
		nodes: []*ProcessNodeInstance{
			{ID: 20, ProcessInstanceID: 10, NodeKey: "incoming_qc", NodeType: ProcessNodeTypeDomainCommand, Status: ProcessNodeStatusActive, Version: 1, PolicySnapshot: map[string]any{"command_key": ProcessDomainCommandIncomingQualityGate}},
			{ID: 21, ProcessInstanceID: 10, NodeKey: "warehouse_inbound", NodeType: ProcessNodeTypeDomainCommand, Status: ProcessNodeStatusWaiting, Version: 1},
		},
	}
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{qualityGate: &PurchaseReceiptQualityGate{
		PurchaseReceiptID: 6002,
		Outcome:           PurchaseReceiptQualityGateRejected,
		TotalLines:        2,
		RejectedLineIDs:   []int{12},
	}}
	uc := NewProcessRuntimeUsecase(processRepo, nil)
	if err := RegisterQualityInspectionProcessDomainCommandHandlers(uc, NewInventoryUsecase(inventoryRepo)); err != nil {
		t.Fatalf("register quality handlers failed: %v", err)
	}
	node, err := uc.ExecuteDomainCommandNode(ctx, &ProcessDomainCommandExecution{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		CommandKey:            ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:        "process:10:node:20:quality-inspection-aggregate-gate",
		Payload:               map[string]any{"purchase_receipt_id": float64(6002)},
	}, 7)
	if err != nil {
		t.Fatalf("execute rejected aggregate gate failed: %v", err)
	}
	if node == nil || node.Status != ProcessNodeStatusBlocked || node.Outcome == nil || *node.Outcome != IncomingQualityGateProcessCommandOutcomeRejected {
		t.Fatalf("expected blocked quality node, got %#v", node)
	}
	if processRepo.process.Status != ProcessStatusBlocked || processRepo.nodes[1].Status != ProcessNodeStatusWaiting || processRepo.completedNode != nil {
		t.Fatalf("rejected gate must block process without advancing, process=%#v next=%#v complete=%#v", processRepo.process, processRepo.nodes[1], processRepo.completedNode)
	}
}

func TestIncomingQualityGateProcessDomainCommandRejectsLegacyInspectionID(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{}
	handler := &incomingQualityGateProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6002},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"id":                  float64(5002),
			"purchase_receipt_id": float64(6002),
			"inventory_lot_id":    float64(7002),
			"result":              QualityInspectionResultReject,
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected legacy id to be rejected, got %v", err)
	}
	if inventoryRepo.rejectInput != nil || inventoryRepo.passInput != nil {
		t.Fatalf("legacy id command must not call quality usecase")
	}
}

func TestIncomingQualityGateProcessDomainCommandRejectsMismatchedStableRefs(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{
		qualityGate: &PurchaseReceiptQualityGate{
			PurchaseReceiptID: 6001,
			Outcome:           PurchaseReceiptQualityGateReady,
			TotalLines:        1,
			PassedLines:       1,
		},
	}
	handler := &incomingQualityGateProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_order", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"purchase_receipt_id": float64(6001),
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected business ref type mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6002},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"purchase_receipt_id": float64(6001),
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected process purchase receipt mismatch rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload: map[string]any{
			"quality_inspection_id": float64(5001),
		},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected payload inventory lot mismatch rejected, got %v", err)
	}
	if inventoryRepo.passInput != nil || inventoryRepo.rejectInput != nil {
		t.Fatalf("mismatched command must not decide quality inspection, pass=%#v reject=%#v", inventoryRepo.passInput, inventoryRepo.rejectInput)
	}
}

func TestIncomingQualityGateProcessDomainCommandRequiresReceipt(t *testing.T) {
	ctx := context.Background()
	inventoryRepo := &qualityInspectionProcessInventoryRepoStub{}
	handler := &incomingQualityGateProcessCommandHandler{uc: NewInventoryUsecase(inventoryRepo)}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
		IdempotencyKey:  "process:10:node:20:quality-inspection-decide",
		Payload:         map[string]any{"result": QualityInspectionResultPass},
	}, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing inspection id rejected, got %v", err)
	}

	if _, err := handler.ExecuteProcessDomainCommand(ctx, &ProcessDomainCommandInput{
		ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
		CommandKey:      ProcessDomainCommandIncomingQualityGate,
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
	if inventoryRepo.passInput.InspectorID == nil || *inventoryRepo.passInput.InspectorID != 7 {
		t.Fatalf("expected authenticated actor 7 as inspector truth, got %#v", inventoryRepo.passInput.InspectorID)
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
	qualityGate *PurchaseReceiptQualityGate
	getCalled   bool
	passInput   *QualityInspectionDecision
	rejectInput *QualityInspectionDecision
	postCalled  bool
}

func (r *qualityInspectionProcessInventoryRepoStub) EvaluatePurchaseReceiptQualityGate(_ context.Context, receiptID int) (*PurchaseReceiptQualityGate, error) {
	if r.qualityGate == nil || r.qualityGate.PurchaseReceiptID != receiptID {
		return nil, ErrPurchaseReceiptNotFound
	}
	cloned := *r.qualityGate
	return &cloned, nil
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
	return nil, errors.New("post purchase receipt must not be called by quality_inspection.aggregate_gate")
}
