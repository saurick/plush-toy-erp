package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	ProductionWIPRoutePlushSewHandV1        = "PLUSH_SEW_HAND_V1"
	ProductionWIPRoutePlushSewHandV1Version = 1
	ProductionWIPMutationResultV1           = "production.wip-mutation-result/v1"
	ProductionWIPQualitySourceType          = "PRODUCTION_WIP"
	ProductionWIPQualityInspectionType      = "PRODUCTION_STAGE"
	ProductionWIPQualitySubjectType         = "WIP"

	ProductionWIPOperationFabricProcessing = "FABRIC_PROCESSING"
	ProductionWIPOperationSewing           = "SEWING"
	ProductionWIPOperationHandwork         = "HANDWORK"
	ProductionWIPOperationPackaging        = "PACKAGING"

	ProductionWIPOutputCutPiece      = "CUT_PIECE"
	ProductionWIPOutputShell         = "SHELL"
	ProductionWIPOutputFinishedGoods = "FINISHED_GOODS"
	ProductionWIPOutputPackedGoods   = "PACKED_GOODS"

	ProductionWIPQualityGateCutPiece                   = "CUT_PIECE"
	ProductionWIPQualityGateShell                      = "SHELL"
	ProductionWIPQualityGateFinishedGoods              = "FINISHED_GOODS"
	ProductionWIPQualityGateNeedle                     = "NEEDLE"
	ProductionWIPQualityGateSampling                   = "SAMPLING"
	ProductionWIPQualityGateCustomerAcceptance         = "CUSTOMER_ACCEPTANCE"
	ProductionWIPBusinessConfirmationPackagingMaterial = "PACKAGING_MATERIAL"

	ProductionWIPExecutionInHouse    = "IN_HOUSE"
	ProductionWIPExecutionOutsourced = "OUTSOURCED"

	ProductionWIPFlowNormal = "NORMAL"
	ProductionWIPFlowRework = "REWORK"

	ProductionWIPStatusPlanned        = "PLANNED"
	ProductionWIPStatusSplit          = "SPLIT"
	ProductionWIPStatusInProgress     = "IN_PROGRESS"
	ProductionWIPStatusOutsourced     = "OUTSOURCED"
	ProductionWIPStatusWaitingQuality = "WAITING_QUALITY"
	ProductionWIPStatusAccepted       = "ACCEPTED"
	ProductionWIPStatusRejected       = "REJECTED"
	ProductionWIPStatusCancelled      = "CANCELLED"

	ProductionPackagingConfirmationPending   = "PENDING"
	ProductionPackagingConfirmationConfirmed = "CONFIRMED"

	ProductionWIPActionInitialize               = "INITIALIZE"
	ProductionWIPActionSplitBatch               = "SPLIT_BATCH"
	ProductionWIPActionAssignExecution          = "ASSIGN_EXECUTION"
	ProductionWIPActionStartOperation           = "START_OPERATION"
	ProductionWIPActionCompleteOperation        = "COMPLETE_OPERATION"
	ProductionWIPActionTransferToNextOperation  = "TRANSFER_TO_NEXT_OPERATION"
	ProductionWIPActionReceiveOutsourcingReturn = "RECEIVE_OUTSOURCING_RETURN"
	ProductionWIPActionConfirmPackagingMaterial = "CONFIRM_PACKAGING_MATERIAL"
	ProductionWIPActionRework                   = "REWORK"

	ProductionWIPEventActionTransfer          = "WIP_TRANSFER"
	ProductionWIPEventActionOutsourcingReturn = "OUTSOURCE_RETURN"
)

var (
	ErrProductionWIPUnavailable                     = errors.New("production WIP repository unavailable")
	ErrProductionWIPInvalidRoute                    = errors.New("production WIP route invalid")
	ErrProductionWIPInvalidTransition               = errors.New("production WIP transition invalid")
	ErrProductionWIPQuantityExceeded                = errors.New("production WIP quantity exceeded")
	ErrProductionWIPExecutionModeNotAllowed         = errors.New("production WIP execution mode not allowed")
	ErrProductionWIPOutsourcingAllocationInvalid    = errors.New("production WIP outsourcing allocation invalid")
	ErrProductionWIPOutsourcingMaterialIssuePending = errors.New("production WIP outsourcing material issue pending")
	ErrProductionWIPOutsourcingSourceDependency     = errors.New("outsourcing source is linked to production WIP")
	ErrProductionWIPQualityGateIncomplete           = errors.New("production WIP quality gate incomplete")
	ErrProductionWIPPackagingConfirmationPending    = errors.New("production WIP packaging confirmation pending")
)

type ProductionWIPProcessReference struct {
	ID                 int
	Code               string
	Name               string
	InhouseEnabled     bool
	OutsourcingEnabled bool
	IsActive           bool
}

type ProductionWIPRouteSnapshotInput struct {
	ProductionOrderID          int
	ProductionOrderItemID      int
	PlannedQuantity            decimal.Decimal
	CustomerInspectionRequired bool
	Processes                  map[string]ProductionWIPProcessReference
}

type ProductionOrderOperation struct {
	ID                       int
	ProductionOrderID        int
	ProductionOrderItemID    int
	RouteCode                string
	RouteVersion             int
	StepNo                   int
	OperationCode            string
	ProcessID                int
	ProcessCodeSnapshot      string
	ProcessNameSnapshot      string
	OutputCode               string
	InhouseAllowed           bool
	OutsourcingAllowed       bool
	PlannedQuantity          decimal.Decimal
	RequiredQualityGates     []string
	BusinessConfirmationCode *string
	CreatedAt                time.Time
}

