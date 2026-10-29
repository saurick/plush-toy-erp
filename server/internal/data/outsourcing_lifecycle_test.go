package data

import (
	"context"
	"fmt"

	"server/internal/biz"
)

// Dependency tests deliberately close short: full quantity settlement is
// exercised separately by normal-close tests.
func outsourcingLifecycleForTest(id, version int, action string) *biz.SourceOrderLifecycleAction {
	in := &biz.SourceOrderLifecycleAction{ID: id, ExpectedVersion: version, ActorID: 1, IdempotencyKey: fmt.Sprintf("test-lifecycle-%d-%d-%s", id, version, action)}
	if action == biz.SourceOrderActionClose {
		in.CloseMode = biz.SourceOrderCloseModeShort
		in.Reason = "结束剩余委外数量"
	}
	if action == biz.SourceOrderActionCancel {
		in.Reason = "取消未执行合同"
	}
	return in
}
func applyOutsourcingLifecycleForTest(ctx context.Context, repo *outsourcingOrderRepo, id int, status string) (*biz.OutsourcingOrder, error) {
	row, err := repo.GetOutsourcingOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	action := map[string]string{biz.OutsourcingOrderStatusSubmitted: biz.SourceOrderActionSubmit, biz.OutsourcingOrderStatusConfirmed: biz.SourceOrderActionConfirm, biz.OutsourcingOrderStatusClosed: biz.SourceOrderActionClose, biz.OutsourcingOrderStatusCanceled: biz.SourceOrderActionCancel}[status]
	normalized, err := biz.NormalizeSourceOrderLifecycleAction(*outsourcingLifecycleForTest(id, row.Version, action), action)
	if err != nil {
		return nil, err
	}
	return repo.ApplyOutsourcingOrderLifecycleAction(ctx, &normalized, status)
}
func applyOutsourcingLifecycleUsecaseForTest(ctx context.Context, uc *biz.OutsourcingOrderUsecase, id int, action string) (*biz.OutsourcingOrder, error) {
	row, err := uc.GetOutsourcingOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	in := outsourcingLifecycleForTest(id, row.Version, action)
	switch action {
	case biz.SourceOrderActionSubmit:
		return uc.SubmitOutsourcingOrderWithAction(ctx, in)
	case biz.SourceOrderActionConfirm:
		return uc.ConfirmOutsourcingOrderWithAction(ctx, in)
	case biz.SourceOrderActionClose:
		return uc.CloseOutsourcingOrderWithAction(ctx, in)
	default:
		return uc.CancelOutsourcingOrderWithAction(ctx, in)
	}
}
