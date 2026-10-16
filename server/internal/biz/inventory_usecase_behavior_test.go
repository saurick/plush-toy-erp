package biz

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

type inventoryBehaviorRepo struct {
	InventoryRepo
	txns    []InventoryTxnCreate
	actions []InventoryLotStatusAction
	result  *InventoryTxnApplyResult
	err     error
}

func (r *inventoryBehaviorRepo) ApplyInventoryTxnAndUpdateBalance(_ context.Context, in *InventoryTxnCreate) (*InventoryTxnApplyResult, error) {
	r.txns = append(r.txns, *in)
	return r.result, r.err
}

func (r *inventoryBehaviorRepo) ApplyInventoryLotStatusAction(_ context.Context, in *InventoryLotStatusAction) (*InventoryLot, error) {
	r.actions = append(r.actions, *in)
	if r.err != nil {
		return nil, r.err
	}
	return &InventoryLot{ID: in.LotID, Status: in.TargetStatus, Version: in.ExpectedVersion + 1}, nil
}

func inventoryBehaviorTxn() InventoryTxnCreate {
	return InventoryTxnCreate{
		SubjectType: " material ", SubjectID: 7, WarehouseID: 3, UnitID: 2,
		TxnType: " out ", Direction: -1, Quantity: decimal.RequireFromString("0.000001"),
		SourceType: " production_issue ", IdempotencyKey: " issue-line-7 ",
		OccurredAt: time.Date(2026, 10, 1, 12, 0, 0, 123456789, time.FixedZone("source", 8*3600)),
	}
}

func TestInventoryUsecaseTransactionRejectsInvalidIntentBeforeWriting(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*InventoryTxnCreate)
	}{
		{"missing subject", func(in *InventoryTxnCreate) { in.SubjectID = 0 }},
		{"unknown subject", func(in *InventoryTxnCreate) { in.SubjectType = "OTHER" }},
		{"missing warehouse", func(in *InventoryTxnCreate) { in.WarehouseID = 0 }},
		{"missing unit", func(in *InventoryTxnCreate) { in.UnitID = 0 }},
		{"zero quantity", func(in *InventoryTxnCreate) { in.Quantity = decimal.Zero }},
		{"negative quantity", func(in *InventoryTxnCreate) { in.Quantity = decimal.NewFromInt(-1) }},
		{"missing source", func(in *InventoryTxnCreate) { in.SourceType = " " }},
		{"missing retry identity", func(in *InventoryTxnCreate) { in.IdempotencyKey = " " }},
		{"unknown movement", func(in *InventoryTxnCreate) { in.TxnType = "DELETE" }},
		{"outbound with inbound direction", func(in *InventoryTxnCreate) { in.Direction = 1 }},
		{"invalid direction", func(in *InventoryTxnCreate) { in.Direction = 0 }},
		{"reversal without original", func(in *InventoryTxnCreate) { in.TxnType = InventoryTxnReversal }},
		{"material with product SKU", func(in *InventoryTxnCreate) { id := 4; in.ProductSkuID = &id }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &inventoryBehaviorRepo{}
			in := inventoryBehaviorTxn()
			tc.edit(&in)
			got, err := NewInventoryUsecase(repo).ApplyInventoryTxnAndUpdateBalance(context.Background(), &in)
			if got != nil || !errors.Is(err, ErrBadParam) || len(repo.txns) != 0 {
				t.Fatalf("invalid movement reached storage: result=%v err=%v calls=%d", got, err, len(repo.txns))
			}
		})
	}
}

