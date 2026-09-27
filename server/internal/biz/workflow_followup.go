package biz

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const WorkflowFollowupTaskGroup = "business_followup"

type WorkflowFollowupSourceSpec struct {
	Type, Label, ModuleKey string
	ReadPermissions        []string
	States                 []string
}

func WorkflowFollowupSourceSpecFor(sourceType string) (WorkflowFollowupSourceSpec, bool) {
	specs := []WorkflowFollowupSourceSpec{
		{"sales_order", "销售订单", "sales_orders", []string{PermissionSalesOrderRead}, []string{"draft", "submitted", "active"}},
		{"purchase_order", "采购订单", "purchase_orders", []string{PermissionPurchaseOrderRead}, []string{"draft", "submitted", "approved"}},
		{"outsourcing_order", "加工合同", "outsourcing_orders", []string{PermissionOutsourcingOrderRead}, []string{"draft", "submitted", "confirmed"}},
		{"production_order", "生产订单", "production_orders", []string{PermissionPMCPlanRead, PermissionProductionWIPRead}, []string{"DRAFT", "RELEASED"}},
		{"shipment", "出货单", "shipments", []string{PermissionShipmentRead}, []string{"DRAFT"}},
	}
	for _, spec := range specs {
		if spec.Type == sourceType {
			return spec, true
		}
	}
	return WorkflowFollowupSourceSpec{}, false
}

func (spec WorkflowFollowupSourceSpec) CanCreate(status string) bool {
	for _, value := range spec.States {
		if value == status {
			return true
		}
	}
	return false
}

type WorkflowFollowupSource struct {
	ID               int
	Type, No, Status string
}

type WorkflowFollowupSourceReader interface {
	GetWorkflowFollowupSource(context.Context, string, int) (*WorkflowFollowupSource, error)
	ResolveWorkflowFollowupCreate(context.Context, int, string, string) (*WorkflowTask, bool, error)
}

type WorkflowFollowupCreate struct {
	SourceType                          string
	SourceID                            int
	TaskName, Description, OwnerRoleKey string
	AssigneeID                          *int
	DueAt                               time.Time
	Priority                            int16
	IdempotencyKey                      string
}

func (uc *WorkflowUsecase) GetFollowupSource(ctx context.Context, sourceType string, sourceID int) (*WorkflowFollowupSource, error) {
	if _, ok := WorkflowFollowupSourceSpecFor(sourceType); !ok || sourceID <= 0 {
		return nil, ErrBadParam
	}
	reader, ok := uc.repo.(WorkflowFollowupSourceReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.GetWorkflowFollowupSource(ctx, sourceType, sourceID)
}

// Follow-up tasks cannot carry client-supplied workflow identities, runtime
// anchors or domain payloads. The source number is read inside the write transaction.
func PrepareWorkflowFollowupCreate(in WorkflowFollowupCreate, actorID int) (*WorkflowTaskCreate, error) {
	in.TaskName = strings.TrimSpace(in.TaskName)
	in.Description = strings.TrimSpace(in.Description)
	in.OwnerRoleKey = NormalizeRoleKey(in.OwnerRoleKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if _, ok := WorkflowFollowupSourceSpecFor(in.SourceType); !ok || in.SourceID <= 0 || actorID <= 0 ||
		in.TaskName == "" || utf8.RuneCountInString(in.TaskName) > WorkflowTaskNameMaxLength ||
		in.Description == "" || utf8.RuneCountInString(in.Description) > 2000 || in.OwnerRoleKey == "" ||
		in.IdempotencyKey == "" || in.DueAt.IsZero() || (in.Priority != 0 && in.Priority != 10) ||
		(in.AssigneeID != nil && *in.AssigneeID <= 0) {
		return nil, ErrBadParam
	}
	digest := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", actorID, in.IdempotencyKey)))
	task := WorkflowTaskCreate{
		IdempotencyKey: in.IdempotencyKey, TaskCode: fmt.Sprintf("FOLLOWUP-%x", digest[:20]),
		TaskGroup: WorkflowFollowupTaskGroup, TaskName: in.TaskName,
		SourceType: in.SourceType, SourceID: in.SourceID, TaskStatusKey: "ready",
		OwnerRoleKey: in.OwnerRoleKey, AssigneeID: in.AssigneeID,
		DueAt: &in.DueAt, Priority: in.Priority,
		Payload: map[string]any{"description": in.Description},
	}
	normalized, err := normalizeWorkflowTaskCreate(task)
	if err != nil {
		return nil, err
	}
	if err := prepareWorkflowTaskCreateIdempotency(&normalized, actorID); err != nil {
		return nil, err
	}
	return &normalized, nil
}

func (uc *WorkflowUsecase) ResolveFollowupCreate(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, bool, error) {
	reader, ok := uc.repo.(WorkflowFollowupSourceReader)
	if !ok || in == nil || in.TaskGroup != WorkflowFollowupTaskGroup {
		return nil, false, ErrBadParam
	}
	return reader.ResolveWorkflowFollowupCreate(ctx, actorID, in.IdempotencyKey, in.IntentHash)
}

func IsWorkflowFollowupCreator(task *WorkflowTask, actorID int) bool {
	return task != nil && task.TaskGroup == WorkflowFollowupTaskGroup && actorID > 0 &&
		task.CreatedBy != nil && *task.CreatedBy == actorID && task.ConfigRevision == nil &&
		task.ProcessInstanceID == nil && task.ProcessNodeInstanceID == nil
}