type ProductionWIPBatch struct {
	ID                         int
	ProductionOrderID          int
	ProductionOrderItemID      int
	ProductionOrderOperationID int
	SourceBatchID              *int
	BatchNo                    string
	FlowType                   string
	ExecutionMode              *string
	Status                     string
	Version                    int
	Quantity                   decimal.Decimal
	ReworkReason               *string
	CreatedBy                  int
	StartedAt                  *time.Time
	CompletedAt                *time.Time
	CreatedAt                  time.Time
	UpdatedAt                  time.Time
}

// ProductionWIPOutsourcingAllocationInput binds an outsourced WIP batch to a
// contract line. Fabric processing also names the frozen material requirement
// being fulfilled; product operations deliberately leave it nil.
type ProductionWIPOutsourcingAllocationInput struct {
	OutsourcingOrderItemID               int  `json:"outsourcing_order_item_id"`
	ProductionOrderMaterialRequirementID *int `json:"production_order_material_requirement_id,omitempty"`
}

type ProductionWIPOutsourcingAllocation struct {
	ID                                   int
	ProductionWIPBatchID                 int
	OutsourcingOrderItemID               int
	ProductionOrderMaterialRequirementID *int
	SubjectType                          string
	AllocatedQuantity                    decimal.Decimal
	UnitID                               int
	CreatedBy                            int
	CreatedAt                            time.Time
}

// ProductionPackagingConfirmation is an order-item-level business decision.
// It is intentionally independent from the packaging WIP batch so business
// may confirm artwork/version requirements while earlier operations run.
type ProductionPackagingConfirmation struct {
	ID                       int
	ProductionOrderID        int
	ProductionOrderItemID    int
	Status                   string
	Version                  int
	PackagingVersionSnapshot *string
	ConfirmedBy              *int
	ConfirmedAt              *time.Time
	Note                     *string
	CreatedAt                time.Time
	UpdatedAt                time.Time
}

type ProductionWIPQualityInspectionSummary struct {
	ID                   int
	ProductionWIPBatchID int
	GateCode             string
	Status               string
	Result               *string
}

type ProductionWIPAggregate struct {
	ProductionOrderID      int
	ProductionOrder        *ProductionOrder
	ProductionOrderItems   []*ProductionOrderItem
	MaterialRequirements   []*ProductionOrderMaterialRequirement
	Operations             []*ProductionOrderOperation
	Batches                []*ProductionWIPBatch
	OutsourcingAllocations []*ProductionWIPOutsourcingAllocation
	PackagingConfirmations []*ProductionPackagingConfirmation
	QualityInspections     []*ProductionWIPQualityInspectionSummary
}

type ProductionWIPInitialize struct {
	ProductionOrderID int
	ActorID           int
	IdempotencyKey    string
}

type ProductionWIPInitializeCommand struct {
	ProductionOrderID int
	ActorID           int
	IdempotencyKey    string
	RouteCode         string
	RouteVersion      int
	IntentHash        string
}

type ProductionWIPSplit struct {
	Quantity decimal.Decimal
}

type ProductionWIPAction struct {
	Action                   string
	ProductionOrderID        int
	ProductionOrderItemID    int
	BatchID                  int
	TargetOperationID        int
	ExpectedVersion          int
	ActorID                  int
	IdempotencyKey           string
	ExecutionMode            string
	OutsourcingAllocations   []ProductionWIPOutsourcingAllocationInput
	Splits                   []ProductionWIPSplit
	Quantity                 decimal.Decimal
	Reason                   *string
	PackagingVersionSnapshot *string
	Note                     *string
}

type ProductionWIPCommand struct {
	ProductionWIPAction
	IntentHash string
}

// ProductionWIPRepo is implemented by productionOrderRepo in the data layer.
// Keeping it optional avoids a new provider and preserves existing constructors.
type ProductionWIPRepo interface {
	GetProductionWIP(ctx context.Context, productionOrderID int) (*ProductionWIPAggregate, error)
	InitializeProductionWIP(ctx context.Context, in *ProductionWIPInitializeCommand) (*ProductionWIPAggregate, error)
	ApplyProductionWIPCommand(ctx context.Context, in *ProductionWIPCommand) (*ProductionWIPAggregate, error)
}

type productionWIPRouteStep struct {
	StepNo                   int
	OperationCode            string
	OutputCode               string
	InhouseAllowed           bool
	OutsourcingAllowed       bool
	RequiredQualityGates     []string
	BusinessConfirmationCode *string
}

func plushSewHandV1Route(customerInspectionRequired bool) []productionWIPRouteStep {
	handworkGates, _ := ProductionWIPRequiredQualityGates(ProductionWIPOperationHandwork, customerInspectionRequired)
	packagingConfirmation := ProductionWIPBusinessConfirmationPackagingMaterial
	return []productionWIPRouteStep{
		{StepNo: 10, OperationCode: ProductionWIPOperationFabricProcessing, OutputCode: ProductionWIPOutputCutPiece, OutsourcingAllowed: true, RequiredQualityGates: []string{ProductionWIPQualityGateCutPiece}},
		{StepNo: 20, OperationCode: ProductionWIPOperationSewing, OutputCode: ProductionWIPOutputShell, InhouseAllowed: true, OutsourcingAllowed: true, RequiredQualityGates: []string{ProductionWIPQualityGateShell}},
		{StepNo: 30, OperationCode: ProductionWIPOperationHandwork, OutputCode: ProductionWIPOutputFinishedGoods, InhouseAllowed: true, OutsourcingAllowed: true, RequiredQualityGates: handworkGates},
		{StepNo: 40, OperationCode: ProductionWIPOperationPackaging, OutputCode: ProductionWIPOutputPackedGoods, InhouseAllowed: true, BusinessConfirmationCode: &packagingConfirmation},
	}
}

