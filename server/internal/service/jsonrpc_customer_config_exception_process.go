package service

import (
	"context"
	"errors"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

type customerConfigExceptionProcessContract struct {
	processKey      string
	businessRefType string
	idParam         string
	startMethod     string
	getMethod       string
	executeMethods  map[string]string
	startPermission string
}

var customerConfigExceptionProcessContracts = []customerConfigExceptionProcessContract{
	{
		processKey:      biz.ProcessKeyFinancePaymentApproval,
		businessRefType: "finance_payment",
		idParam:         "finance_payment_id",
		startMethod:     "start_finance_payment_approval_process",
		getMethod:       "get_finance_payment_approval_process",
		executeMethods: map[string]string{
			"execute_finance_payment_post": biz.ProcessDomainCommandFinancePaymentPost,
		},
		startPermission: biz.PermissionFinancePaymentCreate,
	},
	{
		processKey:      biz.ProcessKeyInventoryAdjustmentApproval,
		businessRefType: "inventory_operation",
		idParam:         "inventory_operation_id",
		startMethod:     "start_inventory_adjustment_approval_process",
		getMethod:       "get_inventory_adjustment_approval_process",
		executeMethods: map[string]string{
			"execute_inventory_adjustment_submit": biz.ProcessDomainCommandInventoryAdjustmentSubmit,
			"execute_inventory_adjustment_post":   biz.ProcessDomainCommandInventoryAdjustmentPost,
		},
		startPermission: biz.PermissionWarehouseAdjustmentCreate,
	},
	{
		processKey:      biz.ProcessKeyProductionExceptionApproval,
		businessRefType: "production_exception_decision",
		idParam:         "production_exception_id",
		startMethod:     "start_production_exception_approval_process",
		getMethod:       "get_production_exception_approval_process",
		executeMethods: map[string]string{
			"execute_production_exception_process": biz.ProcessDomainCommandProductionExceptionExecute,
		},
		startPermission: biz.PermissionProductionExceptionSubmit,
	},
}

func (d *jsonrpcDispatcher) handleCustomerConfigExceptionProcess(
	ctx context.Context,
	method string,
	pm map[string]any,
) *v1.JsonrpcResult {
	contract, action, commandKey, ok := customerConfigExceptionProcessContractForMethod(method)
	if !ok {
		return &v1.JsonrpcResult{Code: errcode.UnknownMethod.Code, Message: "未知异常流程动作"}
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return res
	}
	switch action {
	case "start":
		return d.startCustomerConfigExceptionProcess(ctx, contract, method, pm, admin)
	case "get":
		return d.getCustomerConfigExceptionProcess(ctx, contract, method, pm, admin)
	case "execute":
		return d.executeCustomerConfigExceptionProcess(ctx, contract, method, commandKey, pm, admin)
	default:
		return invalidParamResult()
	}
}

func customerConfigExceptionProcessContractForMethod(
	method string,
) (customerConfigExceptionProcessContract, string, string, bool) {
	for _, contract := range customerConfigExceptionProcessContracts {
		switch method {
		case contract.startMethod:
			return contract, "start", "", true
		case contract.getMethod:
			return contract, "get", "", true
		default:
			if commandKey := contract.executeMethods[method]; commandKey != "" {
				return contract, "execute", commandKey, true
			}
		}
	}
	return customerConfigExceptionProcessContract{}, "", "", false
}

func (d *jsonrpcDispatcher) startCustomerConfigExceptionProcess(
	ctx context.Context,
	contract customerConfigExceptionProcessContract,
	method string,
	pm map[string]any,
	admin *biz.AdminUser,
) *v1.JsonrpcResult {
	if !customerConfigAllowsOnly(
		pm,
		"customer_key",
		contract.idParam,
		"process_version",
		"correlation_key",
		"idempotency_key",
	) {
		return invalidParamResult()
	}
	if res := d.RequireAdminPermission(ctx, contract.startPermission); res != nil {
		return res
	}
	businessRefID := exceptionProcessBusinessRefID(pm, contract.idParam)
	if businessRefID <= 0 || strings.TrimSpace(getString(pm, "idempotency_key")) == "" {
		return invalidParamResult()
	}
	if res := d.requireExceptionProcessSourceRead(ctx, method, contract, businessRefID); res != nil {
		return res
	}
	if _, res := d.exceptionProcessSourceReadback(ctx, contract, businessRefID); res != nil {
		return res
	}
	customerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	createInput := biz.ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     customerKey,
		ProcessKey:      contract.processKey,
		ProcessVersion:  getString(pm, "process_version"),
		BusinessRefType: contract.businessRefType,
		BusinessRefID:   businessRefID,
		CorrelationKey:  optionalRPCStringPointer(getString(pm, "correlation_key")),
		IdempotencyKey:  strings.TrimSpace(getString(pm, "idempotency_key")),
	}
	processCreate, err := d.customerConfigUC.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, createInput)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	instance, nodes, err := d.processRuntimeUC.CreateProcessInstanceFromSource(ctx, processCreate, admin.ID)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	if len(nodes) == 0 || nodes[0] == nil {
		return d.mapCustomerConfigError(ctx, biz.ErrProcessNodeInstanceNotFound)
	}
	startedNode, err := d.startOrReadProcessFirstNode(ctx, instance, nodes, admin.ID)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	if refreshed, refreshErr := d.processRuntimeUC.GetProcessInstance(ctx, instance.ID); refreshErr == nil {
		instance = refreshed
	}
	if refreshed, refreshErr := d.processRuntimeUC.ListProcessNodeInstances(ctx, instance.ID); refreshErr == nil {
		nodes = refreshed
	}
	sourceReadback, sourceRes := d.exceptionProcessSourceReadback(ctx, contract, businessRefID)
	if sourceRes != nil {
		return sourceRes
	}
	return okData(map[string]any{
		"process_context":  exceptionProcessContextToMap(instance, nodes),
		"process_instance": processInstanceToMap(instance),
		"started_node":     processNodeInstanceToMap(startedNode),
		"nodes":            processNodeInstancesToMaps(nodes),
		"source_readback":  sourceReadback,
		"runtime_boundary": map[string]any{
			"source":                        "active_customer_config",
			"config_revision":               instance.ConfigRevision,
			"process_key":                   contract.processKey,
			"started_only":                  true,
			"executes_domain_command":       false,
			"workflow_task_done_posts_fact": false,
		},
	})
}