func TestInventoryUsecaseTransactionPreservesPrecisionRetryAndRepositoryFailure(t *testing.T) {
	in := inventoryBehaviorTxn()
	before := in
	repo := &inventoryBehaviorRepo{err: ErrInventoryInsufficientStock}
	uc := NewInventoryUsecase(repo)
	scope := WarehouseDataScope{Mode: DataScopeModeAssigned, WarehouseIDs: []int{3}}
	if got, err := uc.ApplyInventoryTxnAndUpdateBalanceForAccess(context.Background(), &in, scope); got != nil || !errors.Is(err, ErrInventoryInsufficientStock) {
		t.Fatalf("stock failure must remain visible: result=%v err=%v", got, err)
	}
	repo.err = nil
	repo.result = &InventoryTxnApplyResult{Txn: &InventoryTxn{ID: 11}, Balance: &InventoryBalance{Quantity: decimal.RequireFromString("9.999999")}, IdempotentReplay: true}
	got, err := uc.ApplyInventoryTxnAndUpdateBalanceForAccess(context.Background(), &in, scope)
	if err != nil || got != repo.result || !got.IdempotentReplay || len(repo.txns) != 2 {
		t.Fatalf("retry must preserve repository receipt: result=%v err=%v calls=%d", got, err, len(repo.txns))
	}
	first, second := repo.txns[0], repo.txns[1]
	if first.SubjectType != InventorySubjectMaterial || first.SourceType != "PRODUCTION_ISSUE" || first.TxnType != InventoryTxnOut || first.IdempotencyKey != "issue-line-7" || !first.Quantity.Equal(decimal.RequireFromString("0.000001")) {
		t.Fatalf("movement normalization lost intent: %#v", first)
	}
	wantTime := time.Date(2026, 10, 1, 4, 0, 0, 123456000, time.UTC)
	if !first.OccurredAt.Equal(wantTime) || !first.OccurredAtSpecified || !reflect.DeepEqual(first, second) || !reflect.DeepEqual(in, before) {
		t.Fatalf("retry or caller input changed: first=%#v second=%#v input=%#v", first, second, in)
	}
}

func TestInventoryUsecaseWarehouseScopeRejectsWritesBeforeRepository(t *testing.T) {
	for _, scope := range []WarehouseDataScope{
		{}, {Mode: DataScopeModeNone}, {Mode: DataScopeModeAssigned},
		{Mode: DataScopeModeAssigned, WarehouseIDs: []int{8}},
	} {
		repo := &inventoryBehaviorRepo{}
		in := inventoryBehaviorTxn()
		_, err := NewInventoryUsecase(repo).ApplyInventoryTxnAndUpdateBalanceForAccess(context.Background(), &in, scope)
		if !errors.Is(err, ErrDataScopeForbidden) || len(repo.txns) != 0 {
			t.Fatalf("scope %#v allowed a movement: err=%v calls=%d", scope, err, len(repo.txns))
		}
	}
}

func TestInventoryUsecaseScopedListsRequireScopedRepository(t *testing.T) {
	uc := NewInventoryUsecase(&inventoryBehaviorRepo{})
	scope := WarehouseDataScope{Mode: DataScopeModeAll}
	_, _, balancesErr := uc.ListInventoryBalancesForAccess(context.Background(), InventoryBalanceFilter{}, scope)
	_, _, lotsErr := uc.ListInventoryLotsForAccess(context.Background(), InventoryLotFilter{}, scope)
	_, _, txnsErr := uc.ListInventoryTxnsForAccess(context.Background(), InventoryTxnFilter{}, scope)
	for name, err := range map[string]error{"balances": balancesErr, "lots": lotsErr, "transactions": txnsErr} {
		if !errors.Is(err, ErrDataScopeForbidden) {
			t.Fatalf("%s must not fall back to unrestricted reads: %v", name, err)
		}
	}
}

