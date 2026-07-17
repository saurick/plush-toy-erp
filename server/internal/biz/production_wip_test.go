package biz

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func productionWIPTestDecimal(value string) decimal.Decimal {
	return decimal.RequireFromString(value)
}

func productionWIPTestString(value string) *string {
	return &value
}

func productionWIPTestProcesses() map[string]ProductionWIPProcessReference {
	return map[string]ProductionWIPProcessReference{
		ProductionWIPOperationFabricProcessing: {
			ID: 11, Code: "PROC-FABRIC", Name: "布料加工",
			InhouseEnabled: true, OutsourcingEnabled: true, IsActive: true,
		},
		ProductionWIPOperationSewing: {
			ID: 12, Code: "PROC-SEWING", Name: "车缝",
			InhouseEnabled: true, OutsourcingEnabled: true, IsActive: true,
		},
		ProductionWIPOperationHandwork: {
			ID: 13, Code: "PROC-HANDWORK", Name: "手工",
			InhouseEnabled: true, OutsourcingEnabled: true, IsActive: true,
		},
		ProductionWIPOperationPackaging: {
			ID: 14, Code: "PROC-PACKAGING", Name: "包装",
			InhouseEnabled: true, OutsourcingEnabled: true, IsActive: true,
		},
	}
}

func TestProductionWIPBuildsFixedSewThenHandworkRouteSnapshot(t *testing.T) {
	operations, err := BuildPlushSewHandV1OperationSnapshots(ProductionWIPRouteSnapshotInput{
		ProductionOrderID:          101,
		ProductionOrderItemID:      201,
		PlannedQuantity:            productionWIPTestDecimal("12.5"),
		CustomerInspectionRequired: true,
		Processes:                  productionWIPTestProcesses(),
	})
	if err != nil {
		t.Fatalf("build route snapshot: %v", err)
	}
	if len(operations) != 4 {
		t.Fatalf("operation count=%d, want 4", len(operations))
	}
	wantCodes := []string{
		ProductionWIPOperationFabricProcessing,
		ProductionWIPOperationSewing,
		ProductionWIPOperationHandwork,
		ProductionWIPOperationPackaging,
	}
	wantSteps := []int{10, 20, 30, 40}
	wantOutputs := []string{
		ProductionWIPOutputCutPiece,
		ProductionWIPOutputShell,
		ProductionWIPOutputFinishedGoods,
		ProductionWIPOutputPackedGoods,
	}
	for i, operation := range operations {
		if operation.OperationCode != wantCodes[i] || operation.StepNo != wantSteps[i] || operation.OutputCode != wantOutputs[i] {
			t.Fatalf("operation[%d]=%+v", i, operation)
		}
		if operation.RouteCode != ProductionWIPRoutePlushSewHandV1 || operation.RouteVersion != 1 {
			t.Fatalf("operation[%d] route=%s/%d", i, operation.RouteCode, operation.RouteVersion)
		}
	}
	if !operations[1].InhouseAllowed || !operations[1].OutsourcingAllowed ||
		!operations[2].InhouseAllowed || !operations[2].OutsourcingAllowed {
		t.Fatal("sewing and handwork must each allow an independent in-house/outsource decision")
	}
	if operations[0].InhouseAllowed || !operations[0].OutsourcingAllowed {
		t.Fatal("fabric processing must use the fixed V1 outsourcing capability")
	}
	if !operations[3].InhouseAllowed || operations[3].OutsourcingAllowed {
		t.Fatal("packaging must use the fixed V1 in-house capability")
	}
	if !reflect.DeepEqual(operations[2].RequiredQualityGates, []string{
		ProductionWIPQualityGateFinishedGoods,
		ProductionWIPQualityGateNeedle,
		ProductionWIPQualityGateSampling,
		ProductionWIPQualityGateCustomerAcceptance,
	}) {
		t.Fatalf("handwork gates=%v", operations[2].RequiredQualityGates)
	}
	if operations[3].BusinessConfirmationCode == nil || *operations[3].BusinessConfirmationCode != ProductionWIPBusinessConfirmationPackagingMaterial {
		t.Fatalf("packaging confirmation=%v", operations[3].BusinessConfirmationCode)
	}
}

