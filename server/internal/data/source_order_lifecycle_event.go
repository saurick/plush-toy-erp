package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/sourceorderlifecycleevent"

	"github.com/shopspring/decimal"
)

const sourceOrderLifecycleResultContract = "source-order-lifecycle-result/v1"

func resolveSourceOrderLifecycleActionReplay(
	ctx context.Context,
	client *ent.Client,
	sourceType string,
	in *biz.SourceOrderLifecycleAction,
) (bool, error) {
	if client == nil || in == nil {
		return false, biz.ErrBadParam
	}
	event, err := client.SourceOrderLifecycleEvent.Query().Where(
		sourceorderlifecycleevent.SourceType(sourceType),
		sourceorderlifecycleevent.SourceID(in.ID),
		sourceorderlifecycleevent.IdempotencyKey(in.IdempotencyKey),
	).Only(ctx)
	if ent.IsNotFound(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if event.IntentHash != in.IntentHash || event.ActionKey != in.ActionKey || event.SourceVersion != in.ExpectedVersion+1 ||
		event.ActorID != in.ActorID || optionalStringValue(event.Reason) != in.Reason || optionalStringValue(event.CloseMode) != in.CloseMode {
		return false, biz.ErrIdempotencyConflict
	}
	return true, nil
}

func createSourceOrderLifecycleActionReceipt(
	ctx context.Context,
	client *ent.Client,
	sourceType string,
	fromStatus string,
	toStatus string,
	in *biz.SourceOrderLifecycleAction,
	lineResults []map[string]any,
) error {
	if client == nil || in == nil {
		return biz.ErrBadParam
	}
	if lineResults == nil {
		lineResults = []map[string]any{}
	}
	builder := client.SourceOrderLifecycleEvent.Create().
		SetSourceType(sourceType).
		SetSourceID(in.ID).
		SetSourceVersion(in.ExpectedVersion + 1).
		SetActionKey(in.ActionKey).
		SetFromStatus(fromStatus).
		SetToStatus(toStatus).
		SetIdempotencyKey(in.IdempotencyKey).
		SetIntentHash(in.IntentHash).
		SetResultContract(sourceOrderLifecycleResultContract).
		SetMutationResult(map[string]any{
			"source_type":    sourceType,
			"source_id":      in.ID,
			"source_version": in.ExpectedVersion + 1,
			"action_key":     in.ActionKey,
			"from_status":    fromStatus,
			"to_status":      toStatus,
			"close_mode":     in.CloseMode,
			"lines":          lineResults,
		}).
		SetActorID(in.ActorID)
	if in.Reason != "" {
		builder.SetReason(in.Reason)
	}
	if in.CloseMode != "" {
		builder.SetCloseMode(in.CloseMode)
	}
	_, err := builder.Save(ctx)
	if ent.IsConstraintError(err) {
		return biz.ErrIdempotencyConflict
	}
	return err
}

func sourceOrderLineLifecycleResult(
	lineID int,
	planned decimal.Decimal,
	fulfilled decimal.Decimal,
	terminalStatus string,
) map[string]any {
	remaining := planned.Sub(fulfilled)
	if remaining.IsNegative() {
		remaining = decimal.Zero
	}
	return map[string]any{
		"line_id":            lineID,
		"planned_quantity":   planned.String(),
		"fulfilled_quantity": fulfilled.String(),
		"remaining_quantity": remaining.String(),
		"terminal_status":    terminalStatus,
	}
}

func optionalStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