func (d *jsonrpcDispatcher) startOrReadProcessFirstNode(
	ctx context.Context,
	instance *biz.ProcessInstance,
	nodes []*biz.ProcessNodeInstance,
	actorID int,
) (*biz.ProcessNodeInstance, error) {
	if d == nil || d.processRuntimeUC == nil || instance == nil || instance.ID <= 0 ||
		len(nodes) == 0 || nodes[0] == nil || actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	firstNode := nodes[0]
	if firstNode.ProcessInstanceID != instance.ID {
		return nil, biz.ErrBadParam
	}
	if firstNode.NodeType != biz.ProcessNodeTypeDomainCommand &&
		(firstNode.Status == biz.ProcessNodeStatusCompleted ||
			firstNode.Status == biz.ProcessNodeStatusBlocked) {
		return firstNode, nil
	}
	return d.processRuntimeUC.StartProcessInstance(
		ctx,
		&biz.ProcessInstanceStart{ID: instance.ID},
		actorID,
	)
}

func (d *jsonrpcDispatcher) getCustomerConfigExceptionProcess(
	ctx context.Context,
	contract customerConfigExceptionProcessContract,
	method string,
	pm map[string]any,
	_ *biz.AdminUser,
) *v1.JsonrpcResult {
	if !customerConfigAllowsOnly(pm, "customer_key", contract.idParam) {
		return invalidParamResult()
	}
	businessRefID := exceptionProcessBusinessRefID(pm, contract.idParam)
	if businessRefID <= 0 {
		return invalidParamResult()
	}
	customerKey, err := runtimeCustomerKey(getString(pm, "customer_key"))
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	if res := d.requireExceptionProcessSourceRead(ctx, method, contract, businessRefID); res != nil {
		return res
	}
	sourceReadback, sourceRes := d.exceptionProcessSourceReadback(ctx, contract, businessRefID)
	if sourceRes != nil {
		return sourceRes
	}
	instance, nodes, err := d.processRuntimeUC.GetProcessInstanceByBusinessRef(
		ctx,
		contract.processKey,
		contract.businessRefType,
		businessRefID,
	)
	if errors.Is(err, biz.ErrProcessInstanceNotFound) {
		return okData(map[string]any{
			"process_context": nil,
			"source_readback": sourceReadback,
		})
	}
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	if !processInstanceCustomerKeyMatches(instance, customerKey) {
		return d.mapCustomerConfigError(ctx, biz.ErrForbidden)
	}
	return okData(map[string]any{
		"process_context": exceptionProcessContextToMap(instance, nodes),
		"source_readback": sourceReadback,
	})
}