func TestProductionWIPRouteSnapshotFailsClosedOnProcessMasterCapability(t *testing.T) {
	base := ProductionWIPRouteSnapshotInput{
		ProductionOrderID: 1, ProductionOrderItemID: 2,
		PlannedQuantity: productionWIPTestDecimal("10"), Processes: productionWIPTestProcesses(),
	}
	tests := []struct {
		name   string
		mutate func(map[string]ProductionWIPProcessReference)
	}{
		{name: "inactive", mutate: func(processes map[string]ProductionWIPProcessReference) {
			process := processes[ProductionWIPOperationSewing]
			process.IsActive = false
			processes[ProductionWIPOperationSewing] = process
		}},
		{name: "sewing missing inhouse", mutate: func(processes map[string]ProductionWIPProcessReference) {
			process := processes[ProductionWIPOperationSewing]
			process.InhouseEnabled = false
			processes[ProductionWIPOperationSewing] = process
		}},
		{name: "handwork missing outsource", mutate: func(processes map[string]ProductionWIPProcessReference) {
			process := processes[ProductionWIPOperationHandwork]
			process.OutsourcingEnabled = false
			processes[ProductionWIPOperationHandwork] = process
		}},
		{name: "packaging missing inhouse", mutate: func(processes map[string]ProductionWIPProcessReference) {
			process := processes[ProductionWIPOperationPackaging]
			process.InhouseEnabled = false
			processes[ProductionWIPOperationPackaging] = process
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := base
			input.Processes = productionWIPTestProcesses()
			tt.mutate(input.Processes)
			if _, err := BuildPlushSewHandV1OperationSnapshots(input); !errors.Is(err, ErrProductionWIPInvalidRoute) {
				t.Fatalf("error=%v, want invalid route", err)
			}
		})
	}
}

func TestProductionWIPQualityGateSnapshotKeepsCustomerInspectionConditional(t *testing.T) {
	withoutCustomer, err := ProductionWIPRequiredQualityGates(ProductionWIPOperationHandwork, false)
	if err != nil {
		t.Fatal(err)
	}
	withCustomer, err := ProductionWIPRequiredQualityGates(ProductionWIPOperationHandwork, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(withoutCustomer) != 3 || len(withCustomer) != 4 || withCustomer[3] != ProductionWIPQualityGateCustomerAcceptance {
		t.Fatalf("without=%v with=%v", withoutCustomer, withCustomer)
	}
	packaging, err := ProductionWIPRequiredQualityGates(ProductionWIPOperationPackaging, true)
	if err != nil || len(packaging) != 0 {
		t.Fatalf("packaging gates=%v err=%v", packaging, err)
	}
}

func TestProductionWIPInitializationUsesOnlyExplicitReleasedRouteItems(t *testing.T) {
	route := ProductionWIPRoutePlushSewHandV1
	order := &ProductionOrder{ID: 7, Status: ProductionOrderStatusReleased}
	legacy := &ProductionOrderItem{ID: 70, ProductionOrderID: 7, LineNo: 1, PlannedQuantity: productionWIPTestDecimal("3")}
	routedLaterLine := &ProductionOrderItem{ID: 72, ProductionOrderID: 7, LineNo: 3, PlannedQuantity: productionWIPTestDecimal("4"), RouteCode: &route}
	routedEarlierLine := &ProductionOrderItem{ID: 71, ProductionOrderID: 7, LineNo: 2, PlannedQuantity: productionWIPTestDecimal("5"), RouteCode: &route}
	routed, err := ValidateProductionWIPInitialization(order, []*ProductionOrderItem{routedLaterLine, legacy, routedEarlierLine})
	if err != nil {
		t.Fatal(err)
	}
	if len(routed) != 2 || routed[0].ID != 71 || routed[1].ID != 72 {
		t.Fatalf("routed=%v", []int{routed[0].ID, routed[1].ID})
	}
	if legacy.RouteCode != nil {
		t.Fatal("legacy route_code must not be inferred")
	}
	order.Status = ProductionOrderStatusDraft
	if _, err := ValidateProductionWIPInitialization(order, []*ProductionOrderItem{routedEarlierLine}); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("draft error=%v", err)
	}
	order.Status = ProductionOrderStatusReleased
	legacy.CustomerInspectionRequired = true
	if _, err := ValidateProductionWIPInitialization(order, []*ProductionOrderItem{legacy, routedEarlierLine}); !errors.Is(err, ErrProductionWIPInvalidRoute) {
		t.Fatalf("customer inspection without route error=%v", err)
	}
}