// BuildPlushSewHandV1OperationSnapshots freezes the fixed Product Core route.
// Process references are supplied by the repository and only their immutable
// display snapshots are copied; processes.sort_order is deliberately ignored.
func BuildPlushSewHandV1OperationSnapshots(in ProductionWIPRouteSnapshotInput) ([]*ProductionOrderOperation, error) {
	if in.ProductionOrderID <= 0 || in.ProductionOrderItemID <= 0 || !in.PlannedQuantity.GreaterThan(decimal.Zero) {
		return nil, ErrBadParam
	}
	steps := plushSewHandV1Route(in.CustomerInspectionRequired)
	out := make([]*ProductionOrderOperation, 0, len(steps))
	for _, step := range steps {
		process, ok := in.Processes[step.OperationCode]
		process.Code = strings.TrimSpace(process.Code)
		process.Name = strings.TrimSpace(process.Name)
		if !ok || process.ID <= 0 || process.Code == "" || len(process.Code) > 64 || process.Name == "" || len(process.Name) > 255 ||
			!process.IsActive ||
			(step.InhouseAllowed && !process.InhouseEnabled) ||
			(step.OutsourcingAllowed && !process.OutsourcingEnabled) {
			return nil, ErrProductionWIPInvalidRoute
		}
		out = append(out, &ProductionOrderOperation{
			ProductionOrderID: in.ProductionOrderID, ProductionOrderItemID: in.ProductionOrderItemID,
			RouteCode: ProductionWIPRoutePlushSewHandV1, RouteVersion: ProductionWIPRoutePlushSewHandV1Version,
			StepNo: step.StepNo, OperationCode: step.OperationCode, ProcessID: process.ID,
			ProcessCodeSnapshot: process.Code, ProcessNameSnapshot: process.Name, OutputCode: step.OutputCode,
			InhouseAllowed:     step.InhouseAllowed && process.InhouseEnabled,
			OutsourcingAllowed: step.OutsourcingAllowed && process.OutsourcingEnabled,
			PlannedQuantity:    in.PlannedQuantity, RequiredQualityGates: append([]string(nil), step.RequiredQualityGates...),
			BusinessConfirmationCode: cloneProductionWIPString(step.BusinessConfirmationCode),
		})
	}
	return out, nil
}

// ProductionWIPRequiredQualityGates derives the immutable gate snapshot copied
// to the released operation. Batches read that snapshot and never duplicate it.
func ProductionWIPRequiredQualityGates(operationCode string, customerInspectionRequired bool) ([]string, error) {
	switch strings.ToUpper(strings.TrimSpace(operationCode)) {
	case ProductionWIPOperationFabricProcessing:
		return []string{ProductionWIPQualityGateCutPiece}, nil
	case ProductionWIPOperationSewing:
		return []string{ProductionWIPQualityGateShell}, nil
	case ProductionWIPOperationHandwork:
		gates := []string{
			ProductionWIPQualityGateFinishedGoods,
			ProductionWIPQualityGateNeedle,
			ProductionWIPQualityGateSampling,
		}
		if customerInspectionRequired {
			gates = append(gates, ProductionWIPQualityGateCustomerAcceptance)
		}
		return gates, nil
	case ProductionWIPOperationPackaging:
		return []string{}, nil
	default:
		return nil, ErrProductionWIPInvalidRoute
	}
}

// ValidateProductionWIPInitialization preserves the legacy completion path:
// only explicitly route-coded items participate and route_code is never
// inferred for old items. The repository must call this under the released
// production-order transaction before creating route snapshots.
func ValidateProductionWIPInitialization(order *ProductionOrder, items []*ProductionOrderItem) ([]*ProductionOrderItem, error) {
	if order == nil || order.ID <= 0 {
		return nil, ErrBadParam
	}
	if order.Status != ProductionOrderStatusReleased {
		return nil, ErrProductionWIPInvalidTransition
	}
	routed := make([]*ProductionOrderItem, 0, len(items))
	for _, item := range items {
		if item == nil || item.ID <= 0 || item.ProductionOrderID != order.ID || !item.PlannedQuantity.GreaterThan(decimal.Zero) {
			return nil, ErrProductionWIPInvalidRoute
		}
		if item.RouteCode == nil {
			if item.CustomerInspectionRequired {
				return nil, ErrProductionWIPInvalidRoute
			}
			continue
		}
		routeCode := strings.TrimSpace(*item.RouteCode)
		if routeCode != ProductionWIPRoutePlushSewHandV1 {
			return nil, ErrProductionWIPInvalidRoute
		}
		routed = append(routed, item)
	}
	if len(routed) == 0 {
		return nil, ErrProductionWIPInvalidRoute
	}
	sort.Slice(routed, func(i, j int) bool {
		if routed[i].LineNo == routed[j].LineNo {
			return routed[i].ID < routed[j].ID
		}
		return routed[i].LineNo < routed[j].LineNo
	})
	return routed, nil
}

