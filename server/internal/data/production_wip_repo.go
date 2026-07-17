package data

import (
	"context"
	stdsql "database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/process"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionordermaterialrequirement"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionpackagingconfirmation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipevent"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
	"server/internal/data/model/ent/qualityinspection"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/shopspring/decimal"
)

var _ biz.ProductionWIPRepo = (*productionOrderRepo)(nil)

type productionWIPMutationResult struct {
	Contract  string                      `json:"contract"`
	Aggregate *biz.ProductionWIPAggregate `json:"aggregate"`
}

type productionWIPMutationOutcome struct {
	Batch      *ent.ProductionWIPBatch
	FromStatus string
	ToStatus   string
	Quantity   decimal.Decimal
	Reason     *string
}

func (r *productionOrderRepo) GetProductionWIP(ctx context.Context, productionOrderID int) (*biz.ProductionWIPAggregate, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil || productionOrderID <= 0 {
		return nil, biz.ErrBadParam
	}
	sqlTx, err := r.data.sqldb.BeginTx(ctx, &stdsql.TxOptions{Isolation: stdsql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = sqlTx.Rollback() }()
	client := productionWIPClientForSQLTx(r.data, sqlTx)
	aggregate, err := loadProductionWIPAggregate(ctx, client, productionOrderID)
	if err != nil {
		return nil, err
	}
	if err := sqlTx.Commit(); err != nil {
		return nil, err
	}
	return aggregate, nil
}

// InitializeProductionWIP is deliberately a read-after-lock operation. Route
// snapshots are frozen atomically by RELEASE; this method may verify and return
// that frozen result, but it must never infer a route for a legacy order.
func (r *productionOrderRepo) InitializeProductionWIP(ctx context.Context, in *biz.ProductionWIPInitializeCommand) (*biz.ProductionWIPAggregate, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil || in == nil || in.ProductionOrderID <= 0 || in.ActorID <= 0 ||
		strings.TrimSpace(in.IdempotencyKey) == "" || len(in.IntentHash) != 64 ||
		in.RouteCode != biz.ProductionWIPRoutePlushSewHandV1 || in.RouteVersion != biz.ProductionWIPRoutePlushSewHandV1Version {
		return nil, biz.ErrBadParam
	}
	tx, err := r.beginProductionOrderCommandTx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.sqlTx.Rollback() }()
	if err := r.lockProductionOrderCommandSource(ctx, tx.sqlTx, in.ProductionOrderID); err != nil {
		return nil, err
	}
	aggregate, err := loadProductionWIPAggregate(ctx, tx.client, in.ProductionOrderID)
	if err != nil {
		return nil, err
	}
	if aggregate.ProductionOrder == nil || aggregate.ProductionOrder.Status != biz.ProductionOrderStatusReleased || len(aggregate.Operations) == 0 {
		return nil, biz.ErrProductionWIPInvalidRoute
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	return aggregate, nil
}

func productionWIPClientForSQLTx(data *Data, sqlTx *stdsql.Tx) *ent.Client {
	sqlDialect := data.sqlDialect
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	return ent.NewClient(ent.Driver(entsql.NewDriver(sqlDialect, entsql.Conn{ExecQuerier: sqlTx})))
}

func freezeProductionOrderWIPRoute(ctx context.Context, client *ent.Client, orderID, actorID int) error {
	if client == nil || orderID <= 0 || actorID <= 0 {
		return biz.ErrBadParam
	}
	orderRow, err := client.ProductionOrder.Get(ctx, orderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionOrderNotFound
		}
		return err
	}
	if orderRow.Status != biz.ProductionOrderStatusReleased {
		return biz.ErrProductionWIPInvalidTransition
	}
	itemRows, err := client.ProductionOrderItem.Query().
		Where(productionorderitem.ProductionOrderID(orderID)).
		Order(ent.Asc(productionorderitem.FieldLineNo), ent.Asc(productionorderitem.FieldID)).
		All(ctx)
	if err != nil {
		return err
	}
	if len(itemRows) == 0 {
		return biz.ErrProductionOrderReferenceInvalid
	}
	routedItems := make([]*ent.ProductionOrderItem, 0, len(itemRows))
	for _, item := range itemRows {
		if item.RouteCode == nil {
			if item.CustomerInspectionRequired {
				return biz.ErrProductionWIPInvalidRoute
			}
			continue
		}
		if strings.TrimSpace(*item.RouteCode) != biz.ProductionWIPRoutePlushSewHandV1 {
			return biz.ErrProductionWIPInvalidRoute
		}
		routedItems = append(routedItems, item)
	}
	if err := requireProductionWIPRouteEmpty(ctx, client, orderID); err != nil {
		return err
	}
	// A nil route is the explicit legacy path. RELEASE remains unchanged and no
	// WIP object is created for that order line.
	if len(routedItems) == 0 {
		return nil
	}
	processes, err := resolveProductionWIPRouteProcesses(ctx, client)
	if err != nil {
		return err
	}
	materialRequirements, err := loadProductionOrderMaterialRequirements(ctx, client, orderID)
	if err != nil {
		return err
	}
	for _, item := range routedItems {
		itemRequirements := make([]*biz.ProductionOrderMaterialRequirement, 0)
		for _, requirement := range materialRequirements {
			if requirement != nil && requirement.ProductionOrderItemID == item.ID {
				itemRequirements = append(itemRequirements, requirement)
			}
		}
		if _, err := biz.SelectProductionWIPFabricRequirements(item.ID, itemRequirements); err != nil {
			return err
		}
		operations, err := biz.BuildPlushSewHandV1OperationSnapshots(biz.ProductionWIPRouteSnapshotInput{
			ProductionOrderID:          orderID,
			ProductionOrderItemID:      item.ID,
			PlannedQuantity:            item.PlannedQuantity,
			CustomerInspectionRequired: item.CustomerInspectionRequired,
			Processes:                  processes,
		})
		if err != nil {
			return err
		}
		var firstOperation *ent.ProductionOrderOperation
		for _, operation := range operations {
			row, err := client.ProductionOrderOperation.Create().
				SetProductionOrderID(operation.ProductionOrderID).
				SetProductionOrderItemID(operation.ProductionOrderItemID).
				SetRouteCode(operation.RouteCode).
				SetRouteVersion(operation.RouteVersion).
				SetStepNo(operation.StepNo).
				SetOperationCode(operation.OperationCode).
				SetProcessID(operation.ProcessID).
				SetProcessCodeSnapshot(operation.ProcessCodeSnapshot).
				SetProcessNameSnapshot(operation.ProcessNameSnapshot).
				SetOutputCode(operation.OutputCode).
				SetInhouseAllowed(operation.InhouseAllowed).
				SetOutsourcingAllowed(operation.OutsourcingAllowed).
				SetPlannedQuantity(operation.PlannedQuantity).
				SetRequiredQualityGates(append([]string(nil), operation.RequiredQualityGates...)).
				SetNillableBusinessConfirmationCode(operation.BusinessConfirmationCode).
				Save(ctx)
			if err != nil {
				return err
			}
			if firstOperation == nil {
				firstOperation = row
			}
		}
		if firstOperation == nil || firstOperation.StepNo != 10 {
			return biz.ErrProductionWIPInvalidRoute
		}
		if _, err := client.ProductionPackagingConfirmation.Create().
			SetProductionOrderID(orderID).
			SetProductionOrderItemID(item.ID).
			SetStatus(biz.ProductionPackagingConfirmationPending).
			SetVersion(1).
			Save(ctx); err != nil {
			return err
		}
		batchNo := fmt.Sprintf("WIP-%d-%d", orderID, item.ID)
		if len(batchNo) > 64 {
			return biz.ErrProductionWIPInvalidRoute
		}
		if _, err := client.ProductionWIPBatch.Create().
			SetProductionOrderID(orderID).
			SetProductionOrderItemID(item.ID).
			SetProductionOrderOperationID(firstOperation.ID).
			SetBatchNo(batchNo).
			SetFlowType(biz.ProductionWIPFlowNormal).
			SetStatus(biz.ProductionWIPStatusPlanned).
			SetVersion(1).
			SetQuantity(item.PlannedQuantity).
			SetCreatedBy(actorID).
			Save(ctx); err != nil {
			return err
		}
	}
	return nil
}

