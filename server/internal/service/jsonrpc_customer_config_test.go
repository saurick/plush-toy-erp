package service

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"google.golang.org/protobuf/types/known/structpb"
)

func newCustomerConfigTestDispatcher(admin *biz.AdminUser, roleKeys []string) *jsonrpcDispatcher {
	return newCustomerConfigTestDispatcherWithSalesOrderRepo(admin, roleKeys, newServiceSalesOrderRepo(nil))
}

func newCustomerConfigTestDispatcherWithSalesOrderRepo(admin *biz.AdminUser, roleKeys []string, salesOrderRepo *serviceSalesOrderRepo) *jsonrpcDispatcher {
	return newCustomerConfigTestDispatcherWithRepos(admin, roleKeys, salesOrderRepo, nil, nil)
}

func newCustomerConfigTestDispatcherWithInventoryRepo(admin *biz.AdminUser, roleKeys []string, inventoryRepo biz.InventoryRepo) *jsonrpcDispatcher {
	return newCustomerConfigTestDispatcherWithRepos(admin, roleKeys, newServiceSalesOrderRepo(nil), inventoryRepo, nil)
}

func newCustomerConfigTestDispatcherWithOperationalFactRepo(admin *biz.AdminUser, roleKeys []string, operationalFactRepo biz.OperationalFactRepo) *jsonrpcDispatcher {
	return newCustomerConfigTestDispatcherWithRepos(admin, roleKeys, newServiceSalesOrderRepo(nil), nil, operationalFactRepo)
}

func newCustomerConfigTestDispatcherWithRepos(admin *biz.AdminUser, roleKeys []string, salesOrderRepo *serviceSalesOrderRepo, inventoryRepo biz.InventoryRepo, operationalFactRepo biz.OperationalFactRepo) *jsonrpcDispatcher {
	adminRepo := newMemAdminManageRepoForData()
	if admin == nil {
		admin = &biz.AdminUser{
			ID:        1,
			Username:  "admin",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
	}
	adminRepo.admins[admin.ID] = admin
	adminRepo.applyAdminRoles(adminRepo.admins[admin.ID], roleKeys)
	logger := log.NewStdLogger(io.Discard)
	customerConfigUC := biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo())
	processRuntimeUC := biz.NewProcessRuntimeUsecase(newServiceProcessRuntimeRepo(), newServiceWorkflowRepo(), customerConfigUC)
	salesOrderUC := biz.NewSalesOrderUsecase(salesOrderRepo)
	if err := biz.RegisterSalesOrderProcessDomainCommandHandlers(processRuntimeUC, salesOrderUC); err != nil {
		panic(err)
	}
	var inventoryUC *biz.InventoryUsecase
	if inventoryRepo != nil {
		inventoryUC = biz.NewInventoryUsecase(inventoryRepo)
		if err := biz.RegisterPurchaseReceiptProcessDomainCommandHandlers(processRuntimeUC, inventoryUC); err != nil {
			panic(err)
		}
		if err := biz.RegisterQualityInspectionProcessDomainCommandHandlers(processRuntimeUC, inventoryUC); err != nil {
			panic(err)
		}
		if err := biz.RegisterInventoryProcessDomainCommandHandlers(processRuntimeUC, inventoryUC); err != nil {
			panic(err)
		}
	}
	var operationalFactUC *biz.OperationalFactUsecase
	if operationalFactRepo != nil {
		operationalFactUC = biz.NewOperationalFactUsecase(operationalFactRepo)
		if err := biz.RegisterShipmentProcessDomainCommandHandlers(processRuntimeUC, operationalFactUC); err != nil {
			panic(err)
		}
		if err := biz.RegisterFinanceProcessDomainCommandHandlers(processRuntimeUC, operationalFactUC); err != nil {
			panic(err)
		}
	}
	return &jsonrpcDispatcher{
		log:               log.NewHelper(logger),
		adminManageUC:     biz.NewAdminManageUsecase(adminRepo, logger, tracesdk.NewTracerProvider()),
		customerConfigUC:  customerConfigUC,
		processRuntimeUC:  processRuntimeUC,
		salesOrderUC:      salesOrderUC,
		inventoryUC:       inventoryUC,
		operationalFactUC: operationalFactUC,
		adminReader:       adminRepo,
	}
}

type serviceCustomerConfigRepo struct {
	activeErr    error
	revisions    map[string]*biz.CustomerConfigRevision
	modules      map[string][]biz.DeploymentModuleStateInput
	profiles     map[string][]biz.RoleProfileInput
	pools        map[string][]biz.WorkPoolInput
	entitlements map[string][]biz.AccessEntitlementInput
	memberships  map[string][]biz.WorkPoolMembershipInput
}

type serviceProcessRuntimeRepo struct {
	nextProcessID  int
	nextNodeID     int
	processes      map[int]*biz.ProcessInstance
	nodes          map[int]*biz.ProcessNodeInstance
	nodesByProcess map[int][]int
}

type serviceWorkflowRepo struct {
	nextTaskID  int
	tasks       map[int]*biz.WorkflowTask
	taskCodeIDs map[string]int
}

type serviceSalesOrderRepo struct {
	orders     map[int]*biz.SalesOrder
	nextStatus string
}

type serviceMaterialSupplyInventoryRepo struct {
	biz.InventoryRepo

	inspection      *biz.QualityInspection
	qualityGate     *biz.PurchaseReceiptQualityGate
	createdReceipt  *biz.PurchaseReceipt
	postedReceipt   *biz.PurchaseReceipt
	createInput     *biz.PurchaseReceiptFromPurchaseOrderCreate
	passInput       *biz.QualityInspectionDecision
	rejectInput     *biz.QualityInspectionDecision
	postedReceiptID int
}

func newServiceCustomerConfigRepo() *serviceCustomerConfigRepo {
	return &serviceCustomerConfigRepo{
		revisions:    map[string]*biz.CustomerConfigRevision{},
		modules:      map[string][]biz.DeploymentModuleStateInput{},
		profiles:     map[string][]biz.RoleProfileInput{},
		pools:        map[string][]biz.WorkPoolInput{},
		entitlements: map[string][]biz.AccessEntitlementInput{},
		memberships:  map[string][]biz.WorkPoolMembershipInput{},
	}
}

func newServiceProcessRuntimeRepo() *serviceProcessRuntimeRepo {
	return &serviceProcessRuntimeRepo{
		nextProcessID:  1,
		nextNodeID:     1,
		processes:      map[int]*biz.ProcessInstance{},
		nodes:          map[int]*biz.ProcessNodeInstance{},
		nodesByProcess: map[int][]int{},
	}
}

func newServiceWorkflowRepo() *serviceWorkflowRepo {
	return &serviceWorkflowRepo{
		nextTaskID:  1,
		tasks:       map[int]*biz.WorkflowTask{},
		taskCodeIDs: map[string]int{},
	}
}

func TestMapCustomerConfigError_IdempotencyConflict(t *testing.T) {
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{log: log.NewHelper(logger)}
	result := dispatcher.mapCustomerConfigError(context.Background(), biz.ErrIdempotencyConflict)
	if result.Code != errcode.IdempotencyConflict.Code || result.Message != errcode.IdempotencyConflict.Message {
		t.Fatalf("unexpected idempotency conflict result: %#v", result)
	}
}

func TestMapCustomerConfigError_ProcessDomainCommandRecoveryRequired(t *testing.T) {
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{log: log.NewHelper(logger)}
	result := dispatcher.mapCustomerConfigError(context.Background(), biz.ErrProcessDomainCommandRecoveryRequired)
	if result.Code != errcode.ProcessDomainCommandRecoveryRequired.Code || result.Message != errcode.ProcessDomainCommandRecoveryRequired.Message {
		t.Fatalf("unexpected process recovery result: %#v", result)
	}
}

func newServiceSalesOrderRepo(orders map[int]*biz.SalesOrder) *serviceSalesOrderRepo {
	if orders == nil {
		orders = map[int]*biz.SalesOrder{}
	}
	return &serviceSalesOrderRepo{orders: orders}
}

