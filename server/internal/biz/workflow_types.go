package biz

import (
	"context"
	"errors"
	"time"
)

var (
	ErrWorkflowTaskNotFound       = errors.New("workflow task not found")
	ErrWorkflowTaskExists         = errors.New("workflow task already exists")
	ErrWorkflowBusinessStateFound = errors.New("workflow business state already exists")
)

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
	TaskGroup     string
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
	BusinessState                     *WorkflowBusinessStateUpsert
	DerivedTask                       *WorkflowTaskCreate
	DerivedFromTaskID                 int
	WorkflowRuleKey                   string
	RefreshExistingDerivedTaskPayload bool
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