func TestProductionOrderRouteCodeValidationPreservesLegacyNil(t *testing.T) {
	routeWithSpaces := "  " + ProductionWIPRoutePlushSewHandV1 + "  "
	draft := ProductionOrderDraft{
		OrderNo: "PO-WIP-001",
		Items: []ProductionOrderDraftItem{
			{LineNo: 2, ProductID: 2, UnitID: 1, PlannedQuantity: productionWIPTestDecimal("1")},
			{LineNo: 1, ProductID: 1, UnitID: 1, PlannedQuantity: productionWIPTestDecimal("2"), RouteCode: &routeWithSpaces, CustomerInspectionRequired: true},
		},
	}
	normalized, _, err := normalizeProductionOrderCommand(draft, 9, " key ")
	if err != nil {
		t.Fatal(err)
	}
	if normalized.Items[0].RouteCode == nil || *normalized.Items[0].RouteCode != ProductionWIPRoutePlushSewHandV1 || normalized.Items[1].RouteCode != nil {
		t.Fatalf("normalized routes=%v/%v", normalized.Items[0].RouteCode, normalized.Items[1].RouteCode)
	}
	draft.Items[0].RouteCode = nil
	draft.Items[0].CustomerInspectionRequired = true
	if _, _, err := normalizeProductionOrderCommand(draft, 9, "key"); !errors.Is(err, ErrBadParam) {
		t.Fatalf("customer inspection without route error=%v", err)
	}
	unknown := "UNKNOWN"
	draft.Items[0].RouteCode = &unknown
	draft.Items[0].CustomerInspectionRequired = false
	if _, _, err := normalizeProductionOrderCommand(draft, 9, "key"); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unknown route error=%v", err)
	}
}

func TestProductionWIPActionNormalizationAndSemanticEvents(t *testing.T) {
	base := ProductionWIPAction{
		ProductionOrderID: 1, BatchID: 2, ExpectedVersion: 3,
		ActorID: 4, IdempotencyKey: " key ",
	}
	split := base
	split.Action = " split_batch "
	split.Splits = []ProductionWIPSplit{{Quantity: productionWIPTestDecimal("6")}, {Quantity: productionWIPTestDecimal("4")}}
	normalized, err := normalizeProductionWIPAction(split)
	if err != nil {
		t.Fatal(err)
	}
	if normalized.IdempotencyKey != "key" || !normalized.Splits[0].Quantity.Equal(productionWIPTestDecimal("4")) {
		t.Fatalf("normalized split=%+v", normalized)
	}
	transfer := base
	transfer.Action = ProductionWIPActionTransferToNextOperation
	transfer.TargetOperationID = 30
	transfer.Quantity = productionWIPTestDecimal("10")
	if _, err := normalizeProductionWIPAction(transfer); err != nil {
		t.Fatalf("normalize transfer: %v", err)
	}
	if event, err := ProductionWIPEventActionForCommand(transfer.Action); err != nil || event != ProductionWIPEventActionTransfer {
		t.Fatalf("transfer event=%q err=%v", event, err)
	}
	if event, err := ProductionWIPEventActionForCommand(ProductionWIPActionReceiveOutsourcingReturn); err != nil || event != ProductionWIPEventActionOutsourcingReturn {
		t.Fatalf("return event=%q err=%v", event, err)
	}
	confirmation := ProductionWIPAction{
		Action:            ProductionWIPActionConfirmPackagingMaterial,
		ProductionOrderID: 1, ProductionOrderItemID: 8, ExpectedVersion: 1,
		ActorID: 4, IdempotencyKey: "confirm",
		PackagingVersionSnapshot: productionWIPTestString("  PKG-V2  "),
		Note:                     productionWIPTestString("  已核版  "),
	}
	normalized, err = normalizeProductionWIPAction(confirmation)
	if err != nil || normalized.Note == nil || *normalized.Note != "已核版" || normalized.PackagingVersionSnapshot == nil || *normalized.PackagingVersionSnapshot != "PKG-V2" {
		t.Fatalf("confirmation=%+v err=%v", normalized, err)
	}
	confirmation.BatchID = 2
	if _, err := normalizeProductionWIPAction(confirmation); !errors.Is(err, ErrBadParam) {
		t.Fatalf("batch-bound confirmation error=%v", err)
	}
	if _, err := ProductionWIPEventActionForCommand(ProductionWIPActionConfirmPackagingMaterial); !errors.Is(err, ErrBadParam) {
		t.Fatalf("confirmation must not be stored as WIP batch event: %v", err)
	}
}