func requireProductionWIPRouteEmpty(ctx context.Context, client *ent.Client, orderID int) error {
	counts := []func(context.Context) (int, error){
		func(ctx context.Context) (int, error) {
			return client.ProductionOrderOperation.Query().Where(productionorderoperation.ProductionOrderID(orderID)).Count(ctx)
		},
		func(ctx context.Context) (int, error) {
			return client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderID(orderID)).Count(ctx)
		},
		func(ctx context.Context) (int, error) {
			return client.ProductionPackagingConfirmation.Query().Where(productionpackagingconfirmation.ProductionOrderID(orderID)).Count(ctx)
		},
	}
	for _, count := range counts {
		value, err := count(ctx)
		if err != nil {
			return err
		}
		if value != 0 {
			return biz.ErrProductionWIPInvalidRoute
		}
	}
	return nil
}

func resolveProductionWIPRouteProcesses(ctx context.Context, client *ent.Client) (map[string]biz.ProductionWIPProcessReference, error) {
	semantics := []struct {
		operationCode string
		labels        []string
	}{
		{biz.ProductionWIPOperationFabricProcessing, []string{"机裁", "裁片"}},
		{biz.ProductionWIPOperationSewing, []string{"车缝"}},
		{biz.ProductionWIPOperationHandwork, []string{"手工"}},
		{biz.ProductionWIPOperationPackaging, []string{"包装"}},
	}
	resolved := make(map[string]biz.ProductionWIPProcessReference, len(semantics))
	used := make(map[int]struct{}, len(semantics))
	for _, semantic := range semantics {
		rows, err := client.Process.Query().Where(
			process.IsActive(true),
			process.Or(process.NameIn(semantic.labels...), process.CategoryIn(semantic.labels...)),
		).All(ctx)
		if err != nil {
			return nil, err
		}
		if len(rows) != 1 {
			return nil, biz.ErrProductionWIPInvalidRoute
		}
		row := rows[0]
		if _, duplicate := used[row.ID]; duplicate {
			return nil, biz.ErrProductionWIPInvalidRoute
		}
		used[row.ID] = struct{}{}
		resolved[semantic.operationCode] = biz.ProductionWIPProcessReference{
			ID: row.ID, Code: row.Code, Name: row.Name, InhouseEnabled: row.InhouseEnabled,
			OutsourcingEnabled: row.OutsourcingEnabled, IsActive: row.IsActive,
		}
	}
	return resolved, nil
}