func (r *serviceProcessRuntimeRepo) CreateProcessInstance(_ context.Context, in *biz.ProcessInstanceCreate, actorID int) (*biz.ProcessInstance, []*biz.ProcessNodeInstance, error) {
	for _, item := range r.processes {
		if item.ProcessKey != in.ProcessKey || item.BusinessRefType != in.BusinessRefType || item.BusinessRefID != in.BusinessRefID {
			continue
		}
		if item.IdempotencyKey == in.IdempotencyKey {
			nodes := make([]*biz.ProcessNodeInstance, 0, len(r.nodesByProcess[item.ID]))
			for _, nodeID := range r.nodesByProcess[item.ID] {
				if node := r.nodes[nodeID]; node != nil {
					nodes = append(nodes, cloneServiceProcessNodeInstance(node))
				}
			}
			return cloneServiceProcessInstance(item), nodes, nil
		}
		if item.BusinessRefType == in.BusinessRefType && item.BusinessRefID == in.BusinessRefID {
			return nil, nil, biz.ErrProcessInstanceExists
		}
	}
	now := time.Now()
	processID := r.nextProcessID
	r.nextProcessID++
	createdBy := actorID
	instance := &biz.ProcessInstance{
		ID:                     processID,
		ProcessKey:             in.ProcessKey,
		ProcessVersion:         in.ProcessVersion,
		VariantKey:             in.VariantKey,
		ConfigRevision:         in.ConfigRevision,
		DefinitionHash:         in.DefinitionHash,
		ModuleContractSnapshot: in.ModuleContractSnapshot,
		BusinessRefType:        in.BusinessRefType,
		BusinessRefID:          in.BusinessRefID,
		BusinessRefNo:          in.BusinessRefNo,
		CorrelationKey:         in.CorrelationKey,
		IdempotencyKey:         in.IdempotencyKey,
		Status:                 in.Status,
		StartedAt:              now,
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	if actorID > 0 {
		instance.CreatedBy = &createdBy
		instance.UpdatedBy = &createdBy
	}
	r.processes[processID] = cloneServiceProcessInstance(instance)
	nodes := make([]*biz.ProcessNodeInstance, 0, len(in.Nodes))
	for _, nodeIn := range in.Nodes {
		nodeID := r.nextNodeID
		r.nextNodeID++
		node := &biz.ProcessNodeInstance{
			ID:                    nodeID,
			ProcessInstanceID:     processID,
			NodeKey:               nodeIn.NodeKey,
			NodeType:              nodeIn.NodeType,
			Attempt:               nodeIn.Attempt,
			Status:                nodeIn.Status,
			OwnerPoolKey:          nodeIn.OwnerPoolKey,
			RequiredCapabilityKey: nodeIn.RequiredCapabilityKey,
			FormProfileKey:        nodeIn.FormProfileKey,
			ActionSetKey:          nodeIn.ActionSetKey,
			PolicySnapshot:        nodeIn.PolicySnapshot,
			DueAt:                 nodeIn.DueAt,
			Version:               1,
			CreatedAt:             now,
			UpdatedAt:             now,
		}
		r.nodes[nodeID] = cloneServiceProcessNodeInstance(node)
		r.nodesByProcess[processID] = append(r.nodesByProcess[processID], nodeID)
		nodes = append(nodes, cloneServiceProcessNodeInstance(node))
	}
	return cloneServiceProcessInstance(instance), nodes, nil
}

func (r *serviceProcessRuntimeRepo) GetProcessInstance(_ context.Context, id int) (*biz.ProcessInstance, error) {
	item := r.processes[id]
	if item == nil {
		return nil, biz.ErrProcessInstanceNotFound
	}
	return cloneServiceProcessInstance(item), nil
}

func (r *serviceProcessRuntimeRepo) GetProcessNodeInstance(_ context.Context, id int) (*biz.ProcessNodeInstance, error) {
	item := r.nodes[id]
	if item == nil {
		return nil, biz.ErrProcessNodeInstanceNotFound
	}
	return cloneServiceProcessNodeInstance(item), nil
}

func (r *serviceProcessRuntimeRepo) ListProcessNodeInstances(_ context.Context, processInstanceID int) ([]*biz.ProcessNodeInstance, error) {
	out := []*biz.ProcessNodeInstance{}
	for _, id := range r.nodesByProcess[processInstanceID] {
		if item := r.nodes[id]; item != nil {
			out = append(out, cloneServiceProcessNodeInstance(item))
		}
	}
	return out, nil
}

func (r *serviceProcessRuntimeRepo) ClaimProcessNodeDomainCommand(_ context.Context, in *biz.ProcessNodeDomainCommandClaim) (*biz.ProcessNodeInstance, error) {
	item := r.nodes[in.ProcessNodeInstanceID]
	if item == nil {
		return nil, biz.ErrProcessNodeInstanceNotFound
	}
	if item.ProcessInstanceID != in.ProcessInstanceID || item.Status != biz.ProcessNodeStatusActive || item.Version != in.ExpectedVersion {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	if item.NodeType != biz.ProcessNodeTypeDomainCommand {
		return nil, biz.ErrBadParam
	}
	if item.DomainCommandFingerprint != nil && *item.DomainCommandFingerprint != in.DomainCommandFingerprint {
		return nil, biz.ErrIdempotencyConflict
	}
	fingerprint := in.DomainCommandFingerprint
	item.DomainCommandFingerprint = &fingerprint
	return cloneServiceProcessNodeInstance(item), nil
}

func (r *serviceProcessRuntimeRepo) ActivateProcessNodeInstance(_ context.Context, in *biz.ProcessNodeInstanceActivate, actorID int) (*biz.ProcessNodeInstance, error) {
	item := r.nodes[in.ID]
	if item == nil {
		return nil, biz.ErrProcessNodeInstanceNotFound
	}
	if item.ProcessInstanceID != in.ProcessInstanceID || item.Status != biz.ProcessNodeStatusWaiting || item.Version != in.ExpectedVersion {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	now := time.Now()
	item.Status = biz.ProcessNodeStatusActive
	item.StartedAt = &now
	item.Version++
	item.UpdatedAt = now
	return cloneServiceProcessNodeInstance(item), nil
}

func (r *serviceProcessRuntimeRepo) CompleteProcessNodeInstance(_ context.Context, in *biz.ProcessNodeInstanceComplete, actorID int) (*biz.ProcessNodeInstance, error) {
	item := r.nodes[in.ID]
	if item == nil {
		return nil, biz.ErrProcessNodeInstanceNotFound
	}
	if item.ProcessInstanceID != in.ProcessInstanceID || item.Status != biz.ProcessNodeStatusActive || item.Version != in.ExpectedVersion {
		return nil, biz.ErrProcessNodeInstanceConflict
	}
	now := time.Now()
	outcome := in.Outcome
	item.Status = biz.ProcessNodeStatusCompleted
	item.CompletedAt = &now
	item.Outcome = &outcome
	item.DomainCommandFingerprint = in.DomainCommandFingerprint
	item.Version++
	item.UpdatedAt = now
	return cloneServiceProcessNodeInstance(item), nil
}

func (r *serviceProcessRuntimeRepo) CompleteProcessInstance(_ context.Context, in *biz.ProcessInstanceComplete, actorID int) (*biz.ProcessInstance, error) {
	item := r.processes[in.ID]
	if item == nil {
		return nil, biz.ErrProcessInstanceNotFound
	}
	if item.Status != "" && item.Status != biz.ProcessStatusActive {
		return nil, biz.ErrProcessInstanceSettled
	}
	now := time.Now()
	updatedBy := actorID
	item.Status = biz.ProcessStatusCompleted
	item.CompletedAt = &now
	item.UpdatedAt = now
	if actorID > 0 {
		item.UpdatedBy = &updatedBy
	}
	return cloneServiceProcessInstance(item), nil
}

func (r *serviceProcessRuntimeRepo) RecordProcessInstanceLinkedBusinessRef(_ context.Context, in *biz.ProcessInstanceLinkedBusinessRefRecord, actorID int) (*biz.ProcessInstance, error) {
	item := r.processes[in.ProcessInstanceID]
	if item == nil {
		return nil, biz.ErrProcessInstanceNotFound
	}
	snapshot, err := biz.ApplyProcessLinkedBusinessRefToSnapshot(item.ModuleContractSnapshot, in)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	updatedBy := actorID
	item.ModuleContractSnapshot = snapshot
	item.UpdatedAt = now
	if actorID > 0 {
		item.UpdatedBy = &updatedBy
	}
	return cloneServiceProcessInstance(item), nil
}

func (r *serviceProcessRuntimeRepo) BlockProcessNodeInstance(context.Context, *biz.ProcessNodeInstanceBlock, int) (*biz.ProcessNodeInstance, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceProcessRuntimeRepo) BlockProcessInstance(context.Context, *biz.ProcessInstanceBlock, int) (*biz.ProcessInstance, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceProcessRuntimeRepo) CreateProcessNodeInstanceAttempt(context.Context, *biz.ProcessNodeInstanceAttemptCreate, int) (*biz.ProcessNodeInstance, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceWorkflowRepo) GetWorkflowTask(_ context.Context, id int) (*biz.WorkflowTask, error) {
	item := r.tasks[id]
	if item == nil {
		return nil, biz.ErrWorkflowTaskNotFound
	}
	return cloneServiceWorkflowTask(item), nil
}

func (r *serviceWorkflowRepo) GetWorkflowTaskByTaskCode(_ context.Context, taskCode string) (*biz.WorkflowTask, error) {
	id := r.taskCodeIDs[taskCode]
	if id <= 0 {
		return nil, biz.ErrWorkflowTaskNotFound
	}
	return r.GetWorkflowTask(context.Background(), id)
}

func (r *serviceWorkflowRepo) ListWorkflowTasks(context.Context, biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	out := make([]*biz.WorkflowTask, 0, len(r.tasks))
	for _, item := range r.tasks {
		out = append(out, cloneServiceWorkflowTask(item))
	}
	return out, len(out), nil
}

func (r *serviceWorkflowRepo) CreateWorkflowTask(_ context.Context, in *biz.WorkflowTaskCreate, actorID int) (*biz.WorkflowTask, error) {
	if existingID := r.taskCodeIDs[in.TaskCode]; existingID > 0 {
		return nil, biz.ErrWorkflowTaskExists
	}
	now := time.Now()
	taskID := r.nextTaskID
	r.nextTaskID++
	createdBy := actorID
	task := &biz.WorkflowTask{
		ID:                    taskID,
		TaskCode:              in.TaskCode,
		TaskGroup:             in.TaskGroup,
		TaskName:              in.TaskName,
		SourceType:            in.SourceType,
		SourceID:              in.SourceID,
		SourceNo:              in.SourceNo,
		BusinessStatusKey:     in.BusinessStatusKey,
		TaskStatusKey:         in.TaskStatusKey,
		OwnerRoleKey:          in.OwnerRoleKey,
		OwnerPoolKey:          in.OwnerPoolKey,
		RequiredCapabilityKey: in.RequiredCapabilityKey,
		ConfigRevision:        in.ConfigRevision,
		ProcessInstanceID:     in.ProcessInstanceID,
		ProcessNodeInstanceID: in.ProcessNodeInstanceID,
		AssigneeID:            in.AssigneeID,
		Priority:              in.Priority,
		BlockedReason:         in.BlockedReason,
		DueAt:                 in.DueAt,
		Payload:               in.Payload,
		CreatedBy:             &createdBy,
		UpdatedBy:             &createdBy,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	r.tasks[taskID] = cloneServiceWorkflowTask(task)
	r.taskCodeIDs[task.TaskCode] = taskID
	return cloneServiceWorkflowTask(task), nil
}

func (r *serviceWorkflowRepo) ResolveWorkflowTaskMutation(context.Context, int, string, string, string, int) (*biz.WorkflowTask, bool, error) {
	return nil, false, nil
}

func (r *serviceWorkflowRepo) UpdateWorkflowTaskStatus(context.Context, *biz.WorkflowTaskStatusUpdate, int, string) (*biz.WorkflowTask, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceWorkflowRepo) UrgeWorkflowTask(context.Context, *biz.WorkflowTaskUrge, int, string) (*biz.WorkflowTask, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceWorkflowRepo) ListWorkflowBusinessStates(context.Context, biz.WorkflowBusinessStateFilter) ([]*biz.WorkflowBusinessState, int, error) {
	return nil, 0, nil
}

func (r *serviceWorkflowRepo) UpsertWorkflowBusinessState(context.Context, *biz.WorkflowBusinessStateUpsert, int) (*biz.WorkflowBusinessState, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) CreateSalesOrder(context.Context, *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) UpdateSalesOrder(context.Context, int, *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) GetSalesOrder(_ context.Context, id int) (*biz.SalesOrder, error) {
	item := r.orders[id]
	if item == nil {
		return nil, biz.ErrSalesOrderNotFound
	}
	cloned := *item
	return &cloned, nil
}

func (r *serviceSalesOrderRepo) ListSalesOrders(context.Context, biz.SalesOrderFilter) ([]*biz.SalesOrder, int, error) {
	return nil, 0, nil
}

func (r *serviceSalesOrderRepo) UpdateSalesOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*biz.SalesOrder, error) {
	item := r.orders[id]
	if item == nil {
		return nil, biz.ErrSalesOrderNotFound
	}
	r.nextStatus = lifecycleStatus
	updated := *item
	updated.LifecycleStatus = lifecycleStatus
	r.orders[id] = &updated
	return &updated, nil
}

func (r *serviceSalesOrderRepo) AddSalesOrderItem(context.Context, *biz.SalesOrderItemMutation) (*biz.SalesOrderItem, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) UpdateSalesOrderItem(context.Context, int, *biz.SalesOrderItemMutation) (*biz.SalesOrderItem, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) GetSalesOrderItem(context.Context, int) (*biz.SalesOrderItem, error) {
	return nil, biz.ErrSalesOrderItemNotFound
}

func (r *serviceSalesOrderRepo) UpdateSalesOrderItemStatus(context.Context, int, string) (*biz.SalesOrderItem, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) ListSalesOrderItems(context.Context, biz.SalesOrderItemFilter) ([]*biz.SalesOrderItem, int, error) {
	return nil, 0, nil
}

func (r *serviceSalesOrderRepo) SaveSalesOrderWithItems(context.Context, int, *biz.SalesOrderMutation, []*biz.SalesOrderItemSaveMutation) (*biz.SalesOrderWithItems, error) {
	return nil, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) CustomerIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) ProductIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) ProductSKUIsActiveForProduct(context.Context, int, int) (bool, error) {
	return false, biz.ErrBadParam
}

func (r *serviceSalesOrderRepo) UnitIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrBadParam
}

func (r *serviceMaterialSupplyInventoryRepo) GetQualityInspection(_ context.Context, id int) (*biz.QualityInspection, error) {
	if r.inspection == nil || r.inspection.ID != id {
		return nil, biz.ErrQualityInspectionNotFound
	}
	cloned := *r.inspection
	return &cloned, nil
}

func (r *serviceMaterialSupplyInventoryRepo) EvaluatePurchaseReceiptQualityGate(_ context.Context, receiptID int) (*biz.PurchaseReceiptQualityGate, error) {
	if r.qualityGate == nil || r.qualityGate.PurchaseReceiptID != receiptID {
		return nil, biz.ErrPurchaseReceiptNotFound
	}
	cloned := *r.qualityGate
	return &cloned, nil
}

func (r *serviceMaterialSupplyInventoryRepo) GetPurchaseReceipt(_ context.Context, receiptID int) (*biz.PurchaseReceipt, error) {
	if r.postedReceipt == nil || r.postedReceipt.ID != receiptID {
		return nil, biz.ErrPurchaseReceiptNotFound
	}
	cloned := *r.postedReceipt
	return &cloned, nil
}

func (r *serviceMaterialSupplyInventoryRepo) WarehouseIsActive(_ context.Context, id int) (bool, error) {
	if id <= 0 {
		return false, biz.ErrBadParam
	}
	return true, nil
}

func (r *serviceMaterialSupplyInventoryRepo) ResolvePurchaseReceiptFromPurchaseOrderReplay(_ context.Context, in *biz.PurchaseReceiptFromPurchaseOrderCreate) (*biz.PurchaseReceipt, bool, error) {
	if in == nil || r.createInput == nil || r.createInput.IdempotencyKey != in.IdempotencyKey {
		return nil, false, nil
	}
	if r.createInput.IdempotencyPayloadHash != in.IdempotencyPayloadHash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	if r.createdReceipt == nil {
		return nil, true, biz.ErrBadParam
	}
	cloned := *r.createdReceipt
	return &cloned, true, nil
}

func (r *serviceMaterialSupplyInventoryRepo) CreatePurchaseReceiptFromPurchaseOrder(_ context.Context, in *biz.PurchaseReceiptFromPurchaseOrderCreate) (*biz.PurchaseReceipt, error) {
	if in == nil || in.PurchaseOrderID <= 0 {
		return nil, biz.ErrBadParam
	}
	clonedInput := *in
	r.createInput = &clonedInput
	if r.createdReceipt == nil {
		r.createdReceipt = &biz.PurchaseReceipt{
			ID:        6001,
			ReceiptNo: in.ReceiptNo,
			Status:    biz.PurchaseReceiptStatusDraft,
		}
	}
	cloned := *r.createdReceipt
	return &cloned, nil
}

func (r *serviceMaterialSupplyInventoryRepo) PassQualityInspection(_ context.Context, in *biz.QualityInspectionDecision) (*biz.QualityInspection, error) {
	if r.inspection == nil || in == nil || in.InspectionID != r.inspection.ID {
		return nil, biz.ErrQualityInspectionNotFound
	}
	clonedInput := *in
	r.passInput = &clonedInput
	cloned := *r.inspection
	result := in.Result
	cloned.Result = &result
	cloned.Status = biz.QualityInspectionStatusPassed
	return &cloned, nil
}

func (r *serviceMaterialSupplyInventoryRepo) RejectQualityInspection(_ context.Context, in *biz.QualityInspectionDecision) (*biz.QualityInspection, error) {
	if r.inspection == nil || in == nil || in.InspectionID != r.inspection.ID {
		return nil, biz.ErrQualityInspectionNotFound
	}
	clonedInput := *in
	r.rejectInput = &clonedInput
	cloned := *r.inspection
	result := in.Result
	cloned.Result = &result
	cloned.Status = biz.QualityInspectionStatusRejected
	return &cloned, nil
}

func (r *serviceMaterialSupplyInventoryRepo) PostPurchaseReceipt(_ context.Context, receiptID int) (*biz.PurchaseReceipt, error) {
	if r.postedReceipt == nil || r.postedReceipt.ID != receiptID {
		return nil, biz.ErrPurchaseReceiptNotFound
	}
	r.postedReceiptID = receiptID
	r.postedReceipt.Status = biz.PurchaseReceiptStatusPosted
	cloned := *r.postedReceipt
	return &cloned, nil
}

func cloneServiceProcessInstance(item *biz.ProcessInstance) *biz.ProcessInstance {
	if item == nil {
		return nil
	}
	cloned := *item
	return &cloned
}

func cloneServiceProcessNodeInstance(item *biz.ProcessNodeInstance) *biz.ProcessNodeInstance {
	if item == nil {
		return nil
	}
	cloned := *item
	if item.PolicySnapshot != nil {
		cloned.PolicySnapshot = map[string]any{}
		for key, value := range item.PolicySnapshot {
			cloned.PolicySnapshot[key] = value
		}
	}
	return &cloned
}

func cloneServiceWorkflowTask(item *biz.WorkflowTask) *biz.WorkflowTask {
	if item == nil {
		return nil
	}
	cloned := *item
	if item.Payload != nil {
		cloned.Payload = map[string]any{}
		for key, value := range item.Payload {
			cloned.Payload[key] = value
		}
	}
	return &cloned
}

func serviceCustomerConfigKey(customerKey, revision string) string {
	return customerKey + "/" + revision
}

func (r *serviceCustomerConfigRepo) GetCustomerConfigRevision(_ context.Context, customerKey, revision string) (*biz.CustomerConfigRevision, error) {
	item := r.revisions[serviceCustomerConfigKey(customerKey, revision)]
	if item == nil {
		return nil, biz.ErrCustomerConfigNotFound
	}
	cloned := *item
	return &cloned, nil
}

func (r *serviceCustomerConfigRepo) GetActiveCustomerConfigRevision(_ context.Context, customerKey string) (*biz.CustomerConfigRevision, error) {
	if r.activeErr != nil {
		return nil, r.activeErr
	}
	for _, item := range r.revisions {
		if item.CustomerKey == customerKey && item.Status == biz.CustomerConfigStatusActive {
			cloned := *item
			return &cloned, nil
		}
	}
	return nil, biz.ErrCustomerConfigNotFound
}

func (r *serviceCustomerConfigRepo) PublishCustomerConfig(_ context.Context, in biz.CustomerConfigPublishInput, configHash string, publishedBy int, publishedAt time.Time) (*biz.CustomerConfigRevision, error) {
	item := &biz.CustomerConfigRevision{
		ID:               len(r.revisions) + 1,
		CustomerKey:      in.CustomerKey,
		Revision:         in.Revision,
		ProductVersion:   in.ProductVersion,
		ConfigHash:       configHash,
		Status:           biz.CustomerConfigStatusPublished,
		CompiledSnapshot: in.CompiledSnapshot,
		PublishedBy:      &publishedBy,
		PublishedAt:      &publishedAt,
		CreatedAt:        publishedAt,
		UpdatedAt:        publishedAt,
	}
	key := serviceCustomerConfigKey(in.CustomerKey, in.Revision)
	r.revisions[key] = item
	r.modules[key] = append([]biz.DeploymentModuleStateInput(nil), in.ModuleStates...)
	r.profiles[key] = append([]biz.RoleProfileInput(nil), in.RoleProfiles...)
	r.pools[key] = append([]biz.WorkPoolInput(nil), in.WorkPools...)
	r.entitlements[key] = append([]biz.AccessEntitlementInput(nil), in.AccessEntitlements...)
	r.memberships[key] = append([]biz.WorkPoolMembershipInput(nil), in.WorkPoolMemberships...)
	cloned := *item
	return &cloned, nil
}

func (r *serviceCustomerConfigRepo) ActivateCustomerConfig(_ context.Context, customerKey, revision string, activatedBy int, activatedAt time.Time) (*biz.CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(customerKey, revision, activatedBy, activatedAt)
}