func TestInventoryUsecaseNamedLotActionsBindTheirIntentAndSafeRetry(t *testing.T) {
	for _, tc := range []struct {
		name, action, status string
		call                 func(*InventoryUsecase, context.Context, *InventoryLotStatusAction) (*InventoryLot, error)
	}{
		{"hold", InventoryLotActionHold, InventoryLotHold, (*InventoryUsecase).HoldInventoryLot},
		{"reject", InventoryLotActionRejectFromQuality, InventoryLotRejected, (*InventoryUsecase).RejectInventoryLotFromQuality},
		{"reinspect", InventoryLotActionReleaseReinspect, InventoryLotActive, (*InventoryUsecase).ReleaseInventoryLotAfterReinspection},
		{"concession", InventoryLotActionApproveConcession, InventoryLotActive, (*InventoryUsecase).ApproveInventoryLotConcession},
		{"close", InventoryLotActionCloseZeroBalance, InventoryLotDisabled, (*InventoryUsecase).CloseZeroBalanceInventoryLot},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &inventoryBehaviorRepo{err: ErrInventoryLotConflict}
			uc := NewInventoryUsecase(repo)
			in := InventoryLotStatusAction{LotID: 9, ExpectedVersion: 3, ActorID: 7, QualityInspectionID: 12, Reason: "  核对处理原因  ", IdempotencyKey: " lot-action-9 ", ActionKey: "untrusted", TargetStatus: "untrusted", IntentHash: "untrusted"}
			if _, err := tc.call(uc, context.Background(), &in); !errors.Is(err, ErrInventoryLotConflict) {
				t.Fatalf("version conflict must remain visible: %v", err)
			}
			repo.err = nil
			got, err := tc.call(uc, context.Background(), &in)
			if err != nil || got.Status != tc.status || got.Version != 4 || len(repo.actions) != 2 {
				t.Fatalf("retry result=%#v err=%v calls=%d", got, err, len(repo.actions))
			}
			first := repo.actions[0]
			if first.ActionKey != tc.action || first.TargetStatus != tc.status || first.Reason != "核对处理原因" || first.IdempotencyKey != "lot-action-9" || len(first.IntentHash) != 64 || first.IntentHash != repo.actions[1].IntentHash {
				t.Fatalf("named action failed to bind canonical intent: %#v", repo.actions)
			}
			in.Reason = "另一处理原因"
			if _, err := tc.call(uc, context.Background(), &in); err != nil || repo.actions[2].IntentHash == first.IntentHash {
				t.Fatalf("a changed reason must change the intent identity: %v", err)
			}
		})
	}
}

func TestInventoryUsecaseLotActionRequiresVersionActorReasonAndRetryKey(t *testing.T) {
	for _, edit := range []func(*InventoryLotStatusAction){
		func(in *InventoryLotStatusAction) { in.LotID = 0 },
		func(in *InventoryLotStatusAction) { in.ExpectedVersion = 0 },
		func(in *InventoryLotStatusAction) { in.ActorID = 0 },
		func(in *InventoryLotStatusAction) { in.Reason = " " },
		func(in *InventoryLotStatusAction) { in.Reason = strings.Repeat("因", 256) },
		func(in *InventoryLotStatusAction) { in.IdempotencyKey = " " },
		func(in *InventoryLotStatusAction) { in.IdempotencyKey = strings.Repeat("a", 129) },
	} {
		repo := &inventoryBehaviorRepo{}
		in := InventoryLotStatusAction{LotID: 9, ExpectedVersion: 3, ActorID: 7, Reason: "待复检", IdempotencyKey: "hold-9"}
		edit(&in)
		if _, err := NewInventoryUsecase(repo).HoldInventoryLot(context.Background(), &in); !errors.Is(err, ErrBadParam) || len(repo.actions) != 0 {
			t.Fatalf("invalid action reached storage: err=%v actions=%v", err, repo.actions)
		}
	}
}

type inventoryScopedBehaviorRepo struct {
	inventoryBehaviorRepo
	scopes    []WarehouseDataScope
	balances  []InventoryBalanceFilter
	lots      []InventoryLotFilter
	movements []InventoryTxnFilter
}

func (r *inventoryScopedBehaviorRepo) ListInventoryBalancesForAccess(_ context.Context, filter InventoryBalanceFilter, scope WarehouseDataScope) ([]*InventoryBalance, int, error) {
	r.scopes, r.balances = append(r.scopes, scope), append(r.balances, filter)
	return []*InventoryBalance{{WarehouseID: 3, Quantity: decimal.RequireFromString("0.000001")}}, 17, r.err
}

func (r *inventoryScopedBehaviorRepo) ListInventoryLotsForAccess(_ context.Context, filter InventoryLotFilter, scope WarehouseDataScope) ([]*InventoryLot, int, error) {
	r.scopes, r.lots = append(r.scopes, scope), append(r.lots, filter)
	return []*InventoryLot{{ID: 9}}, 18, r.err
}

func (r *inventoryScopedBehaviorRepo) ListInventoryTxnsForAccess(_ context.Context, filter InventoryTxnFilter, scope WarehouseDataScope) ([]*InventoryTxn, int, error) {
	r.scopes, r.movements = append(r.scopes, scope), append(r.movements, filter)
	return []*InventoryTxn{{ID: 11}}, 19, r.err
}