func (d *jsonrpcDispatcher) executeCustomerConfigExceptionProcess(
	ctx context.Context,
	contract customerConfigExceptionProcessContract,
	method string,
	commandKey string,
	pm map[string]any,
	admin *biz.AdminUser,
) *v1.JsonrpcResult {
	in, ok := exceptionProcessDomainCommandExecutionFromParams(contract, commandKey, pm)
	if !ok {
		return invalidParamResult()
	}
	if res := d.requireExceptionProcessSourceRead(ctx, method, contract, contractBusinessRefID(in)); res != nil {
		return res
	}
	if _, sourceRes := d.exceptionProcessSourceReadback(ctx, contract, contractBusinessRefID(in)); sourceRes != nil {
		return sourceRes
	}
	runtimeRevision, res := d.requireCustomerConfigProcessDomainCommandAllowed(
		ctx,
		getString(pm, "customer_key"),
		in,
		admin,
	)
	if res != nil {
		return res
	}
	completedNode, err := d.processRuntimeUC.ExecuteDomainCommandNode(ctx, in, admin.ID)
	if err != nil {
		return d.mapCustomerConfigExceptionProcessError(ctx, contract, err)
	}
	instance, err := d.processRuntimeUC.GetProcessInstance(ctx, in.ProcessInstanceID)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	nodes, err := d.processRuntimeUC.ListProcessNodeInstances(ctx, in.ProcessInstanceID)
	if err != nil {
		return d.mapCustomerConfigError(ctx, err)
	}
	sourceReadback, sourceRes := d.exceptionProcessSourceReadback(ctx, contract, contractBusinessRefID(in))
	if sourceRes != nil {
		return sourceRes
	}
	return okData(map[string]any{
		"completed_node":  processNodeInstanceToMap(completedNode),
		"process_context": exceptionProcessContextToMap(instance, nodes),
		"source_readback": sourceReadback,
		"runtime_boundary": customerConfigProcessRuntimeBoundary(runtimeRevision, map[string]any{
			"process_key":                   contract.processKey,
			"command_key":                   commandKey,
			"executes_domain_command":       true,
			"workflow_task_done_posts_fact": false,
		}),
	})
}

func exceptionProcessBusinessRefID(pm map[string]any, idParam string) int {
	return getInt(pm, idParam, 0)
}

func contractBusinessRefID(in *biz.ProcessDomainCommandExecution) int {
	if in == nil {
		return 0
	}
	for _, key := range []string{
		"finance_payment_id",
		"inventory_operation_id",
		"production_exception_id",
	} {
		if id, ok := in.Payload[key].(int); ok && id > 0 {
			return id
		}
	}
	return 0
}

