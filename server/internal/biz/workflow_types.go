package biz

import (
	"context"
	"errors"
	"time"
)

var (
	ErrWorkflowTaskNotFound       = errors.New("workflow task not found")
	ErrWorkflowTaskExists         = errors.New("workflow task already exists")
	ErrWorkflowTaskSettled        = errors.New("workflow task already settled")
	ErrWorkflowTaskConflict       = errors.New("workflow task version conflict")
	ErrWorkflowTaskBoardStatus    = errors.New("workflow task board contains unsupported status")
	ErrWorkflowBusinessStateFound = errors.New("workflow business state already exists")
)

type WorkflowTask struct {
	ID                    int
	TaskCode              string
	TaskGroup             string
	TaskName              string
	SourceType            string
	SourceID              int
	SourceNo              *string
	BusinessStatusKey     *string
	TaskStatusKey         string
	OwnerRoleKey          string
	OwnerPoolKey          *string
	RequiredCapabilityKey *string
	ConfigRevision        *string
	ProcessInstanceID     *int
	ProcessNodeInstanceID *int
	AssigneeID            *int
	Priority              int16
	BlockedReason         *string
	CriticalPath          bool
	UrgeCount             int
	LastUrgedAt           *time.Time
	LastUrgedBy           *int
	LastUrgedByRoleKey    *string
	EscalatedAt           *time.Time
	EscalateTargetRoleKey *string
	DueAt                 *time.Time
	CompletedAt           *time.Time
	Payload               map[string]any
	Version               int
	CreatedBy             *int
	UpdatedBy             *int
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type WorkflowTaskFilter struct {
	Limit                int
	Offset               int
	Keyword              string
	OwnerRoleKey         string
	VisibleOwnerRoleKeys []string
	VisibleAssigneeID    *int
	VisibilityScope      *WorkflowTaskVisibilityScope
	TaskStatusKey        string
	TaskGroup            string
	SourceType           string
	SourceID             int
	DueFrom              *time.Time
	DueTo                *time.Time
}

type WorkflowTaskBoardQuery struct {
	Keyword              string
	Status               string
	OwnerRoleKey         string
	Due                  string
	SourceType           string
	LaneKey              string
	Limit                int
	Offset               int
	VisibleOwnerRoleKeys []string
	VisibleAssigneeID    *int
	VisibilityScope      *WorkflowTaskVisibilityScope
	SnapshotAt           time.Time
}

type WorkflowTaskBoardCounts struct {
	Actionable int
	Exception  int
	Due        int
	Finished   int
}

type WorkflowTaskBoardLane struct {
	Key    string
	Total  int
	Limit  int
	Offset int
	Tasks  []*WorkflowTask
}

type WorkflowTaskBoard struct {
	SnapshotAt  time.Time
	Total       int
	Counts      WorkflowTaskBoardCounts
	Lanes       []WorkflowTaskBoardLane
	SourceTypes []string
}

type WorkflowTaskCreate struct {
	TaskCode              string
	TaskGroup             string
	TaskName              string
	SourceType            string
	SourceID              int
	SourceNo              *string
	BusinessStatusKey     *string
	TaskStatusKey         string
	OwnerRoleKey          string
	OwnerPoolKey          *string
	RequiredCapabilityKey *string
	ConfigRevision        *string
	ProcessInstanceID     *int
	ProcessNodeInstanceID *int
	AssigneeID            *int
	Priority              int16
	BlockedReason         *string
	CriticalPath          bool
	DueAt                 *time.Time
	Payload               map[string]any
}

type WorkflowTaskStatusUpdate struct {
	ID                int
	ExpectedVersion   int
	CommandKey        string
	IdempotencyKey    string
	IntentHash        string
	TaskStatusKey     string
	BusinessStatusKey string
	Reason            string
	Payload           map[string]any
	SideEffects       *WorkflowTaskStatusSideEffects
	BreakGlass        *WorkflowTaskBreakGlassIntent
	AuditEvent        *RuntimeAuditEventCreate
}

type WorkflowTaskBreakGlassIntent struct {
	ActionKey string
	Reason    string
	ExpiresAt time.Time
}

type WorkflowTaskStatusSideEffects struct {
	BusinessState                     *WorkflowBusinessStateUpsert
	DerivedTask                       *WorkflowTaskCreate
	DerivedFromTaskID                 int
	WorkflowRuleKey                   string
	RefreshExistingDerivedTaskPayload bool
}

type WorkflowTaskUrge struct {
	ID              int
	ExpectedVersion int
	CommandKey      string
	IdempotencyKey  string
	IntentHash      string
	Action          string
	Reason          string
	Payload         map[string]any
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
	GetWorkflowTaskByTaskCode(ctx context.Context, taskCode string) (*WorkflowTask, error)
	ListWorkflowTasks(ctx context.Context, filter WorkflowTaskFilter) ([]*WorkflowTask, int, error)
	GetWorkflowTaskBoard(ctx context.Context, query WorkflowTaskBoardQuery) (*WorkflowTaskBoard, error)
	CreateWorkflowTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error)
	ResolveWorkflowTaskMutation(ctx context.Context, taskID int, idempotencyKey string, intentHash string, commandKey string, actorID int) (*WorkflowTask, bool, error)
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
