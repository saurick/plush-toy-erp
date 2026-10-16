package biz

import (
	"context"
	"strings"
	"time"
)

// Tracking is a read projection of existing processes and standalone tasks.
// Participation grants this summary only; it never grants task mutation access.
type WorkflowTrackingQuery struct {
	ActorID         int
	Scope           string
	Keyword         string
	Status          string
	OwnerRoleKey    string
	Attention       string
	SourceType      string
	SourceID        int
	DateFrom        *time.Time
	DateTo          *time.Time
	SnapshotAt      time.Time
	Limit           int
	Offset          int
	VisibilityScope *WorkflowTaskVisibilityScope
}

type WorkflowTrackingRef struct {
	Kind string
	ID   int
}

type WorkflowTrackingEntry struct {
	Ref             WorkflowTrackingRef
	Instance        *ProcessInstance
	Task            *WorkflowTask
	Nodes           []*ProcessNodeInstance
	Tasks           []*WorkflowTask
	Events          []*WorkflowTaskEvent
	EventsTruncated bool
	People          map[int]string
	InitiatorRoleKey string
	DisplayContext  *WorkflowTaskDisplayContext
}

func (e *WorkflowTrackingEntry) StartedAt() time.Time {
	if e.Instance != nil {
		return e.Instance.StartedAt
	}
	return e.Task.CreatedAt
}

type WorkflowTrackingPage struct {
	Items []*WorkflowTrackingEntry
	Total int
}

type WorkflowTrackingReader interface {
	ListWorkflowTracking(context.Context, WorkflowTrackingQuery) (*WorkflowTrackingPage, error)
	GetWorkflowTracking(context.Context, WorkflowTrackingQuery, WorkflowTrackingRef, int) (*WorkflowTrackingEntry, error)
}

func normalizeWorkflowTrackingQuery(q WorkflowTrackingQuery) (WorkflowTrackingQuery, error) {
	q.Keyword = strings.TrimSpace(q.Keyword)
	q.SourceType = strings.TrimSpace(q.SourceType)
	q.Status = strings.TrimSpace(q.Status)
	q.OwnerRoleKey = NormalizeRoleKey(q.OwnerRoleKey)
	q.Attention = strings.TrimSpace(q.Attention)
	if q.ActorID <= 0 || q.VisibilityScope == nil ||
		(q.Scope != "started" && q.Scope != "participated" && q.Scope != "visible") ||
		len([]rune(q.Keyword)) > 128 ||
		(q.SourceID > 0 && q.SourceType == "") || q.SourceID < 0 || len(q.SourceType) > 64 ||
		(q.Status != "" && q.Status != "active" && q.Status != "completed") ||
		(q.OwnerRoleKey != "" && !isWorkflowTaskBoardOwnerRoleKey(q.OwnerRoleKey)) ||
		(q.Attention != "" && q.Attention != "overdue" && q.Attention != "blocked") ||
		q.Limit < 1 || q.Limit > 50 || q.Offset < 0 {
		return q, ErrBadParam
	}
	if q.DateFrom != nil && q.DateFrom.IsZero() || q.DateTo != nil && q.DateTo.IsZero() ||
		q.DateFrom != nil && q.DateTo != nil && q.DateFrom.After(*q.DateTo) {
		return q, ErrBadParam
	}
	if q.SnapshotAt.IsZero() {
		q.SnapshotAt = time.Now().UTC()
	}
	return q, nil
}

func (uc *WorkflowUsecase) ListTracking(ctx context.Context, q WorkflowTrackingQuery) (*WorkflowTrackingPage, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	q, err := normalizeWorkflowTrackingQuery(q)
	if err != nil {
		return nil, err
	}
	reader, ok := uc.repo.(WorkflowTrackingReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.ListWorkflowTracking(ctx, q)
}

func (uc *WorkflowUsecase) GetTracking(ctx context.Context, q WorkflowTrackingQuery, ref WorkflowTrackingRef, beforeEventID int) (*WorkflowTrackingEntry, error) {
	if uc == nil || ref.ID <= 0 || (ref.Kind != "process" && ref.Kind != "task") || beforeEventID < 0 {
		return nil, ErrBadParam
	}
	q.Scope, q.Limit = "visible", 20
	q, err := normalizeWorkflowTrackingQuery(q)
	if err != nil {
		return nil, err
	}
	reader, ok := uc.repo.(WorkflowTrackingReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.GetWorkflowTracking(ctx, q, ref, beforeEventID)
}