func TestInventoryUsecaseScopedReadsPreserveWarehouseRestrictionsAndResults(t *testing.T) {
	repo := &inventoryScopedBehaviorRepo{}
	uc := NewInventoryUsecase(repo)
	scope := WarehouseDataScope{Mode: DataScopeModeAssigned, WarehouseIDs: []int{3, 2, 3, 0}}
	balances, total, err := uc.ListInventoryBalancesForAccess(context.Background(), InventoryBalanceFilter{SubjectType: " material ", Limit: 201, Offset: -1}, scope)
	if err != nil || total != 17 || len(balances) != 1 || !balances[0].Quantity.Equal(decimal.RequireFromString("0.000001")) {
		t.Fatalf("scoped balances lost count or precision: rows=%v total=%d err=%v", balances, total, err)
	}
	lots, total, err := uc.ListInventoryLotsForAccess(context.Background(), InventoryLotFilter{SubjectType: " material ", Status: " hold ", WarehouseID: 3, Keyword: " 批次 ", Limit: 20, Offset: 20}, scope)
	if err != nil || total != 18 || len(lots) != 1 || lots[0].ID != 9 {
		t.Fatalf("scoped lot result changed: rows=%v total=%d err=%v", lots, total, err)
	}
	repo.err = errors.New("inventory read unavailable")
	_, _, err = uc.ListInventoryTxnsForAccess(context.Background(), InventoryTxnFilter{TxnType: " out ", SourceType: " production_issue ", Limit: 10}, scope)
	if !errors.Is(err, repo.err) || len(repo.scopes) != 3 {
		t.Fatalf("scoped transaction failure was lost: %v", err)
	}
	for _, got := range repo.scopes {
		if got.Mode != DataScopeModeAssigned || !reflect.DeepEqual(got.WarehouseIDs, []int{2, 3}) {
			t.Fatalf("read widened the effective warehouse restriction: %#v", got)
		}
	}
	if repo.balances[0].SubjectType != InventorySubjectMaterial || repo.balances[0].Limit != 50 || repo.balances[0].Offset != 0 || repo.lots[0].Status != InventoryLotHold || repo.lots[0].Keyword != "批次" || repo.lots[0].Offset != 20 || repo.movements[0].SourceType != "PRODUCTION_ISSUE" {
		t.Fatal("list normalization discarded the requested business filter or pagination")
	}
}

func TestInventoryUsecaseScopedReadsRejectOtherWarehousesAndInvalidFilters(t *testing.T) {
	repo := &inventoryScopedBehaviorRepo{}
	uc := NewInventoryUsecase(repo)
	scope := WarehouseDataScope{Mode: DataScopeModeAssigned, WarehouseIDs: []int{3}}
	_, _, balanceErr := uc.ListInventoryBalancesForAccess(context.Background(), InventoryBalanceFilter{WarehouseID: 8}, scope)
	_, _, lotErr := uc.ListInventoryLotsForAccess(context.Background(), InventoryLotFilter{WarehouseID: 8}, scope)
	_, _, txnErr := uc.ListInventoryTxnsForAccess(context.Background(), InventoryTxnFilter{WarehouseID: 8}, scope)
	for _, err := range []error{balanceErr, lotErr, txnErr} {
		if !errors.Is(err, ErrDataScopeForbidden) {
			t.Fatalf("another warehouse was queried: %v", err)
		}
	}
	_, _, balanceErr = uc.ListInventoryBalancesForAccess(context.Background(), InventoryBalanceFilter{SubjectType: "OTHER"}, scope)
	_, _, lotErr = uc.ListInventoryLotsForAccess(context.Background(), InventoryLotFilter{Status: "UNKNOWN"}, scope)
	_, _, txnErr = uc.ListInventoryTxnsForAccess(context.Background(), InventoryTxnFilter{TxnType: "DELETE"}, scope)
	for _, err := range []error{balanceErr, lotErr, txnErr} {
		if !errors.Is(err, ErrBadParam) {
			t.Fatalf("an invalid filter was queried: %v", err)
		}
	}
	if len(repo.scopes) != 0 {
		t.Fatalf("invalid reads reached storage: %#v", repo.scopes)
	}
}