// SelectProductionWIPFabricRequirements returns the frozen BOM requirements
// explicitly owned by FABRIC_PROCESSING. Route ownership is never inferred
// from material names, BOM position, or free text.
func SelectProductionWIPFabricRequirements(itemID int, requirements []*ProductionOrderMaterialRequirement) ([]*ProductionOrderMaterialRequirement, error) {
	if itemID <= 0 || len(requirements) == 0 {
		return nil, ErrProductionWIPInvalidRoute
	}
	selected := make([]*ProductionOrderMaterialRequirement, 0, len(requirements))
	seen := make(map[int]struct{}, len(requirements))
	for _, requirement := range requirements {
		if requirement == nil || requirement.ID <= 0 || requirement.ProductionOrderItemID != itemID ||
			!requirement.PlannedQuantity.GreaterThan(decimal.Zero) {
			return nil, ErrProductionWIPInvalidRoute
		}
		if _, duplicate := seen[requirement.ID]; duplicate {
			return nil, ErrProductionWIPInvalidRoute
		}
		seen[requirement.ID] = struct{}{}
		if requirement.ProductionOperationCode == nil {
			continue
		}
		code := strings.ToUpper(strings.TrimSpace(*requirement.ProductionOperationCode))
		if code != ProductionWIPOperationFabricProcessing {
			return nil, ErrProductionWIPInvalidRoute
		}
		selected = append(selected, requirement)
	}
	if len(selected) == 0 {
		return nil, ErrProductionWIPInvalidRoute
	}
	sort.Slice(selected, func(i, j int) bool { return selected[i].ID < selected[j].ID })
	return selected, nil
}

func (uc *ProductionOrderUsecase) GetProductionWIP(ctx context.Context, productionOrderID int) (*ProductionWIPAggregate, error) {
	if uc == nil || uc.repo == nil || productionOrderID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionWIPRepo)
	if !ok {
		return nil, ErrProductionWIPUnavailable
	}
	return repo.GetProductionWIP(ctx, productionOrderID)
}

func (uc *ProductionOrderUsecase) InitializeProductionWIP(ctx context.Context, in *ProductionWIPInitialize) (*ProductionWIPAggregate, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ProductionOrderID <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionWIPRepo)
	if !ok {
		return nil, ErrProductionWIPUnavailable
	}
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(key) > 128 {
		return nil, ErrBadParam
	}
	command := &ProductionWIPInitializeCommand{
		ProductionOrderID: in.ProductionOrderID,
		ActorID:           in.ActorID,
		IdempotencyKey:    key,
		RouteCode:         ProductionWIPRoutePlushSewHandV1,
		RouteVersion:      ProductionWIPRoutePlushSewHandV1Version,
	}
	hash, err := productionWIPIntentHash(command)
	if err != nil {
		return nil, err
	}
	command.IntentHash = hash
	return repo.InitializeProductionWIP(ctx, command)
}

func (uc *ProductionOrderUsecase) ApplyProductionWIPAction(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionWIPRepo)
	if !ok {
		return nil, ErrProductionWIPUnavailable
	}
	normalized, err := normalizeProductionWIPAction(*in)
	if err != nil {
		return nil, err
	}
	// ExpectedVersion is a concurrency precondition, not command intent. Exact
	// retries therefore keep the same receipt identity even after the first
	// command advanced the row version.
	intent := normalized
	intent.ExpectedVersion = 0
	hash, err := productionWIPIntentHash(intent)
	if err != nil {
		return nil, err
	}
	return repo.ApplyProductionWIPCommand(ctx, &ProductionWIPCommand{ProductionWIPAction: normalized, IntentHash: hash})
}

func (uc *ProductionOrderUsecase) SplitProductionWIPBatch(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionSplitBatch)
}

func (uc *ProductionOrderUsecase) AssignProductionWIPExecution(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionAssignExecution)
}

func (uc *ProductionOrderUsecase) StartProductionWIPOperation(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionStartOperation)
}

func (uc *ProductionOrderUsecase) CompleteProductionWIPOperation(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionCompleteOperation)
}

func (uc *ProductionOrderUsecase) TransferProductionWIPToNextOperation(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionTransferToNextOperation)
}

func (uc *ProductionOrderUsecase) ReceiveProductionWIPOutsourcingReturn(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionReceiveOutsourcingReturn)
}

func (uc *ProductionOrderUsecase) ConfirmProductionWIPPackagingMaterial(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionConfirmPackagingMaterial)
}

func (uc *ProductionOrderUsecase) ReworkProductionWIPBatch(ctx context.Context, in *ProductionWIPAction) (*ProductionWIPAggregate, error) {
	return uc.applyNamedProductionWIPAction(ctx, in, ProductionWIPActionRework)
}

func (uc *ProductionOrderUsecase) applyNamedProductionWIPAction(ctx context.Context, in *ProductionWIPAction, action string) (*ProductionWIPAggregate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	copy := *in
	copy.Action = action
	return uc.ApplyProductionWIPAction(ctx, &copy)
}

