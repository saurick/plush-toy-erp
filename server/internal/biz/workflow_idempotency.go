package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	workflowTaskIdempotencyKeyMaxLength  = 128
	workflowTaskCommandKeyMaxLength      = 128
	workflowTaskMutationIntentContractV1 = "workflow.task-mutation/v1"
)

var workflowTaskIntentTopLevelIgnoredKeys = map[string]struct{}{
	"blocked_reason":                {},
	"desktop_task_board_action":     {},
	"entry":                         {},
	"entry_path":                    {},
	"mobile_action_key":             {},
	"mobile_action_recorded_at":     {},
	"mobile_action_role_key":        {},
	"mobile_role_key":               {},
	"outsourcing_order_page_action": {},
	"purchase_order_page_action":    {},
	"rejected_reason":               {},
	"surface_key":                   {},
	"workflow_page_action":          {},
	"workflow_page_scope":           {},
}

var workflowTaskIntentMobileDuplicateKeys = map[string]struct{}{
	"action_key":   {},
	"action_label": {},
	"reason":       {},
	"recorded_at":  {},
	"reported_at":  {},
	"role_key":     {},
}

type workflowTaskMutationIntent struct {
	Contract     string                        `json:"contract"`
	CommandKey   string                        `json:"command_key"`
	TaskID       int                           `json:"task_id"`
	ActorID      int                           `json:"actor_id"`
	TargetStatus string                        `json:"target_status,omitempty"`
	UrgeAction   string                        `json:"urge_action,omitempty"`
	Reason       string                        `json:"reason"`
	PayloadPatch map[string]any                `json:"payload_patch"`
	BreakGlass   *workflowTaskBreakGlassDigest `json:"break_glass,omitempty"`
}

type workflowTaskBreakGlassDigest struct {
	ActionKey string `json:"action_key"`
	Reason    string `json:"reason"`
	ExpiresAt string `json:"expires_at"`
}

func (uc *WorkflowUsecase) ResolveTaskStatusMutationReplay(
	ctx context.Context,
	in *WorkflowTaskStatusUpdate,
	actorID int,
) (*WorkflowTask, bool, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, false, ErrBadParam
	}
	if err := prepareWorkflowTaskStatusMutation(in, actorID); err != nil {
		return nil, false, err
	}
	return uc.repo.ResolveWorkflowTaskMutation(ctx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID)
}

func (uc *WorkflowUsecase) ResolveTaskUrgeMutationReplay(
	ctx context.Context,
	in *WorkflowTaskUrge,
	actorID int,
) (*WorkflowTask, bool, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, false, ErrBadParam
	}
	if err := prepareWorkflowTaskUrgeMutation(in, actorID); err != nil {
		return nil, false, err
	}
	return uc.repo.ResolveWorkflowTaskMutation(ctx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID)
}