func (r *serviceCustomerConfigRepo) RollbackCustomerConfig(_ context.Context, customerKey, targetRevision string, actorID int, rolledBackAt time.Time) (*biz.CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(customerKey, targetRevision, actorID, rolledBackAt)
}

func (r *serviceCustomerConfigRepo) switchActiveCustomerConfigRevision(customerKey, revision string, actorID int, activatedAt time.Time) (*biz.CustomerConfigRevision, error) {
	target := r.revisions[serviceCustomerConfigKey(customerKey, revision)]
	if target == nil {
		return nil, biz.ErrCustomerConfigNotFound
	}
	for _, item := range r.revisions {
		if item.CustomerKey == customerKey && item.Status == biz.CustomerConfigStatusActive && item.Revision != revision {
			item.Status = biz.CustomerConfigStatusSuperseded
		}
	}
	target.Status = biz.CustomerConfigStatusActive
	target.ActivatedBy = &actorID
	target.ActivatedAt = &activatedAt
	cloned := *target
	return &cloned, nil
}

func (r *serviceCustomerConfigRepo) ListDeploymentModuleStates(_ context.Context, customerKey, revision string) ([]biz.DeploymentModuleStateInput, error) {
	return append([]biz.DeploymentModuleStateInput(nil), r.modules[serviceCustomerConfigKey(customerKey, revision)]...), nil
}

func (r *serviceCustomerConfigRepo) ListRoleProfiles(_ context.Context, customerKey, revision string) ([]biz.RoleProfileInput, error) {
	return append([]biz.RoleProfileInput(nil), r.profiles[serviceCustomerConfigKey(customerKey, revision)]...), nil
}

func (r *serviceCustomerConfigRepo) ListAccessEntitlements(_ context.Context, customerKey, revision string, roleKeys []string) ([]biz.AccessEntitlementInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range biz.NormalizeAdminRoleKeys(roleKeys) {
		allowed[key] = struct{}{}
	}
	out := []biz.AccessEntitlementInput{}
	for _, item := range r.entitlements[serviceCustomerConfigKey(customerKey, revision)] {
		if _, ok := allowed[item.RoleKey]; ok {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *serviceCustomerConfigRepo) ListWorkPools(_ context.Context, customerKey, revision string) ([]biz.WorkPoolInput, error) {
	return append([]biz.WorkPoolInput(nil), r.pools[serviceCustomerConfigKey(customerKey, revision)]...), nil
}

func (r *serviceCustomerConfigRepo) ListWorkPoolMemberships(_ context.Context, customerKey, revision string, roleKeys []string, userID int) ([]biz.WorkPoolMembershipInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range biz.NormalizeAdminRoleKeys(roleKeys) {
		allowed[key] = struct{}{}
	}
	out := []biz.WorkPoolMembershipInput{}
	for _, item := range r.memberships[serviceCustomerConfigKey(customerKey, revision)] {
		_, roleOK := allowed[item.RoleKey]
		if roleOK || (item.UserID > 0 && item.UserID == userID) {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *serviceCustomerConfigRepo) ListWorkPoolMembershipsByPools(_ context.Context, customerKey, revision string, poolKeys []string) ([]biz.WorkPoolMembershipInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range poolKeys {
		if key != "" {
			allowed[key] = struct{}{}
		}
	}
	out := []biz.WorkPoolMembershipInput{}
	for _, item := range r.memberships[serviceCustomerConfigKey(customerKey, revision)] {
		if _, ok := allowed[item.PoolKey]; ok {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *serviceCustomerConfigRepo) CountInFlightProcessInstances(context.Context, string, string, []string) (int, error) {
	return 0, nil
}

func (r *serviceCustomerConfigRepo) CountOpenWorkflowTasksByPools(context.Context, string, string, []string) (int, error) {
	return 0, nil
}

func (r *serviceCustomerConfigRepo) CountOpenBusinessDocumentsByModules(context.Context, string, []string) (int, error) {
	return 0, nil
}

func customerConfigAdminCtx(adminID int, username string) context.Context {
	return biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   adminID,
		Username: username,
		Role:     biz.RoleAdmin,
	})
}

func customerConfigPublishParams(t *testing.T) *structpb.Struct {
	return customerConfigPublishParamsForRevision(t, "2026.06.28.1")
}

func customerConfigPublishParamsWithRevisionAndModuleState(t *testing.T, params *structpb.Struct, revision string, moduleKey string, state string) *structpb.Struct {
	t.Helper()
	payload := params.AsMap()
	if revision != "" {
		payload["revision"] = revision
	}
	moduleStates, ok := payload["module_states"].([]any)
	if !ok {
		t.Fatalf("module_states missing: %#v", payload["module_states"])
	}
	byKey := map[string]map[string]any{}
	for _, raw := range moduleStates {
		item, ok := raw.(map[string]any)
		if !ok {
			t.Fatalf("module state item = %#v", raw)
		}
		key, _ := item["module_key"].(string)
		byKey[key] = item
	}
	dependentModules := map[string][]string{
		"customers":           {"sales_orders"},
		"suppliers":           {"purchase_orders", "outsourcing_orders"},
		"products":            {"material_bom", "sales_orders"},
		"materials":           {"material_bom", "purchase_orders"},
		"processes":           {"outsourcing_orders"},
		"sales_orders":        {"shipments"},
		"purchase_orders":     {"purchase_receipts"},
		"quality_inspections": {"purchase_receipts"},
		"inventory":           {"purchase_receipts", "quality_inspections", "shipments"},
	}
	queue := []string{moduleKey}
	seen := map[string]struct{}{}
	for len(queue) > 0 {
		key := queue[0]
		queue = queue[1:]
		if _, done := seen[key]; done {
			continue
		}
		seen[key] = struct{}{}
		item := byKey[key]
		if item == nil {
			item = map[string]any{"module_key": key}
			moduleStates = append(moduleStates, item)
			byKey[key] = item
		}
		item["state"] = state
		queue = append(queue, dependentModules[key]...)
	}
	payload["module_states"] = moduleStates
	out, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	return out
}

func publishAndActivateCustomerConfigForTest(t *testing.T, dispatcher *jsonrpcDispatcher, ctx context.Context, params *structpb.Struct) {
	t.Helper()
	payload := params.AsMap()
	revision, _ := payload["revision"].(string)
	if revision == "" {
		t.Fatalf("revision missing in customer config params: %#v", payload)
	}
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish-"+revision, params)
	if err != nil {
		t.Fatalf("publish %s err = %v", revision, err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish %s code = %d msg=%s", revision, publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     revision,
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate-"+revision, activateParams)
	if err != nil {
		t.Fatalf("activate %s err = %v", revision, err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate %s code = %d msg=%s", revision, activateRes.Code, activateRes.Message)
	}
}

func customerConfigPublishParamsForRevision(t *testing.T, revision string) *structpb.Struct {
	t.Helper()
	roleProfiles := make([]any, 0, len(biz.BuiltinRoles()))
	accessEntitlements := make([]any, 0, len(biz.AllPermissionKeys()))
	for _, role := range biz.BuiltinRoles() {
		roleProfiles = append(roleProfiles, map[string]any{
			"role_key":     role.Key,
			"display_name": role.Name,
		})
		for _, capabilityKey := range role.Permissions {
			accessEntitlements = append(accessEntitlements, map[string]any{
				"role_key":       role.Key,
				"capability_key": capabilityKey,
				"scope_type":     "customer",
				"scope_value":    biz.DefaultCustomerKey,
				"enabled":        true,
			})
		}
	}
	params, err := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"revision":        revision,
		"product_version": "test",
		"compiled_snapshot": map[string]any{
			"customer": map[string]any{"key": biz.DefaultCustomerKey, "name": "永绅"},
			"pages":    []any{"global-dashboard", "permission-center", "sales-orders"},
			"workflows": []any{
				map[string]any{
					"key":           "sales_order_approval",
					"sourceModules": []any{"sales_orders"},
				},
			},
			"fieldPolicies": map[string]any{
				"sales_orders.default": map[string]any{
					"source_no": map[string]any{"visible": false},
				},
			},
			"printTemplateDefaults": map[string]any{
				"runtime_enabled":                    true,
				"formal_runtime_consumed":            true,
				"sales_order_print_template_enabled": false,
				"templates": []any{
					map[string]any{
						"template_key":              "material-purchase-contract",
						"runtime_consumed":          true,
						"supplier_defaults_allowed": false,
						"party_defaults": map[string]any{
							"buyerCompany": "永绅",
						},
					},
				},
			},
		},
		"module_states": []any{
			map[string]any{"module_key": "customers", "state": "enabled"},
			map[string]any{"module_key": "suppliers", "state": "enabled"},
			map[string]any{"module_key": "products", "state": "enabled"},
			map[string]any{"module_key": "materials", "state": "enabled"},
			map[string]any{"module_key": "processes", "state": "enabled"},
			map[string]any{"module_key": "sales_orders", "state": "enabled"},
			map[string]any{"module_key": "workflow_tasks", "state": "enabled"},
			map[string]any{"module_key": "purchase_orders", "state": "enabled"},
			map[string]any{"module_key": "purchase_receipts", "state": "enabled"},
			map[string]any{"module_key": "quality_inspections", "state": "enabled"},
			map[string]any{"module_key": "inventory", "state": "enabled"},
			map[string]any{"module_key": "shipments", "state": "enabled"},
			map[string]any{"module_key": "finance", "state": "enabled"},
		},
		"role_profiles":       roleProfiles,
		"access_entitlements": accessEntitlements,
		"work_pools": []any{
			map[string]any{"pool_key": "admin", "module_key": "system", "display_name": "配置管理员"},
			map[string]any{"pool_key": "sales", "module_key": "sales_orders", "display_name": "业务池"},
		},
		"work_pool_memberships": []any{
			map[string]any{"pool_key": "admin", "role_key": biz.AdminRoleKey, "enabled": true},
			map[string]any{"pool_key": "sales", "role_key": biz.SalesRoleKey, "enabled": true},
		},
	})
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	return params
}

func customerConfigPublishParamsWithSalesOrderAcceptanceProcess(t *testing.T) *structpb.Struct {
	t.Helper()
	params := customerConfigPublishParams(t)
	payload := params.AsMap()
	snapshot, ok := payload["compiled_snapshot"].(map[string]any)
	if !ok {
		t.Fatalf("compiled_snapshot missing: %#v", payload)
	}
	snapshot["processDefinitions"] = map[string]any{
		biz.ProcessKeySalesOrderAcceptance: map[string]any{
			"process_key":            biz.ProcessKeySalesOrderAcceptance,
			"process_version":        "v1",
			"variant_key":            "default",
			"manifest_status":        "runtime_loader_ready",
			"runtime_loader_enabled": true,
			"business_ref_type":      "sales_order",
			"domain_boundary":        "source_document_command_only",
			"fact_boundary":          "no_fact_posting",
			"source_workflow_key":    "sales_order_approval",
			"nodes": []any{
				map[string]any{
					"node_key":                "submit_sales_order",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"required_capability_key": biz.PermissionSalesOrderSubmit,
					"policy_snapshot": map[string]any{
						"command_key":              biz.ProcessDomainCommandSalesOrderSubmit,
						"source_command_key":       "submit_sales_order",
						"handler":                  "SalesOrderUsecase.SubmitSalesOrder",
						"idempotency_key_required": true,
						"writes_fact":              false,
					},
				},
				map[string]any{
					"node_key":                "order_approval",
					"node_type":               biz.ProcessNodeTypeApproval,
					"owner_pool_key":          "order_approval",
					"required_capability_key": biz.PermissionWorkflowTaskApprove,
					"form_profile_key":        "sales_order_approval.default",
					"action_set_key":          "sales_order_approval",
				},
				map[string]any{
					"node_key":                "order_review",
					"node_type":               biz.ProcessNodeTypeHumanTask,
					"owner_pool_key":          "order_review",
					"required_capability_key": biz.PermissionWorkflowTaskComplete,
					"form_profile_key":        "sales_order_review.default",
					"action_set_key":          "sales_order_review",
				},
				map[string]any{
					"node_key":  "end",
					"node_type": biz.ProcessNodeTypeEnd,
				},
			},
		},
	}
	payload["work_pools"] = append(payload["work_pools"].([]any),
		map[string]any{"pool_key": "order_approval", "module_key": "sales_orders", "display_name": "订单审批"},
		map[string]any{"pool_key": "order_review", "module_key": "sales_orders", "display_name": "订单评审"},
	)
	payload["work_pool_memberships"] = append(payload["work_pool_memberships"].([]any),
		map[string]any{"pool_key": "order_approval", "role_key": biz.BossRoleKey, "enabled": true},
		map[string]any{"pool_key": "order_review", "role_key": biz.PMCRoleKey, "enabled": true},
	)
	params, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	return params
}

func customerConfigPublishParamsWithMaterialSupplyRuntimeProcess(t *testing.T) *structpb.Struct {
	t.Helper()
	params := customerConfigPublishParams(t)
	payload := params.AsMap()
	snapshot, ok := payload["compiled_snapshot"].(map[string]any)
	if !ok {
		t.Fatalf("compiled_snapshot missing: %#v", payload)
	}
	snapshot["processDefinitions"] = map[string]any{
		biz.ProcessKeyMaterialSupply: map[string]any{
			"process_key":            biz.ProcessKeyMaterialSupply,
			"process_version":        "v1",
			"variant_key":            "purchase_receipt_iqc_inbound",
			"manifest_status":        "runtime_loader_ready",
			"runtime_loader_enabled": true,
			"business_ref_type":      "purchase_receipt",
			"domain_boundary":        "explicit_fact_command_api",
			"fact_boundary":          "no_fact_posting",
			"source_status":          "explicit_api_only",
			"nodes": []any{
				map[string]any{
					"node_key":                "incoming_qc",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"required_capability_key": biz.PermissionQualityInspectionUpdate,
					"policy_snapshot": map[string]any{
						"command_key":              biz.ProcessDomainCommandIncomingQualityGate,
						"handler":                  "InventoryUsecase.EvaluatePurchaseReceiptQualityGate",
						"idempotency_key_required": true,
						"writes_fact":              false,
					},
				},
				map[string]any{
					"node_key":                "warehouse_inbound",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"required_capability_key": biz.PermissionWarehouseInboundConfirm,
					"policy_snapshot": map[string]any{
						"command_key":              biz.ProcessDomainCommandInventoryPostInbound,
						"handler":                  "InventoryUsecase.PostPurchaseReceipt",
						"idempotency_key_required": true,
						"writes_fact":              false,
					},
				},
				map[string]any{
					"node_key":  "end",
					"node_type": biz.ProcessNodeTypeEnd,
				},
			},
		},
	}
	params, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	return params
}

func customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t *testing.T) *structpb.Struct {
	t.Helper()
	params := customerConfigPublishParams(t)
	payload := params.AsMap()
	snapshot, ok := payload["compiled_snapshot"].(map[string]any)
	if !ok {
		t.Fatalf("compiled_snapshot missing: %#v", payload)
	}
	blockers := []any{
		"domain_command_handler_not_registered",
		"target_evidence_missing",
	}
	shipmentExecutionBlockers := []any{
		"target_evidence_missing",
	}
	registeredHandlerBlockers := []any{
		"target_evidence_missing",
	}
	snapshot["processDefinitions"] = map[string]any{
		biz.ProcessKeyFinishedGoodsDelivery: map[string]any{
			"process_key":            biz.ProcessKeyFinishedGoodsDelivery,
			"process_version":        "v1",
			"variant_key":            "quality_finance_ship_receivable",
			"manifest_status":        "runtime_loader_start_ready",
			"runtime_loader_enabled": true,
			"business_ref_type":      "shipment",
			"domain_boundary":        "contract_preflight_only",
			"fact_boundary":          "no_fact_posting",
			"source_workflow_key":    "finished_goods_delivery",
			"source_status":          "workflow_preview",
			"nodes": []any{
				map[string]any{
					"node_key":                "finished_goods_quality",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"owner_pool_key":          "finished_goods_quality",
					"required_capability_key": biz.PermissionQualityInspectionUpdate,
					"policy_snapshot": map[string]any{
						"command_key": "finished_goods_quality.decide",
						"writes_fact": false,
					},
					"fact_command_contract": map[string]any{
						"command_key":                        "finished_goods_quality.decide",
						"runtime_binding_status":             "contract_preflight_only",
						"process_runtime_handler_registered": false,
						"runtime_loader_blockers":            []any{},
						"runtime_execute_blockers":           blockers,
						"writes_fact":                        false,
					},
				},
				map[string]any{
					"node_key":                "shipment_finance_release",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"owner_pool_key":          "shipment_finance_release",
					"required_capability_key": biz.PermissionFinanceReceivableConfirm,
					"policy_snapshot": map[string]any{
						"command_key": "shipment.finance_release",
						"writes_fact": false,
					},
					"fact_command_contract": map[string]any{
						"command_key":                        "shipment.finance_release",
						"runtime_binding_status":             "process_runtime_handler_registered",
						"process_runtime_handler_registered": true,
						"runtime_loader_blockers":            []any{},
						"runtime_execute_blockers":           registeredHandlerBlockers,
						"writes_fact":                        false,
					},
				},
				map[string]any{
					"node_key":                "shipment_execution",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"owner_pool_key":          "shipment_execution",
					"required_capability_key": biz.PermissionShipmentShip,
					"policy_snapshot": map[string]any{
						"command_key": "shipment.ship",
						"writes_fact": false,
					},
					"fact_command_contract": map[string]any{
						"command_key":                        "shipment.ship",
						"runtime_binding_status":             "process_runtime_handler_registered",
						"process_runtime_handler_registered": true,
						"runtime_loader_blockers":            []any{},
						"runtime_execute_blockers":           shipmentExecutionBlockers,
						"writes_fact":                        false,
					},
				},
				map[string]any{
					"node_key":                "receivable_lead",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"owner_pool_key":          "receivable_lead",
					"required_capability_key": biz.PermissionFinanceReceivableConfirm,
					"policy_snapshot": map[string]any{
						"command_key": "finance.receivable_lead",
						"writes_fact": false,
					},
					"fact_command_contract": map[string]any{
						"command_key":                        "finance.receivable_lead",
						"runtime_binding_status":             "process_runtime_handler_registered",
						"process_runtime_handler_registered": true,
						"runtime_loader_blockers":            []any{},
						"runtime_execute_blockers":           registeredHandlerBlockers,
						"writes_fact":                        false,
					},
				},
				map[string]any{
					"node_key":  "end",
					"node_type": biz.ProcessNodeTypeEnd,
				},
			},
		},
	}
	params, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	return params
}

func customerConfigPublishParamsWithMaterialSupplyPurchaseOrderRuntimeProcess(t *testing.T) *structpb.Struct {
	t.Helper()
	params := customerConfigPublishParamsWithMaterialSupplyRuntimeProcess(t)
	payload := params.AsMap()
	snapshot, ok := payload["compiled_snapshot"].(map[string]any)
	if !ok {
		t.Fatalf("compiled_snapshot missing: %#v", payload)
	}
	snapshot["processDefinitions"] = map[string]any{
		biz.ProcessKeyMaterialSupply: map[string]any{
			"process_key":            biz.ProcessKeyMaterialSupply,
			"process_version":        "v1",
			"variant_key":            "purchase_order_receipt_iqc_inbound",
			"manifest_status":        "runtime_loader_ready",
			"runtime_loader_enabled": true,
			"business_ref_type":      "purchase_order",
			"domain_boundary":        "explicit_fact_command_api",
			"fact_boundary":          "no_fact_posting",
			"source_status":          "explicit_api_only",
			"nodes": []any{
				map[string]any{
					"node_key":                "purchase_receipt_source",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"required_capability_key": biz.PermissionPurchaseReceiptCreate,
					"policy_snapshot": map[string]any{
						"command_key":              biz.ProcessDomainCommandPurchaseReceiptCreate,
						"handler":                  "InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
						"idempotency_key_required": true,
						"writes_fact":              false,
					},
				},
				map[string]any{
					"node_key":                "incoming_qc",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"required_capability_key": biz.PermissionQualityInspectionUpdate,
					"policy_snapshot": map[string]any{
						"command_key":              biz.ProcessDomainCommandIncomingQualityGate,
						"handler":                  "InventoryUsecase.EvaluatePurchaseReceiptQualityGate",
						"idempotency_key_required": true,
						"writes_fact":              false,
					},
				},
				map[string]any{
					"node_key":                "warehouse_inbound",
					"node_type":               biz.ProcessNodeTypeDomainCommand,
					"required_capability_key": biz.PermissionWarehouseInboundConfirm,
					"policy_snapshot": map[string]any{
						"command_key":              biz.ProcessDomainCommandInventoryPostInbound,
						"handler":                  "InventoryUsecase.PostPurchaseReceipt",
						"idempotency_key_required": true,
						"writes_fact":              false,
					},
				},
				map[string]any{
					"node_key":  "end",
					"node_type": biz.ProcessNodeTypeEnd,
				},
			},
		},
	}
	out, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	return out
}

func TestCustomerConfigJSONRPCRequiresPublishPermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "sales", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.SalesRoleKey})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "sales"), "publish_customer_config", "1", customerConfigPublishParams(t))
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func TestCustomerConfigJSONRPCRejectsRemovedRoleProfileGrants(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	payload := customerConfigPublishParams(t).AsMap()
	profiles, ok := payload["role_profiles"].([]any)
	if !ok || len(profiles) == 0 {
		t.Fatalf("role_profiles missing: %#v", payload["role_profiles"])
	}
	profile, ok := profiles[0].(map[string]any)
	if !ok {
		t.Fatalf("role profile invalid: %#v", profiles[0])
	}
	profile["grants"] = []any{biz.PermissionSalesOrderRead}
	params, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}

	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "admin"), "publish_customer_config", "1", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.InvalidParam.Code {
		t.Fatalf("code = %d, want invalid param", res.Code)
	}
}