func normalizeProductionWIPAction(in ProductionWIPAction) (ProductionWIPAction, error) {
	in.Action = strings.ToUpper(strings.TrimSpace(in.Action))
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.ExecutionMode = strings.ToUpper(strings.TrimSpace(in.ExecutionMode))
	in.Reason = normalizeOptionalProductionOrderText(in.Reason)
	in.PackagingVersionSnapshot = normalizeOptionalProductionOrderText(in.PackagingVersionSnapshot)
	in.Note = normalizeOptionalProductionOrderText(in.Note)
	if in.ProductionOrderID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || in.IdempotencyKey == "" || len(in.IdempotencyKey) > 128 ||
		(in.Reason != nil && len(*in.Reason) > 255) ||
		(in.PackagingVersionSnapshot != nil && len(*in.PackagingVersionSnapshot) > 128) ||
		(in.Note != nil && len(*in.Note) > 255) {
		return ProductionWIPAction{}, ErrBadParam
	}
	if in.Action == ProductionWIPActionConfirmPackagingMaterial {
		if in.ProductionOrderItemID <= 0 || in.BatchID != 0 || in.TargetOperationID != 0 ||
			in.ExecutionMode != "" || len(in.OutsourcingAllocations) != 0 || len(in.Splits) != 0 ||
			!in.Quantity.IsZero() || in.Reason != nil || in.PackagingVersionSnapshot == nil {
			return ProductionWIPAction{}, ErrBadParam
		}
		return in, nil
	}
	if in.BatchID <= 0 || in.ProductionOrderItemID != 0 || in.PackagingVersionSnapshot != nil || in.Note != nil {
		return ProductionWIPAction{}, ErrBadParam
	}
	switch in.Action {
	case ProductionWIPActionSplitBatch:
		if in.TargetOperationID != 0 || in.ExecutionMode != "" || len(in.OutsourcingAllocations) != 0 || !in.Quantity.IsZero() || in.Reason != nil {
			return ProductionWIPAction{}, ErrBadParam
		}
		var err error
		if in.Splits, err = normalizeProductionWIPSplits(in.Splits); err != nil {
			return ProductionWIPAction{}, err
		}
	case ProductionWIPActionTransferToNextOperation:
		if in.TargetOperationID <= 0 || !in.Quantity.GreaterThan(decimal.Zero) || len(in.Splits) != 0 ||
			in.ExecutionMode != "" || len(in.OutsourcingAllocations) != 0 || in.Reason != nil {
			return ProductionWIPAction{}, ErrBadParam
		}
	case ProductionWIPActionAssignExecution:
		if in.TargetOperationID != 0 || len(in.Splits) != 0 || !in.Quantity.IsZero() || in.Reason != nil ||
			(in.ExecutionMode != ProductionWIPExecutionInHouse && in.ExecutionMode != ProductionWIPExecutionOutsourced) {
			return ProductionWIPAction{}, ErrBadParam
		}
		if in.ExecutionMode == ProductionWIPExecutionInHouse && len(in.OutsourcingAllocations) != 0 {
			return ProductionWIPAction{}, ErrBadParam
		}
		if in.ExecutionMode == ProductionWIPExecutionOutsourced {
			var err error
			if in.OutsourcingAllocations, err = normalizeProductionWIPOutsourcingAllocations(in.OutsourcingAllocations); err != nil {
				return ProductionWIPAction{}, err
			}
		}
		if in.ExecutionMode == ProductionWIPExecutionOutsourced && len(in.OutsourcingAllocations) == 0 {
			return ProductionWIPAction{}, ErrBadParam
		}
	case ProductionWIPActionStartOperation, ProductionWIPActionCompleteOperation, ProductionWIPActionReceiveOutsourcingReturn:
		if in.TargetOperationID != 0 || in.ExecutionMode != "" || len(in.OutsourcingAllocations) != 0 || len(in.Splits) != 0 || !in.Quantity.IsZero() || in.Reason != nil {
			return ProductionWIPAction{}, ErrBadParam
		}
	case ProductionWIPActionRework:
		if in.TargetOperationID <= 0 || !in.Quantity.GreaterThan(decimal.Zero) || in.Reason == nil ||
			in.ExecutionMode != "" || len(in.OutsourcingAllocations) != 0 || len(in.Splits) != 0 {
			return ProductionWIPAction{}, ErrBadParam
		}
	default:
		return ProductionWIPAction{}, ErrBadParam
	}
	return in, nil
}

func normalizeProductionWIPOutsourcingAllocations(input []ProductionWIPOutsourcingAllocationInput) ([]ProductionWIPOutsourcingAllocationInput, error) {
	if len(input) == 0 || len(input) > 100 {
		return nil, ErrBadParam
	}
	allocations := append([]ProductionWIPOutsourcingAllocationInput(nil), input...)
	seenItems := make(map[int]struct{}, len(allocations))
	seenRequirements := make(map[int]struct{}, len(allocations))
	for _, allocation := range allocations {
		if allocation.OutsourcingOrderItemID <= 0 {
			return nil, ErrBadParam
		}
		if _, duplicate := seenItems[allocation.OutsourcingOrderItemID]; duplicate {
			return nil, ErrBadParam
		}
		seenItems[allocation.OutsourcingOrderItemID] = struct{}{}
		if allocation.ProductionOrderMaterialRequirementID != nil {
			if *allocation.ProductionOrderMaterialRequirementID <= 0 {
				return nil, ErrBadParam
			}
			if _, duplicate := seenRequirements[*allocation.ProductionOrderMaterialRequirementID]; duplicate {
				return nil, ErrBadParam
			}
			seenRequirements[*allocation.ProductionOrderMaterialRequirementID] = struct{}{}
		}
	}
	sort.Slice(allocations, func(i, j int) bool {
		if allocations[i].OutsourcingOrderItemID != allocations[j].OutsourcingOrderItemID {
			return allocations[i].OutsourcingOrderItemID < allocations[j].OutsourcingOrderItemID
		}
		left, right := 0, 0
		if allocations[i].ProductionOrderMaterialRequirementID != nil {
			left = *allocations[i].ProductionOrderMaterialRequirementID
		}
		if allocations[j].ProductionOrderMaterialRequirementID != nil {
			right = *allocations[j].ProductionOrderMaterialRequirementID
		}
		return left < right
	})
	return allocations, nil
}

func normalizeProductionWIPSplits(input []ProductionWIPSplit) ([]ProductionWIPSplit, error) {
	if len(input) == 0 {
		return nil, ErrBadParam
	}
	splits := append([]ProductionWIPSplit(nil), input...)
	for i := range splits {
		if !splits[i].Quantity.GreaterThan(decimal.Zero) {
			return nil, ErrBadParam
		}
	}
	sort.Slice(splits, func(i, j int) bool { return splits[i].Quantity.LessThan(splits[j].Quantity) })
	return splits, nil
}

