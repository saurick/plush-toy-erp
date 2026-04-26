package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrWorkflowTaskNotFound       = errors.New("workflow task not found")
	ErrWorkflowTaskExists         = errors.New("workflow task already exists")
	ErrWorkflowBusinessStateFound = errors.New("workflow business state already exists")
)

const (
	workflowProjectOrderModuleKey              = "project-orders"
	workflowMaterialBOMModuleKey               = "material-bom"
	workflowAccessoriesPurchaseModuleKey       = "accessories-purchase"
	workflowInboundModuleKey                   = "inbound"
	workflowProcessingContractsModuleKey       = "processing-contracts"
	workflowOrderApprovalTaskGroup             = "order_approval"
	workflowEngineeringDataTaskGroup           = "engineering_data"
	workflowOrderRevisionTaskGroup             = "order_revision"
	workflowPurchaseIQCTaskGroup               = "purchase_iqc"
	workflowWarehouseInboundTaskGroup          = "warehouse_inbound"
	workflowPurchaseQualityExceptionGroup      = "purchase_quality_exception"
	workflowOutsourceReturnQCTaskGroup         = "outsource_return_qc"
	workflowOutsourceWarehouseInboundTaskGroup = "outsource_warehouse_inbound"
	workflowOutsourceReworkTaskGroup           = "outsource_rework"
	workflowOrderApprovalStatusKey             = "project_pending"
	workflowOrderApprovedStatusKey             = "project_approved"
	workflowEngineeringPreparingStatusKey      = "engineering_preparing"
	workflowQCPendingStatusKey                 = "qc_pending"
	workflowIQCPendingStatusKey                = "iqc_pending"
	workflowQCFailedStatusKey                  = "qc_failed"
	workflowWarehouseInboundPendingKey         = "warehouse_inbound_pending"
	workflowInboundDoneStatusKey               = "inbound_done"
	workflowBlockedStatusKey                   = "blocked"
)

type WorkflowStateOption struct {
	Key     string
	Label   string
	Summary string
}

var workflowTaskStates = []WorkflowStateOption{
	{Key: "pending", Label: "待开始", Summary: "任务已创建，但前置条件还没齐，暂时不能开工。"},
	{Key: "ready", Label: "可执行", Summary: "上游单据、资料或齐套条件已满足，可以正式开始。"},
	{Key: "processing", Label: "处理中", Summary: "已有责任人接手，当前任务正在推进。"},
	{Key: "blocked", Label: "阻塞", Summary: "被缺料、缺资料、未放行或异常等外部条件卡住。"},
	{Key: "done", Label: "已完成", Summary: "当前任务的完成条件已经达到，可进入下游节点。"},
	{Key: "rejected", Label: "已退回", Summary: "审批、检验或确认动作未通过，需要回退上一责任人。"},
	{Key: "cancelled", Label: "已取消", Summary: "因订单取消、方案切换或需求撤销而失效。"},
	{Key: "closed", Label: "已关闭", Summary: "主链闭环后归档关闭，不再继续推进。"},
}

var workflowBusinessStates = []WorkflowStateOption{
	{Key: "project_pending", Label: "立项待确认", Summary: "客户、编号、交期和资料前置条件正在收口。"},
	{Key: "project_approved", Label: "立项已放行", Summary: "已通过老板或管理层审批，允许进入资料与采购准备。"},
	{Key: "engineering_preparing", Label: "资料准备中", Summary: "BOM、色卡、作业指导书和包装要求正在补齐。"},
	{Key: "material_preparing", Label: "齐套准备中", Summary: "主料、辅包材、委外和关键资料仍在确认或催办。"},
	{Key: "production_ready", Label: "待排产", Summary: "齐套条件已满足，等待生产经理做排单决策。"},
	{Key: "production_processing", Label: "生产中", Summary: "已进入裁切、车缝、手工、组装或外发执行。"},
	{Key: "qc_pending", Label: "待检验", Summary: "待做 IQC、过程检验、返工复检或出货前质量确认。"},
	{Key: "iqc_pending", Label: "IQC 待检", Summary: "采购到货或入库通知已形成，等待品质做来料检验。"},
	{Key: "qc_failed", Label: "质检不合格", Summary: "来料、回货或成品检验未通过，等待责任角色处理退货、返工、补做或让步接收。"},
	{Key: "warehouse_processing", Label: "待入库 / 待出货", Summary: "仓库正在做回仓、入库、备货和待出货准备。"},
	{Key: "warehouse_inbound_pending", Label: "待确认入库", Summary: "品质已放行，等待仓库确认入库数量、库位和经手人。"},
	{Key: "inbound_done", Label: "已入库", Summary: "仓库已确认入库事实；库存余额和库存流水后续按专表评审落地。"},
	{Key: "shipment_pending", Label: "待出货", Summary: "成品已入库或放行，等待出货准备、装箱、唛头和出库确认。"},
	{Key: "shipping_released", Label: "已放行待出库", Summary: "业务确认和财务放行已完成，等待仓库出库执行。"},
	{Key: "shipped", Label: "已出货", Summary: "出库事实已形成，可进入对账和结算链路。"},
	{Key: "reconciling", Label: "对账中", Summary: "加工费、辅包材费用和异常费用正在核对。"},
	{Key: "settled", Label: "已结算", Summary: "当前订单或批次对应的结算义务已经闭环。"},
	{Key: "blocked", Label: "业务阻塞", Summary: "主链被缺料、延期、未放行、数量差异或异常问题卡住。"},
	{Key: "cancelled", Label: "业务取消", Summary: "订单或批次被整体取消，不再继续推进。"},
	{Key: "closed", Label: "业务归档", Summary: "主链已完成并归档，保留历史快照与追溯记录。"},
}