func exceptionProcessDomainCommandExecutionFromParams(
	contract customerConfigExceptionProcessContract,
	commandKey string,
	pm map[string]any,
) (*biz.ProcessDomainCommandExecution, bool) {
	allowed := []string{
		"customer_key",
		"process_instance_id",
		"process_node_instance_id",
		"expected_version",
		contract.idParam,
		"idempotency_key",
	}
	switch commandKey {
	case biz.ProcessDomainCommandFinancePaymentPost:
		allowed = append(allowed, "allocations")
	case biz.ProcessDomainCommandProductionExceptionExecute:
		allowed = append(allowed, "reason")
	}
	if !customerConfigAllowsOnly(pm, allowed...) {
		return nil, false
	}
	processInstanceID := getInt(pm, "process_instance_id", 0)
	processNodeInstanceID := getInt(pm, "process_node_instance_id", 0)
	expectedVersion := getInt(pm, "expected_version", 0)
	businessRefID := exceptionProcessBusinessRefID(pm, contract.idParam)
	idempotencyKey := strings.TrimSpace(getString(pm, "idempotency_key"))
	if processInstanceID <= 0 || processNodeInstanceID <= 0 || expectedVersion <= 0 ||
		businessRefID <= 0 || idempotencyKey == "" {
		return nil, false
	}
	payload := map[string]any{contract.idParam: businessRefID}
	switch commandKey {
	case biz.ProcessDomainCommandFinancePaymentPost:
		raw, ok := pm["allocations"].([]any)
		if !ok || len(raw) == 0 {
			return nil, false
		}
		allocations := make([]any, 0, len(raw))
		for _, value := range raw {
			item, ok := value.(map[string]any)
			if !ok || !customerConfigAllowsOnly(item, "finance_fact_id", "amount") {
				return nil, false
			}
			amount, ok := getRequiredJSONRPCNumeric20Scale6(item, "amount")
			financeFactID := getInt(item, "finance_fact_id", 0)
			if !ok || !amount.IsPositive() || financeFactID <= 0 {
				return nil, false
			}
			allocations = append(allocations, map[string]any{
				"finance_fact_id": financeFactID,
				"amount":          amount.String(),
			})
		}
		payload["allocations"] = allocations
	case biz.ProcessDomainCommandProductionExceptionExecute:
		reason := strings.TrimSpace(getString(pm, "reason"))
		if reason == "" || len([]rune(reason)) > 255 {
			return nil, false
		}
		payload["reason"] = reason
	}
	return &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     processInstanceID,
		ProcessNodeInstanceID: processNodeInstanceID,
		ExpectedVersion:       expectedVersion,
		CommandKey:            commandKey,
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
	}, true
}

func exceptionProcessContextToMap(
	instance *biz.ProcessInstance,
	nodes []*biz.ProcessNodeInstance,
) map[string]any {
	active := make([]*biz.ProcessNodeInstance, 0)
	completed := make([]*biz.ProcessNodeInstance, 0)
	for _, node := range nodes {
		if node == nil {
			continue
		}
		switch node.Status {
		case biz.ProcessNodeStatusActive:
			active = append(active, node)
		case biz.ProcessNodeStatusCompleted, biz.ProcessNodeStatusBlocked:
			completed = append(completed, node)
		}
	}
	return map[string]any{
		"process_instance": processInstanceToMap(instance),
		"nodes":            processNodeInstancesToMaps(nodes),
		"active_nodes":     processNodeInstancesToMaps(active),
		"settled_nodes":    processNodeInstancesToMaps(completed),
	}
}

func (d *jsonrpcDispatcher) requireExceptionProcessSourceRead(
	ctx context.Context,
	method string,
	contract customerConfigExceptionProcessContract,
	businessRefID int,
) *v1.JsonrpcResult {
	if businessRefID <= 0 {
		return invalidParamResult()
	}
	switch method {
	case "start_production_exception_approval_process",
		"get_production_exception_approval_process":
		if res := d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method); res != nil {
			return res
		}
		item, err := d.operationalFactUC.GetProductionException(ctx, businessRefID)
		if err != nil {
			return d.mapOperationalFactError(ctx, err)
		}
		condition := biz.SourceReadConditionProductionExceptionWIP
		if item.DecisionType == biz.ProductionExceptionOverIssue {
			condition = biz.SourceReadConditionProductionExceptionIssue
		}
		return d.requireSourceActionReadPermissions(ctx, "customer_config", method, condition)
	case "execute_finance_payment_post":
		if res := d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method); res != nil {
			return res
		}
		item, err := d.operationalFactUC.GetFinancePayment(ctx, businessRefID)
		if err != nil {
			return d.mapOperationalFactError(ctx, err)
		}
		condition := biz.SourceReadConditionFinancePayable
		if item.Direction == biz.FinancePaymentDirectionReceipt {
			condition = biz.SourceReadConditionFinanceReceivable
		}
		return d.requireSourceActionReadPermissions(ctx, "customer_config", method, condition)
	case contract.getMethod, contract.startMethod:
		return d.requireSourceActionReadPermissions(ctx, "customer_config", method)
	default:
		return d.requireSourceActionRBACReadPermissions(ctx, "customer_config", method)
	}
}

