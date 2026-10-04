package logger

import (
	"context"
	"sync"
)

type requestObservationKey struct{}
type requestObservation struct {
	mu         sync.Mutex
	actorID    int
	taskID     int64
	objectKind string
	objectID   int
}

// These fields flow back to completion logging after authentication and DTO
// validation. They contain identities, never request or response payloads.
func SetRequestActor(ctx context.Context, actorID int) {
	if state, ok := ctx.Value(requestObservationKey{}).(*requestObservation); ok && actorID > 0 {
		state.mu.Lock()
		defer state.mu.Unlock()
		state.actorID = actorID
	}
}

func SetRequestObject(ctx context.Context, kind string, id int) {
	if state, ok := ctx.Value(requestObservationKey{}).(*requestObservation); ok && id > 0 {
		state.mu.Lock()
		defer state.mu.Unlock()
		state.objectKind, state.objectID = kind, id
	}
}

func RequestObservationFields(ctx context.Context) []any {
	state, ok := ctx.Value(requestObservationKey{}).(*requestObservation)
	if !ok {
		return nil
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	var fields []any
	if state.actorID > 0 {
		fields = append(fields, "actor_id", state.actorID)
	}
	if state.taskID > 0 {
		fields = append(fields, "task.id", state.taskID)
	}
	if state.objectID > 0 {
		fields = append(fields, "business_object_kind", state.objectKind, "business_object_id", state.objectID)
	}
	return fields
}