var workflowPlanningPhases = []WorkflowStateOption{
	{Key: "source_locked", Label: "真源已收口", Summary: "先明确当前唯一真源字段、单据和业务节点。"},
	{Key: "page_defined", Label: "页面已收口", Summary: "菜单、角色入口、帮助中心和工作台卡片范围已确定。"},
	{Key: "status_defined", Label: "状态已统一", Summary: "任务状态、业务状态和阻塞原因已形成统一字典。"},
	{Key: "schema_v1_ready", Label: "Schema v1 已落地", Summary: "workflow 和通用业务记录表已通过 Ent + Atlas 生成迁移。"},
	{Key: "api_v1_ready", Label: "API v1 已接通", Summary: "workflow 与 business JSON-RPC 已支持当前表格、弹窗和任务池主路径。"},
	{Key: "save_link_v1_ready", Label: "保存链路 v1 已接通", Summary: "桌面业务页可保存通用业务记录、写状态快照并创建协同任务。"},
}

var (
	workflowTaskStateSet      = buildWorkflowStateSet(workflowTaskStates)
	workflowBusinessStateSet  = buildWorkflowStateSet(workflowBusinessStates)
	workflowTaskUrgeActionSet = map[string]struct{}{
		"urge_task":        {},
		"urge_role":        {},
		"urge_assignee":    {},
		"escalate_to_pmc":  {},
		"escalate_to_boss": {},
	}
)

func buildWorkflowStateSet(items []WorkflowStateOption) map[string]struct{} {
	out := make(map[string]struct{}, len(items))
	for _, item := range items {
		out[item.Key] = struct{}{}
	}
	return out
}

func WorkflowTaskStates() []WorkflowStateOption {
	out := make([]WorkflowStateOption, len(workflowTaskStates))
	copy(out, workflowTaskStates)
	return out
}

func WorkflowBusinessStates() []WorkflowStateOption {
	out := make([]WorkflowStateOption, len(workflowBusinessStates))
	copy(out, workflowBusinessStates)
	return out
}

func WorkflowPlanningPhases() []WorkflowStateOption {
	out := make([]WorkflowStateOption, len(workflowPlanningPhases))
	copy(out, workflowPlanningPhases)
	return out
}

func IsValidWorkflowTaskState(key string) bool {
	_, ok := workflowTaskStateSet[strings.TrimSpace(key)]
	return ok
}

func IsValidWorkflowBusinessState(key string) bool {
	_, ok := workflowBusinessStateSet[strings.TrimSpace(key)]
	return ok
}

func IsValidWorkflowTaskUrgeAction(action string) bool {
	_, ok := workflowTaskUrgeActionSet[strings.TrimSpace(action)]
	return ok
}

func IsTerminalWorkflowTaskStatus(statusKey string) bool {
	switch strings.TrimSpace(statusKey) {
	case "done", "cancelled", "closed":
		return true
	default:
		return false
	}
}

func WorkflowStatusActionPermission(nextStatusKey string, current *WorkflowTask) string {
	switch strings.TrimSpace(nextStatusKey) {
	case "done":
		if isBossOrderApprovalTask(current) {
			return PermissionWorkflowTaskApprove
		}
		return PermissionWorkflowTaskComplete
	case "rejected":
		return PermissionWorkflowTaskReject
	default:
		return PermissionWorkflowTaskUpdate
	}
}

func CanAdminHandleWorkflowTask(admin *AdminUser, task *WorkflowTask, nextStatusKey string) bool {
	if admin == nil || admin.Disabled || task == nil {
		return false
	}
	if IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false
	}
	nextStatusKey = strings.TrimSpace(nextStatusKey)
	if nextStatusKey == "" || !IsValidWorkflowTaskState(nextStatusKey) {
		return false
	}
	if task.AssigneeID != nil {
		return *task.AssigneeID == admin.ID
	}
	return AdminHasRole(admin, task.OwnerRoleKey)
}

