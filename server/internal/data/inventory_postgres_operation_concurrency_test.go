package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/inventorytxn"
)

func waitInventoryPostgresBlocked(t *testing.T, ctx context.Context, db *stdsql.DB, holderPID, count int) {
	t.Helper()
	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		var blocked int
		if err := db.QueryRowContext(ctx, `WITH RECURSIVE waiting(pid) AS (
			SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))
			UNION SELECT activity.pid FROM pg_stat_activity activity
			JOIN waiting ON waiting.pid=ANY(pg_blocking_pids(activity.pid))
		) SELECT count(*) FROM waiting`, holderPID).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked >= count {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("expected %d transactions blocked by backend %d", count, holderPID)
}

func inventoryPostgresTxPID(t *testing.T, ctx context.Context, tx *inventoryDBTx) int {
	t.Helper()
	var pid int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT pg_backend_pid()`).Scan(&pid); err != nil {
		t.Fatal(err)
	}
	return pid
}

func TestInventoryLotPostgresFreezeBeforePosting(t *testing.T) {
	for _, path := range []string{"ordinary", "ledger", "transfer", "cycle-loss", "reversal"} {
		t.Run(path, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			data, client := openInventoryLotPostgresTestData(t)
			f := createInventoryLotPostgresFixtures(t, ctx, client)
			r := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
			uc := biz.NewInventoryUsecase(r)
			lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, f.materialID, "FREEZE-"+f.suffix)
			seed, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial,
				SubjectID: f.materialID, WarehouseID: f.warehouseID, LotID: &lot.ID, UnitID: f.unitID,
				TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10), SourceType: "TEST", IdempotencyKey: "freeze-seed-" + f.suffix})
			if err != nil {
				t.Fatal(err)
			}
			in := &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.warehouseID,
				LotID: &lot.ID, UnitID: f.unitID, TxnType: biz.InventoryTxnOut, Direction: -1, Quantity: decimal.NewFromInt(1),
				SourceType: "TEST", IdempotencyKey: "freeze-write-" + f.suffix}
			var op *biz.InventoryOperation
			if path == "transfer" || path == "cycle-loss" {
				expected, counted := decimal.NewFromInt(10), decimal.NewFromInt(9)
				line := biz.InventoryOperationItemCreate{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
					FromWarehouseID: f.warehouseID, FromLotID: &lot.ID, UnitID: f.unitID}
				opType := biz.InventoryOperationCycleCount
				if path == "transfer" {
					to := createTestWarehouse(t, ctx, client, "FREEZE-TO-"+f.suffix)
					line.ToWarehouseID, line.AdjustmentQuantity = &to.ID, decimal.NewFromInt(1)
					opType = biz.InventoryOperationTransfer
				} else {
					line.ExpectedQuantity, line.CountedQuantity = &expected, &counted
				}
				op, err = uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{OperationNo: "FREEZE-" + f.suffix,
					OperationType: opType, Reason: "并发冻结", CreatedBy: 1, IdempotencyKey: "freeze-op-" + f.suffix, Items: []biz.InventoryOperationItemCreate{line}})
				if err != nil {
					t.Fatal(err)
				}
			}
			if path == "reversal" {
				in.TxnType, in.ReversalOfTxnID, in.Quantity = biz.InventoryTxnReversal, &seed.Txn.ID, seed.Txn.Quantity
			}
			holder, err := r.beginInventoryDBTx(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer rollbackInventoryDBTx(ctx, holder, r.log)
			pid := inventoryPostgresTxPID(t, ctx, holder)
			if err := lockInventoryLot(ctx, holder, lot.ID); err != nil {
				t.Fatal(err)
			}
			holder.client.InventoryLot.Update().Where(inventorylot.ID(lot.ID)).SetStatus(biz.InventoryLotHold).
				SetVersion(lot.Version + 1).SetStatusAction("internal_status_change").
				SetStatusReason("并发冻结").SetStatusChangedAt(time.Now()).SaveX(ctx)
			done := make(chan error, 1)
			go func() {
				var err error
				switch path {
				case "ledger":
					_, err = r.CreateInventoryTxn(ctx, in)
				case "transfer", "cycle-loss":
					_, err = uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: op.ID, ExpectedVersion: op.Version, ActorID: 1})
				default:
					_, err = uc.ApplyInventoryTxnAndUpdateBalance(ctx, in)
				}
				done <- err
			}()
			waitInventoryPostgresBlocked(t, ctx, data.sqldb, pid, 1)
			if err := holder.sqlTx.Commit(); err != nil {
				t.Fatal(err)
			}
			err = <-done
			if path == "reversal" {
				if err != nil {
					t.Fatalf("valid frozen-lot reversal: %v", err)
				}
				assertInventoryOperationLotBalance(t, ctx, uc, f.materialID, f.warehouseID, lot.ID, f.unitID, "0")
				return
			}
			if !errors.Is(err, biz.ErrInventoryLotStatusBlocked) {
				t.Fatalf("posting after freeze error=%v", err)
			}
			assertInventoryOperationLotBalance(t, ctx, uc, f.materialID, f.warehouseID, lot.ID, f.unitID, "10")
			if count := client.InventoryTxn.Query().Where(inventorytxn.SubjectID(f.materialID)).CountX(ctx); count != 1 {
				t.Fatalf("failed posting left %d transactions", count)
			}
			if op != nil {
				current, err := uc.GetInventoryOperation(ctx, op.ID)
				if err != nil || current.Status != op.Status || current.Version != op.Version {
					t.Fatalf("failed posting changed operation: %#v %v", current, err)
				}
			}
		})
	}
}

func TestInventoryLotPostgresPostingBlocksFreezeUntilCommit(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openInventoryLotPostgresTestData(t)
	f := createInventoryLotPostgresFixtures(t, ctx, client)
	r := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewInventoryUsecase(r)
	lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, f.materialID, "POST-FIRST-"+f.suffix)
	in := &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.warehouseID,
		LotID: &lot.ID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10),
		SourceType: "TEST", IdempotencyKey: "post-first-seed-" + f.suffix}
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, in); err != nil {
		t.Fatal(err)
	}
	in.IdempotencyKey, in.TxnType, in.Direction, in.Quantity = "post-first-out-"+f.suffix, biz.InventoryTxnOut, -1, decimal.NewFromInt(1)
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if _, err := r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, in); err != nil {
		t.Fatal(err)
	}
	pid := inventoryPostgresTxPID(t, ctx, tx)
	done := make(chan error, 1)
	go func() {
		_, err := r.ChangeInventoryLotStatus(ctx, lot.ID, biz.InventoryLotHold, "并发冻结")
		done <- err
	}()
	waitInventoryPostgresBlocked(t, ctx, data.sqldb, pid, 1)
	if err := tx.sqlTx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if status := client.InventoryLot.Query().Where(inventorylot.ID(lot.ID)).OnlyX(ctx).Status; status != biz.InventoryLotHold {
		t.Fatalf("freeze status=%s", status)
	}
	replay, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, in)
	if err != nil || !replay.IdempotentReplay {
		t.Fatalf("frozen-lot idempotent replay=%#v %v", replay, err)
	}
	assertInventoryOperationLotBalance(t, ctx, uc, f.materialID, f.warehouseID, lot.ID, f.unitID, "9")
}

func TestInventoryPostgresOpposingTransfersAndCancellations(t *testing.T) {
	for _, withLots := range []bool{false, true} {
		t.Run(fmt.Sprintf("lots=%v", withLots), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			data, client := openInventoryLotPostgresTestData(t)
			f := createInventoryLotPostgresFixtures(t, ctx, client)
			r := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
			uc := biz.NewInventoryUsecase(r)
			to := createTestWarehouse(t, ctx, client, "OPPOSING-"+f.suffix)
			lots := []*int{nil, nil}
			if withLots {
				for i := range lots {
					lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, f.materialID, fmt.Sprintf("OPPOSING-%s-%d", f.suffix, i))
					lots[i] = &lot.ID
				}
			}
			for i, lotID := range lots {
				for _, wh := range []int{f.warehouseID, to.ID} {
					if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial,
						SubjectID: f.materialID, WarehouseID: wh, LotID: lotID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1,
						Quantity: decimal.NewFromInt(10), SourceType: "TEST", IdempotencyKey: fmt.Sprintf("opposing-seed-%s-%d-%d", f.suffix, i, wh)}); err != nil {
						t.Fatal(err)
					}
				}
			}
			ops := make([]*biz.InventoryOperation, 2)
			for i := range ops {
				from, target := f.warehouseID, to.ID
				if i == 1 {
					from, target = target, from
				}
				lines := []biz.InventoryOperationItemCreate{}
				for j := range lots {
					lotID := lots[j]
					if i == 1 {
						lotID = lots[len(lots)-1-j]
					}
					lines = append(lines, biz.InventoryOperationItemCreate{LineNo: fmt.Sprint(j + 1), SubjectType: biz.InventorySubjectMaterial,
						SubjectID: f.materialID, FromWarehouseID: from, FromLotID: lotID, ToWarehouseID: &target, UnitID: f.unitID, AdjustmentQuantity: decimal.NewFromInt(2)})
				}
				var err error
				ops[i], err = uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{OperationNo: fmt.Sprintf("OPPOSING-%s-%d", f.suffix, i),
					OperationType: biz.InventoryOperationTransfer, Reason: "双向调拨", CreatedBy: 1, IdempotencyKey: fmt.Sprintf("opposing-%s-%d", f.suffix, i), Items: lines})
				if err != nil {
					t.Fatal(err)
				}
			}
			for _, cancelOperation := range []bool{false, true} {
				holder, err := r.beginInventoryDBTx(ctx)
				if err != nil {
					t.Fatal(err)
				}
				defer rollbackInventoryDBTx(ctx, holder, r.log)
				key := biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
					WarehouseID: f.warehouseID, LotID: lots[0], UnitID: f.unitID}
				if err := lockInventoryBalanceRow(ctx, holder, key); err != nil {
					t.Fatal(err)
				}
				pid := inventoryPostgresTxPID(t, ctx, holder)
				done := make(chan error, 2)
				for i := 1; i >= 0; i-- {
					op := ops[i]
					go func() {
						mutation := &biz.InventoryOperationMutation{ID: op.ID, ExpectedVersion: op.Version, ActorID: 1, Reason: "双向撤销"}
						var result *biz.InventoryOperation
						var err error
						if cancelOperation {
							result, err = uc.CancelInventoryOperation(ctx, mutation)
						} else {
							result, err = uc.PostInventoryOperation(ctx, mutation)
						}
						if err == nil {
							*op = *result
						}
						done <- err
					}()
					waitInventoryPostgresBlocked(t, ctx, data.sqldb, pid, 2-i)
				}
				if err := holder.sqlTx.Commit(); err != nil {
					t.Fatal(err)
				}
				for range ops {
					if err := <-done; err != nil {
						t.Fatalf("opposing operations cancel=%v: %v", cancelOperation, err)
					}
				}
			}
			for _, lotID := range lots {
				for _, wh := range []int{f.warehouseID, to.ID} {
					balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial,
						SubjectID: f.materialID, WarehouseID: wh, LotID: lotID, UnitID: f.unitID})
					want := decimal.NewFromInt(10)
					if !withLots {
						want = decimal.NewFromInt(20)
					}
					if err != nil || !balance.Quantity.Equal(want) {
						t.Fatalf("opposing balance=%#v %v", balance, err)
					}
				}
			}
		})
	}
}

func TestInventoryPostgresOperationFirstBalanceAndRollback(t *testing.T) {
	for _, withLot := range []bool{false, true} {
		t.Run(fmt.Sprintf("lot=%v", withLot), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			data, client := openInventoryLotPostgresTestData(t)
			f := createInventoryLotPostgresFixtures(t, ctx, client)
			uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
			var lotID *int
			if withLot {
				lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectMaterial, f.materialID, "FIRST-BALANCE-"+f.suffix)
				lotID = &lot.ID
			}
			second := createTestWarehouse(t, ctx, client, "FIRST-SOURCE-"+f.suffix)
			target := createTestWarehouse(t, ctx, client, "FIRST-TARGET-"+f.suffix)
			unused := createTestWarehouse(t, ctx, client, "ROLLBACK-TARGET-"+f.suffix)
			ops := []*biz.InventoryOperation{}
			create := func(from, to int, quantity int64) *biz.InventoryOperation {
				t.Helper()
				key := fmt.Sprintf("first-transfer-%s-%d-%d", f.suffix, from, to)
				op, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{OperationNo: key,
					OperationType: biz.InventoryOperationTransfer, Reason: "首次余额并发", CreatedBy: 1, IdempotencyKey: key,
					Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
						FromWarehouseID: from, FromLotID: lotID, ToWarehouseID: &to, UnitID: f.unitID, AdjustmentQuantity: decimal.NewFromInt(quantity)}},
				})
				if err != nil {
					t.Fatal(err)
				}
				return op
			}
			for _, from := range []int{f.warehouseID, second.ID} {
				_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial,
					SubjectID: f.materialID, WarehouseID: from, LotID: lotID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1,
					Quantity: decimal.NewFromInt(10), SourceType: "TEST", IdempotencyKey: fmt.Sprintf("first-seed-%s-%d", f.suffix, from)})
				if err != nil {
					t.Fatal(err)
				}
				ops = append(ops, create(from, target.ID, 2))
			}
			start := make(chan struct{})
			done := make(chan error, len(ops))
			for _, op := range ops {
				go func() {
					<-start
					_, err := uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: op.ID, ExpectedVersion: op.Version, ActorID: 1})
					done <- err
				}()
			}
			close(start)
			for range ops {
				if err := <-done; err != nil {
					t.Fatal(err)
				}
			}
			balance, err := uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial,
				SubjectID: f.materialID, WarehouseID: target.ID, LotID: lotID, UnitID: f.unitID})
			if err != nil || !balance.Quantity.Equal(decimal.NewFromInt(4)) {
				t.Fatalf("first destination balance=%#v %v", balance, err)
			}
			failed := create(f.warehouseID, unused.ID, 20)
			_, err = uc.PostInventoryOperation(ctx, &biz.InventoryOperationMutation{ID: failed.ID, ExpectedVersion: failed.Version, ActorID: 1})
			if !errors.Is(err, biz.ErrInventoryInsufficientStock) {
				t.Fatalf("insufficient posting error=%v", err)
			}
			_, err = uc.GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial,
				SubjectID: f.materialID, WarehouseID: unused.ID, LotID: lotID, UnitID: f.unitID})
			if !errors.Is(err, biz.ErrInventoryBalanceNotFound) {
				t.Fatalf("rollback left an empty balance: %v", err)
			}
			if count := client.InventoryTxn.Query().Where(inventorytxn.SubjectID(f.materialID)).CountX(ctx); count != 6 {
				t.Fatalf("rollback left partial ledger: %d", count)
			}
			current, err := uc.GetInventoryOperation(ctx, failed.ID)
			if err != nil || current.Status != failed.Status || current.Version != failed.Version {
				t.Fatalf("rollback changed operation: %#v %v", current, err)
			}
		})
	}
}