func TestCustomerConfigJSONRPCRejectsUnsupportedFieldPolicy(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	params, err := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"revision":        "2026.06.28.invalid-field-policy",
		"product_version": "test",
		"compiled_snapshot": map[string]any{
			"customer": map[string]any{"key": biz.DefaultCustomerKey, "name": "永绅"},
			"pages":    []any{"global-dashboard"},
			"fieldPolicies": map[string]any{
				"sales_order_items.default": map[string]any{
					"style_no": map[string]any{"visible": true},
				},
			},
		},
		"module_states": []any{
			map[string]any{"module_key": "sales_orders", "state": "enabled"},
		},
		"role_profiles": []any{
			map[string]any{"role_key": biz.AdminRoleKey, "display_name": "系统管理员"},
		},
		"access_entitlements": []any{
			map[string]any{"role_key": biz.AdminRoleKey, "capability_key": biz.PermissionCustomerConfigRead, "enabled": true},
		},
		"work_pools": []any{
			map[string]any{"pool_key": "admin", "module_key": "system", "display_name": "配置管理员"},
		},
		"work_pool_memberships": []any{
			map[string]any{"pool_key": "admin", "role_key": biz.AdminRoleKey, "enabled": true},
		},
	})
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}

	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "admin"), "publish_customer_config", "1", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.InvalidParam.Code {
		t.Fatalf("code = %d, want invalid param", res.Code)
	}
}

func TestCustomerConfigJSONRPCRejectsUnknownPageProjection(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	params := customerConfigPublishParams(t)
	payload := params.AsMap()
	snapshot, ok := payload["compiled_snapshot"].(map[string]any)
	if !ok {
		t.Fatalf("compiled_snapshot missing: %#v", payload)
	}
	snapshot["pages"] = []any{"global-dashboard", "unknown-page"}
	params, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}

	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "admin"), "publish_customer_config", "1", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.InvalidParam.Code {
		t.Fatalf("code = %d, want invalid param", res.Code)
	}
}

func TestCustomerConfigJSONRPCPublishActivateAndEffectiveSession(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "1", customerConfigPublishParams(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "2", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}
	sessionParams, _ := structpb.NewStruct(map[string]any{"customer_key": biz.DefaultCustomerKey})
	_, sessionRes, err := dispatcher.handleCustomerConfig(ctx, "get_effective_session", "3", sessionParams)
	if err != nil {
		t.Fatalf("session err = %v", err)
	}
	if sessionRes.Code != errcode.OK.Code {
		t.Fatalf("session code = %d msg=%s", sessionRes.Code, sessionRes.Message)
	}
	data := sessionRes.Data.AsMap()
	session, ok := data["session"].(map[string]any)
	if !ok {
		t.Fatalf("session missing: %#v", data)
	}
	if session["configRevision"] != "2026.06.28.1" {
		t.Fatalf("configRevision = %#v", session["configRevision"])
	}
	if session["source"] != "active_customer_config_revision" {
		t.Fatalf("source = %#v", session["source"])
	}
	printDefaults, ok := session["printTemplateDefaults"].(map[string]any)
	if !ok {
		t.Fatalf("printTemplateDefaults missing: %#v", session)
	}
	if printDefaults["sales_order_print_template_enabled"] != false {
		t.Fatalf("sales order print template must stay disabled: %#v", printDefaults)
	}
}

func TestCustomerConfigJSONRPCEffectiveSessionRequiresActiveRevisionForFixedRealCustomer(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	params, _ := structpb.NewStruct(map[string]any{"customer_key": "yoyoosun"})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "admin"), "get_effective_session", "1", params)
	if err != nil {
		t.Fatalf("get_effective_session err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code || res.Message != "当前部署客户尚未激活配置，业务权限已关闭" {
		t.Fatalf("fixed customer missing active revision result = %#v", res)
	}
}

func TestCustomerConfigJSONRPCEffectiveSessionKeepsBuiltinFallbackOutsideFixedRealCustomer(t *testing.T) {
	tests := []struct {
		name          string
		configuredKey string
		requestedKey  string
		wantKey       string
	}{
		{name: "unfixed explicit customer", configuredKey: "", requestedKey: "yoyoosun", wantKey: "yoyoosun"},
		{name: "fixed demo", configuredKey: biz.DefaultCustomerKey, requestedKey: "", wantKey: biz.DefaultCustomerKey},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("ERP_CUSTOMER_KEY", tt.configuredKey)
			dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
			params, _ := structpb.NewStruct(map[string]any{"customer_key": tt.requestedKey})
			_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "admin"), "get_effective_session", "1", params)
			if err != nil {
				t.Fatalf("get_effective_session err = %v", err)
			}
			if res.Code != errcode.OK.Code {
				t.Fatalf("result = %#v", res)
			}
			session, ok := res.Data.AsMap()["session"].(map[string]any)
			if !ok || session["source"] != "builtin_rbac_fallback" {
				t.Fatalf("session = %#v", session)
			}
			customer, ok := session["customer"].(map[string]any)
			if !ok || customer["key"] != tt.wantKey {
				t.Fatalf("customer = %#v, want key %s", customer, tt.wantKey)
			}
		})
	}
}

func TestCustomerConfigJSONRPCExplainModuleStatus(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "1", customerConfigPublishParams(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "2", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	explainParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"module_key":   "sales_orders",
	})
	_, explainRes, err := dispatcher.handleCustomerConfig(ctx, "explain_module_status", "3", explainParams)
	if err != nil {
		t.Fatalf("explain err = %v", err)
	}
	if explainRes.Code != errcode.OK.Code {
		t.Fatalf("explain code = %d msg=%s", explainRes.Code, explainRes.Message)
	}
	data := explainRes.Data.AsMap()
	moduleStatus, ok := data["module_status"].(map[string]any)
	if !ok {
		t.Fatalf("module_status missing: %#v", data)
	}
	if moduleStatus["module_key"] != "sales_orders" || moduleStatus["customer_state"] != "enabled" {
		t.Fatalf("module status = %#v", moduleStatus)
	}
	if moduleStatus["product_included"] != true || moduleStatus["dependencies_satisfied"] != true {
		t.Fatalf("catalog/dependency fields = %#v", moduleStatus)
	}
	if moduleStatus["can_disable"] != false ||
		moduleStatus["runtime_count_source"] != "process_workflow_business_partial" ||
		moduleStatus["open_business_document_count"] != float64(0) {
		t.Fatalf("disable/count fields = %#v", moduleStatus)
	}
}

func TestCustomerConfigJSONRPCExplainModuleStatusRequiresReadPermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "sales", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.SalesRoleKey})
	params, _ := structpb.NewStruct(map[string]any{"customer_key": biz.DefaultCustomerKey, "module_key": "sales_orders"})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "sales"), "explain_module_status", "1", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func TestCustomerConfigJSONRPCExplainProcessDefinitionFinishedGoodsDelivery(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "1", customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "2", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	explainParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"process_key":  biz.ProcessKeyFinishedGoodsDelivery,
	})
	_, explainRes, err := dispatcher.handleCustomerConfig(ctx, "explain_process_definition", "3", explainParams)
	if err != nil {
		t.Fatalf("explain err = %v", err)
	}
	if explainRes.Code != errcode.OK.Code {
		t.Fatalf("explain code = %d msg=%s", explainRes.Code, explainRes.Message)
	}
	data := explainRes.Data.AsMap()
	definition, ok := data["process_definition"].(map[string]any)
	if !ok {
		t.Fatalf("process_definition missing: %#v", data)
	}
	if definition["process_key"] != biz.ProcessKeyFinishedGoodsDelivery ||
		definition["manifest_status"] != "runtime_loader_start_ready" ||
		definition["runtime_loader_enabled"] != true ||
		definition["can_start_runtime"] != true ||
		definition["can_execute_runtime_commands"] != false {
		t.Fatalf("definition = %#v", definition)
	}
	nodes, ok := definition["nodes"].([]any)
	if !ok || len(nodes) != 5 {
		t.Fatalf("nodes = %#v", definition["nodes"])
	}
	reasons := map[string]bool{}
	for _, raw := range definition["execute_blocked_reasons"].([]any) {
		if text, ok := raw.(string); ok {
			reasons[text] = true
		}
	}
	for _, want := range []string{"domain_command_handler_not_registered", "target_evidence_missing"} {
		if !reasons[want] {
			t.Fatalf("missing execute blocked reason %q in %#v", want, definition["execute_blocked_reasons"])
		}
	}
	if reasons["explicit_runtime_execute_api_not_implemented"] {
		t.Fatalf("execute blocked reasons should not keep explicit API blocker after all finished goods delivery guard APIs exist: %#v", definition["execute_blocked_reasons"])
	}
}