type WorkflowTask struct {
	ID                int
	TaskCode          string
	TaskGroup         string
	TaskName          string
	SourceType        string
	SourceID          int
	SourceNo          *string
	BusinessStatusKey *string
	TaskStatusKey     string
	OwnerRoleKey      string
	AssigneeID        *int
	Priority          int16
	BlockedReason     *string
	DueAt             *time.Time
	StartedAt         *time.Time
	CompletedAt       *time.Time
	ClosedAt          *time.Time
	Payload           map[string]any
	CreatedBy         *int
	UpdatedBy         *int
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type WorkflowTaskFilter struct {
	Limit         int
	Offset        int
	OwnerRoleKey  string
	TaskStatusKey string
	SourceType    string
	SourceID      int
}

type WorkflowTaskCreate struct {
	TaskCode          string
	TaskGroup         string
	TaskName          string
	SourceType        string
	SourceID          int
	SourceNo          *string
	BusinessStatusKey *string
	TaskStatusKey     string
	OwnerRoleKey      string
	AssigneeID        *int
	Priority          int16
	BlockedReason     *string
	DueAt             *time.Time
	Payload           map[string]any
}

type WorkflowTaskStatusUpdate struct {
	ID                int
	TaskStatusKey     string
	BusinessStatusKey string
	Reason            string
	Payload           map[string]any
	SideEffects       *WorkflowTaskStatusSideEffects
}

type WorkflowTaskStatusSideEffects struct {
	BusinessState     *WorkflowBusinessStateUpsert
	DerivedTask       *WorkflowTaskCreate
	DerivedFromTaskID int
	WorkflowRuleKey   string
}

type WorkflowTaskUrge struct {
	ID      int
	Action  string
	Reason  string
	Payload map[string]any
}

type WorkflowBusinessState struct {
	ID                int
	SourceType        string
	SourceID          int
	SourceNo          *string
	OrderID           *int
	BatchID           *int
	BusinessStatusKey string
	OwnerRoleKey      *string
	BlockedReason     *string
	StatusChangedAt   time.Time
	Payload           map[string]any
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type WorkflowBusinessStateFilter struct {
	Limit             int
	Offset            int
	SourceType        string
	SourceID          int
	BusinessStatusKey string
	OwnerRoleKey      string
}

type WorkflowBusinessStateUpsert struct {
	SourceType        string
	SourceID          int
	SourceNo          *string
	OrderID           *int
	BatchID           *int
	BusinessStatusKey string
	OwnerRoleKey      *string
	BlockedReason     *string
	Payload           map[string]any
}

type WorkflowRepo interface {
	GetWorkflowTask(ctx context.Context, id int) (*WorkflowTask, error)
	ListWorkflowTasks(ctx context.Context, filter WorkflowTaskFilter) ([]*WorkflowTask, int, error)
	CreateWorkflowTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error)
	UpdateWorkflowTaskStatus(ctx context.Context, in *WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*WorkflowTask, error)
	UrgeWorkflowTask(ctx context.Context, in *WorkflowTaskUrge, actorID int, actorRoleKey string) (*WorkflowTask, error)
	ListWorkflowBusinessStates(ctx context.Context, filter WorkflowBusinessStateFilter) ([]*WorkflowBusinessState, int, error)
	UpsertWorkflowBusinessState(ctx context.Context, in *WorkflowBusinessStateUpsert, actorID int) (*WorkflowBusinessState, error)
}

type WorkflowUsecase struct {
	repo WorkflowRepo
}

func NewWorkflowUsecase(repo WorkflowRepo) *WorkflowUsecase {
	return &WorkflowUsecase{repo: repo}
}

func (uc *WorkflowUsecase) Metadata() (taskStates, businessStates, planningPhases []WorkflowStateOption) {
	return WorkflowTaskStates(), WorkflowBusinessStates(), WorkflowPlanningPhases()
}

func (uc *WorkflowUsecase) ListTasks(ctx context.Context, filter WorkflowTaskFilter) ([]*WorkflowTask, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter = normalizeWorkflowTaskFilter(filter)
	if filter.TaskStatusKey != "" && !IsValidWorkflowTaskState(filter.TaskStatusKey) {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListWorkflowTasks(ctx, filter)
}

func (uc *WorkflowUsecase) GetTask(ctx context.Context, id int) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetWorkflowTask(ctx, id)
}

func (uc *WorkflowUsecase) CreateTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowTaskCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateWorkflowTask(ctx, &normalized, actorID)
}

func (uc *WorkflowUsecase) UpdateTaskStatus(ctx context.Context, in *WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.BusinessStatusKey = strings.TrimSpace(in.BusinessStatusKey)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.ID <= 0 || !IsValidWorkflowTaskState(in.TaskStatusKey) {
		return nil, ErrBadParam
	}
	if in.BusinessStatusKey != "" && !IsValidWorkflowBusinessState(in.BusinessStatusKey) {
		return nil, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	current, err := uc.repo.GetWorkflowTask(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if isBossOrderApprovalTask(current) {
		if err := uc.applyBossApprovalTransition(current, in); err != nil {
			return nil, err
		}
	} else if isPurchaseIQCTask(current) {
		if err := uc.applyPurchaseIQCTransition(current, in); err != nil {
			return nil, err
		}
	} else if isPurchaseWarehouseInboundTask(current) {
		if err := uc.applyPurchaseWarehouseInboundTransition(current, in); err != nil {
			return nil, err
		}
	} else if isOutsourceReturnQCTask(current) {
		if err := uc.applyOutsourceReturnQCTransition(current, in); err != nil {
			return nil, err
		}
	}
	return uc.repo.UpdateWorkflowTaskStatus(ctx, in, actorID, strings.TrimSpace(actorRoleKey))
}

func (uc *WorkflowUsecase) applyBossApprovalTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowOrderApprovedStatusKey
		in.SideEffects = buildBossApprovalDoneSideEffects(current)
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		if in.TaskStatusKey == "blocked" {
			in.BusinessStatusKey = "blocked"
		} else {
			in.BusinessStatusKey = workflowOrderApprovalStatusKey
		}
		in.SideEffects = buildBossApprovalRevisionSideEffects(current, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func buildBossApprovalDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "engineering"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        workflowProjectOrderModuleKey,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowOrderApprovedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":     workflowOrderRecordTitle(current),
				"approval_task_id": current.ID,
				"approval_result":  "approved",
				"critical_path":    true,
			},
		},
		DerivedTask:       buildEngineeringTaskFromApprovedOrder(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "boss_approval_done_to_engineering_data",
	}
}

func buildBossApprovalRevisionSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := BusinessRoleKey
	businessStatusKey := workflowOrderApprovalStatusKey
	workflowRuleKey := "boss_approval_rejected_to_order_revision"
	if taskStatusKey == "blocked" {
		businessStatusKey = "blocked"
		workflowRuleKey = "boss_approval_blocked_to_order_revision"
	}
	statePayload := map[string]any{
		"record_title":      workflowOrderRecordTitle(current),
		"approval_task_id":  current.ID,
		"approval_result":   "rejected",
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"rejected_reason":   reason,
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        workflowProjectOrderModuleKey,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: businessStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedTask:       buildRevisionTaskFromRejectedOrder(current, taskStatusKey, reason),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   workflowRuleKey,
	}
}

func (uc *WorkflowUsecase) applyPurchaseIQCTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowWarehouseInboundPendingKey
		ensureWorkflowPayload(&in.Payload)
		if workflowPayloadString(in.Payload, "qc_result") == "" {
			in.Payload["qc_result"] = "pass"
		}
		in.SideEffects = buildPurchaseIQCDoneSideEffects(current)
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowQCFailedStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
			if workflowPayloadString(in.Payload, "rejected_reason") == "" {
				in.Payload["rejected_reason"] = reason
			}
		} else {
			in.Payload["rejected_reason"] = reason
		}
		in.SideEffects = buildPurchaseIQCExceptionSideEffects(current, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyPurchaseWarehouseInboundTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowInboundDoneStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.Payload["warehouse_task_id"] = current.ID
		in.Payload["inbound_result"] = "done"
		in.Payload["inventory_balance_deferred"] = true
		in.Payload["critical_path"] = true
		in.SideEffects = buildPurchaseWarehouseInboundDoneSideEffects(current)
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowBlockedStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		in.Payload["warehouse_task_id"] = current.ID
		in.Payload["critical_path"] = true
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
		} else {
			in.Payload["rejected_reason"] = reason
		}
		in.SideEffects = buildPurchaseWarehouseInboundBlockedSideEffects(current, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyOutsourceReturnQCTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowWarehouseInboundPendingKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		if workflowPayloadString(in.Payload, "qc_result") == "" {
			in.Payload["qc_result"] = "pass"
		}
		in.Payload["qc_type"] = "outsource_return"
		in.Payload["outsource_processing"] = true
		in.SideEffects = buildOutsourceReturnQCDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowQCFailedStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		in.Payload["qc_type"] = "outsource_return"
		in.Payload["outsource_processing"] = true
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
			in.Payload["rejected_reason"] = reason
		} else {
			delete(in.Payload, "blocked_reason")
			in.Payload["rejected_reason"] = reason
		}
		in.SideEffects = buildOutsourceReturnQCReworkSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) UrgeTask(ctx context.Context, in *WorkflowTaskUrge, actorID int, actorRoleKey string) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	in.Action = strings.TrimSpace(in.Action)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.ID <= 0 || !IsValidWorkflowTaskUrgeAction(in.Action) || in.Reason == "" {
		return nil, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return uc.repo.UrgeWorkflowTask(ctx, in, actorID, strings.TrimSpace(actorRoleKey))
}