func ValidateProductionWIPExecutionAssignment(operation *ProductionOrderOperation, mode string, allocationCount int) error {
	if operation == nil {
		return ErrBadParam
	}
	mode = strings.ToUpper(strings.TrimSpace(mode))
	switch mode {
	case ProductionWIPExecutionInHouse:
		if !operation.InhouseAllowed || allocationCount != 0 {
			return ErrProductionWIPExecutionModeNotAllowed
		}
	case ProductionWIPExecutionOutsourced:
		if !operation.OutsourcingAllowed || allocationCount <= 0 {
			return ErrProductionWIPExecutionModeNotAllowed
		}
	default:
		return ErrProductionWIPExecutionModeNotAllowed
	}
	return nil
}

func ValidateProductionWIPExecutionAssignmentForBatch(batch *ProductionWIPBatch, operation *ProductionOrderOperation, mode string, allocationCount int) error {
	if batch == nil || operation == nil || batch.ProductionOrderOperationID != operation.ID {
		return ErrBadParam
	}
	if batch.Status != ProductionWIPStatusPlanned || batch.ExecutionMode != nil {
		return ErrProductionWIPInvalidTransition
	}
	return ValidateProductionWIPExecutionAssignment(operation, mode, allocationCount)
}

// ValidateProductionWIPAllocation enforces explicit quantity conservation.
// alreadyAllocated must exclude cancelled children; the repository calculates
// it under the source-batch lock. The returned value is the remaining quantity.
func ValidateProductionWIPAllocation(sourceQuantity, alreadyAllocated decimal.Decimal, splits []ProductionWIPSplit) (decimal.Decimal, error) {
	if !sourceQuantity.GreaterThan(decimal.Zero) || alreadyAllocated.IsNegative() || alreadyAllocated.GreaterThan(sourceQuantity) || len(splits) == 0 {
		return decimal.Zero, ErrBadParam
	}
	requested := decimal.Zero
	for _, split := range splits {
		if !split.Quantity.GreaterThan(decimal.Zero) {
			return decimal.Zero, ErrBadParam
		}
		requested = requested.Add(split.Quantity)
	}
	used := alreadyAllocated.Add(requested)
	if used.GreaterThan(sourceQuantity) {
		return decimal.Zero, ErrProductionWIPQuantityExceeded
	}
	return sourceQuantity.Sub(used), nil
}

// ValidateProductionWIPSplit requires one atomic, quantity-conserving split.
// The repository must lock the parent, verify no child was previously created,
// mark the parent SPLIT, and insert every child in the same transaction.
func ValidateProductionWIPSplit(source *ProductionWIPBatch, operation *ProductionOrderOperation, alreadyAllocated decimal.Decimal, splits []ProductionWIPSplit) error {
	if source == nil || source.Status != ProductionWIPStatusPlanned || !alreadyAllocated.IsZero() {
		return ErrProductionWIPInvalidTransition
	}
	if operation == nil || source.ProductionOrderOperationID != operation.ID {
		return ErrBadParam
	}
	if operation.OperationCode == ProductionWIPOperationFabricProcessing {
		return ErrProductionWIPInvalidTransition
	}
	remaining, err := ValidateProductionWIPAllocation(source.Quantity, alreadyAllocated, splits)
	if err != nil {
		return err
	}
	if !remaining.IsZero() {
		return ErrProductionWIPQuantityExceeded
	}
	return nil
}

// ValidateProductionWIPTransfer permits only an accepted batch to move to the
// immediately following production operation. Completion and quality approval
// never create the next batch implicitly.
func ValidateProductionWIPTransfer(source *ProductionWIPBatch, sourceOperation, targetOperation *ProductionOrderOperation) error {
	if source == nil || sourceOperation == nil || targetOperation == nil ||
		source.ProductionOrderOperationID != sourceOperation.ID ||
		source.ProductionOrderItemID != sourceOperation.ProductionOrderItemID ||
		sourceOperation.ProductionOrderItemID != targetOperation.ProductionOrderItemID {
		return ErrBadParam
	}
	if source.Status != ProductionWIPStatusAccepted ||
		targetOperation.StepNo-sourceOperation.StepNo != 10 ||
		targetOperation.RouteCode != sourceOperation.RouteCode ||
		targetOperation.RouteVersion != sourceOperation.RouteVersion {
		return ErrProductionWIPInvalidTransition
	}
	return nil
}

// ValidateProductionWIPTransferAllocation requires one explicit transfer
// quantity to consume the complete untransferred source batch. Operators split
// first when the next operation needs multiple child batches.
func ValidateProductionWIPTransferAllocation(sourceQuantity, alreadyTransferred, quantity decimal.Decimal) error {
	if !sourceQuantity.GreaterThan(decimal.Zero) || alreadyTransferred.IsNegative() || !quantity.GreaterThan(decimal.Zero) {
		return ErrBadParam
	}
	if alreadyTransferred.Add(quantity).GreaterThan(sourceQuantity) {
		return ErrProductionWIPQuantityExceeded
	}
	if !alreadyTransferred.Add(quantity).Equal(sourceQuantity) {
		return ErrProductionWIPQuantityExceeded
	}
	return nil
}

func ValidateProductionWIPRework(source *ProductionWIPBatch, sourceOperation, targetOperation *ProductionOrderOperation, alreadyReworked, quantity decimal.Decimal, reason string) error {
	if source == nil || sourceOperation == nil || targetOperation == nil ||
		source.ProductionOrderOperationID != sourceOperation.ID ||
		source.Status != ProductionWIPStatusRejected ||
		sourceOperation.ProductionOrderID != targetOperation.ProductionOrderID ||
		sourceOperation.ProductionOrderItemID != targetOperation.ProductionOrderItemID ||
		sourceOperation.RouteCode != targetOperation.RouteCode ||
		sourceOperation.RouteVersion != targetOperation.RouteVersion ||
		targetOperation.StepNo > sourceOperation.StepNo ||
		strings.TrimSpace(reason) == "" || !quantity.GreaterThan(decimal.Zero) {
		return ErrProductionWIPInvalidTransition
	}
	if alreadyReworked.IsNegative() || alreadyReworked.Add(quantity).GreaterThan(source.Quantity) {
		return ErrProductionWIPQuantityExceeded
	}
	return nil
}