func prepareWorkflowTaskStatusMutation(in *WorkflowTaskStatusUpdate, actorID int) error {
	if in == nil {
		return ErrBadParam
	}
	in.CommandKey = strings.TrimSpace(in.CommandKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.BusinessStatusKey = strings.TrimSpace(in.BusinessStatusKey)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	if in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 || in.IdempotencyKey == "" ||
		!IsKnownWorkflowTaskState(in.TaskStatusKey) || in.CommandKey == "" ||
		utf8.RuneCountInString(in.CommandKey) > workflowTaskCommandKeyMaxLength ||
		utf8.RuneCountInString(in.IdempotencyKey) > workflowTaskIdempotencyKeyMaxLength {
		return ErrBadParam
	}
	if in.BusinessStatusKey != "" && !IsValidWorkflowBusinessState(in.BusinessStatusKey) {
		return ErrBadParam
	}
	if in.TaskStatusKey == "ready" || in.TaskStatusKey == "blocked" || in.TaskStatusKey == "rejected" {
		in.Reason = workflowTransitionReason(in, in.TaskStatusKey)
		if in.Reason == "" {
			return ErrBadParam
		}
	}
	if in.BreakGlass != nil {
		in.BreakGlass.ActionKey = strings.TrimSpace(in.BreakGlass.ActionKey)
		in.BreakGlass.Reason = strings.TrimSpace(in.BreakGlass.Reason)
		if in.BreakGlass.ActionKey == "" || in.BreakGlass.Reason == "" || in.BreakGlass.ExpiresAt.IsZero() {
			return ErrBadParam
		}
	}
	semanticPayload, err := workflowTaskSemanticPayload(in.Payload)
	if err != nil {
		return err
	}
	hash, err := workflowTaskIntentHash(workflowTaskMutationIntent{
		Contract:     workflowTaskMutationIntentContractV1,
		CommandKey:   in.CommandKey,
		TaskID:       in.ID,
		ActorID:      actorID,
		TargetStatus: in.TaskStatusKey,
		Reason:       in.Reason,
		PayloadPatch: semanticPayload,
		BreakGlass:   workflowTaskBreakGlassIntentDigest(in.BreakGlass),
	})
	if err != nil {
		return err
	}
	in.IntentHash = hash
	return nil
}

func prepareWorkflowTaskUrgeMutation(in *WorkflowTaskUrge, actorID int) error {
	if in == nil {
		return ErrBadParam
	}
	in.CommandKey = strings.TrimSpace(in.CommandKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Action = strings.TrimSpace(in.Action)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	if in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 || in.IdempotencyKey == "" ||
		!IsValidWorkflowTaskUrgeAction(in.Action) || in.Reason == "" || in.CommandKey == "" ||
		utf8.RuneCountInString(in.CommandKey) > workflowTaskCommandKeyMaxLength ||
		utf8.RuneCountInString(in.IdempotencyKey) > workflowTaskIdempotencyKeyMaxLength {
		return ErrBadParam
	}
	semanticPayload, err := workflowTaskSemanticPayload(in.Payload)
	if err != nil {
		return err
	}
	hash, err := workflowTaskIntentHash(workflowTaskMutationIntent{
		Contract:     workflowTaskMutationIntentContractV1,
		CommandKey:   in.CommandKey,
		TaskID:       in.ID,
		ActorID:      actorID,
		UrgeAction:   in.Action,
		Reason:       in.Reason,
		PayloadPatch: semanticPayload,
	})
	if err != nil {
		return err
	}
	in.IntentHash = hash
	return nil
}

func workflowTaskBreakGlassIntentDigest(in *WorkflowTaskBreakGlassIntent) *workflowTaskBreakGlassDigest {
	if in == nil {
		return nil
	}
	return &workflowTaskBreakGlassDigest{
		ActionKey: strings.TrimSpace(in.ActionKey),
		Reason:    strings.TrimSpace(in.Reason),
		ExpiresAt: in.ExpiresAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func workflowTaskIntentHash(intent workflowTaskMutationIntent) (string, error) {
	encoded, err := json.Marshal(intent)
	if err != nil {
		return "", ErrBadParam
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}

func workflowTaskSemanticPayload(payload map[string]any) (map[string]any, error) {
	if payload == nil {
		return map[string]any{}, nil
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, ErrBadParam
	}
	var generic map[string]any
	if err := json.Unmarshal(encoded, &generic); err != nil {
		return nil, ErrBadParam
	}
	return workflowTaskSemanticMap(generic, ""), nil
}

func workflowTaskSemanticMap(input map[string]any, parentKey string) map[string]any {
	out := make(map[string]any, len(input))
	for rawKey, rawValue := range input {
		if workflowTaskIntentKeyIgnored(parentKey, rawKey) {
			continue
		}
		semanticValue := workflowTaskSemanticValue(rawValue, rawKey)
		if workflowTaskIntentValueEmpty(rawKey, semanticValue) {
			continue
		}
		out[rawKey] = semanticValue
	}
	return out
}

func workflowTaskSemanticValue(value any, key string) any {
	switch typed := value.(type) {
	case map[string]any:
		return workflowTaskSemanticMap(typed, key)
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, workflowTaskSemanticValue(item, key))
		}
		if workflowTaskEvidenceRefsKey(key) {
			return workflowTaskSortedUniqueStrings(items)
		}
		return items
	case string:
		if key == "feedback" {
			return strings.TrimSpace(typed)
		}
		return typed
	default:
		return typed
	}
}

func workflowTaskIntentValueEmpty(key string, value any) bool {
	switch {
	case key == "feedback":
		text, ok := value.(string)
		return ok && text == ""
	case workflowTaskEvidenceRefsKey(key):
		items, ok := value.([]any)
		return ok && len(items) == 0
	default:
		return false
	}
}

func workflowTaskIntentKeyIgnored(parentKey string, key string) bool {
	if parentKey == "" {
		_, ignored := workflowTaskIntentTopLevelIgnoredKeys[key]
		return ignored
	}
	if parentKey == "mobile_action" || parentKey == "mobile_exception_report" {
		_, ignored := workflowTaskIntentMobileDuplicateKeys[key]
		return ignored
	}
	return false
}

func workflowTaskEvidenceRefsKey(key string) bool {
	return key == "evidence_refs" || key == "mobile_action_evidence_refs"
}

func workflowTaskSortedUniqueStrings(items []any) []any {
	values := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		value, ok := item.(string)
		if !ok {
			return items
		}
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	sort.Strings(values)
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, value)
	}
	return out
}