func (uc *WorkflowUsecase) ListBusinessStates(ctx context.Context, filter WorkflowBusinessStateFilter) ([]*WorkflowBusinessState, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter = normalizeWorkflowBusinessStateFilter(filter)
	if filter.BusinessStatusKey != "" && !IsValidWorkflowBusinessState(filter.BusinessStatusKey) {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListWorkflowBusinessStates(ctx, filter)
}

func (uc *WorkflowUsecase) UpsertBusinessState(ctx context.Context, in *WorkflowBusinessStateUpsert, actorID int) (*WorkflowBusinessState, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowBusinessStateUpsert(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpsertWorkflowBusinessState(ctx, &normalized, actorID)
}

func normalizeWorkflowTaskFilter(filter WorkflowTaskFilter) WorkflowTaskFilter {
	filter.OwnerRoleKey = NormalizeRoleKey(filter.OwnerRoleKey)
	filter.TaskStatusKey = strings.TrimSpace(filter.TaskStatusKey)
	filter.SourceType = strings.TrimSpace(filter.SourceType)
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return filter
}

func normalizeWorkflowTaskCreate(in WorkflowTaskCreate) (WorkflowTaskCreate, error) {
	in.TaskCode = strings.TrimSpace(in.TaskCode)
	in.TaskGroup = strings.TrimSpace(in.TaskGroup)
	in.TaskName = strings.TrimSpace(in.TaskName)
	in.SourceType = strings.TrimSpace(in.SourceType)
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.OwnerRoleKey = NormalizeRoleKey(in.OwnerRoleKey)
	if in.TaskStatusKey == "" {
		in.TaskStatusKey = "pending"
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	if in.TaskCode == "" || in.TaskGroup == "" || in.TaskName == "" || in.SourceType == "" || in.SourceID <= 0 || in.OwnerRoleKey == "" {
		return WorkflowTaskCreate{}, ErrBadParam
	}
	if !IsValidWorkflowTaskState(in.TaskStatusKey) {
		return WorkflowTaskCreate{}, ErrBadParam
	}
	if in.BusinessStatusKey != nil {
		normalized := strings.TrimSpace(*in.BusinessStatusKey)
		if normalized == "" {
			in.BusinessStatusKey = nil
		} else if !IsValidWorkflowBusinessState(normalized) {
			return WorkflowTaskCreate{}, ErrBadParam
		} else {
			in.BusinessStatusKey = &normalized
		}
	}
	return in, nil
}

func normalizeWorkflowBusinessStateFilter(filter WorkflowBusinessStateFilter) WorkflowBusinessStateFilter {
	filter.SourceType = strings.TrimSpace(filter.SourceType)
	filter.BusinessStatusKey = strings.TrimSpace(filter.BusinessStatusKey)
	filter.OwnerRoleKey = NormalizeRoleKey(filter.OwnerRoleKey)
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return filter
}

func normalizeWorkflowBusinessStateUpsert(in WorkflowBusinessStateUpsert) (WorkflowBusinessStateUpsert, error) {
	in.SourceType = strings.TrimSpace(in.SourceType)
	in.BusinessStatusKey = strings.TrimSpace(in.BusinessStatusKey)
	in.OwnerRoleKey = NormalizeOptionalRoleKey(in.OwnerRoleKey)
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	if in.SourceType == "" || in.SourceID <= 0 || !IsValidWorkflowBusinessState(in.BusinessStatusKey) {
		return WorkflowBusinessStateUpsert{}, ErrBadParam
	}
	return in, nil
}

func isBossOrderApprovalTask(task *WorkflowTask) bool {
	if task == nil {
		return false
	}
	return strings.TrimSpace(task.SourceType) == workflowProjectOrderModuleKey &&
		strings.TrimSpace(task.TaskGroup) == workflowOrderApprovalTaskGroup &&
		strings.TrimSpace(task.OwnerRoleKey) == "boss"
}

func isPurchaseIQCTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowAccessoriesPurchaseModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowPurchaseIQCTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "quality" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowIQCPendingStatusKey, workflowWarehouseInboundPendingKey, workflowQCFailedStatusKey:
		return true
	default:
		return false
	}
}

func isPurchaseWarehouseInboundTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowAccessoriesPurchaseModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowWarehouseInboundTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "warehouse" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowWarehouseInboundPendingKey:
		return true
	default:
		return false
	}
}

func isOutsourceReturnQCTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowProcessingContractsModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowOutsourceReturnQCTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "quality" {
		return false
	}
	if workflowPayloadString(task.Payload, "qc_type") != "outsource_return" &&
		workflowPayloadString(task.Payload, "outsource_processing") != "true" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowQCPendingStatusKey, workflowQCFailedStatusKey:
		return true
	default:
		return false
	}
}

func workflowTransitionReason(in *WorkflowTaskStatusUpdate, taskStatusKey string) string {
	if in == nil {
		return ""
	}
	if reason := strings.TrimSpace(in.Reason); reason != "" {
		return reason
	}
	if reason := workflowPayloadString(in.Payload, "reason"); reason != "" {
		return reason
	}
	switch taskStatusKey {
	case "blocked":
		if reason := workflowPayloadString(in.Payload, "blocked_reason"); reason != "" {
			return reason
		}
	case "rejected":
		if reason := workflowPayloadString(in.Payload, "rejected_reason"); reason != "" {
			return reason
		}
	}
	return ""
}

func buildEngineeringTaskFromApprovedOrder(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowEngineeringPreparingStatusKey
	dueAt := resolveEngineeringDueAt(current.Payload, time.Now())
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("engineering-data", current.SourceID),
		TaskGroup:         workflowEngineeringDataTaskGroup,
		TaskName:          "准备 BOM / 色卡 / 作业指导书",
		SourceType:        workflowProjectOrderModuleKey,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "engineering",
		Priority:          2,
		DueAt:             &dueAt,
		Payload: map[string]any{
			"record_title":       workflowOrderRecordTitle(current),
			"customer_name":      workflowPayloadString(current.Payload, "customer_name"),
			"style_no":           workflowPayloadString(current.Payload, "style_no"),
			"product_no":         workflowPayloadString(current.Payload, "product_no"),
			"product_name":       workflowPayloadString(current.Payload, "product_name"),
			"due_date":           workflowPayloadString(current.Payload, "due_date"),
			"complete_condition": "BOM、色卡、作业指导书或包装要求已补齐并确认",
			"related_documents": workflowOrderRelatedDocuments(current, workflowOrderRelatedDocumentOptions{
				includeMaterialBOM: true,
			}),
			"next_module_key": workflowMaterialBOMModuleKey,
			"entry_path":      "/erp/purchase/material-bom",
			"critical_path":   true,
		},
	}
}

func buildRevisionTaskFromRejectedOrder(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowOrderApprovalStatusKey
	payload := map[string]any{
		"record_title":       workflowOrderRecordTitle(current),
		"customer_name":      workflowPayloadString(current.Payload, "customer_name"),
		"style_no":           workflowPayloadString(current.Payload, "style_no"),
		"due_date":           workflowPayloadString(current.Payload, "due_date"),
		"complete_condition": "补齐客户资料、款式资料、交期或审批驳回原因后重新提交",
		"related_documents": workflowOrderRelatedDocuments(current, workflowOrderRelatedDocumentOptions{
			includeArtwork: true,
		}),
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"rejected_reason":   reason,
		"notification_type": "task_rejected",
		"alert_type":        "approval_pending",
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		payload["blocked_reason"] = reason
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("order-revision", current.SourceID),
		TaskGroup:         workflowOrderRevisionTaskGroup,
		TaskName:          "补充订单资料后重新提交",
		SourceType:        workflowProjectOrderModuleKey,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      BusinessRoleKey,
		Priority:          2,
		Payload:           payload,
	}
}

func buildPurchaseIQCDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowWarehouseInboundPendingKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":  workflowPurchaseInboundRecordTitle(current),
				"iqc_task_id":   current.ID,
				"qc_result":     "pass",
				"critical_path": true,
			},
		},
		DerivedTask:       buildWarehouseInboundTaskFromPurchaseIqc(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "purchase_iqc_done_to_warehouse_inbound",
	}
}

func buildPurchaseIQCExceptionSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := PurchaseRoleKey
	qcResult := "fail"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	statePayload := map[string]any{
		"record_title":      workflowPurchaseInboundRecordTitle(current),
		"iqc_task_id":       current.ID,
		"qc_result":         qcResult,
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"rejected_reason":   reason,
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	}
	workflowRuleKey := "purchase_iqc_rejected_to_quality_exception"
	if taskStatusKey == "blocked" {
		workflowRuleKey = "purchase_iqc_blocked_to_quality_exception"
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCFailedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedTask:       buildPurchaseQualityExceptionTaskFromIqc(current, taskStatusKey, reason),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   workflowRuleKey,
	}
}

func buildPurchaseWarehouseInboundDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowInboundDoneStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":               workflowPurchaseInboundRecordTitle(current),
				"warehouse_task_id":          current.ID,
				"inbound_result":             "done",
				"inventory_balance_deferred": true,
				"critical_path":              true,
				"decision":                   "done",
				"transition_status":          "done",
			},
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "warehouse_inbound_done_to_inbound_done",
	}
}

func buildPurchaseWarehouseInboundBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	statePayload := map[string]any{
		"record_title":      workflowPurchaseInboundRecordTitle(current),
		"warehouse_task_id": current.ID,
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowBlockedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "warehouse_inbound_" + taskStatusKey + "_to_blocked",
	}
}

func buildOutsourceReturnQCDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	qcResult := workflowPayloadString(current.Payload, "qc_result")
	if qcResult == "" {
		qcResult = "pass"
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowWarehouseInboundPendingKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":         workflowOutsourceReturnRecordTitle(current),
				"qc_task_id":           current.ID,
				"qc_result":            qcResult,
				"qc_type":              "outsource_return",
				"notification_type":    "task_created",
				"alert_type":           "inbound_pending",
				"critical_path":        true,
				"outsource_processing": true,
			},
		},
		DerivedTask:       buildOutsourceWarehouseInboundTaskFromReturnQC(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "outsource_return_qc_done_to_outsource_warehouse_inbound",
	}
}

func buildOutsourceReturnQCReworkSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "production"
	qcResult := "fail"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	statePayload := map[string]any{
		"record_title":         workflowOutsourceReturnRecordTitle(current),
		"qc_task_id":           current.ID,
		"qc_result":            qcResult,
		"qc_type":              "outsource_return",
		"decision":             taskStatusKey,
		"transition_status":    taskStatusKey,
		"rejected_reason":      reason,
		"notification_type":    "qc_failed",
		"alert_type":           "qc_failed",
		"critical_path":        true,
		"outsource_processing": true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	}
	workflowRuleKey := "outsource_return_qc_rejected_to_outsource_rework"
	if taskStatusKey == "blocked" {
		workflowRuleKey = "outsource_return_qc_blocked_to_outsource_rework"
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCFailedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedTask:       buildOutsourceReworkTaskFromReturnQC(current, taskStatusKey, reason),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   workflowRuleKey,
	}
}

func buildWarehouseInboundTaskFromPurchaseIqc(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowWarehouseInboundPendingKey
	dueAt := time.Now().Add(4 * time.Hour)
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("warehouse-inbound", current.SourceID),
		TaskGroup:         workflowWarehouseInboundTaskGroup,
		TaskName:          "确认入库",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          priority,
		DueAt:             &dueAt,
		Payload: map[string]any{
			"record_title":       workflowPurchaseInboundRecordTitle(current),
			"supplier_name":      workflowPayloadString(current.Payload, "supplier_name"),
			"material_name":      workflowPayloadString(current.Payload, "material_name"),
			"product_name":       workflowPayloadString(current.Payload, "product_name"),
			"quantity":           workflowPayloadString(current.Payload, "quantity"),
			"unit":               workflowPayloadString(current.Payload, "unit"),
			"due_date":           workflowPayloadString(current.Payload, "due_date"),
			"qc_result":          "pass",
			"complete_condition": "仓库确认入库数量、库位和经手人，业务状态更新为已入库",
			"related_documents": workflowPurchaseInboundRelatedDocuments(current, workflowPurchaseInboundRelatedDocumentOptions{
				qcResult: "pass",
			}),
			"notification_type": "task_created",
			"alert_type":        "inbound_pending",
			"critical_path":     true,
		},
	}
}