func TestCustomerConfigJSONRPCExplainProcessDefinitionRequiresReadPermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "sales", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.SalesRoleKey})
	params, _ := structpb.NewStruct(map[string]any{"customer_key": biz.DefaultCustomerKey, "process_key": biz.ProcessKeyFinishedGoodsDelivery})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "sales"), "explain_process_definition", "1", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func TestCustomerConfigJSONRPCStartFinishedGoodsDeliveryProcess(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{})
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"shipment_id":     float64(9001),
		"shipment_no":     "SHIP-9001",
		"idempotency_key": "finished-goods-delivery/SHIP-9001",
		"correlation_key": "sales_order:1001",
		"process_version": "v1",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_finished_goods_delivery_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	data := startRes.Data.AsMap()
	instance, ok := data["process_instance"].(map[string]any)
	if !ok {
		t.Fatalf("process_instance missing: %#v", data)
	}
	if instance["process_key"] != biz.ProcessKeyFinishedGoodsDelivery ||
		instance["business_ref_type"] != "shipment" ||
		instance["business_ref_id"] != float64(9001) {
		t.Fatalf("process_instance = %#v", instance)
	}
	startedNode, ok := data["started_node"].(map[string]any)
	if !ok ||
		startedNode["node_key"] != "finished_goods_quality" ||
		startedNode["node_type"] != biz.ProcessNodeTypeDomainCommand ||
		startedNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("started_node = %#v", data["started_node"])
	}
	nodes, ok := data["nodes"].([]any)
	if !ok || len(nodes) != 5 {
		t.Fatalf("nodes = %#v", data["nodes"])
	}
	secondNode, ok := nodes[1].(map[string]any)
	if !ok || secondNode["node_key"] != "shipment_finance_release" || secondNode["status"] != biz.ProcessNodeStatusWaiting {
		t.Fatalf("second node = %#v", nodes[1])
	}
	boundary := data["runtime_boundary"].(map[string]any)
	if boundary["runtime_loader_start_only"] != true ||
		boundary["executes_domain_command"] != false ||
		boundary["writes_shipment_or_finance_fact"] != false ||
		boundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("runtime_boundary = %#v", boundary)
	}
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideGuardedByMissingHandler(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{})
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}
	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"shipment_id":     float64(9001),
		"shipment_no":     "SHIP-9001",
		"idempotency_key": "finished-goods-delivery/SHIP-9001",
		"process_version": "v1",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_finished_goods_delivery_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	startData := startRes.Data.AsMap()
	instance := startData["process_instance"].(map[string]any)
	startedNode := startData["started_node"].(map[string]any)
	processInstanceID := int(instance["id"].(float64))
	processNodeInstanceID := int(startedNode["id"].(float64))
	expectedVersion := int(startedNode["version"].(float64))

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(processInstanceID),
		"process_node_instance_id": float64(processNodeInstanceID),
		"expected_version":         float64(expectedVersion),
		"shipment_id":              float64(9001),
		"finished_goods_lot_id":    float64(7001),
		"quality_inspection_id":    float64(8001),
		"result":                   "PASS",
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/quality/PASS",
		"decision_note":            "guard only",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_finished_goods_delivery_quality_decide", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.InvalidParam.Code || executeRes.Message != "流程领域命令处理器不存在" {
		t.Fatalf("execute result = %#v", executeRes)
	}
	nodes, err := dispatcher.processRuntimeUC.ListProcessNodeInstances(ctx, processInstanceID)
	if err != nil {
		t.Fatalf("ListProcessNodeInstances err = %v", err)
	}
	node := nodes[0]
	if node.ID != processNodeInstanceID || node.Status != biz.ProcessNodeStatusActive || node.Version != expectedVersion || node.CompletedAt != nil {
		t.Fatalf("node should remain active after missing handler guard: %#v", node)
	}
	if nodes[1].Status != biz.ProcessNodeStatusWaiting {
		t.Fatalf("next node should remain waiting: %#v", nodes[1])
	}
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideRunsRegisteredHandler(t *testing.T) {
	sourceType := biz.QualityInspectionSourceShipment
	sourceID := 9001
	inspectionType := biz.QualityInspectionTypeFinishedGoods
	inventoryRepo := &serviceFinishedGoodsQualityInventoryRepoStub{
		inspection: &biz.QualityInspection{
			ID:             8001,
			InventoryLotID: 7001,
			SourceType:     &sourceType,
			SourceID:       &sourceID,
			InspectionType: &inspectionType,
			Status:         biz.QualityInspectionStatusSubmitted,
		},
	}
	dispatcher := newCustomerConfigTestDispatcherWithInventoryRepo(
		&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{},
		inventoryRepo,
	)
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}
	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"shipment_id":     float64(9001),
		"shipment_no":     "SHIP-9001",
		"idempotency_key": "finished-goods-delivery/SHIP-9001/quality-handler",
		"process_version": "v1",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_finished_goods_delivery_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	startData := startRes.Data.AsMap()
	instance := startData["process_instance"].(map[string]any)
	startedNode := startData["started_node"].(map[string]any)
	processInstanceID := int(instance["id"].(float64))
	processNodeInstanceID := int(startedNode["id"].(float64))
	expectedVersion := int(startedNode["version"].(float64))

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(processInstanceID),
		"process_node_instance_id": float64(processNodeInstanceID),
		"expected_version":         float64(expectedVersion),
		"shipment_id":              float64(9001),
		"finished_goods_lot_id":    float64(7001),
		"quality_inspection_id":    float64(8001),
		"result":                   "PASS",
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/quality/PASS",
		"decision_note":            "成品质检通过",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_finished_goods_delivery_quality_decide", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.OK.Code {
		t.Fatalf("execute code = %d msg=%s", executeRes.Code, executeRes.Message)
	}
	if inventoryRepo.passInput == nil || inventoryRepo.passInput.InspectionID != 8001 ||
		!inventoryRepo.passInput.InspectedAtDefaulted {
		t.Fatalf("expected quality pass input for inspection 8001, got %#v", inventoryRepo.passInput)
	}
	data := executeRes.Data.AsMap()
	completedNode := data["completed_node"].(map[string]any)
	if completedNode["node_key"] != "finished_goods_quality" ||
		completedNode["status"] != biz.ProcessNodeStatusCompleted ||
		completedNode["outcome"] != biz.FinishedGoodsQualityProcessCommandOutcomePassed {
		t.Fatalf("completed_node = %#v", completedNode)
	}
	boundary := data["runtime_boundary"].(map[string]any)
	if boundary["writes_quality_fact"] != true ||
		boundary["writes_shipment_or_finance_fact"] != false ||
		boundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("runtime_boundary = %#v", boundary)
	}
	nodes, err := dispatcher.processRuntimeUC.ListProcessNodeInstances(ctx, processInstanceID)
	if err != nil {
		t.Fatalf("ListProcessNodeInstances err = %v", err)
	}
	if nodes[0].Status != biz.ProcessNodeStatusCompleted || nodes[1].Status != biz.ProcessNodeStatusActive {
		t.Fatalf("expected quality completed and finance release active, nodes=%#v", nodes)
	}
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryQualityDecideRequiresQualityPermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "warehouse", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.WarehouseRoleKey})
	params, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(1),
		"process_node_instance_id": float64(1),
		"expected_version":         float64(1),
		"shipment_id":              float64(9001),
		"result":                   "PASS",
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/quality/PASS",
	})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "warehouse"), "execute_finished_goods_delivery_quality_decide", "execute", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

type serviceFinishedGoodsQualityInventoryRepoStub struct {
	biz.InventoryRepo
	inspection  *biz.QualityInspection
	passInput   *biz.QualityInspectionDecision
	rejectInput *biz.QualityInspectionDecision
}

func (r *serviceFinishedGoodsQualityInventoryRepoStub) GetQualityInspection(_ context.Context, id int) (*biz.QualityInspection, error) {
	if r.inspection == nil || r.inspection.ID != id {
		return nil, biz.ErrQualityInspectionNotFound
	}
	copied := *r.inspection
	return &copied, nil
}

func (r *serviceFinishedGoodsQualityInventoryRepoStub) PassQualityInspection(_ context.Context, in *biz.QualityInspectionDecision) (*biz.QualityInspection, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	copiedInput := *in
	r.passInput = &copiedInput
	return &biz.QualityInspection{
		ID:             in.InspectionID,
		InventoryLotID: r.inspection.InventoryLotID,
		SourceType:     r.inspection.SourceType,
		SourceID:       r.inspection.SourceID,
		InspectionType: r.inspection.InspectionType,
		Status:         biz.QualityInspectionStatusPassed,
		Result:         &copiedInput.Result,
		InspectedAt:    &copiedInput.InspectedAt,
		InspectorID:    copiedInput.InspectorID,
		DecisionNote:   copiedInput.DecisionNote,
	}, nil
}

func (r *serviceFinishedGoodsQualityInventoryRepoStub) RejectQualityInspection(_ context.Context, in *biz.QualityInspectionDecision) (*biz.QualityInspection, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	copiedInput := *in
	r.rejectInput = &copiedInput
	return &biz.QualityInspection{
		ID:             in.InspectionID,
		InventoryLotID: r.inspection.InventoryLotID,
		SourceType:     r.inspection.SourceType,
		SourceID:       r.inspection.SourceID,
		InspectionType: r.inspection.InspectionType,
		Status:         biz.QualityInspectionStatusRejected,
		Result:         &copiedInput.Result,
		InspectedAt:    &copiedInput.InspectedAt,
		InspectorID:    copiedInput.InspectorID,
		DecisionNote:   copiedInput.DecisionNote,
	}, nil
}

func createFinishedGoodsDeliveryFinanceReleaseActiveFixture(t *testing.T, dispatcher *jsonrpcDispatcher, ctx context.Context) (*biz.ProcessInstance, []*biz.ProcessNodeInstance) {
	t.Helper()
	instance, nodes, err := dispatcher.processRuntimeUC.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:             biz.ProcessKeyFinishedGoodsDelivery,
		ProcessVersion:         "v1",
		VariantKey:             optionalRPCStringPointer("quality_finance_ship_receivable"),
		ConfigRevision:         "2026.06.28.1",
		DefinitionHash:         "finished-goods-delivery-test",
		ModuleContractSnapshot: map[string]any{"source": "test"},
		BusinessRefType:        "shipment",
		BusinessRefID:          9001,
		BusinessRefNo:          optionalRPCStringPointer("SHIP-9001"),
		IdempotencyKey:         "finished-goods-delivery/SHIP-9001/finance-fixture",
		Status:                 biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:  "finished_goods_quality",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusCompleted,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandFinishedGoodsQualityDecide,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "shipment_finance_release",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusActive,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandShipmentFinanceRelease,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "shipment_execution",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandShipmentShip,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "receivable_lead",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandFinanceReceivableLead,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "end",
				NodeType: biz.ProcessNodeTypeEnd,
				Status:   biz.ProcessNodeStatusWaiting,
			},
		},
	}, 1)
	if err != nil {
		t.Fatalf("CreateProcessInstance err = %v", err)
	}
	if len(nodes) != 5 {
		t.Fatalf("nodes = %#v", nodes)
	}
	return instance, nodes
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryFinanceReleaseRunsRegisteredHandler(t *testing.T) {
	operationalFactRepo := &customerConfigShipmentOperationalFactRepo{
		shipment: &biz.Shipment{
			ID:         9001,
			ShipmentNo: "SHIP-9001",
			Status:     biz.ShipmentStatusDraft,
		},
	}
	dispatcher := newCustomerConfigTestDispatcherWithOperationalFactRepo(
		&biz.AdminUser{ID: 1, Username: "finance", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{biz.AdminRoleKey, biz.FinanceRoleKey},
		operationalFactRepo,
	)
	ctx := customerConfigAdminCtx(1, "finance")
	publishAndActivateCustomerConfigForTest(t, dispatcher, ctx, customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	instance, nodes := createFinishedGoodsDeliveryFinanceReleaseActiveFixture(t, dispatcher, ctx)
	financeNode := nodes[1]

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(instance.ID),
		"process_node_instance_id": float64(financeNode.ID),
		"expected_version":         float64(financeNode.Version),
		"shipment_id":              float64(9001),
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/finance-release",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_finished_goods_delivery_finance_release", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.OK.Code {
		t.Fatalf("execute result = %#v", executeRes)
	}
	if operationalFactRepo.fetchedShipmentID != 9001 {
		t.Fatalf("expected shipment 9001 to be checked, got %d", operationalFactRepo.fetchedShipmentID)
	}
	if operationalFactRepo.shippedShipmentID != 0 || operationalFactRepo.createdFinanceFact != nil {
		t.Fatalf("finance release must not ship or create finance fact, shipped=%d finance=%#v", operationalFactRepo.shippedShipmentID, operationalFactRepo.createdFinanceFact)
	}
	executeData := executeRes.Data.AsMap()
	boundary, ok := executeData["runtime_boundary"].(map[string]any)
	if !ok {
		t.Fatalf("runtime_boundary missing: %#v", executeData)
	}
	if boundary["scope"] != "shipment_finance_release_domain_command" ||
		boundary["writes_finance_fact"] != false ||
		boundary["writes_shipment_or_inventory_fact"] != false ||
		boundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("unexpected runtime boundary: %#v", boundary)
	}
	refreshedNodes, err := dispatcher.processRuntimeUC.ListProcessNodeInstances(ctx, instance.ID)
	if err != nil {
		t.Fatalf("ListProcessNodeInstances err = %v", err)
	}
	node := refreshedNodes[1]
	if node.ID != financeNode.ID || node.Status != biz.ProcessNodeStatusCompleted || node.CompletedAt == nil {
		t.Fatalf("finance node should complete after registered handler: %#v", node)
	}
	if node.Outcome == nil || *node.Outcome != biz.ShipmentProcessCommandOutcomeFinanceReleased {
		t.Fatalf("finance node outcome = %#v", node.Outcome)
	}
	if refreshedNodes[2].Status != biz.ProcessNodeStatusActive {
		t.Fatalf("shipment node should activate: %#v", refreshedNodes[2])
	}
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryFinanceReleaseRequiresFinancePermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "quality", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.QualityRoleKey})
	params, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(1),
		"process_node_instance_id": float64(2),
		"expected_version":         float64(1),
		"shipment_id":              float64(9001),
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/finance-release",
	})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "quality"), "execute_finished_goods_delivery_finance_release", "execute", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func createFinishedGoodsDeliveryShipmentExecutionActiveFixture(t *testing.T, dispatcher *jsonrpcDispatcher, ctx context.Context) (*biz.ProcessInstance, []*biz.ProcessNodeInstance) {
	t.Helper()
	instance, nodes, err := dispatcher.processRuntimeUC.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:             biz.ProcessKeyFinishedGoodsDelivery,
		ProcessVersion:         "v1",
		VariantKey:             optionalRPCStringPointer("quality_finance_ship_receivable"),
		ConfigRevision:         "2026.06.28.1",
		DefinitionHash:         "finished-goods-delivery-test",
		ModuleContractSnapshot: map[string]any{"source": "test"},
		BusinessRefType:        "shipment",
		BusinessRefID:          9001,
		BusinessRefNo:          optionalRPCStringPointer("SHIP-9001"),
		IdempotencyKey:         "finished-goods-delivery/SHIP-9001/shipment-fixture",
		Status:                 biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:  "finished_goods_quality",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusCompleted,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandFinishedGoodsQualityDecide,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "shipment_finance_release",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusCompleted,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandShipmentFinanceRelease,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "shipment_execution",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusActive,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandShipmentShip,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "receivable_lead",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandFinanceReceivableLead,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "end",
				NodeType: biz.ProcessNodeTypeEnd,
				Status:   biz.ProcessNodeStatusWaiting,
			},
		},
	}, 1)
	if err != nil {
		t.Fatalf("CreateProcessInstance err = %v", err)
	}
	if len(nodes) != 5 {
		t.Fatalf("nodes = %#v", nodes)
	}
	return instance, nodes
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRunsRegisteredHandler(t *testing.T) {
	operationalFactRepo := &customerConfigShipmentOperationalFactRepo{
		shipment: &biz.Shipment{ID: 9001, ShipmentNo: "SHIP-9001", Status: biz.ShipmentStatusShipped},
	}
	dispatcher := newCustomerConfigTestDispatcherWithOperationalFactRepo(
		&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{},
		operationalFactRepo,
	)
	ctx := customerConfigAdminCtx(1, "admin")
	publishAndActivateCustomerConfigForTest(t, dispatcher, ctx, customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	instance, nodes := createFinishedGoodsDeliveryShipmentExecutionActiveFixture(t, dispatcher, ctx)
	shipmentNode := nodes[2]

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(instance.ID),
		"process_node_instance_id": float64(shipmentNode.ID),
		"expected_version":         float64(shipmentNode.Version),
		"shipment_id":              float64(9001),
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/shipment-ship",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_finished_goods_delivery_shipment_ship", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.OK.Code {
		t.Fatalf("execute result = %#v", executeRes)
	}
	if operationalFactRepo.shippedShipmentID != 9001 {
		t.Fatalf("expected shipment 9001 to be shipped, got %d", operationalFactRepo.shippedShipmentID)
	}
	executeData := executeRes.Data.AsMap()
	completedNode, ok := executeData["completed_node"].(map[string]any)
	if !ok {
		t.Fatalf("completed_node missing: %#v", executeData)
	}
	if completedNode["node_key"] != "shipment_execution" ||
		completedNode["status"] != biz.ProcessNodeStatusCompleted ||
		completedNode["outcome"] != biz.ShipmentProcessCommandOutcomeShipped {
		t.Fatalf("completed_node = %#v", completedNode)
	}
	boundary, ok := executeData["runtime_boundary"].(map[string]any)
	if !ok {
		t.Fatalf("runtime_boundary missing: %#v", executeData)
	}
	if boundary["scope"] != "shipment_execution_domain_command" ||
		boundary["writes_shipment_fact"] != true ||
		boundary["writes_inventory_fact"] != true ||
		boundary["writes_finance_fact"] != false ||
		boundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("runtime_boundary = %#v", boundary)
	}
	refreshedNodes, err := dispatcher.processRuntimeUC.ListProcessNodeInstances(ctx, instance.ID)
	if err != nil {
		t.Fatalf("ListProcessNodeInstances err = %v", err)
	}
	node := refreshedNodes[2]
	if node.ID != shipmentNode.ID || node.Status != biz.ProcessNodeStatusCompleted || node.Version != shipmentNode.Version+1 || node.CompletedAt == nil {
		t.Fatalf("shipment node should complete after registered handler: %#v", node)
	}
	if refreshedNodes[3].Status != biz.ProcessNodeStatusActive {
		t.Fatalf("receivable node should activate after shipment: %#v", refreshedNodes[3])
	}
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRequiresEnabledModules(t *testing.T) {
	operationalFactRepo := &customerConfigShipmentOperationalFactRepo{
		shipment: &biz.Shipment{ID: 9001, ShipmentNo: "SHIP-9001", Status: biz.ShipmentStatusShipped},
	}
	dispatcher := newCustomerConfigTestDispatcherWithOperationalFactRepo(
		&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{},
		operationalFactRepo,
	)
	ctx := customerConfigAdminCtx(1, "admin")
	publishAndActivateCustomerConfigForTest(t, dispatcher, ctx, customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	instance, nodes := createFinishedGoodsDeliveryShipmentExecutionActiveFixture(t, dispatcher, ctx)
	shipmentNode := nodes[2]

	disabledParams := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t),
		"2026.06.28.2",
		"shipments",
		"disabled",
	)
	publishAndActivateCustomerConfigForTest(t, dispatcher, ctx, disabledParams)

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(instance.ID),
		"process_node_instance_id": float64(shipmentNode.ID),
		"expected_version":         float64(shipmentNode.Version),
		"shipment_id":              float64(9001),
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/shipment-ship/module-gate",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_finished_goods_delivery_shipment_ship", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("execute code = %d msg=%s, want invalid param", executeRes.Code, executeRes.Message)
	}
	if operationalFactRepo.shippedShipmentID != 0 {
		t.Fatalf("shipment usecase should not be called when module is disabled, got shipment id %d", operationalFactRepo.shippedShipmentID)
	}
}