// BuildProductionWIPLineageBatchNo is repository-only numbering logic. Callers
// never supply technical batch numbers; the repository resolves idempotency,
// locks the parent, chooses the next ordinal, then relies on the unique index.
func BuildProductionWIPLineageBatchNo(parentBatchNo, action string, targetStep, ordinal int) (string, error) {
	parentBatchNo = strings.TrimSpace(parentBatchNo)
	action = strings.ToUpper(strings.TrimSpace(action))
	if parentBatchNo == "" || ordinal <= 0 {
		return "", ErrBadParam
	}
	var suffix string
	switch action {
	case ProductionWIPActionSplitBatch:
		if targetStep != 0 {
			return "", ErrBadParam
		}
		suffix = "-S" + leftPadProductionWIPOrdinal(ordinal)
	case ProductionWIPActionTransferToNextOperation:
		if targetStep <= 0 {
			return "", ErrBadParam
		}
		suffix = "-T" + decimal.NewFromInt(int64(targetStep)).String() + "-" + leftPadProductionWIPOrdinal(ordinal)
	case ProductionWIPActionRework:
		if targetStep != 0 {
			return "", ErrBadParam
		}
		suffix = "-R" + leftPadProductionWIPOrdinal(ordinal)
	default:
		return "", ErrBadParam
	}
	batchNo := parentBatchNo + suffix
	if len(batchNo) > 64 {
		return "", ErrBadParam
	}
	return batchNo, nil
}

func leftPadProductionWIPOrdinal(ordinal int) string {
	value := decimal.NewFromInt(int64(ordinal)).String()
	if ordinal < 10 {
		return "0" + value
	}
	return value
}

// ProductionWIPEventActionForCommand keeps operator command names separate
// from the semantic append-only event names used for movement audit.
func ProductionWIPEventActionForCommand(commandAction string) (string, error) {
	switch strings.ToUpper(strings.TrimSpace(commandAction)) {
	case ProductionWIPActionInitialize,
		ProductionWIPActionSplitBatch,
		ProductionWIPActionAssignExecution,
		ProductionWIPActionStartOperation,
		ProductionWIPActionCompleteOperation,
		ProductionWIPActionRework:
		return strings.ToUpper(strings.TrimSpace(commandAction)), nil
	case ProductionWIPActionTransferToNextOperation:
		return ProductionWIPEventActionTransfer, nil
	case ProductionWIPActionReceiveOutsourcingReturn:
		return ProductionWIPEventActionOutsourcingReturn, nil
	default:
		return "", ErrBadParam
	}
}

func ValidateProductionPackagingConfirmationForStart(batch *ProductionWIPBatch, operation *ProductionOrderOperation, confirmation *ProductionPackagingConfirmation) error {
	if batch == nil || operation == nil || batch.ProductionOrderOperationID != operation.ID {
		return ErrBadParam
	}
	if operation.OperationCode != ProductionWIPOperationPackaging {
		if operation.BusinessConfirmationCode != nil {
			return ErrProductionWIPInvalidRoute
		}
		return nil
	}
	if operation.BusinessConfirmationCode == nil || *operation.BusinessConfirmationCode != ProductionWIPBusinessConfirmationPackagingMaterial {
		return ErrProductionWIPInvalidRoute
	}
	if confirmation == nil ||
		confirmation.ProductionOrderID != batch.ProductionOrderID ||
		confirmation.ProductionOrderItemID != batch.ProductionOrderItemID ||
		confirmation.Status != ProductionPackagingConfirmationConfirmed ||
		confirmation.Version <= 0 ||
		confirmation.PackagingVersionSnapshot == nil || strings.TrimSpace(*confirmation.PackagingVersionSnapshot) == "" ||
		confirmation.ConfirmedBy == nil || confirmation.ConfirmedAt == nil {
		return ErrProductionWIPPackagingConfirmationPending
	}
	return nil
}

func NextProductionPackagingConfirmationStatus(action string, confirmation *ProductionPackagingConfirmation) (string, error) {
	if confirmation == nil || confirmation.ID <= 0 || confirmation.Version <= 0 {
		return "", ErrBadParam
	}
	if strings.ToUpper(strings.TrimSpace(action)) != ProductionWIPActionConfirmPackagingMaterial || confirmation.Status != ProductionPackagingConfirmationPending {
		return "", ErrProductionWIPInvalidTransition
	}
	return ProductionPackagingConfirmationConfirmed, nil
}