func buildPurchaseQualityExceptionTaskFromIqc(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowQCFailedStatusKey
	qcResult := "fail"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	payload := map[string]any{
		"record_title":       workflowPurchaseInboundRecordTitle(current),
		"supplier_name":      workflowPayloadString(current.Payload, "supplier_name"),
		"material_name":      workflowPayloadString(current.Payload, "material_name"),
		"product_name":       workflowPayloadString(current.Payload, "product_name"),
		"quantity":           workflowPayloadString(current.Payload, "quantity"),
		"unit":               workflowPayloadString(current.Payload, "unit"),
		"due_date":           workflowPayloadString(current.Payload, "due_date"),
		"iqc_task_id":        current.ID,
		"qc_result":          qcResult,
		"decision":           taskStatusKey,
		"transition_status":  taskStatusKey,
		"rejected_reason":    reason,
		"complete_condition": "采购确认退货、补货、让步接收或重新到货安排",
		"related_documents": workflowPurchaseInboundRelatedDocuments(current, workflowPurchaseInboundRelatedDocumentOptions{
			qcResult: qcResult,
			reason:   reason,
		}),
		"notification_type": "qc_failed",
		"alert_type":        "qc_failed",
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		payload["blocked_reason"] = reason
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("purchase-qc-exception", current.SourceID),
		TaskGroup:         workflowPurchaseQualityExceptionGroup,
		TaskName:          "处理来料不良 / 补货 / 退货",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      PurchaseRoleKey,
		Priority:          3,
		Payload:           payload,
	}
}

func buildOutsourceWarehouseInboundTaskFromReturnQC(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowWarehouseInboundPendingKey
	dueAt := time.Now().Add(4 * time.Hour)
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	qcResult := workflowPayloadString(current.Payload, "qc_result")
	if qcResult == "" {
		qcResult = "pass"
	}
	payload := workflowOutsourceReturnCommonPayload(current)
	payload["qc_task_id"] = current.ID
	payload["qc_result"] = qcResult
	payload["complete_condition"] = "仓库确认委外回货入库数量、库位和经手人"
	payload["related_documents"] = workflowOutsourceReturnRelatedDocuments(current, workflowOutsourceReturnRelatedDocumentOptions{
		qcResult: qcResult,
	})
	payload["notification_type"] = "task_created"
	payload["alert_type"] = "inbound_pending"
	payload["critical_path"] = true
	payload["inventory_balance_deferred"] = true
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("outsource-warehouse-inbound", current.SourceID),
		TaskGroup:         workflowOutsourceWarehouseInboundTaskGroup,
		TaskName:          "委外回货入库",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          priority,
		DueAt:             &dueAt,
		Payload:           payload,
	}
}

func buildOutsourceReworkTaskFromReturnQC(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowQCFailedStatusKey
	payload := workflowOutsourceReturnCommonPayload(current)
	payload["qc_task_id"] = current.ID
	payload["qc_result"] = "fail"
	payload["decision"] = taskStatusKey
	payload["transition_status"] = taskStatusKey
	payload["rejected_reason"] = reason
	payload["complete_condition"] = "生产/委外负责人确认返工、补做、让步接收或重新回货安排"
	payload["related_documents"] = workflowOutsourceReturnRelatedDocuments(current, workflowOutsourceReturnRelatedDocumentOptions{
		qcResult: "fail",
		reason:   reason,
	})
	payload["notification_type"] = "qc_failed"
	payload["alert_type"] = "qc_failed"
	payload["critical_path"] = true
	payload["outsource_owner_role_key"] = "outsource"
	if taskStatusKey == "blocked" {
		payload["blocked_reason"] = reason
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("outsource-rework", current.SourceID),
		TaskGroup:         workflowOutsourceReworkTaskGroup,
		TaskName:          "委外返工 / 补做处理",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "production",
		Priority:          3,
		Payload:           payload,
	}
}

type workflowOrderRelatedDocumentOptions struct {
	includeMaterialBOM bool
	includeArtwork     bool
}

func workflowOrderRelatedDocuments(current *WorkflowTask, options workflowOrderRelatedDocumentOptions) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 6)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		documents = append(documents, "客户/款式立项记录："+sourceNo)
	}
	if customerName := workflowPayloadString(current.Payload, "customer_name"); customerName != "" {
		documents = append(documents, "客户："+customerName)
	}
	if styleNo := workflowPayloadString(current.Payload, "style_no"); styleNo != "" {
		documents = append(documents, "款式："+styleNo)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if dueDate := workflowPayloadString(current.Payload, "due_date"); dueDate != "" {
		documents = append(documents, "交期："+dueDate)
	}
	if options.includeMaterialBOM {
		documents = append(documents, "材料 BOM：待工程资料补齐")
	}
	if options.includeArtwork {
		documents = append(documents, "款图/资料：随订单资料检查")
	}
	return documents
}

type workflowPurchaseInboundRelatedDocumentOptions struct {
	qcResult string
	reason   string
}

func workflowPurchaseInboundRelatedDocuments(current *WorkflowTask, options workflowPurchaseInboundRelatedDocumentOptions) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 8)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		documents = append(documents, "到货记录："+sourceNo)
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "采购记录："+sourceNo)
	}
	if supplierName := workflowPayloadString(current.Payload, "supplier_name"); supplierName != "" {
		documents = append(documents, "供应商："+supplierName)
	}
	if materialName := workflowPayloadString(current.Payload, "material_name"); materialName != "" {
		documents = append(documents, "物料："+materialName)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if quantity := workflowPayloadString(current.Payload, "quantity"); quantity != "" {
		documents = append(documents, "数量："+quantity+workflowPayloadString(current.Payload, "unit"))
	}
	if options.qcResult != "" {
		documents = append(documents, "IQC 结果："+options.qcResult)
	}
	if options.reason != "" {
		documents = append(documents, "不良原因："+options.reason)
	}
	return documents
}