func TestRuntimeCustomerKeyRejectsBusinessRequestCustomerOverride(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")

	resolved, err := runtimeCustomerKey("")
	if err != nil || resolved != "yoyoosun" {
		t.Fatalf("runtimeCustomerKey empty = %q, %v", resolved, err)
	}
	resolved, err = runtimeCustomerKey("yoyoosun")
	if err != nil || resolved != "yoyoosun" {
		t.Fatalf("runtimeCustomerKey matching = %q, %v", resolved, err)
	}
	if _, err := runtimeCustomerKey("demo"); !errors.Is(err, biz.ErrForbidden) {
		t.Fatalf("runtimeCustomerKey override error = %v, want ErrForbidden", err)
	}
}

func TestCustomerConfigJSONRPCEveryCustomerScopedEntryRejectsRuntimeCustomerOverride(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	ctx := customerConfigAdminCtx(1, "admin")

	publishPayload := customerConfigPublishParams(t).AsMap()
	publishPayload["customer_key"] = "demo"
	tests := []struct {
		method  string
		payload map[string]any
	}{
		{method: "validate_customer_config", payload: publishPayload},
		{method: "publish_customer_config", payload: publishPayload},
		{method: "activate_customer_config", payload: map[string]any{"customer_key": "demo", "revision": "v1"}},
		{method: "rollback_customer_config", payload: map[string]any{"customer_key": "demo", "target_revision": "v1"}},
		{method: "get_effective_session", payload: map[string]any{"customer_key": "demo"}},
		{method: "explain_module_status", payload: map[string]any{"customer_key": "demo", "module_key": "sales_orders"}},
		{method: "explain_process_definition", payload: map[string]any{"customer_key": "demo", "process_key": biz.ProcessKeySalesOrderAcceptance}},
		{method: "start_sales_order_acceptance_process", payload: map[string]any{"customer_key": "demo", "sales_order_id": float64(1), "idempotency_key": "guard/sales"}},
		{method: "start_material_supply_process", payload: map[string]any{"customer_key": "demo", "purchase_receipt_id": float64(1), "idempotency_key": "guard/receipt"}},
		{method: "start_material_supply_purchase_order_process", payload: map[string]any{"customer_key": "demo", "purchase_order_id": float64(1), "idempotency_key": "guard/purchase"}},
		{method: "start_finished_goods_delivery_process", payload: map[string]any{"customer_key": "demo", "shipment_id": float64(1), "idempotency_key": "guard/shipment"}},
	}

	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			params, err := structpb.NewStruct(tt.payload)
			if err != nil {
				t.Fatalf("NewStruct error = %v", err)
			}
			_, res, err := dispatcher.handleCustomerConfig(ctx, tt.method, "runtime-customer-guard", params)
			if err != nil {
				t.Fatalf("handleCustomerConfig error = %v", err)
			}
			if res.Code != errcode.PermissionDenied.Code {
				t.Fatalf("code = %d message=%q, want permission denied", res.Code, res.Message)
			}
		})
	}
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryShipmentShipRequiresShipmentPermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "quality", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.QualityRoleKey})
	params, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(1),
		"process_node_instance_id": float64(3),
		"expected_version":         float64(1),
		"shipment_id":              float64(9001),
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/shipment-ship",
	})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "quality"), "execute_finished_goods_delivery_shipment_ship", "execute", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

type customerConfigShipmentOperationalFactRepo struct {
	stubBusinessDashboardOperationalFactRepo
	shipment               *biz.Shipment
	fetchedShipmentID      int
	shippedShipmentID      int
	createdFinanceFact     *biz.FinanceFactCreate
	postedFinanceFactID    int
	settledFinanceFactID   int
	cancelledFinanceFactID int
}

func (r *customerConfigShipmentOperationalFactRepo) ShipShipment(_ context.Context, shipmentID int) (*biz.Shipment, error) {
	r.shippedShipmentID = shipmentID
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, biz.ErrShipmentNotFound
	}
	copied := *r.shipment
	return &copied, nil
}

func (r *customerConfigShipmentOperationalFactRepo) GetShipment(_ context.Context, shipmentID int) (*biz.Shipment, error) {
	r.fetchedShipmentID = shipmentID
	if r.shipment == nil || r.shipment.ID != shipmentID {
		return nil, biz.ErrShipmentNotFound
	}
	copied := *r.shipment
	return &copied, nil
}

func (r *customerConfigShipmentOperationalFactRepo) CreateFinanceFactDraft(_ context.Context, in *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	copied := *in
	r.createdFinanceFact = &copied
	return &biz.FinanceFact{
		ID:               3001,
		FactNo:           copied.FactNo,
		FactType:         copied.FactType,
		Status:           biz.OperationalFactStatusDraft,
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

func (r *customerConfigShipmentOperationalFactRepo) PostFinanceFact(_ context.Context, id int) (*biz.FinanceFact, error) {
	r.postedFinanceFactID = id
	return nil, biz.ErrBadParam
}

func (r *customerConfigShipmentOperationalFactRepo) SettleFinanceFact(_ context.Context, id int) (*biz.FinanceFact, error) {
	r.settledFinanceFactID = id
	return nil, biz.ErrBadParam
}

func (r *customerConfigShipmentOperationalFactRepo) CancelPostedFinanceFact(_ context.Context, id int, _ int, _ string) (*biz.FinanceFact, error) {
	r.cancelledFinanceFactID = id
	return nil, biz.ErrBadParam
}

func createFinishedGoodsDeliveryReceivableLeadActiveFixture(t *testing.T, dispatcher *jsonrpcDispatcher, ctx context.Context) (*biz.ProcessInstance, []*biz.ProcessNodeInstance) {
	t.Helper()
	instance, nodes, err := dispatcher.processRuntimeUC.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:             biz.ProcessKeyFinishedGoodsDelivery,
		ProcessVersion:         "v1",
		VariantKey:             optionalRPCStringPointer("quality_finance_ship_receivable"),
		ConfigRevision:         "2026.06.28.1",
		DefinitionHash:         "finished-goods-delivery-test",
		ModuleContractSnapshot: map[string]any{"source": "test"},
		BusinessRefType:        "shipment",
		BusinessRefID:          9001,
		BusinessRefNo:          optionalRPCStringPointer("SHIP-9001"),
		IdempotencyKey:         "finished-goods-delivery/SHIP-9001/receivable-fixture",
		Status:                 biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:  "finished_goods_quality",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusCompleted,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandFinishedGoodsQualityDecide,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "shipment_finance_release",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusCompleted,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandShipmentFinanceRelease,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "shipment_execution",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusCompleted,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandShipmentShip,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "receivable_lead",
				NodeType: biz.ProcessNodeTypeDomainCommand,
				Status:   biz.ProcessNodeStatusActive,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandFinanceReceivableLead,
					"writes_fact": false,
				},
			},
			{
				NodeKey:  "end",
				NodeType: biz.ProcessNodeTypeEnd,
				Status:   biz.ProcessNodeStatusWaiting,
			},
		},
	}, 1)
	if err != nil {
		t.Fatalf("CreateProcessInstance err = %v", err)
	}
	if len(nodes) != 5 {
		t.Fatalf("nodes = %#v", nodes)
	}
	return instance, nodes
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryReceivableLeadCreatesDraft(t *testing.T) {
	customerID := 501
	operationalFactRepo := &customerConfigShipmentOperationalFactRepo{
		shipment: &biz.Shipment{
			ID:         9001,
			CustomerID: &customerID,
			Status:     biz.ShipmentStatusShipped,
		},
	}
	dispatcher := newCustomerConfigTestDispatcherWithOperationalFactRepo(
		&biz.AdminUser{ID: 1, Username: "finance", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{biz.AdminRoleKey, biz.FinanceRoleKey},
		operationalFactRepo,
	)
	ctx := customerConfigAdminCtx(1, "finance")
	publishAndActivateCustomerConfigForTest(t, dispatcher, ctx, customerConfigPublishParamsWithFinishedGoodsDeliveryStartReady(t))
	instance, nodes := createFinishedGoodsDeliveryReceivableLeadActiveFixture(t, dispatcher, ctx)
	receivableNode := nodes[3]

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(instance.ID),
		"process_node_instance_id": float64(receivableNode.ID),
		"expected_version":         float64(receivableNode.Version),
		"shipment_id":              float64(9001),
		"receivable_source_no":     "AR-LEAD-9001",
		"currency":                 "CNY",
		"expected_amount":          "12888.00",
		"lead_note":                "guard only",
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/receivable-lead",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_finished_goods_delivery_receivable_lead", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.OK.Code {
		t.Fatalf("execute result = %#v", executeRes)
	}
	if operationalFactRepo.createdFinanceFact == nil {
		t.Fatalf("expected receivable finance fact draft to be created")
	}
	if operationalFactRepo.createdFinanceFact.FactNo != "AR-LEAD-9001" ||
		operationalFactRepo.createdFinanceFact.FactType != biz.FinanceFactReceivable ||
		operationalFactRepo.createdFinanceFact.CounterpartyType != biz.FinanceCounterpartyCustomer ||
		operationalFactRepo.createdFinanceFact.CounterpartyID == nil ||
		*operationalFactRepo.createdFinanceFact.CounterpartyID != 501 ||
		!operationalFactRepo.createdFinanceFact.Amount.Equal(decimal.RequireFromString("12888.00")) ||
		operationalFactRepo.createdFinanceFact.SourceType == nil ||
		*operationalFactRepo.createdFinanceFact.SourceType != biz.ShipmentSourceType ||
		operationalFactRepo.createdFinanceFact.SourceID == nil ||
		*operationalFactRepo.createdFinanceFact.SourceID != 9001 {
		t.Fatalf("unexpected receivable finance fact create input %#v", operationalFactRepo.createdFinanceFact)
	}
	if operationalFactRepo.postedFinanceFactID != 0 || operationalFactRepo.settledFinanceFactID != 0 || operationalFactRepo.cancelledFinanceFactID != 0 {
		t.Fatalf("receivable lead must only create a draft, got post=%d settle=%d cancel=%d", operationalFactRepo.postedFinanceFactID, operationalFactRepo.settledFinanceFactID, operationalFactRepo.cancelledFinanceFactID)
	}
	executeData := executeRes.Data.AsMap()
	boundary, ok := executeData["runtime_boundary"].(map[string]any)
	if !ok {
		t.Fatalf("runtime_boundary missing: %#v", executeData)
	}
	if boundary["scope"] != "receivable_lead_domain_command" ||
		boundary["writes_receivable_fact"] != true ||
		boundary["writes_invoice_fact"] != false ||
		boundary["writes_finance_fact"] != true ||
		boundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("runtime_boundary = %#v", boundary)
	}
	refreshedNodes, err := dispatcher.processRuntimeUC.ListProcessNodeInstances(ctx, instance.ID)
	if err != nil {
		t.Fatalf("ListProcessNodeInstances err = %v", err)
	}
	node := refreshedNodes[3]
	if node.ID != receivableNode.ID || node.Status != biz.ProcessNodeStatusCompleted || node.Version != receivableNode.Version+1 || node.CompletedAt == nil {
		t.Fatalf("receivable node should complete after registered handler: %#v", node)
	}
	if refreshedNodes[4].Status != biz.ProcessNodeStatusCompleted {
		t.Fatalf("end node should complete after receivable lead: %#v", refreshedNodes[4])
	}
	refreshedInstance, err := dispatcher.processRuntimeUC.GetProcessInstance(ctx, instance.ID)
	if err != nil {
		t.Fatalf("GetProcessInstance err = %v", err)
	}
	if refreshedInstance.Status != biz.ProcessStatusCompleted {
		t.Fatalf("process should complete after receivable lead end, got %#v", refreshedInstance)
	}
}

func TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryReceivableLeadRequiresFinancePermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "warehouse", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.WarehouseRoleKey})
	params, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      float64(1),
		"process_node_instance_id": float64(4),
		"expected_version":         float64(1),
		"shipment_id":              float64(9001),
		"idempotency_key":          "finished-goods-delivery/SHIP-9001/receivable-lead",
	})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "warehouse"), "execute_finished_goods_delivery_receivable_lead", "execute", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func TestCustomerConfigJSONRPCStartFinishedGoodsDeliveryRequiresShipmentPermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "quality", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.QualityRoleKey})
	params, _ := structpb.NewStruct(map[string]any{"customer_key": biz.DefaultCustomerKey, "shipment_id": float64(9001), "idempotency_key": "finished-goods-delivery/SHIP-9001"})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "quality"), "start_finished_goods_delivery_process", "start", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func TestCustomerConfigJSONRPCStartSalesOrderAcceptanceProcess(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{})
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithSalesOrderAcceptanceProcess(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"sales_order_id":  float64(42),
		"business_ref_no": "SO-42",
		"idempotency_key": "sales-order-acceptance/SO-42",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_sales_order_acceptance_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	data := startRes.Data.AsMap()
	instance, ok := data["process_instance"].(map[string]any)
	if !ok {
		t.Fatalf("process_instance missing: %#v", data)
	}
	if instance["process_key"] != biz.ProcessKeySalesOrderAcceptance ||
		instance["business_ref_type"] != "sales_order" ||
		instance["business_ref_id"] != float64(42) {
		t.Fatalf("process_instance = %#v", instance)
	}
	startedNode, ok := data["started_node"].(map[string]any)
	if !ok {
		t.Fatalf("started_node missing: %#v", data)
	}
	if startedNode["node_key"] != "submit_sales_order" ||
		startedNode["node_type"] != biz.ProcessNodeTypeDomainCommand ||
		startedNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("started_node = %#v", startedNode)
	}
	if version, ok := startedNode["version"].(float64); !ok || version <= 0 {
		t.Fatalf("started_node must expose positive version for frontend expected_version, got %#v", startedNode)
	}
	boundary, ok := data["runtime_boundary"].(map[string]any)
	if !ok {
		t.Fatalf("runtime_boundary missing: %#v", data)
	}
	if boundary["executes_domain_command"] != false ||
		boundary["writes_inventory_or_quality_fact"] != false ||
		boundary["writes_shipment_or_finance_fact"] != false {
		t.Fatalf("runtime_boundary = %#v", boundary)
	}
	nodes, ok := data["nodes"].([]any)
	if !ok || len(nodes) != 4 {
		t.Fatalf("nodes = %#v", data["nodes"])
	}
	firstNode, ok := nodes[0].(map[string]any)
	if !ok || firstNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("first node = %#v", nodes[0])
	}
	secondNode, ok := nodes[1].(map[string]any)
	if !ok || secondNode["status"] != biz.ProcessNodeStatusWaiting {
		t.Fatalf("second node = %#v", nodes[1])
	}

	_, retryRes, err := dispatcher.handleCustomerConfig(ctx, "start_sales_order_acceptance_process", "start-retry", startParams)
	if err != nil {
		t.Fatalf("retry start err = %v", err)
	}
	if retryRes.Code != errcode.OK.Code {
		t.Fatalf("retry start code = %d msg=%s", retryRes.Code, retryRes.Message)
	}
	retryData := retryRes.Data.AsMap()
	retryInstance, ok := retryData["process_instance"].(map[string]any)
	if !ok {
		t.Fatalf("retry process_instance missing: %#v", retryData)
	}
	retryStartedNode, ok := retryData["started_node"].(map[string]any)
	if !ok {
		t.Fatalf("retry started_node missing: %#v", retryData)
	}
	if retryInstance["id"] != instance["id"] || retryStartedNode["id"] != startedNode["id"] {
		t.Fatalf("retry should return existing process/node, first=%#v/%#v retry=%#v/%#v", instance, startedNode, retryInstance, retryStartedNode)
	}

	duplicateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"sales_order_id":  float64(42),
		"business_ref_no": "SO-42",
		"idempotency_key": "sales-order-acceptance/SO-42/retry-with-different-key",
	})
	_, duplicateRes, err := dispatcher.handleCustomerConfig(ctx, "start_sales_order_acceptance_process", "start-duplicate", duplicateParams)
	if err != nil {
		t.Fatalf("duplicate start err = %v", err)
	}
	if duplicateRes.Code != errcode.InvalidParam.Code || duplicateRes.Message != "流程实例已存在" {
		t.Fatalf("duplicate start should be rejected, code=%d msg=%s", duplicateRes.Code, duplicateRes.Message)
	}
}

func TestCustomerConfigJSONRPCExecuteSalesOrderAcceptanceSubmit(t *testing.T) {
	salesOrderRepo := newServiceSalesOrderRepo(map[int]*biz.SalesOrder{
		42: {ID: 42, OrderNo: "SO-42", LifecycleStatus: biz.SalesOrderStatusDraft},
	})
	dispatcher := newCustomerConfigTestDispatcherWithSalesOrderRepo(&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{}, salesOrderRepo)
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithSalesOrderAcceptanceProcess(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"sales_order_id":  float64(42),
		"business_ref_no": "SO-42",
		"idempotency_key": "sales-order-acceptance/SO-42",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_sales_order_acceptance_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	startData := startRes.Data.AsMap()
	instance := startData["process_instance"].(map[string]any)
	startedNode := startData["started_node"].(map[string]any)
	if version, ok := startedNode["version"].(float64); !ok || version <= 0 {
		t.Fatalf("started_node must expose positive version for frontend expected_version, got %#v", startedNode)
	}

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": startedNode["id"],
		"expected_version":         startedNode["version"],
		"sales_order_id":           float64(42),
		"idempotency_key":          "sales-order-acceptance/SO-42/submit",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_sales_order_acceptance_submit", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.OK.Code {
		t.Fatalf("execute code = %d msg=%s", executeRes.Code, executeRes.Message)
	}
	if salesOrderRepo.nextStatus != biz.SalesOrderStatusSubmitted {
		t.Fatalf("expected sales order submitted, got %q", salesOrderRepo.nextStatus)
	}
	executeData := executeRes.Data.AsMap()
	completedNode, ok := executeData["completed_node"].(map[string]any)
	if !ok {
		t.Fatalf("completed_node missing: %#v", executeData)
	}
	if completedNode["node_key"] != "submit_sales_order" ||
		completedNode["status"] != biz.ProcessNodeStatusCompleted ||
		completedNode["outcome"] != biz.SalesOrderProcessCommandOutcomeSubmitted {
		t.Fatalf("completed_node = %#v", completedNode)
	}
	nodes, ok := executeData["nodes"].([]any)
	if !ok || len(nodes) != 4 {
		t.Fatalf("nodes = %#v", executeData["nodes"])
	}
	firstNode, ok := nodes[0].(map[string]any)
	if !ok || firstNode["status"] != biz.ProcessNodeStatusCompleted {
		t.Fatalf("first node = %#v", nodes[0])
	}
	secondNode, ok := nodes[1].(map[string]any)
	if !ok ||
		secondNode["node_key"] != "order_approval" ||
		secondNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("second node = %#v", nodes[1])
	}
	boundary, ok := executeData["runtime_boundary"].(map[string]any)
	if !ok {
		t.Fatalf("runtime_boundary missing: %#v", executeData)
	}
	if boundary["executes_domain_command"] != true ||
		boundary["writes_sales_order_source_document"] != true ||
		boundary["writes_inventory_or_quality_fact"] != false ||
		boundary["writes_shipment_or_finance_fact"] != false {
		t.Fatalf("runtime_boundary = %#v", boundary)
	}
	_, retryRes, err := dispatcher.handleCustomerConfig(ctx, "execute_sales_order_acceptance_submit", "execute-retry", executeParams)
	if err != nil {
		t.Fatalf("same fingerprint retry err = %v", err)
	}
	if retryRes.Code != errcode.OK.Code {
		t.Fatalf("same fingerprint retry code=%d msg=%s", retryRes.Code, retryRes.Message)
	}
	changedKeyParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": startedNode["id"],
		"expected_version":         startedNode["version"],
		"sales_order_id":           float64(42),
		"idempotency_key":          "sales-order-acceptance/SO-42/submit-changed",
	})
	_, changedKeyRes, err := dispatcher.handleCustomerConfig(ctx, "execute_sales_order_acceptance_submit", "execute-changed-key", changedKeyParams)
	if err != nil {
		t.Fatalf("changed fingerprint retry err = %v", err)
	}
	if changedKeyRes.Code != errcode.IdempotencyConflict.Code || changedKeyRes.Message != errcode.IdempotencyConflict.Message {
		t.Fatalf("changed fingerprint retry must conflict, code=%d msg=%s", changedKeyRes.Code, changedKeyRes.Message)
	}
}

func TestCustomerConfigJSONRPCExecuteSalesOrderAcceptanceSubmitRequiresEnabledModules(t *testing.T) {
	salesOrderRepo := newServiceSalesOrderRepo(map[int]*biz.SalesOrder{
		42: {ID: 42, OrderNo: "SO-42", LifecycleStatus: biz.SalesOrderStatusDraft},
	})
	dispatcher := newCustomerConfigTestDispatcherWithSalesOrderRepo(&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{}, salesOrderRepo)
	ctx := customerConfigAdminCtx(1, "admin")
	publishAndActivateCustomerConfigForTest(t, dispatcher, ctx, customerConfigPublishParamsWithSalesOrderAcceptanceProcess(t))

	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"sales_order_id":  float64(42),
		"business_ref_no": "SO-42",
		"idempotency_key": "sales-order-acceptance/SO-42/module-gate",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_sales_order_acceptance_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	startData := startRes.Data.AsMap()
	instance := startData["process_instance"].(map[string]any)
	startedNode := startData["started_node"].(map[string]any)

	readOnlyParams := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParamsWithSalesOrderAcceptanceProcess(t),
		"2026.06.28.2",
		"sales_orders",
		"read_only",
	)
	publishAndActivateCustomerConfigForTest(t, dispatcher, ctx, readOnlyParams)

	executeParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": startedNode["id"],
		"expected_version":         startedNode["version"],
		"sales_order_id":           float64(42),
		"idempotency_key":          "sales-order-acceptance/SO-42/submit/module-gate",
	})
	_, executeRes, err := dispatcher.handleCustomerConfig(ctx, "execute_sales_order_acceptance_submit", "execute", executeParams)
	if err != nil {
		t.Fatalf("execute err = %v", err)
	}
	if executeRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("execute code = %d msg=%s, want invalid param", executeRes.Code, executeRes.Message)
	}
	if salesOrderRepo.nextStatus != "" {
		t.Fatalf("sales order usecase should not be called when module is read_only, got %q", salesOrderRepo.nextStatus)
	}
}

func TestCustomerConfigJSONRPCStartSalesOrderAcceptanceProcessRequiresSubmitPermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "pmc", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.PMCRoleKey})
	params, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"sales_order_id":  float64(42),
		"idempotency_key": "sales-order-acceptance/SO-42",
	})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "pmc"), "start_sales_order_acceptance_process", "start", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func TestCustomerConfigJSONRPCStartMaterialSupplyProcess(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcherWithInventoryRepo(
		&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{},
		&serviceMaterialSupplyInventoryRepo{},
	)
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithMaterialSupplyRuntimeProcess(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":        biz.DefaultCustomerKey,
		"purchase_receipt_id": float64(6001),
		"business_ref_no":     "PR-6001",
		"idempotency_key":     "material-supply/PR-6001",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_material_supply_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	data := startRes.Data.AsMap()
	instance, ok := data["process_instance"].(map[string]any)
	if !ok {
		t.Fatalf("process_instance missing: %#v", data)
	}
	if instance["process_key"] != biz.ProcessKeyMaterialSupply ||
		instance["business_ref_type"] != "purchase_receipt" ||
		instance["business_ref_id"] != float64(6001) {
		t.Fatalf("process_instance = %#v", instance)
	}
	startedNode, ok := data["started_node"].(map[string]any)
	if !ok {
		t.Fatalf("started_node missing: %#v", data)
	}
	if startedNode["node_key"] != "incoming_qc" ||
		startedNode["node_type"] != biz.ProcessNodeTypeDomainCommand ||
		startedNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("started_node = %#v", startedNode)
	}
	boundary, ok := data["runtime_boundary"].(map[string]any)
	if !ok {
		t.Fatalf("runtime_boundary missing: %#v", data)
	}
	if boundary["executes_domain_command"] != false ||
		boundary["writes_quality_or_inventory_fact"] != false ||
		boundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("runtime_boundary = %#v", boundary)
	}
	nodes, ok := data["nodes"].([]any)
	if !ok || len(nodes) != 3 {
		t.Fatalf("nodes = %#v", data["nodes"])
	}
	firstNode, ok := nodes[0].(map[string]any)
	if !ok || firstNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("first node = %#v", nodes[0])
	}
	secondNode, ok := nodes[1].(map[string]any)
	if !ok || secondNode["status"] != biz.ProcessNodeStatusWaiting {
		t.Fatalf("second node = %#v", nodes[1])
	}
}