func TestProductionWIPExecutionModeIsPerOperationBatch(t *testing.T) {
	operation := &ProductionOrderOperation{ID: 20, InhouseAllowed: true, OutsourcingAllowed: true}
	if err := ValidateProductionWIPExecutionAssignment(operation, ProductionWIPExecutionInHouse, 0); err != nil {
		t.Fatal(err)
	}
	if err := ValidateProductionWIPExecutionAssignment(operation, ProductionWIPExecutionOutsourced, 1); err != nil {
		t.Fatal(err)
	}
	if err := ValidateProductionWIPExecutionAssignment(operation, ProductionWIPExecutionInHouse, 1); !errors.Is(err, ErrProductionWIPExecutionModeNotAllowed) {
		t.Fatalf("inhouse contract error=%v", err)
	}
	operation.OutsourcingAllowed = false
	if err := ValidateProductionWIPExecutionAssignment(operation, ProductionWIPExecutionOutsourced, 1); !errors.Is(err, ErrProductionWIPExecutionModeNotAllowed) {
		t.Fatalf("disallowed outsource error=%v", err)
	}
	operation.OutsourcingAllowed = true
	batch := &ProductionWIPBatch{ProductionOrderOperationID: 20, Status: ProductionWIPStatusPlanned}
	if err := ValidateProductionWIPExecutionAssignmentForBatch(batch, operation, ProductionWIPExecutionInHouse, 0); err != nil {
		t.Fatal(err)
	}
	batch.ExecutionMode = productionWIPTestString(ProductionWIPExecutionInHouse)
	if err := ValidateProductionWIPExecutionAssignmentForBatch(batch, operation, ProductionWIPExecutionOutsourced, 1); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("second assignment error=%v", err)
	}
}

func TestProductionWIPOutsourcingAllocationIntentIsDeterministic(t *testing.T) {
	requirementID := 70
	action := ProductionWIPAction{
		Action: ProductionWIPActionAssignExecution, ProductionOrderID: 1, BatchID: 2,
		ExpectedVersion: 1, ActorID: 3, IdempotencyKey: "assign-materials", ExecutionMode: ProductionWIPExecutionOutsourced,
		OutsourcingAllocations: []ProductionWIPOutsourcingAllocationInput{
			{OutsourcingOrderItemID: 9},
			{OutsourcingOrderItemID: 7, ProductionOrderMaterialRequirementID: &requirementID},
		},
	}
	normalized, err := normalizeProductionWIPAction(action)
	if err != nil || len(normalized.OutsourcingAllocations) != 2 || normalized.OutsourcingAllocations[0].OutsourcingOrderItemID != 7 {
		t.Fatalf("normalized=%#v err=%v", normalized.OutsourcingAllocations, err)
	}
	action.OutsourcingAllocations[0].OutsourcingOrderItemID = 7
	if _, err := normalizeProductionWIPAction(action); !errors.Is(err, ErrBadParam) {
		t.Fatalf("duplicate item error=%v", err)
	}
}

func TestSelectProductionWIPFabricRequirementsUsesOnlyExplicitOwnership(t *testing.T) {
	fabric := ProductionWIPOperationFabricProcessing
	requirements := []*ProductionOrderMaterialRequirement{
		{ID: 2, ProductionOrderItemID: 10, PlannedQuantity: productionWIPTestDecimal("3"), ProductionOperationCode: &fabric},
		{ID: 1, ProductionOrderItemID: 10, PlannedQuantity: productionWIPTestDecimal("4")},
	}
	selected, err := SelectProductionWIPFabricRequirements(10, requirements)
	if err != nil || len(selected) != 1 || selected[0].ID != 2 {
		t.Fatalf("selected=%#v err=%v", selected, err)
	}
	requirements[0].ProductionOperationCode = nil
	if _, err := SelectProductionWIPFabricRequirements(10, requirements); !errors.Is(err, ErrProductionWIPInvalidRoute) {
		t.Fatalf("missing explicit owner error=%v", err)
	}
}