type workflowOutsourceReturnRelatedDocumentOptions struct {
	qcResult string
	reason   string
}

func workflowOutsourceReturnCommonPayload(current *WorkflowTask) map[string]any {
	return map[string]any{
		"record_title":         workflowOutsourceReturnRecordTitle(current),
		"supplier_name":        workflowPayloadString(current.Payload, "supplier_name"),
		"material_name":        workflowPayloadString(current.Payload, "material_name"),
		"product_no":           workflowPayloadString(current.Payload, "product_no"),
		"product_name":         workflowPayloadString(current.Payload, "product_name"),
		"quantity":             workflowPayloadValue(current.Payload, "quantity"),
		"unit":                 workflowPayloadString(current.Payload, "unit"),
		"due_date":             workflowPayloadString(current.Payload, "due_date"),
		"expected_return_date": workflowPayloadString(current.Payload, "expected_return_date"),
		"outsource_processing": true,
		"qc_type":              "outsource_return",
	}
}

func workflowOutsourceReturnRelatedDocuments(current *WorkflowTask, options workflowOutsourceReturnRelatedDocumentOptions) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 9)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		if strings.TrimSpace(current.SourceType) == workflowProcessingContractsModuleKey {
			documents = append(documents, "加工合同："+sourceNo)
		} else {
			documents = append(documents, "回货记录："+sourceNo)
		}
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "委外单："+sourceNo)
	}
	if issueNo := workflowPayloadString(current.Payload, "issue_no"); issueNo != "" {
		documents = append(documents, "发料记录："+issueNo)
	}
	if supplierName := workflowPayloadString(current.Payload, "supplier_name"); supplierName != "" {
		documents = append(documents, "加工厂："+supplierName)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if materialName := workflowPayloadString(current.Payload, "material_name"); materialName != "" {
		documents = append(documents, "物料 / 成品："+materialName)
	}
	if quantity := workflowPayloadString(current.Payload, "quantity"); quantity != "" {
		documents = append(documents, "数量："+quantity+workflowPayloadString(current.Payload, "unit"))
	}
	if options.qcResult != "" {
		documents = append(documents, "回货检验结果："+options.qcResult)
	}
	if options.reason != "" {
		documents = append(documents, "不良原因："+options.reason)
	}
	return documents
}

func workflowTaskSourceNo(task *WorkflowTask) *string {
	if task == nil || task.SourceNo == nil {
		return nil
	}
	sourceNo := strings.TrimSpace(*task.SourceNo)
	if sourceNo == "" {
		return nil
	}
	return &sourceNo
}

func workflowSourceNoValue(task *WorkflowTask) string {
	if sourceNo := workflowTaskSourceNo(task); sourceNo != nil {
		return *sourceNo
	}
	return ""
}

func workflowOrderRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "客户/款式立项记录"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "style_no"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "客户/款式立项记录"
}

func workflowPurchaseInboundRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "采购到货 / 入库通知"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "material_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "采购到货 / 入库通知"
}

func workflowOutsourceReturnRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "委外回货检验"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "material_name"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "委外回货检验"
}

func workflowPayloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func workflowPayloadValue(payload map[string]any, key string) any {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return value
}

func mergeWorkflowPayload(base map[string]any, override map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range base {
		out[key] = value
	}
	for key, value := range override {
		out[key] = value
	}
	return out
}

func workflowTaskWithPayload(task *WorkflowTask, payload map[string]any) *WorkflowTask {
	if task == nil {
		return nil
	}
	next := *task
	next.Payload = payload
	return &next
}

func ensureWorkflowPayload(payload *map[string]any) {
	if payload == nil {
		return
	}
	if *payload == nil {
		*payload = map[string]any{}
	}
}

func workflowTaskCode(prefix string, sourceID int) string {
	return fmt.Sprintf("%s-%d-%d", prefix, sourceID, time.Now().UnixNano())
}

func resolveEngineeringDueAt(payload map[string]any, now time.Time) time.Time {
	defaultDueAt := now.Add(24 * time.Hour)
	orderDueAt, ok := parseBusinessDateEnd(payload)
	if !ok {
		return defaultDueAt
	}
	if !orderDueAt.After(now.Add(12 * time.Hour)) {
		return now.Add(4 * time.Hour)
	}
	if !orderDueAt.After(now.Add(48 * time.Hour)) {
		minDueAt := now.Add(4 * time.Hour)
		dueAt := orderDueAt.Add(-12 * time.Hour)
		if dueAt.Before(minDueAt) {
			return minDueAt
		}
		return dueAt
	}
	return defaultDueAt
}

func parseBusinessDateEnd(payload map[string]any) (time.Time, bool) {
	dueDate := workflowPayloadString(payload, "due_date")
	if dueDate == "" {
		return time.Time{}, false
	}
	day, err := time.ParseInLocation("2006-01-02", dueDate, time.Local)
	if err != nil {
		return time.Time{}, false
	}
	return time.Date(day.Year(), day.Month(), day.Day(), 23, 59, 59, 0, time.Local), true
}