func processInstanceCustomerKeyMatches(instance *biz.ProcessInstance, customerKey string) bool {
	if instance == nil {
		return false
	}
	snapshotCustomerKey, _ := instance.ModuleContractSnapshot["customer_key"].(string)
	return biz.NormalizeCustomerKey(snapshotCustomerKey) == biz.NormalizeCustomerKey(customerKey)
}

func (d *jsonrpcDispatcher) exceptionProcessSourceReadback(
	ctx context.Context,
	contract customerConfigExceptionProcessContract,
	businessRefID int,
) (any, *v1.JsonrpcResult) {
	switch contract.processKey {
	case biz.ProcessKeyFinancePaymentApproval:
		item, err := d.operationalFactUC.GetFinancePayment(ctx, businessRefID)
		if err != nil {
			return nil, d.mapOperationalFactError(ctx, err)
		}
		return financePaymentToMap(item), nil
	case biz.ProcessKeyInventoryAdjustmentApproval:
		scope, scopeResult := d.currentWarehouseDataScope(ctx)
		if scopeResult != nil {
			return nil, scopeResult
		}
		item, err := d.getInventoryOperationForScope(ctx, businessRefID, scope)
		if err != nil {
			return nil, d.mapInventoryError(ctx, err)
		}
		if item.OperationType != biz.InventoryOperationManualAdjustment {
			return nil, invalidParamResult()
		}
		return inventoryOperationToAny(item), nil
	case biz.ProcessKeyProductionExceptionApproval:
		item, err := d.operationalFactUC.GetProductionException(ctx, businessRefID)
		if err != nil {
			return nil, d.mapOperationalFactError(ctx, err)
		}
		return productionExceptionToAny(item), nil
	default:
		return nil, invalidParamResult()
	}
}

func (d *jsonrpcDispatcher) mapCustomerConfigExceptionProcessError(
	ctx context.Context,
	contract customerConfigExceptionProcessContract,
	err error,
) *v1.JsonrpcResult {
	switch contract.processKey {
	case biz.ProcessKeyInventoryAdjustmentApproval:
		switch {
		case errors.Is(err, biz.ErrInventoryOperationNotFound),
			errors.Is(err, biz.ErrInventoryOperationVersionConflict),
			errors.Is(err, biz.ErrInventoryOperationStaleCount),
			errors.Is(err, biz.ErrInventoryOperationSubmitOwner),
			errors.Is(err, biz.ErrInventoryOperationSelfApproval),
			errors.Is(err, biz.ErrInventoryOperationCancelOwner),
			errors.Is(err, biz.ErrInventoryInsufficientStock):
			return d.mapInventoryError(ctx, err)
		}
	case biz.ProcessKeyFinancePaymentApproval,
		biz.ProcessKeyProductionExceptionApproval:
		switch {
		case errors.Is(err, biz.ErrProductionExceptionNotFound),
			errors.Is(err, biz.ErrProductionExceptionConflict),
			errors.Is(err, biz.ErrProductionExceptionInvalidState),
			errors.Is(err, biz.ErrProductionExceptionSourceInvalid),
			errors.Is(err, biz.ErrProductionExceptionApprovalAmount),
			errors.Is(err, biz.ErrProductionExceptionSelfApproval),
			errors.Is(err, biz.ErrProductionExceptionCancelOwner),
			errors.Is(err, biz.ErrProductionExceptionWIPDependency),
			errors.Is(err, biz.ErrProductionExceptionFactDependency),
			errors.Is(err, biz.ErrProductionExceptionAllowanceUsed),
			errors.Is(err, biz.ErrFinanceFactNotFound),
			errors.Is(err, biz.ErrFinanceFactSourceInvalid),
			errors.Is(err, biz.ErrCustomerNotFound),
			errors.Is(err, biz.ErrCustomerInactive),
			errors.Is(err, biz.ErrSupplierNotFound),
			errors.Is(err, biz.ErrSupplierInactive):
			return d.mapOperationalFactError(ctx, err)
		}
	}
	return d.mapCustomerConfigError(ctx, err)
}