func TestProductionWIPSplitIsAtomicTerminalAndQuantityConserving(t *testing.T) {
	batch := &ProductionWIPBatch{ID: 1, ProductionOrderOperationID: 10, Status: ProductionWIPStatusPlanned, Quantity: productionWIPTestDecimal("10")}
	operation := &ProductionOrderOperation{ID: 10, OperationCode: ProductionWIPOperationSewing}
	exact := []ProductionWIPSplit{{Quantity: productionWIPTestDecimal("4")}, {Quantity: productionWIPTestDecimal("6")}}
	if err := ValidateProductionWIPSplit(batch, operation, decimal.Zero, exact); err != nil {
		t.Fatal(err)
	}
	if status, err := NextProductionWIPBatchStatus(ProductionWIPActionSplitBatch, batch, operation, nil, 0); err != nil || status != ProductionWIPStatusSplit {
		t.Fatalf("split status=%q err=%v", status, err)
	}
	if err := ValidateProductionWIPSplit(batch, operation, decimal.Zero, []ProductionWIPSplit{{Quantity: productionWIPTestDecimal("9")}}); !errors.Is(err, ErrProductionWIPQuantityExceeded) {
		t.Fatalf("under-allocation error=%v", err)
	}
	if err := ValidateProductionWIPSplit(batch, operation, decimal.Zero, []ProductionWIPSplit{{Quantity: productionWIPTestDecimal("11")}}); !errors.Is(err, ErrProductionWIPQuantityExceeded) {
		t.Fatalf("over-allocation error=%v", err)
	}
	if err := ValidateProductionWIPSplit(batch, operation, productionWIPTestDecimal("1"), exact); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("pre-existing children error=%v", err)
	}
	fabric := *operation
	fabric.OperationCode = ProductionWIPOperationFabricProcessing
	if err := ValidateProductionWIPSplit(batch, &fabric, decimal.Zero, exact); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("fabric split error=%v", err)
	}
}

func TestProductionWIPTransferRequiresAcceptedImmediateNextOperationAndFullQuantity(t *testing.T) {
	sourceOperation := &ProductionOrderOperation{ID: 20, ProductionOrderID: 1, ProductionOrderItemID: 2, RouteCode: ProductionWIPRoutePlushSewHandV1, RouteVersion: 1, StepNo: 20}
	targetOperation := &ProductionOrderOperation{ID: 30, ProductionOrderID: 1, ProductionOrderItemID: 2, RouteCode: ProductionWIPRoutePlushSewHandV1, RouteVersion: 1, StepNo: 30}
	batch := &ProductionWIPBatch{ProductionOrderOperationID: 20, ProductionOrderItemID: 2, Status: ProductionWIPStatusAccepted, Quantity: productionWIPTestDecimal("10")}
	if err := ValidateProductionWIPTransfer(batch, sourceOperation, targetOperation); err != nil {
		t.Fatal(err)
	}
	if err := ValidateProductionWIPTransferAllocation(batch.Quantity, decimal.Zero, productionWIPTestDecimal("10")); err != nil {
		t.Fatal(err)
	}
	if err := ValidateProductionWIPTransferAllocation(batch.Quantity, decimal.Zero, productionWIPTestDecimal("9")); !errors.Is(err, ErrProductionWIPQuantityExceeded) {
		t.Fatalf("partial transfer error=%v", err)
	}
	skipped := *targetOperation
	skipped.StepNo = 40
	if err := ValidateProductionWIPTransfer(batch, sourceOperation, &skipped); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("skipped operation error=%v", err)
	}
	batch.Status = ProductionWIPStatusWaitingQuality
	if err := ValidateProductionWIPTransfer(batch, sourceOperation, targetOperation); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("unaccepted transfer error=%v", err)
	}
}