func loadProductionWIPAggregate(ctx context.Context, client *ent.Client, orderID int) (*biz.ProductionWIPAggregate, error) {
	base, err := loadProductionOrderAggregate(ctx, client, orderID)
	if err != nil {
		return nil, err
	}
	operationRows, err := client.ProductionOrderOperation.Query().
		Where(productionorderoperation.ProductionOrderID(orderID)).
		Order(ent.Asc(productionorderoperation.FieldProductionOrderItemID), ent.Asc(productionorderoperation.FieldStepNo), ent.Asc(productionorderoperation.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	batchRows, err := client.ProductionWIPBatch.Query().
		Where(productionwipbatch.ProductionOrderID(orderID)).
		Order(ent.Asc(productionwipbatch.FieldProductionOrderItemID), ent.Asc(productionwipbatch.FieldCreatedAt), ent.Asc(productionwipbatch.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	confirmationRows, err := client.ProductionPackagingConfirmation.Query().
		Where(productionpackagingconfirmation.ProductionOrderID(orderID)).
		Order(ent.Asc(productionpackagingconfirmation.FieldProductionOrderItemID), ent.Asc(productionpackagingconfirmation.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	aggregate := &biz.ProductionWIPAggregate{
		ProductionOrderID:      orderID,
		ProductionOrder:        base.Order,
		ProductionOrderItems:   base.Items,
		MaterialRequirements:   base.MaterialRequirements,
		Operations:             make([]*biz.ProductionOrderOperation, 0, len(operationRows)),
		Batches:                make([]*biz.ProductionWIPBatch, 0, len(batchRows)),
		OutsourcingAllocations: []*biz.ProductionWIPOutsourcingAllocation{},
		PackagingConfirmations: make([]*biz.ProductionPackagingConfirmation, 0, len(confirmationRows)),
		QualityInspections:     []*biz.ProductionWIPQualityInspectionSummary{},
	}
	for _, row := range operationRows {
		aggregate.Operations = append(aggregate.Operations, entProductionOrderOperationToBiz(row))
	}
	batchIDs := make([]int, 0, len(batchRows))
	for _, row := range batchRows {
		batchIDs = append(batchIDs, row.ID)
		aggregate.Batches = append(aggregate.Batches, entProductionWIPBatchToBiz(row))
	}
	for _, row := range confirmationRows {
		aggregate.PackagingConfirmations = append(aggregate.PackagingConfirmations, entProductionPackagingConfirmationToBiz(row))
	}
	if len(batchIDs) > 0 {
		allocationRows, err := client.ProductionWIPOutsourcingAllocation.Query().
			Where(productionwipoutsourcingallocation.ProductionWipBatchIDIn(batchIDs...)).
			Order(ent.Asc(productionwipoutsourcingallocation.FieldProductionWipBatchID), ent.Asc(productionwipoutsourcingallocation.FieldID)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range allocationRows {
			aggregate.OutsourcingAllocations = append(aggregate.OutsourcingAllocations, entProductionWIPOutsourcingAllocationToBiz(row))
		}
		qualityRows, err := client.QualityInspection.Query().
			Where(qualityinspection.ProductionWipBatchIDIn(batchIDs...)).
			Order(ent.Asc(qualityinspection.FieldProductionWipBatchID), ent.Asc(qualityinspection.FieldID)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, row := range qualityRows {
			if row.ProductionWipBatchID == nil || row.GateCode == nil {
				return nil, biz.ErrProductionWIPInvalidRoute
			}
			aggregate.QualityInspections = append(aggregate.QualityInspections, &biz.ProductionWIPQualityInspectionSummary{
				ID: row.ID, ProductionWIPBatchID: *row.ProductionWipBatchID,
				GateCode: *row.GateCode, Status: row.Status, Result: row.Result,
			})
		}
	}
	if err := validateProductionWIPAggregateShape(aggregate); err != nil {
		return nil, err
	}
	return aggregate, nil
}

func validateProductionWIPAggregateShape(aggregate *biz.ProductionWIPAggregate) error {
	if aggregate == nil || aggregate.ProductionOrder == nil || aggregate.ProductionOrder.ID != aggregate.ProductionOrderID {
		return biz.ErrProductionWIPInvalidRoute
	}
	itemByID := make(map[int]*biz.ProductionOrderItem, len(aggregate.ProductionOrderItems))
	requirementByID := make(map[int]*biz.ProductionOrderMaterialRequirement, len(aggregate.MaterialRequirements))
	fabricRequirementIDsByItem := make(map[int]map[int]struct{})
	operationsByItem := make(map[int][]*biz.ProductionOrderOperation)
	operationByID := make(map[int]*biz.ProductionOrderOperation, len(aggregate.Operations))
	confirmationByItem := make(map[int]*biz.ProductionPackagingConfirmation, len(aggregate.PackagingConfirmations))
	for _, item := range aggregate.ProductionOrderItems {
		if item == nil || item.ProductionOrderID != aggregate.ProductionOrderID {
			return biz.ErrProductionWIPInvalidRoute
		}
		itemByID[item.ID] = item
	}
	for _, requirement := range aggregate.MaterialRequirements {
		if requirement == nil || requirement.ID <= 0 || requirement.ProductionOrderID != aggregate.ProductionOrderID ||
			itemByID[requirement.ProductionOrderItemID] == nil || requirementByID[requirement.ID] != nil ||
			!requirement.PlannedQuantity.GreaterThan(decimal.Zero) || requirement.UnitID <= 0 || requirement.MaterialID <= 0 {
			return biz.ErrProductionWIPInvalidRoute
		}
		requirementByID[requirement.ID] = requirement
		if requirement.ProductionOperationCode != nil {
			if strings.TrimSpace(*requirement.ProductionOperationCode) != biz.ProductionWIPOperationFabricProcessing {
				return biz.ErrProductionWIPInvalidRoute
			}
			byID := fabricRequirementIDsByItem[requirement.ProductionOrderItemID]
			if byID == nil {
				byID = make(map[int]struct{})
				fabricRequirementIDsByItem[requirement.ProductionOrderItemID] = byID
			}
			byID[requirement.ID] = struct{}{}
		}
	}
	for _, operation := range aggregate.Operations {
		if operation == nil || operation.ProductionOrderID != aggregate.ProductionOrderID || itemByID[operation.ProductionOrderItemID] == nil {
			return biz.ErrProductionWIPInvalidRoute
		}
		operationByID[operation.ID] = operation
		operationsByItem[operation.ProductionOrderItemID] = append(operationsByItem[operation.ProductionOrderItemID], operation)
	}
	for _, confirmation := range aggregate.PackagingConfirmations {
		if confirmation == nil || confirmation.ProductionOrderID != aggregate.ProductionOrderID || itemByID[confirmation.ProductionOrderItemID] == nil || confirmationByItem[confirmation.ProductionOrderItemID] != nil {
			return biz.ErrProductionWIPInvalidRoute
		}
		confirmationByItem[confirmation.ProductionOrderItemID] = confirmation
	}
	for _, item := range aggregate.ProductionOrderItems {
		if item.RouteCode == nil {
			if len(operationsByItem[item.ID]) != 0 || confirmationByItem[item.ID] != nil || item.CustomerInspectionRequired {
				return biz.ErrProductionWIPInvalidRoute
			}
			continue
		}
		if *item.RouteCode != biz.ProductionWIPRoutePlushSewHandV1 || len(operationsByItem[item.ID]) != 4 || confirmationByItem[item.ID] == nil {
			return biz.ErrProductionWIPInvalidRoute
		}
		for index, operation := range operationsByItem[item.ID] {
			if operation.StepNo != (index+1)*10 || operation.RouteCode != biz.ProductionWIPRoutePlushSewHandV1 || operation.RouteVersion != biz.ProductionWIPRoutePlushSewHandV1Version {
				return biz.ErrProductionWIPInvalidRoute
			}
		}
	}
	batchByID := make(map[int]*biz.ProductionWIPBatch, len(aggregate.Batches))
	allocationCountByBatch := make(map[int]int, len(aggregate.Batches))
	for _, allocation := range aggregate.OutsourcingAllocations {
		if allocation == nil || allocation.ID <= 0 || allocation.AllocatedQuantity.LessThanOrEqual(decimal.Zero) {
			return biz.ErrProductionWIPInvalidRoute
		}
		allocationCountByBatch[allocation.ProductionWIPBatchID]++
	}
	for _, batch := range aggregate.Batches {
		if batch == nil {
			return biz.ErrProductionWIPInvalidRoute
		}
		operation := operationByID[batch.ProductionOrderOperationID]
		if operation == nil || batch.ProductionOrderID != aggregate.ProductionOrderID ||
			batch.ProductionOrderItemID != operation.ProductionOrderItemID || !batch.Quantity.GreaterThan(decimal.Zero) {
			return biz.ErrProductionWIPInvalidRoute
		}
		batchByID[batch.ID] = batch
		allocationCount := allocationCountByBatch[batch.ID]
		if batch.ExecutionMode == nil && allocationCount != 0 {
			return biz.ErrProductionWIPInvalidRoute
		}
		if batch.ExecutionMode != nil {
			if err := biz.ValidateProductionWIPExecutionAssignment(operation, *batch.ExecutionMode, allocationCount); err != nil {
				return biz.ErrProductionWIPInvalidRoute
			}
		}
	}
	coveredFabricRequirementsByBatch := make(map[int]map[int]struct{})
	for _, allocation := range aggregate.OutsourcingAllocations {
		batch := batchByID[allocation.ProductionWIPBatchID]
		if batch == nil {
			return biz.ErrProductionWIPInvalidRoute
		}
		operation := operationByID[batch.ProductionOrderOperationID]
		if operation == nil {
			return biz.ErrProductionWIPInvalidRoute
		}
		if allocation.UnitID <= 0 || allocation.OutsourcingOrderItemID <= 0 {
			return biz.ErrProductionWIPInvalidRoute
		}
		if operation.OperationCode == biz.ProductionWIPOperationFabricProcessing && batch.FlowType == biz.ProductionWIPFlowNormal {
			if allocation.SubjectType != biz.OutsourcingOrderSubjectMaterial || allocation.ProductionOrderMaterialRequirementID == nil {
				return biz.ErrProductionWIPInvalidRoute
			}
			requirement := requirementByID[*allocation.ProductionOrderMaterialRequirementID]
			if requirement == nil || requirement.ProductionOrderItemID != batch.ProductionOrderItemID ||
				requirement.ProductionOperationCode == nil || *requirement.ProductionOperationCode != biz.ProductionWIPOperationFabricProcessing ||
				allocation.UnitID != requirement.UnitID || !allocation.AllocatedQuantity.Equal(requirement.PlannedQuantity) {
				return biz.ErrProductionWIPInvalidRoute
			}
			covered := coveredFabricRequirementsByBatch[batch.ID]
			if covered == nil {
				covered = make(map[int]struct{})
				coveredFabricRequirementsByBatch[batch.ID] = covered
			}
			if _, duplicate := covered[requirement.ID]; duplicate {
				return biz.ErrProductionWIPInvalidRoute
			}
			covered[requirement.ID] = struct{}{}
		} else if allocation.SubjectType != biz.OutsourcingOrderSubjectProduct || allocation.ProductionOrderMaterialRequirementID != nil || allocationCountByBatch[batch.ID] != 1 {
			return biz.ErrProductionWIPInvalidRoute
		} else if itemByID[batch.ProductionOrderItemID] == nil || allocation.UnitID != itemByID[batch.ProductionOrderItemID].UnitID ||
			!allocation.AllocatedQuantity.Equal(batch.Quantity) {
			return biz.ErrProductionWIPInvalidRoute
		}
	}
	for _, batch := range aggregate.Batches {
		operation := operationByID[batch.ProductionOrderOperationID]
		if operation == nil || operation.OperationCode != biz.ProductionWIPOperationFabricProcessing || batch.FlowType != biz.ProductionWIPFlowNormal ||
			batch.ExecutionMode == nil || *batch.ExecutionMode != biz.ProductionWIPExecutionOutsourced {
			continue
		}
		item := itemByID[batch.ProductionOrderItemID]
		expected := fabricRequirementIDsByItem[batch.ProductionOrderItemID]
		covered := coveredFabricRequirementsByBatch[batch.ID]
		if item == nil || batch.SourceBatchID != nil || !batch.Quantity.Equal(item.PlannedQuantity) || len(expected) == 0 || len(covered) != len(expected) {
			return biz.ErrProductionWIPInvalidRoute
		}
		for requirementID := range expected {
			if _, ok := covered[requirementID]; !ok {
				return biz.ErrProductionWIPInvalidRoute
			}
		}
	}
	for _, batch := range aggregate.Batches {
		if batch.SourceBatchID != nil {
			parent := batchByID[*batch.SourceBatchID]
			if parent == nil || parent.ProductionOrderItemID != batch.ProductionOrderItemID {
				return biz.ErrProductionWIPInvalidRoute
			}
		}
	}
	for _, inspection := range aggregate.QualityInspections {
		if inspection == nil || batchByID[inspection.ProductionWIPBatchID] == nil || strings.TrimSpace(inspection.GateCode) == "" {
			return biz.ErrProductionWIPInvalidRoute
		}
		if err := biz.ValidateProductionWIPQualityDecision(biz.ProductionWIPQualityDecision{
			GateCode: inspection.GateCode,
			Status:   inspection.Status,
			Result:   inspection.Result,
		}); err != nil {
			return err
		}
	}
	return nil
}

func entProductionOrderOperationToBiz(row *ent.ProductionOrderOperation) *biz.ProductionOrderOperation {
	if row == nil {
		return nil
	}
	return &biz.ProductionOrderOperation{
		ID: row.ID, ProductionOrderID: row.ProductionOrderID, ProductionOrderItemID: row.ProductionOrderItemID,
		RouteCode: row.RouteCode, RouteVersion: row.RouteVersion, StepNo: row.StepNo, OperationCode: row.OperationCode,
		ProcessID: row.ProcessID, ProcessCodeSnapshot: row.ProcessCodeSnapshot, ProcessNameSnapshot: row.ProcessNameSnapshot,
		OutputCode: row.OutputCode, InhouseAllowed: row.InhouseAllowed, OutsourcingAllowed: row.OutsourcingAllowed,
		PlannedQuantity: row.PlannedQuantity, RequiredQualityGates: append([]string(nil), row.RequiredQualityGates...),
		BusinessConfirmationCode: row.BusinessConfirmationCode, CreatedAt: row.CreatedAt,
	}
}

func entProductionWIPBatchToBiz(row *ent.ProductionWIPBatch) *biz.ProductionWIPBatch {
	if row == nil {
		return nil
	}
	return &biz.ProductionWIPBatch{
		ID: row.ID, ProductionOrderID: row.ProductionOrderID, ProductionOrderItemID: row.ProductionOrderItemID,
		ProductionOrderOperationID: row.ProductionOrderOperationID, SourceBatchID: row.SourceBatchID,
		BatchNo: row.BatchNo, FlowType: row.FlowType, ExecutionMode: row.ExecutionMode, Status: row.Status,
		Version: row.Version, Quantity: row.Quantity,
		ReworkReason: row.ReworkReason, CreatedBy: row.CreatedBy, StartedAt: row.StartedAt, CompletedAt: row.CompletedAt,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func entProductionWIPOutsourcingAllocationToBiz(row *ent.ProductionWIPOutsourcingAllocation) *biz.ProductionWIPOutsourcingAllocation {
	if row == nil {
		return nil
	}
	return &biz.ProductionWIPOutsourcingAllocation{
		ID: row.ID, ProductionWIPBatchID: row.ProductionWipBatchID,
		OutsourcingOrderItemID:               row.OutsourcingOrderItemID,
		ProductionOrderMaterialRequirementID: row.ProductionOrderMaterialRequirementID,
		SubjectType:                          row.SubjectType, AllocatedQuantity: row.AllocatedQuantity,
		UnitID: row.UnitID, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt,
	}
}

func entProductionPackagingConfirmationToBiz(row *ent.ProductionPackagingConfirmation) *biz.ProductionPackagingConfirmation {
	if row == nil {
		return nil
	}
	return &biz.ProductionPackagingConfirmation{
		ID: row.ID, ProductionOrderID: row.ProductionOrderID, ProductionOrderItemID: row.ProductionOrderItemID,
		Status: row.Status, Version: row.Version, PackagingVersionSnapshot: row.PackagingVersionSnapshot,
		ConfirmedBy: row.ConfirmedBy, ConfirmedAt: row.ConfirmedAt, Note: row.Note,
		CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func (r *productionOrderRepo) ApplyProductionWIPCommand(ctx context.Context, in *biz.ProductionWIPCommand) (*biz.ProductionWIPAggregate, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || r.data.sqldb == nil || in == nil ||
		in.ProductionOrderID <= 0 || in.ActorID <= 0 || len(in.IntentHash) != 64 {
		return nil, biz.ErrBadParam
	}
	if in.Action == biz.ProductionWIPActionConfirmPackagingMaterial {
		return r.confirmProductionWIPPackagingMaterial(ctx, in)
	}
	eventAction, err := biz.ProductionWIPEventActionForCommand(in.Action)
	if err != nil {
		return nil, err
	}
	if replay, found, err := resolveProductionWIPEventReceipt(ctx, r.data.postgres, in.BatchID, in.ActorID, eventAction, in.IdempotencyKey, in.IntentHash); err != nil || found {
		return replay, err
	}
	preflightBatch, err := r.data.postgres.ProductionWIPBatch.Get(ctx, in.BatchID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		return nil, err
	}
	if preflightBatch.ProductionOrderID != in.ProductionOrderID {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	operationIDs := []int{preflightBatch.ProductionOrderOperationID}
	if in.TargetOperationID > 0 && in.TargetOperationID != preflightBatch.ProductionOrderOperationID {
		preflightTarget, err := r.data.postgres.ProductionOrderOperation.Get(ctx, in.TargetOperationID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrProductionWIPInvalidTransition
			}
			return nil, err
		}
		if preflightTarget.ProductionOrderID != in.ProductionOrderID || preflightTarget.ProductionOrderItemID != preflightBatch.ProductionOrderItemID {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		operationIDs = append(operationIDs, preflightTarget.ID)
	}

	tx, err := r.beginProductionOrderCommandTx(ctx)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.sqlTx.Rollback()
		}
	}()
	if err := r.lockProductionOrderCommandSource(ctx, tx.sqlTx, in.ProductionOrderID); err != nil {
		return nil, err
	}
	if err := r.lockProductionWIPRows(ctx, tx.sqlTx, "production_order_items", []int{preflightBatch.ProductionOrderItemID}); err != nil {
		return nil, err
	}
	if err := r.lockProductionWIPRows(ctx, tx.sqlTx, "production_order_operations", operationIDs); err != nil {
		return nil, err
	}
	if err := r.lockProductionWIPRows(ctx, tx.sqlTx, "production_wip_batches", []int{in.BatchID}); err != nil {
		return nil, err
	}
	if in.Action == biz.ProductionWIPActionAssignExecution && in.ExecutionMode == biz.ProductionWIPExecutionOutsourced {
		if err := r.lockProductionWIPOutsourcingInputs(ctx, tx.sqlTx, tx.client, in.OutsourcingAllocations); err != nil {
			return nil, err
		}
	}
	if in.Action == biz.ProductionWIPActionStartOperation {
		if err := r.lockProductionWIPStartDependencies(ctx, tx.sqlTx, tx.client, in.BatchID); err != nil {
			return nil, err
		}
	}
	// Resolve once more after the ordered row locks because a concurrent exact
	// command may have committed while this transaction waited.
	if replay, found, resolveErr := resolveProductionWIPEventReceipt(ctx, tx.client, in.BatchID, in.ActorID, eventAction, in.IdempotencyKey, in.IntentHash); resolveErr != nil || found {
		return replay, resolveErr
	}
	orderRow, err := tx.client.ProductionOrder.Get(ctx, in.ProductionOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	if orderRow.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	batchRow, err := tx.client.ProductionWIPBatch.Get(ctx, in.BatchID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		return nil, err
	}
	if batchRow.ProductionOrderID != in.ProductionOrderID || batchRow.ProductionOrderItemID != preflightBatch.ProductionOrderItemID || batchRow.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	operationRow, err := tx.client.ProductionOrderOperation.Get(ctx, batchRow.ProductionOrderOperationID)
	if err != nil {
		return nil, err
	}
	if operationRow.ProductionOrderID != in.ProductionOrderID || operationRow.ProductionOrderItemID != batchRow.ProductionOrderItemID {
		return nil, biz.ErrProductionWIPInvalidRoute
	}
	outcome, err := applyProductionWIPBatchMutation(ctx, tx.client, in, batchRow, operationRow)
	if err != nil {
		_ = tx.sqlTx.Rollback()
		committed = true
		return r.resolveProductionWIPAfterWriteFailure(ctx, in, eventAction, err)
	}
	aggregate, err := loadProductionWIPAggregate(ctx, tx.client, in.ProductionOrderID)
	if err != nil {
		return nil, err
	}
	result, err := productionWIPMutationResultMap(aggregate)
	if err != nil {
		return nil, err
	}
	fromStatus := outcome.FromStatus
	if _, err := tx.client.ProductionWIPEvent.Create().
		SetProductionWipBatchID(outcome.Batch.ID).
		SetActorID(in.ActorID).
		SetAction(eventAction).
		SetNillableFromStatus(&fromStatus).
		SetToStatus(outcome.ToStatus).
		SetBatchVersion(outcome.Batch.Version).
		SetQuantity(outcome.Quantity).
		SetIdempotencyKey(in.IdempotencyKey).
		SetIntentHash(in.IntentHash).
		SetResultContract(biz.ProductionWIPMutationResultV1).
		SetMutationResult(result).
		SetNillableReason(outcome.Reason).
		Save(ctx); err != nil {
		_ = tx.sqlTx.Rollback()
		committed = true
		return r.resolveProductionWIPAfterWriteFailure(ctx, in, eventAction, err)
	}
	if err := tx.sqlTx.Commit(); err != nil {
		committed = true
		return r.resolveProductionWIPAfterWriteFailure(ctx, in, eventAction, err)
	}
	committed = true
	return aggregate, nil
}

func applyProductionWIPBatchMutation(
	ctx context.Context,
	client *ent.Client,
	in *biz.ProductionWIPCommand,
	batchRow *ent.ProductionWIPBatch,
	operationRow *ent.ProductionOrderOperation,
) (*productionWIPMutationOutcome, error) {
	batch := entProductionWIPBatchToBiz(batchRow)
	operation := entProductionOrderOperationToBiz(operationRow)
	fromStatus := batch.Status
	switch in.Action {
	case biz.ProductionWIPActionSplitBatch:
		children, err := client.ProductionWIPBatch.Query().
			Where(productionwipbatch.SourceBatchID(batch.ID), productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		allocated := sumProductionWIPBatchQuantity(children)
		if err := biz.ValidateProductionWIPSplit(batch, operation, allocated, in.Splits); err != nil {
			return nil, err
		}
		affected, err := client.ProductionWIPBatch.Update().Where(
			productionwipbatch.ID(batch.ID), productionwipbatch.Version(in.ExpectedVersion), productionwipbatch.Status(biz.ProductionWIPStatusPlanned),
		).SetStatus(biz.ProductionWIPStatusSplit).AddVersion(1).Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		for index, split := range in.Splits {
			batchNo, err := biz.BuildProductionWIPLineageBatchNo(batch.BatchNo, in.Action, 0, len(children)+index+1)
			if err != nil {
				return nil, err
			}
			if _, err := createProductionWIPChildBatch(ctx, client, batchRow, operationRow.ID, batchNo, biz.ProductionWIPFlowNormal, split.Quantity, in.ActorID, nil); err != nil {
				return nil, err
			}
		}
	case biz.ProductionWIPActionAssignExecution:
		if err := biz.ValidateProductionWIPExecutionAssignmentForBatch(batch, operation, in.ExecutionMode, len(in.OutsourcingAllocations)); err != nil {
			return nil, err
		}
		if in.ExecutionMode == biz.ProductionWIPExecutionOutsourced {
			orderItem, err := client.ProductionOrderItem.Get(ctx, batch.ProductionOrderItemID)
			if err != nil {
				return nil, err
			}
			allocations, err := validateProductionWIPOutsourcingAssignment(ctx, client, orderItem, operationRow, batchRow, in.OutsourcingAllocations)
			if err != nil {
				return nil, err
			}
			for _, allocation := range allocations {
				if _, err := client.ProductionWIPOutsourcingAllocation.Create().
					SetProductionWipBatchID(batch.ID).
					SetOutsourcingOrderItemID(allocation.OutsourcingOrderItemID).
					SetNillableProductionOrderMaterialRequirementID(allocation.ProductionOrderMaterialRequirementID).
					SetSubjectType(allocation.SubjectType).
					SetAllocatedQuantity(allocation.AllocatedQuantity).
					SetUnitID(allocation.UnitID).
					SetCreatedBy(in.ActorID).
					Save(ctx); err != nil {
					if ent.IsConstraintError(err) {
						return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
					}
					return nil, err
				}
			}
		}
		affected, err := client.ProductionWIPBatch.Update().Where(
			productionwipbatch.ID(batch.ID), productionwipbatch.Version(in.ExpectedVersion), productionwipbatch.Status(biz.ProductionWIPStatusPlanned),
		).SetExecutionMode(in.ExecutionMode).AddVersion(1).Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
	case biz.ProductionWIPActionStartOperation:
		allocations, err := loadProductionWIPBatchAllocations(ctx, client, batch.ID)
		if err != nil {
			return nil, err
		}
		if operation.OperationCode == biz.ProductionWIPOperationFabricProcessing && batch.FlowType == biz.ProductionWIPFlowNormal {
			if err := validateProductionWIPOutsourcingMaterialIssues(ctx, client, batchRow, operationRow, allocations); err != nil {
				return nil, err
			}
		}
		var confirmation *biz.ProductionPackagingConfirmation
		if operation.OperationCode == biz.ProductionWIPOperationPackaging {
			row, err := client.ProductionPackagingConfirmation.Query().
				Where(productionpackagingconfirmation.ProductionOrderItemID(batch.ProductionOrderItemID)).Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrProductionWIPPackagingConfirmationPending
				}
				return nil, err
			}
			confirmation = entProductionPackagingConfirmationToBiz(row)
		}
		nextStatus, err := biz.NextProductionWIPBatchStatus(in.Action, batch, operation, confirmation, len(allocations))
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		affected, err := client.ProductionWIPBatch.Update().Where(
			productionwipbatch.ID(batch.ID), productionwipbatch.Version(in.ExpectedVersion), productionwipbatch.Status(batch.Status),
		).SetStatus(nextStatus).SetStartedAt(now).AddVersion(1).Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
	case biz.ProductionWIPActionCompleteOperation, biz.ProductionWIPActionReceiveOutsourcingReturn:
		allocations, err := loadProductionWIPBatchAllocations(ctx, client, batch.ID)
		if err != nil {
			return nil, err
		}
		nextStatus, err := biz.NextProductionWIPBatchStatus(in.Action, batch, operation, nil, len(allocations))
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		affected, err := client.ProductionWIPBatch.Update().Where(
			productionwipbatch.ID(batch.ID), productionwipbatch.Version(in.ExpectedVersion), productionwipbatch.Status(batch.Status),
		).SetStatus(nextStatus).SetCompletedAt(now).AddVersion(1).Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		if nextStatus == biz.ProductionWIPStatusWaitingQuality {
			updated, err := client.ProductionWIPBatch.Get(ctx, batch.ID)
			if err != nil {
				return nil, err
			}
			if err := ensureProductionWIPQualityDraft(ctx, client, updated, operationRow); err != nil {
				return nil, err
			}
		}
	case biz.ProductionWIPActionTransferToNextOperation:
		target, err := client.ProductionOrderOperation.Get(ctx, in.TargetOperationID)
		if err != nil {
			return nil, err
		}
		if err := biz.ValidateProductionWIPTransfer(batch, operation, entProductionOrderOperationToBiz(target)); err != nil {
			return nil, err
		}
		children, err := client.ProductionWIPBatch.Query().Where(
			productionwipbatch.SourceBatchID(batch.ID),
			productionwipbatch.ProductionOrderOperationID(target.ID),
			productionwipbatch.FlowType(biz.ProductionWIPFlowNormal),
			productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled),
		).All(ctx)
		if err != nil {
			return nil, err
		}
		if err := biz.ValidateProductionWIPTransferAllocation(batch.Quantity, sumProductionWIPBatchQuantity(children), in.Quantity); err != nil {
			return nil, err
		}
		affected, err := client.ProductionWIPBatch.Update().Where(
			productionwipbatch.ID(batch.ID), productionwipbatch.Version(in.ExpectedVersion), productionwipbatch.Status(biz.ProductionWIPStatusAccepted),
		).AddVersion(1).Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		batchNo, err := biz.BuildProductionWIPLineageBatchNo(batch.BatchNo, in.Action, target.StepNo, len(children)+1)
		if err != nil {
			return nil, err
		}
		if _, err := createProductionWIPChildBatch(ctx, client, batchRow, target.ID, batchNo, biz.ProductionWIPFlowNormal, in.Quantity, in.ActorID, nil); err != nil {
			return nil, err
		}
	case biz.ProductionWIPActionRework:
		target, err := client.ProductionOrderOperation.Get(ctx, in.TargetOperationID)
		if err != nil {
			return nil, err
		}
		children, err := client.ProductionWIPBatch.Query().Where(
			productionwipbatch.SourceBatchID(batch.ID), productionwipbatch.FlowType(biz.ProductionWIPFlowRework),
			productionwipbatch.StatusNEQ(biz.ProductionWIPStatusCancelled),
		).All(ctx)
		if err != nil {
			return nil, err
		}
		if err := biz.ValidateProductionWIPRework(batch, operation, entProductionOrderOperationToBiz(target), sumProductionWIPBatchQuantity(children), in.Quantity, *in.Reason); err != nil {
			return nil, err
		}
		affected, err := client.ProductionWIPBatch.Update().Where(
			productionwipbatch.ID(batch.ID), productionwipbatch.Version(in.ExpectedVersion), productionwipbatch.Status(biz.ProductionWIPStatusRejected),
		).AddVersion(1).Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected != 1 {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		batchNo, err := biz.BuildProductionWIPLineageBatchNo(batch.BatchNo, in.Action, 0, len(children)+1)
		if err != nil {
			return nil, err
		}
		if _, err := createProductionWIPChildBatch(ctx, client, batchRow, target.ID, batchNo, biz.ProductionWIPFlowRework, in.Quantity, in.ActorID, in.Reason); err != nil {
			return nil, err
		}
	default:
		return nil, biz.ErrBadParam
	}
	updated, err := client.ProductionWIPBatch.Get(ctx, batch.ID)
	if err != nil {
		return nil, err
	}
	quantity := batch.Quantity
	if in.Action == biz.ProductionWIPActionTransferToNextOperation || in.Action == biz.ProductionWIPActionRework {
		quantity = in.Quantity
	}
	return &productionWIPMutationOutcome{
		Batch: updated, FromStatus: fromStatus, ToStatus: updated.Status, Quantity: quantity, Reason: in.Reason,
	}, nil
}

func createProductionWIPChildBatch(
	ctx context.Context,
	client *ent.Client,
	parent *ent.ProductionWIPBatch,
	targetOperationID int,
	batchNo, flowType string,
	quantity decimal.Decimal,
	actorID int,
	reworkReason *string,
) (*ent.ProductionWIPBatch, error) {
	if client == nil || parent == nil || targetOperationID <= 0 || actorID <= 0 || !quantity.GreaterThan(decimal.Zero) {
		return nil, biz.ErrBadParam
	}
	return client.ProductionWIPBatch.Create().
		SetProductionOrderID(parent.ProductionOrderID).
		SetProductionOrderItemID(parent.ProductionOrderItemID).
		SetProductionOrderOperationID(targetOperationID).
		SetSourceBatchID(parent.ID).
		SetBatchNo(batchNo).
		SetFlowType(flowType).
		SetStatus(biz.ProductionWIPStatusPlanned).
		SetVersion(1).
		SetQuantity(quantity).
		SetNillableReworkReason(reworkReason).
		SetCreatedBy(actorID).
		Save(ctx)
}

func sumProductionWIPBatchQuantity(rows []*ent.ProductionWIPBatch) decimal.Decimal {
	total := decimal.Zero
	for _, row := range rows {
		if row != nil {
			total = total.Add(row.Quantity)
		}
	}
	return total
}

func validateProductionWIPOutsourcingAssignment(
	ctx context.Context,
	client *ent.Client,
	orderItem *ent.ProductionOrderItem,
	operation *ent.ProductionOrderOperation,
	batch *ent.ProductionWIPBatch,
	inputs []biz.ProductionWIPOutsourcingAllocationInput,
) ([]*biz.ProductionWIPOutsourcingAllocation, error) {
	if client == nil || orderItem == nil || operation == nil || batch == nil || len(inputs) == 0 {
		return nil, biz.ErrBadParam
	}
	itemIDs := make([]int, 0, len(inputs))
	for _, input := range inputs {
		itemIDs = append(itemIDs, input.OutsourcingOrderItemID)
	}
	if exists, err := client.ProductionWIPOutsourcingAllocation.Query().Where(
		productionwipoutsourcingallocation.Or(
			productionwipoutsourcingallocation.ProductionWipBatchID(batch.ID),
			productionwipoutsourcingallocation.OutsourcingOrderItemIDIn(itemIDs...),
		),
	).Exist(ctx); err != nil {
		return nil, err
	} else if exists {
		return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
	}
	items, err := client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.IDIn(itemIDs...)).WithOutsourcingOrder().All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) != len(inputs) {
		return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
	}
	itemByID := make(map[int]*ent.OutsourcingOrderItem, len(items))
	parentOrderID := 0
	for _, item := range items {
		parent, edgeErr := item.Edges.OutsourcingOrderOrErr()
		if edgeErr != nil {
			return nil, edgeErr
		}
		if parent.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed || item.LineStatus != biz.OutsourcingOrderItemStatusOpen ||
			item.ProcessID != operation.ProcessID || (parentOrderID != 0 && parentOrderID != parent.ID) {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		parentOrderID = parent.ID
		itemByID[item.ID] = item
	}

	if operation.OperationCode == biz.ProductionWIPOperationFabricProcessing && batch.FlowType == biz.ProductionWIPFlowNormal {
		if batch.SourceBatchID != nil || !batch.Quantity.Equal(orderItem.PlannedQuantity) {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		requirementRows, err := client.ProductionOrderMaterialRequirement.Query().Where(
			productionordermaterialrequirement.ProductionOrderItemID(orderItem.ID),
		).Order(ent.Asc(productionordermaterialrequirement.FieldID)).All(ctx)
		if err != nil {
			return nil, err
		}
		requirements := make([]*biz.ProductionOrderMaterialRequirement, 0, len(requirementRows))
		rowByID := make(map[int]*ent.ProductionOrderMaterialRequirement, len(requirementRows))
		for _, row := range requirementRows {
			requirements = append(requirements, entProductionOrderMaterialRequirementToBiz(row, decimal.Zero))
			rowByID[row.ID] = row
		}
		fabricRequirements, err := biz.SelectProductionWIPFabricRequirements(orderItem.ID, requirements)
		if err != nil || len(fabricRequirements) != len(inputs) {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		fabricByID := make(map[int]*biz.ProductionOrderMaterialRequirement, len(fabricRequirements))
		for _, requirement := range fabricRequirements {
			fabricByID[requirement.ID] = requirement
		}
		allocations := make([]*biz.ProductionWIPOutsourcingAllocation, 0, len(inputs))
		for _, input := range inputs {
			if input.ProductionOrderMaterialRequirementID == nil {
				return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
			}
			requirement := fabricByID[*input.ProductionOrderMaterialRequirementID]
			item := itemByID[input.OutsourcingOrderItemID]
			if requirement == nil || rowByID[requirement.ID] == nil || item == nil ||
				item.SubjectType != biz.OutsourcingOrderSubjectMaterial || item.MaterialID == nil || *item.MaterialID != requirement.MaterialID ||
				item.ProductID != nil || item.ProductSkuID != nil || item.UnitID != requirement.UnitID ||
				!item.OutsourcingQuantity.Equal(requirement.PlannedQuantity) {
				return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
			}
			allocations = append(allocations, &biz.ProductionWIPOutsourcingAllocation{
				OutsourcingOrderItemID: item.ID, ProductionOrderMaterialRequirementID: input.ProductionOrderMaterialRequirementID,
				SubjectType: biz.OutsourcingOrderSubjectMaterial, AllocatedQuantity: requirement.PlannedQuantity, UnitID: requirement.UnitID,
			})
			delete(fabricByID, requirement.ID)
		}
		if len(fabricByID) != 0 {
			return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		return allocations, nil
	}

	if len(inputs) != 1 || inputs[0].ProductionOrderMaterialRequirementID != nil {
		return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
	}
	item := itemByID[inputs[0].OutsourcingOrderItemID]
	if item == nil || item.SubjectType != biz.OutsourcingOrderSubjectProduct || item.ProductID == nil || *item.ProductID != orderItem.ProductID ||
		item.MaterialID != nil || !sameOptionalInt(item.ProductSkuID, orderItem.ProductSkuID) || item.UnitID != orderItem.UnitID ||
		!item.OutsourcingQuantity.Equal(batch.Quantity) {
		return nil, biz.ErrProductionWIPOutsourcingAllocationInvalid
	}
	return []*biz.ProductionWIPOutsourcingAllocation{{
		OutsourcingOrderItemID: item.ID, SubjectType: biz.OutsourcingOrderSubjectProduct,
		AllocatedQuantity: batch.Quantity, UnitID: orderItem.UnitID,
	}}, nil
}

func loadProductionWIPBatchAllocations(ctx context.Context, client *ent.Client, batchID int) ([]*biz.ProductionWIPOutsourcingAllocation, error) {
	if client == nil || batchID <= 0 {
		return nil, biz.ErrBadParam
	}
	rows, err := client.ProductionWIPOutsourcingAllocation.Query().Where(
		productionwipoutsourcingallocation.ProductionWipBatchID(batchID),
	).Order(ent.Asc(productionwipoutsourcingallocation.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.ProductionWIPOutsourcingAllocation, 0, len(rows))
	for _, row := range rows {
		out = append(out, entProductionWIPOutsourcingAllocationToBiz(row))
	}
	return out, nil
}

func validateProductionWIPOutsourcingMaterialIssues(
	ctx context.Context,
	client *ent.Client,
	batch *ent.ProductionWIPBatch,
	operation *ent.ProductionOrderOperation,
	allocations []*biz.ProductionWIPOutsourcingAllocation,
) error {
	if client == nil || batch == nil || operation == nil || operation.OperationCode != biz.ProductionWIPOperationFabricProcessing ||
		batch.FlowType != biz.ProductionWIPFlowNormal || len(allocations) == 0 {
		return biz.ErrProductionWIPOutsourcingAllocationInvalid
	}
	for _, allocation := range allocations {
		if allocation == nil || allocation.SubjectType != biz.OutsourcingOrderSubjectMaterial || allocation.ProductionOrderMaterialRequirementID == nil {
			return biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		item, err := client.OutsourcingOrderItem.Get(ctx, allocation.OutsourcingOrderItemID)
		if err != nil || item.MaterialID == nil || item.LineStatus != biz.OutsourcingOrderItemStatusOpen || item.ProcessID != operation.ProcessID {
			return biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		parent, err := client.OutsourcingOrder.Get(ctx, item.OutsourcingOrderID)
		if err != nil || parent.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed {
			return biz.ErrProductionWIPOutsourcingAllocationInvalid
		}
		facts, err := client.OutsourcingFact.Query().Where(
			outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
			outsourcingfact.SourceID(item.OutsourcingOrderID),
			outsourcingfact.SourceLineID(item.ID),
			outsourcingfact.FactType(biz.OutsourcingFactMaterialIssue),
			outsourcingfact.Status(biz.OperationalFactStatusPosted),
		).All(ctx)
		if err != nil {
			return err
		}
		issued := decimal.Zero
		for _, fact := range facts {
			if fact.LotID == nil || fact.SubjectType != biz.OutsourcingOrderSubjectMaterial || fact.SubjectID != *item.MaterialID ||
				fact.UnitID != allocation.UnitID || !fact.Quantity.GreaterThan(decimal.Zero) {
				return biz.ErrProductionWIPOutsourcingMaterialIssuePending
			}
			lot, err := client.InventoryLot.Get(ctx, *fact.LotID)
			if err != nil || lot.Status != biz.InventoryLotActive || lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != fact.SubjectID {
				return biz.ErrProductionWIPOutsourcingMaterialIssuePending
			}
			issued = issued.Add(fact.Quantity)
		}
		if !issued.Equal(allocation.AllocatedQuantity) {
			return biz.ErrProductionWIPOutsourcingMaterialIssuePending
		}
	}
	return nil
}

// ensureProductionWIPQualityDraft is called only after the caller has moved a
// locked batch to WAITING_QUALITY. It creates exactly the first frozen gate;
// later gates are advanced by the quality decision transaction.
func ensureProductionWIPQualityDraft(
	ctx context.Context,
	client *ent.Client,
	batch *ent.ProductionWIPBatch,
	operation *ent.ProductionOrderOperation,
) error {
	if client == nil || batch == nil || operation == nil || batch.Status != biz.ProductionWIPStatusWaitingQuality ||
		batch.ProductionOrderOperationID != operation.ID || batch.ProductionOrderID != operation.ProductionOrderID ||
		batch.ProductionOrderItemID != operation.ProductionOrderItemID || len(operation.RequiredQualityGates) == 0 {
		return biz.ErrProductionWIPInvalidRoute
	}
	rows, err := client.QualityInspection.Query().
		Where(qualityinspection.ProductionWipBatchID(batch.ID)).
		Order(ent.Asc(qualityinspection.FieldID)).
		All(ctx)
	if err != nil {
		return err
	}
	firstGate := operation.RequiredQualityGates[0]
	if len(rows) == 0 {
		_, err := createProductionWIPQualityGateDraft(ctx, client, batch.ID, firstGate, false)
		return err
	}
	if len(rows) != 1 || validateProductionWIPQualityInspectionRow(rows[0], batch) != nil ||
		rows[0].GateCode == nil || *rows[0].GateCode != firstGate || rows[0].Status != biz.QualityInspectionStatusDraft || rows[0].Result != nil {
		return biz.ErrProductionWIPInvalidRoute
	}
	return nil
}

func (r *productionOrderRepo) confirmProductionWIPPackagingMaterial(ctx context.Context, in *biz.ProductionWIPCommand) (*biz.ProductionWIPAggregate, error) {
	if replay, found, err := resolveProductionPackagingConfirmationReceipt(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	tx, err := r.beginProductionOrderCommandTx(ctx)
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.sqlTx.Rollback()
		}
	}()
	if err := r.lockProductionOrderCommandSource(ctx, tx.sqlTx, in.ProductionOrderID); err != nil {
		return nil, err
	}
	if err := r.lockProductionWIPRows(ctx, tx.sqlTx, "production_order_items", []int{in.ProductionOrderItemID}); err != nil {
		return nil, err
	}
	preflightConfirmation, err := tx.client.ProductionPackagingConfirmation.Query().
		Where(productionpackagingconfirmation.ProductionOrderItemID(in.ProductionOrderItemID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionWIPInvalidRoute
		}
		return nil, err
	}
	if err := r.lockProductionWIPRows(ctx, tx.sqlTx, "production_packaging_confirmations", []int{preflightConfirmation.ID}); err != nil {
		return nil, err
	}
	if replay, found, resolveErr := resolveProductionPackagingConfirmationReceipt(ctx, tx.client, in); resolveErr != nil || found {
		return replay, resolveErr
	}
	orderRow, err := tx.client.ProductionOrder.Get(ctx, in.ProductionOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	if orderRow.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	itemRow, err := tx.client.ProductionOrderItem.Get(ctx, in.ProductionOrderItemID)
	if err != nil {
		return nil, err
	}
	if itemRow.ProductionOrderID != in.ProductionOrderID || itemRow.RouteCode == nil || *itemRow.RouteCode != biz.ProductionWIPRoutePlushSewHandV1 {
		return nil, biz.ErrProductionWIPInvalidRoute
	}
	confirmationRow, err := tx.client.ProductionPackagingConfirmation.Get(ctx, preflightConfirmation.ID)
	if err != nil {
		return nil, err
	}
	confirmation := entProductionPackagingConfirmationToBiz(confirmationRow)
	if confirmation.ProductionOrderID != in.ProductionOrderID || confirmation.ProductionOrderItemID != in.ProductionOrderItemID || confirmation.Version != in.ExpectedVersion {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	nextStatus, err := biz.NextProductionPackagingConfirmationStatus(in.Action, confirmation)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	affected, err := tx.client.ProductionPackagingConfirmation.Update().Where(
		productionpackagingconfirmation.ID(confirmation.ID),
		productionpackagingconfirmation.Version(in.ExpectedVersion),
		productionpackagingconfirmation.Status(biz.ProductionPackagingConfirmationPending),
	).SetStatus(nextStatus).
		SetPackagingVersionSnapshot(*in.PackagingVersionSnapshot).
		SetConfirmedBy(in.ActorID).
		SetConfirmedAt(now).
		SetConfirmationIdempotencyKey(in.IdempotencyKey).
		SetConfirmationIntentHash(in.IntentHash).
		SetNillableNote(in.Note).
		AddVersion(1).
		Save(ctx)
	if err != nil {
		_ = tx.sqlTx.Rollback()
		committed = true
		return r.resolveProductionPackagingConfirmationAfterWriteFailure(ctx, in, err)
	}
	if affected != 1 {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	aggregate, err := loadProductionWIPAggregate(ctx, tx.client, in.ProductionOrderID)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		committed = true
		return r.resolveProductionPackagingConfirmationAfterWriteFailure(ctx, in, err)
	}
	committed = true
	return aggregate, nil
}

func resolveProductionPackagingConfirmationReceipt(ctx context.Context, client *ent.Client, in *biz.ProductionWIPCommand) (*biz.ProductionWIPAggregate, bool, error) {
	if client == nil || in == nil || in.ProductionOrderItemID <= 0 {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.ProductionPackagingConfirmation.Query().
		Where(productionpackagingconfirmation.ProductionOrderItemID(in.ProductionOrderItemID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.Status != biz.ProductionPackagingConfirmationConfirmed || row.ConfirmationIdempotencyKey == nil {
		return nil, false, nil
	}
	if *row.ConfirmationIdempotencyKey != in.IdempotencyKey {
		return nil, false, biz.ErrProductionWIPInvalidTransition
	}
	if row.ConfirmationIntentHash == nil || *row.ConfirmationIntentHash != in.IntentHash || row.ConfirmedBy == nil || *row.ConfirmedBy != in.ActorID {
		return nil, false, biz.ErrIdempotencyConflict
	}
	aggregate, err := loadProductionWIPAggregate(ctx, client, in.ProductionOrderID)
	return aggregate, err == nil, err
}

func (r *productionOrderRepo) resolveProductionPackagingConfirmationAfterWriteFailure(ctx context.Context, in *biz.ProductionWIPCommand, writeErr error) (*biz.ProductionWIPAggregate, error) {
	replay, found, err := resolveProductionPackagingConfirmationReceipt(ctx, r.data.postgres, in)
	if err != nil {
		return nil, err
	}
	if found {
		return replay, nil
	}
	return nil, writeErr
}

func (r *productionOrderRepo) lockProductionWIPRows(ctx context.Context, tx *stdsql.Tx, table string, ids []int) error {
	if tx == nil {
		return biz.ErrBadParam
	}
	if r.data.sqlDialect == dialect.SQLite || len(ids) == 0 {
		return nil
	}
	switch table {
	case "production_orders", "production_order_items", "production_order_material_requirements", "production_order_operations",
		"production_wip_batches", "production_packaging_confirmations", "outsourcing_orders", "outsourcing_order_items",
		"outsourcing_facts", "inventory_lots":
	default:
		return biz.ErrBadParam
	}
	unique := make(map[int]struct{}, len(ids))
	ordered := make([]int, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return biz.ErrBadParam
		}
		if _, exists := unique[id]; !exists {
			unique[id] = struct{}{}
			ordered = append(ordered, id)
		}
	}
	sort.Ints(ordered)
	for _, id := range ordered {
		var lockedID int
		query := fmt.Sprintf("SELECT id FROM %s WHERE id = $1 FOR UPDATE", table)
		if err := tx.QueryRowContext(ctx, query, id).Scan(&lockedID); err != nil {
			if err == stdsql.ErrNoRows {
				return biz.ErrProductionWIPInvalidTransition
			}
			return err
		}
	}
	return nil
}

func (r *productionOrderRepo) lockProductionWIPOutsourcingInputs(
	ctx context.Context,
	tx *stdsql.Tx,
	client *ent.Client,
	inputs []biz.ProductionWIPOutsourcingAllocationInput,
) error {
	if tx == nil || client == nil || len(inputs) == 0 {
		return biz.ErrBadParam
	}
	itemIDs := make([]int, 0, len(inputs))
	requirementIDs := make([]int, 0, len(inputs))
	for _, input := range inputs {
		itemIDs = append(itemIDs, input.OutsourcingOrderItemID)
		if input.ProductionOrderMaterialRequirementID != nil {
			requirementIDs = append(requirementIDs, *input.ProductionOrderMaterialRequirementID)
		}
	}
	items, err := client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.IDIn(itemIDs...)).All(ctx)
	if err != nil {
		return err
	}
	if len(items) != len(itemIDs) {
		return biz.ErrProductionWIPOutsourcingAllocationInvalid
	}
	orderIDs := make([]int, 0, len(items))
	for _, item := range items {
		orderIDs = append(orderIDs, item.OutsourcingOrderID)
	}
	if err := r.lockProductionWIPRows(ctx, tx, "outsourcing_orders", orderIDs); err != nil {
		return err
	}
	if err := r.lockProductionWIPRows(ctx, tx, "outsourcing_order_items", itemIDs); err != nil {
		return err
	}
	return r.lockProductionWIPRows(ctx, tx, "production_order_material_requirements", requirementIDs)
}

func (r *productionOrderRepo) lockProductionWIPStartDependencies(ctx context.Context, tx *stdsql.Tx, client *ent.Client, batchID int) error {
	if tx == nil || client == nil || batchID <= 0 {
		return biz.ErrBadParam
	}
	allocationRows, err := client.ProductionWIPOutsourcingAllocation.Query().Where(
		productionwipoutsourcingallocation.ProductionWipBatchID(batchID),
	).All(ctx)
	if err != nil || len(allocationRows) == 0 {
		return err
	}
	itemIDs := make([]int, 0, len(allocationRows))
	for _, allocation := range allocationRows {
		itemIDs = append(itemIDs, allocation.OutsourcingOrderItemID)
	}
	items, err := client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.IDIn(itemIDs...)).All(ctx)
	if err != nil {
		return err
	}
	if len(items) != len(itemIDs) {
		return biz.ErrProductionWIPOutsourcingAllocationInvalid
	}
	orderIDs := make([]int, 0, len(items))
	for _, item := range items {
		orderIDs = append(orderIDs, item.OutsourcingOrderID)
	}
	if err := r.lockProductionWIPRows(ctx, tx, "outsourcing_orders", orderIDs); err != nil {
		return err
	}
	if err := r.lockProductionWIPRows(ctx, tx, "outsourcing_order_items", itemIDs); err != nil {
		return err
	}
	facts, err := client.OutsourcingFact.Query().Where(
		outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
		outsourcingfact.SourceLineIDIn(itemIDs...),
		outsourcingfact.FactType(biz.OutsourcingFactMaterialIssue),
	).All(ctx)
	if err != nil {
		return err
	}
	factIDs := make([]int, 0, len(facts))
	lotIDs := make([]int, 0, len(facts))
	for _, fact := range facts {
		factIDs = append(factIDs, fact.ID)
		if fact.LotID != nil {
			lotIDs = append(lotIDs, *fact.LotID)
		}
	}
	if err := r.lockProductionWIPRows(ctx, tx, "outsourcing_facts", factIDs); err != nil {
		return err
	}
	return r.lockProductionWIPRows(ctx, tx, "inventory_lots", lotIDs)
}

func resolveProductionWIPEventReceipt(
	ctx context.Context,
	client *ent.Client,
	batchID, actorID int,
	action, idempotencyKey, intentHash string,
) (*biz.ProductionWIPAggregate, bool, error) {
	if client == nil || batchID <= 0 || actorID <= 0 {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.ProductionWIPEvent.Query().Where(
		productionwipevent.ProductionWipBatchID(batchID),
		productionwipevent.ActorID(actorID),
		productionwipevent.Action(action),
		productionwipevent.IdempotencyKey(idempotencyKey),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.IntentHash != intentHash {
		return nil, false, biz.ErrIdempotencyConflict
	}
	if row.ResultContract != biz.ProductionWIPMutationResultV1 {
		return nil, false, biz.ErrProductionWIPInvalidRoute
	}
	payload, err := json.Marshal(row.MutationResult)
	if err != nil {
		return nil, false, err
	}
	var result productionWIPMutationResult
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, false, err
	}
	if result.Contract != biz.ProductionWIPMutationResultV1 || result.Aggregate == nil || result.Aggregate.ProductionOrderID <= 0 {
		return nil, false, biz.ErrProductionWIPInvalidRoute
	}
	return result.Aggregate, true, nil
}

func productionWIPMutationResultMap(aggregate *biz.ProductionWIPAggregate) (map[string]interface{}, error) {
	payload, err := json.Marshal(productionWIPMutationResult{Contract: biz.ProductionWIPMutationResultV1, Aggregate: aggregate})
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(payload, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *productionOrderRepo) resolveProductionWIPAfterWriteFailure(
	ctx context.Context,
	in *biz.ProductionWIPCommand,
	eventAction string,
	writeErr error,
) (*biz.ProductionWIPAggregate, error) {
	replay, found, err := resolveProductionWIPEventReceipt(ctx, r.data.postgres, in.BatchID, in.ActorID, eventAction, in.IdempotencyKey, in.IntentHash)
	if err != nil {
		return nil, err
	}
	if found {
		return replay, nil
	}
	return nil, writeErr
}
