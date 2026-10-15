package biz

import (
	"errors"
	"strings"
)

var ErrSourceOrderNormalCloseIncomplete = errors.New("source order normal close requires complete fulfillment")

const (
	SourceOrderActionSubmit  = "submit"
	SourceOrderActionConfirm = "confirm"
	SourceOrderActionClose   = "close"
	SourceOrderActionCancel  = "cancel"

	// SourceOrderSettlementActionWorkflowReject is written by the approval
	// rejection command. It is not a client-callable lifecycle action.
	SourceOrderSettlementActionWorkflowReject = "workflow_reject"

	SourceOrderCloseModeNormal = "normal"
	SourceOrderCloseModeShort  = "short"
)

// SourceOrderLifecycleAction is the authenticated, replay-safe envelope used
// for high-risk source-order lifecycle mutations. ActorID is injected from the
// session; clients never choose it.
type SourceOrderLifecycleAction struct {
	ID              int
	ExpectedVersion int
	ActionKey       string
	IdempotencyKey  string
	IntentHash      string
	Reason          string
	CloseMode       string
	ActorID         int
}

func NormalizeSourceOrderLifecycleAction(in SourceOrderLifecycleAction, actionKey string) (SourceOrderLifecycleAction, error) {
	in.ActionKey = strings.TrimSpace(actionKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Reason = strings.TrimSpace(in.Reason)
	in.CloseMode = strings.ToLower(strings.TrimSpace(in.CloseMode))
	if in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || in.IdempotencyKey == "" ||
		len(in.IdempotencyKey) > 128 || len([]rune(in.Reason)) > 255 {
		return SourceOrderLifecycleAction{}, ErrBadParam
	}
	switch in.ActionKey {
	case SourceOrderActionSubmit, SourceOrderActionConfirm:
		if in.Reason != "" || in.CloseMode != "" {
			return SourceOrderLifecycleAction{}, ErrBadParam
		}
	case SourceOrderActionClose:
		if in.CloseMode != SourceOrderCloseModeNormal && in.CloseMode != SourceOrderCloseModeShort {
			return SourceOrderLifecycleAction{}, ErrBadParam
		}
		if in.CloseMode == SourceOrderCloseModeShort && in.Reason == "" {
			return SourceOrderLifecycleAction{}, ErrBadParam
		}
	case SourceOrderActionCancel:
		if in.Reason == "" || in.CloseMode != "" {
			return SourceOrderLifecycleAction{}, ErrBadParam
		}
	default:
		return SourceOrderLifecycleAction{}, ErrBadParam
	}
	hash, err := processCanonicalSHA256(map[string]any{
		"contract":         "source-order-lifecycle-action/v1",
		"source_id":        in.ID,
		"expected_version": in.ExpectedVersion,
		"action_key":       in.ActionKey,
		"idempotency_key":  in.IdempotencyKey,
		"reason":           in.Reason,
		"close_mode":       in.CloseMode,
		"actor_id":         in.ActorID,
	})
	if err != nil {
		return SourceOrderLifecycleAction{}, err
	}
	in.IntentHash = hash
	return in, nil
}