func TestProductionWIPInternalCompletionAndOutsourceReturnStayDistinct(t *testing.T) {
	inhouse := ProductionWIPExecutionInHouse
	outsourced := ProductionWIPExecutionOutsourced
	operation := &ProductionOrderOperation{ID: 20, OperationCode: ProductionWIPOperationSewing, InhouseAllowed: true, OutsourcingAllowed: true, RequiredQualityGates: []string{ProductionWIPQualityGateShell}}
	inhouseBatch := &ProductionWIPBatch{ProductionOrderOperationID: 20, Status: ProductionWIPStatusPlanned, ExecutionMode: &inhouse}
	if status, err := NextProductionWIPBatchStatus(ProductionWIPActionStartOperation, inhouseBatch, operation, nil, 0); err != nil || status != ProductionWIPStatusInProgress {
		t.Fatalf("inhouse start=%q err=%v", status, err)
	}
	inhouseBatch.Status = ProductionWIPStatusInProgress
	if status, err := NextProductionWIPBatchStatus(ProductionWIPActionCompleteOperation, inhouseBatch, operation, nil, 0); err != nil || status != ProductionWIPStatusWaitingQuality {
		t.Fatalf("inhouse complete=%q err=%v", status, err)
	}
	outsourcedBatch := &ProductionWIPBatch{ProductionOrderOperationID: 20, Status: ProductionWIPStatusPlanned, ExecutionMode: &outsourced}
	if status, err := NextProductionWIPBatchStatus(ProductionWIPActionStartOperation, outsourcedBatch, operation, nil, 1); err != nil || status != ProductionWIPStatusOutsourced {
		t.Fatalf("outsource start=%q err=%v", status, err)
	}
	outsourcedBatch.Status = ProductionWIPStatusOutsourced
	if _, err := NextProductionWIPBatchStatus(ProductionWIPActionCompleteOperation, outsourcedBatch, operation, nil, 1); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("external completion must not use internal action: %v", err)
	}
	if status, err := NextProductionWIPBatchStatus(ProductionWIPActionReceiveOutsourcingReturn, outsourcedBatch, operation, nil, 1); err != nil || status != ProductionWIPStatusWaitingQuality {
		t.Fatalf("outsource return=%q err=%v", status, err)
	}
}

func TestProductionWIPPackagingConfirmationIsIndependentAndRequiredOnlyAtStart(t *testing.T) {
	inhouse := ProductionWIPExecutionInHouse
	confirmationCode := ProductionWIPBusinessConfirmationPackagingMaterial
	operation := &ProductionOrderOperation{
		ID: 40, ProductionOrderID: 1, ProductionOrderItemID: 2,
		OperationCode: ProductionWIPOperationPackaging, InhouseAllowed: true,
		BusinessConfirmationCode: &confirmationCode,
	}
	batch := &ProductionWIPBatch{
		ProductionOrderID: 1, ProductionOrderItemID: 2, ProductionOrderOperationID: 40,
		Status: ProductionWIPStatusPlanned, ExecutionMode: &inhouse,
	}
	if _, err := NextProductionWIPBatchStatus(ProductionWIPActionStartOperation, batch, operation, nil, 0); !errors.Is(err, ErrProductionWIPPackagingConfirmationPending) {
		t.Fatalf("missing confirmation error=%v", err)
	}
	pending := &ProductionPackagingConfirmation{ID: 3, ProductionOrderID: 1, ProductionOrderItemID: 2, Status: ProductionPackagingConfirmationPending, Version: 1}
	if next, err := NextProductionPackagingConfirmationStatus(ProductionWIPActionConfirmPackagingMaterial, pending); err != nil || next != ProductionPackagingConfirmationConfirmed {
		t.Fatalf("confirmation next=%q err=%v", next, err)
	}
	actor := 9
	now := time.Now()
	confirmed := &ProductionPackagingConfirmation{
		ID: 3, ProductionOrderID: 1, ProductionOrderItemID: 2,
		Status: ProductionPackagingConfirmationConfirmed, Version: 2,
		PackagingVersionSnapshot: productionWIPTestString("PKG-V2"),
		ConfirmedBy:              &actor,
		ConfirmedAt:              &now,
	}
	if status, err := NextProductionWIPBatchStatus(ProductionWIPActionStartOperation, batch, operation, confirmed, 0); err != nil || status != ProductionWIPStatusInProgress {
		t.Fatalf("packaging start=%q err=%v", status, err)
	}
}