func TestCustomerConfigJSONRPCExecuteMaterialSupplyQualityAndInbound(t *testing.T) {
	inventoryRepo := &serviceMaterialSupplyInventoryRepo{
		qualityGate: &biz.PurchaseReceiptQualityGate{
			PurchaseReceiptID: 6001,
			Outcome:           biz.PurchaseReceiptQualityGateReady,
			TotalLines:        1,
			PassedLines:       1,
		},
		postedReceipt: &biz.PurchaseReceipt{ID: 6001, ReceiptNo: "PR-6001", Status: biz.PurchaseReceiptStatusDraft},
	}
	dispatcher := newCustomerConfigTestDispatcherWithInventoryRepo(
		&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{},
		inventoryRepo,
	)
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithMaterialSupplyRuntimeProcess(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}
	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":        biz.DefaultCustomerKey,
		"purchase_receipt_id": float64(6001),
		"business_ref_no":     "PR-6001",
		"idempotency_key":     "material-supply/PR-6001",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_material_supply_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	startData := startRes.Data.AsMap()
	instance := startData["process_instance"].(map[string]any)
	startedNode := startData["started_node"].(map[string]any)

	qualityParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": startedNode["id"],
		"expected_version":         startedNode["version"],
		"purchase_receipt_id":      float64(6001),
		"idempotency_key":          "material-supply/PR-6001/iqc",
	})
	_, qualityRes, err := dispatcher.handleCustomerConfig(ctx, "execute_material_supply_quality_gate", "quality", qualityParams)
	if err != nil {
		t.Fatalf("quality err = %v", err)
	}
	if qualityRes.Code != errcode.OK.Code {
		t.Fatalf("quality code = %d msg=%s", qualityRes.Code, qualityRes.Message)
	}
	qualityData := qualityRes.Data.AsMap()
	completedQualityNode, ok := qualityData["evaluated_node"].(map[string]any)
	if !ok ||
		completedQualityNode["node_key"] != "incoming_qc" ||
		completedQualityNode["outcome"] != biz.IncomingQualityGateProcessCommandOutcomePassed {
		t.Fatalf("evaluated quality node = %#v", qualityData["evaluated_node"])
	}
	qualityNodes, ok := qualityData["nodes"].([]any)
	if !ok || len(qualityNodes) != 3 {
		t.Fatalf("quality nodes = %#v", qualityData["nodes"])
	}
	inboundNode, ok := qualityNodes[1].(map[string]any)
	if !ok ||
		inboundNode["node_key"] != "warehouse_inbound" ||
		inboundNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("inbound node = %#v", qualityNodes[1])
	}
	qualityBoundary := qualityData["runtime_boundary"].(map[string]any)
	if qualityBoundary["writes_quality_decision"] != false || qualityBoundary["writes_inventory_fact"] != false {
		t.Fatalf("quality boundary = %#v", qualityBoundary)
	}

	inboundParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": inboundNode["id"],
		"expected_version":         inboundNode["version"],
		"purchase_receipt_id":      float64(6001),
		"idempotency_key":          "material-supply/PR-6001/inbound",
	})
	_, inboundRes, err := dispatcher.handleCustomerConfig(ctx, "execute_material_supply_post_inbound", "inbound", inboundParams)
	if err != nil {
		t.Fatalf("inbound err = %v", err)
	}
	if inboundRes.Code != errcode.OK.Code {
		t.Fatalf("inbound code = %d msg=%s", inboundRes.Code, inboundRes.Message)
	}
	if inventoryRepo.postedReceiptID != 6001 {
		t.Fatalf("posted receipt id = %d", inventoryRepo.postedReceiptID)
	}
	inboundData := inboundRes.Data.AsMap()
	completedInboundNode, ok := inboundData["completed_node"].(map[string]any)
	if !ok ||
		completedInboundNode["node_key"] != "warehouse_inbound" ||
		completedInboundNode["outcome"] != biz.InventoryProcessCommandOutcomeInboundPosted {
		t.Fatalf("completed inbound node = %#v", inboundData["completed_node"])
	}
	inboundNodes, ok := inboundData["nodes"].([]any)
	if !ok || len(inboundNodes) != 3 {
		t.Fatalf("inbound nodes = %#v", inboundData["nodes"])
	}
	endNode, ok := inboundNodes[2].(map[string]any)
	if !ok || endNode["status"] != biz.ProcessNodeStatusCompleted {
		t.Fatalf("end node = %#v", inboundNodes[2])
	}
	inboundBoundary := inboundData["runtime_boundary"].(map[string]any)
	if inboundBoundary["writes_inventory_fact"] != true ||
		inboundBoundary["writes_shipment_or_finance_fact"] != false ||
		inboundBoundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("inbound boundary = %#v", inboundBoundary)
	}
}

func TestCustomerConfigJSONRPCExecuteMaterialSupplyPurchaseOrderToQualityAndInbound(t *testing.T) {
	lotID := 8001
	inventoryRepo := &serviceMaterialSupplyInventoryRepo{
		createdReceipt: &biz.PurchaseReceipt{
			ID:        6001,
			ReceiptNo: "PR-6001",
			Status:    biz.PurchaseReceiptStatusDraft,
			Items:     []*biz.PurchaseReceiptItem{{ID: 6101, ReceiptID: 6001, LotID: &lotID}},
			QualityInspections: []*biz.QualityInspection{{
				ID:                7001,
				InspectionNo:      "IQC-PR-6001-ITEM-6101",
				PurchaseReceiptID: 6001,
				InventoryLotID:    8001,
				Status:            biz.QualityInspectionStatusSubmitted,
			}},
		},
		qualityGate: &biz.PurchaseReceiptQualityGate{
			PurchaseReceiptID: 6001,
			Outcome:           biz.PurchaseReceiptQualityGateReady,
			TotalLines:        1,
			PassedLines:       1,
		},
		postedReceipt: &biz.PurchaseReceipt{ID: 6001, ReceiptNo: "PR-6001", Status: biz.PurchaseReceiptStatusDraft},
	}
	dispatcher := newCustomerConfigTestDispatcherWithInventoryRepo(
		&biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{},
		inventoryRepo,
	)
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsWithMaterialSupplyPurchaseOrderRuntimeProcess(t))
	if err != nil {
		t.Fatalf("publish err = %v", err)
	}
	if publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish code = %d msg=%s", publishRes.Code, publishRes.Message)
	}
	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.1",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	startParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":       biz.DefaultCustomerKey,
		"purchase_order_id":  float64(5001),
		"purchase_order_no":  "PO-5001",
		"idempotency_key":    "material-supply/PO-5001",
		"correlation_key":    "sales_order:1001",
		"process_version":    "v1",
		"extra_ignored_hint": "ignored",
	})
	_, startRes, err := dispatcher.handleCustomerConfig(ctx, "start_material_supply_purchase_order_process", "start", startParams)
	if err != nil {
		t.Fatalf("start err = %v", err)
	}
	if startRes.Code != errcode.OK.Code {
		t.Fatalf("start code = %d msg=%s", startRes.Code, startRes.Message)
	}
	startData := startRes.Data.AsMap()
	instance := startData["process_instance"].(map[string]any)
	if instance["process_key"] != biz.ProcessKeyMaterialSupply ||
		instance["business_ref_type"] != "purchase_order" ||
		instance["business_ref_id"] != float64(5001) {
		t.Fatalf("process_instance = %#v", instance)
	}
	startedNode := startData["started_node"].(map[string]any)
	if startedNode["node_key"] != "purchase_receipt_source" ||
		startedNode["node_type"] != biz.ProcessNodeTypeDomainCommand ||
		startedNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("started_node = %#v", startedNode)
	}
	startBoundary := startData["runtime_boundary"].(map[string]any)
	if startBoundary["scope"] != "purchase_order_to_purchase_receipt_quality_inbound" ||
		startBoundary["executes_domain_command"] != false ||
		startBoundary["workflow_task_done_posts_fact"] != false {
		t.Fatalf("start boundary = %#v", startBoundary)
	}

	createReceiptParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": startedNode["id"],
		"expected_version":         startedNode["version"],
		"purchase_order_id":        float64(5001),
		"receipt_no":               "PR-6001",
		"warehouse_id":             float64(11),
		"received_at":              "2026-06-30",
		"note":                     "首批到货",
		"idempotency_key":          "material-supply/PO-5001/receipt",
	})
	_, createReceiptRes, err := dispatcher.handleCustomerConfig(ctx, "execute_material_supply_purchase_receipt_create", "receipt", createReceiptParams)
	if err != nil {
		t.Fatalf("receipt create err = %v", err)
	}
	if createReceiptRes.Code != errcode.OK.Code {
		t.Fatalf("receipt create code = %d msg=%s", createReceiptRes.Code, createReceiptRes.Message)
	}
	if inventoryRepo.createInput == nil ||
		inventoryRepo.createInput.PurchaseOrderID != 5001 ||
		inventoryRepo.createInput.ReceiptNo != "PR-6001" ||
		inventoryRepo.createInput.WarehouseID != 11 {
		t.Fatalf("receipt create input = %#v", inventoryRepo.createInput)
	}
	createData := createReceiptRes.Data.AsMap()
	createInstance := createData["process_instance"].(map[string]any)
	snapshot := createInstance["module_contract_snapshot"].(map[string]any)
	linkedRefs, ok := snapshot["linked_business_refs"].([]any)
	if !ok || len(linkedRefs) != 2 {
		t.Fatalf("linked refs = %#v", snapshot["linked_business_refs"])
	}
	linkedRef := linkedRefs[0].(map[string]any)
	if linkedRef["ref_type"] != "purchase_receipt" ||
		linkedRef["ref_id"] != float64(6001) ||
		linkedRef["ref_no"] != "PR-6001" ||
		linkedRef["source_node_key"] != "purchase_receipt_source" ||
		linkedRef["source_command_key"] != biz.ProcessDomainCommandPurchaseReceiptCreate {
		t.Fatalf("linked ref = %#v", linkedRef)
	}
	createNodes := createData["nodes"].([]any)
	incomingNode := createNodes[1].(map[string]any)
	if incomingNode["node_key"] != "incoming_qc" ||
		incomingNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("incoming node = %#v", incomingNode)
	}
	createBoundary := createData["runtime_boundary"].(map[string]any)
	if createBoundary["writes_purchase_receipt_source_doc"] != true ||
		createBoundary["creates_submitted_quality_inspections"] != true ||
		createBoundary["creates_zero_balance_hold_lots"] != true ||
		createBoundary["writes_inventory_quantity_fact"] != false ||
		createBoundary["linked_business_ref_source"] != "process_runtime_result" {
		t.Fatalf("create boundary = %#v", createBoundary)
	}

	qualityParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": incomingNode["id"],
		"expected_version":         incomingNode["version"],
		"purchase_receipt_id":      float64(6001),
		"idempotency_key":          "material-supply/PO-5001/iqc",
	})
	_, qualityRes, err := dispatcher.handleCustomerConfig(ctx, "execute_material_supply_quality_gate", "quality", qualityParams)
	if err != nil {
		t.Fatalf("quality err = %v", err)
	}
	if qualityRes.Code != errcode.OK.Code {
		t.Fatalf("quality code = %d msg=%s", qualityRes.Code, qualityRes.Message)
	}
	qualityData := qualityRes.Data.AsMap()
	qualityNodes := qualityData["nodes"].([]any)
	inboundNode := qualityNodes[2].(map[string]any)
	if inboundNode["node_key"] != "warehouse_inbound" ||
		inboundNode["status"] != biz.ProcessNodeStatusActive {
		t.Fatalf("inbound node = %#v", inboundNode)
	}

	inboundParams, _ := structpb.NewStruct(map[string]any{
		"process_instance_id":      instance["id"],
		"process_node_instance_id": inboundNode["id"],
		"expected_version":         inboundNode["version"],
		"purchase_receipt_id":      float64(6001),
		"idempotency_key":          "material-supply/PO-5001/inbound",
	})
	_, inboundRes, err := dispatcher.handleCustomerConfig(ctx, "execute_material_supply_post_inbound", "inbound", inboundParams)
	if err != nil {
		t.Fatalf("inbound err = %v", err)
	}
	if inboundRes.Code != errcode.OK.Code {
		t.Fatalf("inbound code = %d msg=%s", inboundRes.Code, inboundRes.Message)
	}
	if inventoryRepo.postedReceiptID != 6001 {
		t.Fatalf("posted receipt id = %d", inventoryRepo.postedReceiptID)
	}
	inboundData := inboundRes.Data.AsMap()
	inboundNodes := inboundData["nodes"].([]any)
	endNode := inboundNodes[3].(map[string]any)
	if endNode["node_key"] != "end" || endNode["status"] != biz.ProcessNodeStatusCompleted {
		t.Fatalf("end node = %#v", endNode)
	}
}

func TestCustomerConfigJSONRPCStartMaterialSupplyProcessRequiresPurchasePermission(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcherWithInventoryRepo(
		&biz.AdminUser{ID: 1, Username: "sales", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{biz.SalesRoleKey},
		&serviceMaterialSupplyInventoryRepo{},
	)
	params, _ := structpb.NewStruct(map[string]any{
		"customer_key":        biz.DefaultCustomerKey,
		"purchase_receipt_id": float64(6001),
		"idempotency_key":     "material-supply/PR-6001",
	})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "sales"), "start_material_supply_process", "start", params)
	if err != nil {
		t.Fatalf("handleCustomerConfig err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("code = %d, want permission denied", res.Code)
	}
}

func TestCustomerConfigJSONRPCRollbackUsesTargetRevision(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}, []string{biz.AdminRoleKey})
	ctx := customerConfigAdminCtx(1, "admin")

	for _, revision := range []string{"2026.06.28.1", "2026.06.28.2"} {
		_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish-"+revision, customerConfigPublishParamsForRevision(t, revision))
		if err != nil {
			t.Fatalf("publish %s err = %v", revision, err)
		}
		if publishRes.Code != errcode.OK.Code {
			t.Fatalf("publish %s code = %d msg=%s", revision, publishRes.Code, publishRes.Message)
		}
	}

	activateParams, _ := structpb.NewStruct(map[string]any{
		"customer_key": biz.DefaultCustomerKey,
		"revision":     "2026.06.28.2",
	})
	_, activateRes, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", activateParams)
	if err != nil {
		t.Fatalf("activate err = %v", err)
	}
	if activateRes.Code != errcode.OK.Code {
		t.Fatalf("activate code = %d msg=%s", activateRes.Code, activateRes.Message)
	}

	rollbackParams, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"target_revision": "2026.06.28.1",
	})
	_, rollbackRes, err := dispatcher.handleCustomerConfig(ctx, "rollback_customer_config", "rollback", rollbackParams)
	if err != nil {
		t.Fatalf("rollback err = %v", err)
	}
	if rollbackRes.Code != errcode.OK.Code {
		t.Fatalf("rollback code = %d msg=%s", rollbackRes.Code, rollbackRes.Message)
	}
	data := rollbackRes.Data.AsMap()
	revision, ok := data["revision"].(map[string]any)
	if !ok {
		t.Fatalf("revision missing: %#v", data)
	}
	if revision["revision"] != "2026.06.28.1" || revision["status"] != biz.CustomerConfigStatusActive {
		t.Fatalf("rollback revision = %#v", revision)
	}
}

func TestCustomerConfigJSONRPCRollbackRequiresRollbackPermission(t *testing.T) {
	admin := &biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	dispatcher := newCustomerConfigTestDispatcher(admin, nil)
	admin.Permissions = []string{biz.PermissionCustomerConfigActivate}

	params, _ := structpb.NewStruct(map[string]any{
		"customer_key":    biz.DefaultCustomerKey,
		"target_revision": "2026.06.28.1",
	})
	_, res, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, "admin"), "rollback_customer_config", "rollback", params)
	if err != nil {
		t.Fatalf("rollback err = %v", err)
	}
	if res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("rollback code = %d, want permission denied", res.Code)
	}
}