func NextProductionWIPBatchStatus(action string, batch *ProductionWIPBatch, operation *ProductionOrderOperation, packagingConfirmation *ProductionPackagingConfirmation, allocationCount int) (string, error) {
	if batch == nil || operation == nil || batch.ProductionOrderOperationID != operation.ID {
		return "", ErrBadParam
	}
	mode := ""
	if batch.ExecutionMode != nil {
		mode = *batch.ExecutionMode
	}
	nextAfterCompletion := func() string {
		if len(operation.RequiredQualityGates) > 0 {
			return ProductionWIPStatusWaitingQuality
		}
		return ProductionWIPStatusAccepted
	}
	switch action {
	case ProductionWIPActionSplitBatch:
		if batch.Status == ProductionWIPStatusPlanned {
			return ProductionWIPStatusSplit, nil
		}
	case ProductionWIPActionStartOperation:
		if batch.Status != ProductionWIPStatusPlanned {
			return "", ErrProductionWIPInvalidTransition
		}
		if err := ValidateProductionPackagingConfirmationForStart(batch, operation, packagingConfirmation); err != nil {
			return "", err
		}
		if err := ValidateProductionWIPExecutionAssignment(operation, mode, allocationCount); err != nil {
			return "", err
		}
		if mode == ProductionWIPExecutionInHouse {
			return ProductionWIPStatusInProgress, nil
		}
		if mode == ProductionWIPExecutionOutsourced && allocationCount > 0 {
			return ProductionWIPStatusOutsourced, nil
		}
	case ProductionWIPActionCompleteOperation:
		if batch.Status == ProductionWIPStatusInProgress && mode == ProductionWIPExecutionInHouse {
			return nextAfterCompletion(), nil
		}
	case ProductionWIPActionReceiveOutsourcingReturn:
		if batch.Status == ProductionWIPStatusOutsourced && mode == ProductionWIPExecutionOutsourced {
			return nextAfterCompletion(), nil
		}
	case ProductionWIPActionTransferToNextOperation:
		if batch.Status == ProductionWIPStatusAccepted {
			return ProductionWIPStatusAccepted, nil
		}
	}
	return "", ErrProductionWIPInvalidTransition
}

type ProductionWIPQualityDecision struct {
	GateCode string
	Status   string
	Result   *string
}

// ProductionWIPStatusBlocksOrderClose keeps the order-close boundary aligned
// with the WIP state machine. SPLIT is a consumed parent whose children carry
// the remaining work, while ACCEPTED, REJECTED, and CANCELLED are terminal.
func ProductionWIPStatusBlocksOrderClose(status string) (bool, error) {
	switch status {
	case ProductionWIPStatusPlanned,
		ProductionWIPStatusInProgress,
		ProductionWIPStatusOutsourced,
		ProductionWIPStatusWaitingQuality:
		return true, nil
	case ProductionWIPStatusSplit,
		ProductionWIPStatusAccepted,
		ProductionWIPStatusRejected,
		ProductionWIPStatusCancelled:
		return false, nil
	default:
		return false, ErrProductionWIPInvalidTransition
	}
}

// ValidateProductionWIPQualityDecision rejects generic quality concessions on
// a frozen production route. A route gate advances only on PASSED + PASS.
func ValidateProductionWIPQualityDecision(decision ProductionWIPQualityDecision) error {
	switch decision.Status {
	case QualityInspectionStatusDraft, QualityInspectionStatusSubmitted, QualityInspectionStatusCancelled:
		if decision.Result != nil {
			return ErrProductionWIPInvalidTransition
		}
	case QualityInspectionStatusPassed:
		if decision.Result == nil || *decision.Result != QualityInspectionResultPass {
			return ErrProductionWIPInvalidTransition
		}
	case QualityInspectionStatusRejected:
		if decision.Result == nil || *decision.Result != QualityInspectionResultReject {
			return ErrProductionWIPInvalidTransition
		}
	default:
		return ErrProductionWIPInvalidTransition
	}
	return nil
}

// EvaluateProductionWIPQualityGates treats each WIP batch as all-or-nothing.
// Partial pass/reject must first be represented by explicit child batches.
func EvaluateProductionWIPQualityGates(required []string, decisions []ProductionWIPQualityDecision) (string, error) {
	if len(required) == 0 {
		return ProductionWIPStatusAccepted, nil
	}
	requiredSet := make(map[string]struct{}, len(required))
	for _, gate := range required {
		gate = strings.ToUpper(strings.TrimSpace(gate))
		if !isProductionWIPQualityGate(gate) {
			return "", ErrProductionWIPInvalidRoute
		}
		if _, duplicate := requiredSet[gate]; duplicate {
			return "", ErrProductionWIPInvalidRoute
		}
		requiredSet[gate] = struct{}{}
	}
	decisionByGate := make(map[string]ProductionWIPQualityDecision, len(decisions))
	for _, decision := range decisions {
		gate := strings.ToUpper(strings.TrimSpace(decision.GateCode))
		if _, requiredGate := requiredSet[gate]; !requiredGate {
			return "", ErrProductionWIPInvalidRoute
		}
		if _, duplicate := decisionByGate[gate]; duplicate {
			return "", ErrProductionWIPInvalidRoute
		}
		decisionByGate[gate] = decision
	}
	pending := false
	for gate := range requiredSet {
		decision, ok := decisionByGate[gate]
		if !ok {
			pending = true
			continue
		}
		if err := ValidateProductionWIPQualityDecision(decision); err != nil {
			return "", err
		}
		if decision.Status == QualityInspectionStatusDraft || decision.Status == QualityInspectionStatusSubmitted {
			pending = true
			continue
		}
		switch decision.Status {
		case QualityInspectionStatusRejected:
			return ProductionWIPStatusRejected, nil
		case QualityInspectionStatusPassed:
		default:
			return "", ErrProductionWIPInvalidTransition
		}
	}
	if pending {
		return ProductionWIPStatusWaitingQuality, ErrProductionWIPQualityGateIncomplete
	}
	return ProductionWIPStatusAccepted, nil
}

func isProductionWIPQualityGate(gate string) bool {
	switch gate {
	case ProductionWIPQualityGateCutPiece,
		ProductionWIPQualityGateShell,
		ProductionWIPQualityGateFinishedGoods,
		ProductionWIPQualityGateNeedle,
		ProductionWIPQualityGateSampling,
		ProductionWIPQualityGateCustomerAcceptance:
		return true
	default:
		return false
	}
}

func productionWIPIntentHash(value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}

func cloneProductionWIPString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