func TestProductionWIPQualityGatesRequireEveryDistinctDecision(t *testing.T) {
	required := []string{ProductionWIPQualityGateFinishedGoods, ProductionWIPQualityGateNeedle, ProductionWIPQualityGateSampling}
	if status, err := EvaluateProductionWIPQualityGates(required, nil); !errors.Is(err, ErrProductionWIPQualityGateIncomplete) || status != ProductionWIPStatusWaitingQuality {
		t.Fatalf("pending status=%q err=%v", status, err)
	}
	pass := QualityInspectionResultPass
	decisions := make([]ProductionWIPQualityDecision, 0, len(required))
	for _, gate := range required {
		decisions = append(decisions, ProductionWIPQualityDecision{GateCode: gate, Status: QualityInspectionStatusPassed, Result: &pass})
	}
	if status, err := EvaluateProductionWIPQualityGates(required, decisions); err != nil || status != ProductionWIPStatusAccepted {
		t.Fatalf("accepted status=%q err=%v", status, err)
	}
	concession := QualityInspectionResultConcession
	decisions[1] = ProductionWIPQualityDecision{GateCode: ProductionWIPQualityGateNeedle, Status: QualityInspectionStatusPassed, Result: &concession}
	if status, err := EvaluateProductionWIPQualityGates(required, decisions); !errors.Is(err, ErrProductionWIPInvalidTransition) || status != "" {
		t.Fatalf("concession status=%q err=%v", status, err)
	}
	reject := QualityInspectionResultReject
	decisions[1] = ProductionWIPQualityDecision{GateCode: ProductionWIPQualityGateNeedle, Status: QualityInspectionStatusRejected, Result: &reject}
	if status, err := EvaluateProductionWIPQualityGates(required, decisions); err != nil || status != ProductionWIPStatusRejected {
		t.Fatalf("rejected status=%q err=%v", status, err)
	}
}

func TestProductionWIPStatusBlocksOrderClose(t *testing.T) {
	for _, test := range []struct {
		status string
		blocks bool
	}{
		{ProductionWIPStatusPlanned, true},
		{ProductionWIPStatusInProgress, true},
		{ProductionWIPStatusOutsourced, true},
		{ProductionWIPStatusWaitingQuality, true},
		{ProductionWIPStatusSplit, false},
		{ProductionWIPStatusAccepted, false},
		{ProductionWIPStatusRejected, false},
		{ProductionWIPStatusCancelled, false},
	} {
		blocks, err := ProductionWIPStatusBlocksOrderClose(test.status)
		if err != nil || blocks != test.blocks {
			t.Fatalf("status %s blocks=%v err=%v", test.status, blocks, err)
		}
	}
	if blocks, err := ProductionWIPStatusBlocksOrderClose("UNKNOWN"); !errors.Is(err, ErrProductionWIPInvalidTransition) || blocks {
		t.Fatalf("unknown status blocks=%v err=%v", blocks, err)
	}
}

func TestProductionWIPReworkCanReturnToSameOrEarlierOperation(t *testing.T) {
	route := ProductionWIPRoutePlushSewHandV1
	sourceOperation := &ProductionOrderOperation{ID: 20, ProductionOrderID: 1, ProductionOrderItemID: 2, RouteCode: route, RouteVersion: 1, StepNo: 20}
	sameOperation := *sourceOperation
	earlierOperation := *sourceOperation
	earlierOperation.ID = 10
	earlierOperation.StepNo = 10
	laterOperation := *sourceOperation
	laterOperation.ID = 30
	laterOperation.StepNo = 30
	batch := &ProductionWIPBatch{ProductionOrderOperationID: 20, Status: ProductionWIPStatusRejected, Quantity: productionWIPTestDecimal("10")}
	if err := ValidateProductionWIPRework(batch, sourceOperation, &sameOperation, decimal.Zero, productionWIPTestDecimal("10"), "皮套检验不合格"); err != nil {
		t.Fatalf("same-operation rework: %v", err)
	}
	if err := ValidateProductionWIPRework(batch, sourceOperation, &earlierOperation, decimal.Zero, productionWIPTestDecimal("5"), "退回前道"); err != nil {
		t.Fatalf("earlier-operation rework: %v", err)
	}
	if err := ValidateProductionWIPRework(batch, sourceOperation, &laterOperation, decimal.Zero, productionWIPTestDecimal("5"), "错误去向"); !errors.Is(err, ErrProductionWIPInvalidTransition) {
		t.Fatalf("later-operation error=%v", err)
	}
	if err := ValidateProductionWIPRework(batch, sourceOperation, &sameOperation, productionWIPTestDecimal("6"), productionWIPTestDecimal("5"), "超量"); !errors.Is(err, ErrProductionWIPQuantityExceeded) {
		t.Fatalf("excess rework error=%v", err)
	}
}

