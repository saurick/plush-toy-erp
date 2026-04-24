package biz

import (
	"context"
	"errors"
	"strings"
	"time"
)

var (
	ErrWorkflowTaskNotFound       = errors.New("workflow task not found")
	ErrWorkflowTaskExists         = errors.New("workflow task already exists")
	ErrWorkflowBusinessStateFound = errors.New("workflow business state already exists")
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
	{Key: "warehouse_processing", Label: "待入库 / 待出货", Summary: "仓库正在做回仓、入库、备货和待出货准备。"},
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
	workflowTaskStateSet     = buildWorkflowStateSet(workflowTaskStates)
	workflowBusinessStateSet = buildWorkflowStateSet(workflowBusinessStates)
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
	ListWorkflowTasks(ctx context.Context, filter WorkflowTaskFilter) ([]*WorkflowTask, int, error)
	CreateWorkflowTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error)
	UpdateWorkflowTaskStatus(ctx context.Context, in *WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*WorkflowTask, error)
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
	return uc.repo.UpdateWorkflowTaskStatus(ctx, in, actorID, strings.TrimSpace(actorRoleKey))
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
	filter.OwnerRoleKey = strings.TrimSpace(filter.OwnerRoleKey)
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
	in.OwnerRoleKey = strings.TrimSpace(in.OwnerRoleKey)
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
	filter.OwnerRoleKey = strings.TrimSpace(filter.OwnerRoleKey)
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
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	if in.SourceType == "" || in.SourceID <= 0 || !IsValidWorkflowBusinessState(in.BusinessStatusKey) {
		return WorkflowBusinessStateUpsert{}, ErrBadParam
	}
	return in, nil
}