func TestProductionWIPLineageBatchNumbersAreRepositoryGenerated(t *testing.T) {
	tests := []struct {
		action     string
		targetStep int
		ordinal    int
		want       string
	}{
		{ProductionWIPActionSplitBatch, 0, 1, "PO-1-L1-S01"},
		{ProductionWIPActionTransferToNextOperation, 30, 2, "PO-1-L1-T30-02"},
		{ProductionWIPActionRework, 0, 12, "PO-1-L1-R12"},
	}
	for _, tt := range tests {
		got, err := BuildProductionWIPLineageBatchNo("PO-1-L1", tt.action, tt.targetStep, tt.ordinal)
		if err != nil || got != tt.want {
			t.Fatalf("action=%s got=%q err=%v", tt.action, got, err)
		}
	}
}

type productionWIPTestRepo struct {
	ProductionOrderRepo
	aggregate  *ProductionWIPAggregate
	getOrderID int
	initialize *ProductionWIPInitializeCommand
	command    *ProductionWIPCommand
}

func (r *productionWIPTestRepo) GetProductionWIP(_ context.Context, productionOrderID int) (*ProductionWIPAggregate, error) {
	r.getOrderID = productionOrderID
	return r.aggregate, nil
}

func (r *productionWIPTestRepo) InitializeProductionWIP(_ context.Context, in *ProductionWIPInitializeCommand) (*ProductionWIPAggregate, error) {
	r.initialize = in
	return r.aggregate, nil
}

func (r *productionWIPTestRepo) ApplyProductionWIPCommand(_ context.Context, in *ProductionWIPCommand) (*ProductionWIPAggregate, error) {
	r.command = in
	return r.aggregate, nil
}

func TestProductionWIPUsecaseExposesGetInitializeAndCanonicalTransfer(t *testing.T) {
	repo := &productionWIPTestRepo{aggregate: &ProductionWIPAggregate{ProductionOrderID: 9}}
	uc := NewProductionOrderUsecase(repo)
	if _, err := uc.GetProductionWIP(context.Background(), 9); err != nil || repo.getOrderID != 9 {
		t.Fatalf("get id=%d err=%v", repo.getOrderID, err)
	}
	if _, err := uc.InitializeProductionWIP(context.Background(), &ProductionWIPInitialize{ProductionOrderID: 9, ActorID: 2, IdempotencyKey: "init"}); err != nil {
		t.Fatal(err)
	}
	if repo.initialize == nil || repo.initialize.RouteCode != ProductionWIPRoutePlushSewHandV1 || len(repo.initialize.IntentHash) != 64 {
		t.Fatalf("initialize=%+v", repo.initialize)
	}
	if _, err := uc.TransferProductionWIPToNextOperation(context.Background(), &ProductionWIPAction{
		ProductionOrderID: 9, BatchID: 3, TargetOperationID: 30,
		Quantity: productionWIPTestDecimal("4"), ExpectedVersion: 1,
		ActorID: 2, IdempotencyKey: "transfer",
	}); err != nil {
		t.Fatal(err)
	}
	if repo.command == nil || repo.command.Action != ProductionWIPActionTransferToNextOperation || len(repo.command.IntentHash) != 64 {
		t.Fatalf("command=%+v", repo.command)
	}
}
