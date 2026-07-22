package data

import (
	"context"
	"fmt"
	"sort"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financeallocation"
	"server/internal/data/model/ent/financecreditnote"
	"server/internal/data/model/ent/financepayment"

	"github.com/shopspring/decimal"
)

var _ biz.FinancePaymentRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) CreateFinancePayment(ctx context.Context, in *biz.FinancePaymentCreate, actorID int, payloadHash string) (*biz.FinancePayment, error) {
	if replay, found, err := r.findFinancePaymentReplay(ctx, actorID, in.IdempotencyKey, payloadHash); err != nil || found {
		return replay, err
	}
	create := r.data.postgres.FinancePayment.Create().SetPaymentNo(in.PaymentNo).SetDirection(in.Direction).SetCounterpartyType(in.CounterpartyType).SetCounterpartyID(in.CounterpartyID).SetAmount(in.Amount).SetCurrency(in.Currency).SetAccountRef(in.AccountRef).SetEvidenceRef(in.EvidenceRef).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(payloadHash).SetCreatedBy(actorID)
	if in.OccurredAtSpecified {
		create.SetOccurredAt(in.OccurredAt)
	}
	row, err := create.Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if replay, found, replayErr := r.findFinancePaymentReplay(ctx, actorID, in.IdempotencyKey, payloadHash); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	return entFinancePaymentToBiz(row, nil), nil
}

func (r *operationalFactRepo) PostFinancePayment(ctx context.Context, in *biz.FinancePaymentPost, actorID int) (*biz.FinancePayment, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_payments", in.ID, biz.ErrBadParam); err != nil {
		return nil, err
	}
	payment, err := tx.client.FinancePayment.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if payment.Version != in.ExpectedVersion {
		if payment.Status == biz.FinancePaymentStatusPosted && payment.Version == in.ExpectedVersion+1 &&
			payment.PostedBy != nil && *payment.PostedBy == actorID {
			replay, replayErr := financePaymentWithAllocations(ctx, tx.client, payment)
			if replayErr != nil {
				return nil, replayErr
			}
			if financePaymentPostIntentMatches(replay, in.Allocations) {
				return replay, nil
			}
		}
		return nil, biz.ErrIdempotencyConflict
	}
	if payment.Status != biz.FinancePaymentStatusDraft {
		return nil, biz.ErrBadParam
	}
	allocations := append([]biz.FinancePaymentAllocationInput(nil), in.Allocations...)
	sort.Slice(allocations, func(i, j int) bool { return allocations[i].FinanceFactID < allocations[j].FinanceFactID })
	total := decimal.Zero
	for _, a := range allocations {
		total = total.Add(a.Amount)
		if err := lockOperationalFactRow(ctx, tx, "finance_facts", a.FinanceFactID, biz.ErrBadParam); err != nil {
			return nil, err
		}
		fact, err := tx.client.FinanceFact.Get(ctx, a.FinanceFactID)
		if err != nil {
			return nil, err
		}
		if err := validateFinancePaymentTarget(payment, fact); err != nil {
			return nil, err
		}
		outstanding, err := financeFactOutstanding(ctx, tx.client, fact.ID, fact.Amount)
		if err != nil {
			return nil, err
		}
		if a.Amount.GreaterThan(outstanding) {
			return nil, biz.ErrBadParam
		}
		key := fmt.Sprintf("FINANCE_PAYMENT:%d:%d:POST", payment.ID, fact.ID)
		_, err = tx.client.FinanceAllocation.Create().SetPaymentID(payment.ID).SetFinanceFactID(fact.ID).SetAmount(a.Amount).SetCurrency(payment.Currency).SetStatus(biz.FinanceAllocationStatusPosted).SetIdempotencyKey(key).SetCreatedBy(actorID).Save(ctx)
		if err != nil {
			return nil, err
		}
		if a.Amount.Equal(outstanding) {
			if err := setFinanceFactSettlement(ctx, tx, fact.ID, true); err != nil {
				return nil, err
			}
		}
	}
	if total.GreaterThan(payment.Amount) {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	if err := updateFinancePaymentStatus(ctx, tx, payment.ID, payment.Version, biz.FinancePaymentStatusPosted, now, actorID, ""); err != nil {
		return nil, err
	}
	updated, err := tx.client.FinancePayment.Get(ctx, payment.ID)
	if err != nil {
		return nil, err
	}
	out, err := financePaymentWithAllocations(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func (r *operationalFactRepo) ReverseFinancePayment(ctx context.Context, in *biz.FinancePaymentReverse, actorID int) (*biz.FinancePayment, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_payments", in.ID, biz.ErrBadParam); err != nil {
		return nil, err
	}
	payment, err := tx.client.FinancePayment.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if payment.Version != in.ExpectedVersion {
		if payment.Status == biz.FinancePaymentStatusReversed && payment.Version == in.ExpectedVersion+1 &&
			payment.ReversedBy != nil && *payment.ReversedBy == actorID && payment.ReverseReason != nil &&
			*payment.ReverseReason == in.Reason {
			return financePaymentWithAllocations(ctx, tx.client, payment)
		}
		return nil, biz.ErrIdempotencyConflict
	}
	if payment.Status != biz.FinancePaymentStatusPosted {
		return nil, biz.ErrBadParam
	}
	rows, err := tx.client.FinanceAllocation.Query().Where(financeallocation.PaymentID(payment.ID), financeallocation.Status(biz.FinanceAllocationStatusPosted)).Order(ent.Asc(financeallocation.FieldFinanceFactID)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, a := range rows {
		if err := lockOperationalFactRow(ctx, tx, "finance_facts", a.FinanceFactID, biz.ErrBadParam); err != nil {
			return nil, err
		}
		key := fmt.Sprintf("FINANCE_PAYMENT:%d:%d:REVERSE", payment.ID, a.ID)
		_, err := tx.client.FinanceAllocation.Create().SetPaymentID(payment.ID).SetFinanceFactID(a.FinanceFactID).SetAmount(a.Amount).SetCurrency(a.Currency).SetStatus(biz.FinanceAllocationStatusReversed).SetReversalOfAllocationID(a.ID).SetIdempotencyKey(key).SetCreatedBy(actorID).Save(ctx)
		if err != nil {
			return nil, err
		}
		if err := setFinanceFactSettlement(ctx, tx, a.FinanceFactID, false); err != nil {
			return nil, err
		}
	}
	now := time.Now()
	if err := updateFinancePaymentStatus(ctx, tx, payment.ID, payment.Version, biz.FinancePaymentStatusReversed, now, actorID, in.Reason); err != nil {
		return nil, err
	}
	updated, err := tx.client.FinancePayment.Get(ctx, payment.ID)
	if err != nil {
		return nil, err
	}
	out, err := financePaymentWithAllocations(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func financePaymentPostIntentMatches(payment *biz.FinancePayment, expected []biz.FinancePaymentAllocationInput) bool {
	if payment == nil {
		return false
	}
	actual := make([]biz.FinancePaymentAllocationInput, 0, len(payment.Allocations))
	for _, allocation := range payment.Allocations {
		if allocation != nil && allocation.Status == biz.FinanceAllocationStatusPosted && allocation.ReversalOfAllocationID == nil {
			actual = append(actual, biz.FinancePaymentAllocationInput{FinanceFactID: allocation.FinanceFactID, Amount: allocation.Amount})
		}
	}
	sort.Slice(actual, func(i, j int) bool { return actual[i].FinanceFactID < actual[j].FinanceFactID })
	expected = append([]biz.FinancePaymentAllocationInput(nil), expected...)
	sort.Slice(expected, func(i, j int) bool { return expected[i].FinanceFactID < expected[j].FinanceFactID })
	if len(actual) != len(expected) {
		return false
	}
	for index := range actual {
		if actual[index].FinanceFactID != expected[index].FinanceFactID || !actual[index].Amount.Equal(expected[index].Amount) {
			return false
		}
	}
	return true
}

func (r *operationalFactRepo) CreateFinanceCreditNote(ctx context.Context, in *biz.FinanceCreditNoteCreate, actorID int, payloadHash string) (*biz.FinanceCreditNote, error) {
	if replay, found, err := r.findFinanceCreditReplay(ctx, actorID, in.IdempotencyKey, payloadHash); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", in.FinanceFactID, biz.ErrBadParam); err != nil {
		return nil, err
	}
	fact, err := tx.client.FinanceFact.Get(ctx, in.FinanceFactID)
	if err != nil {
		return nil, err
	}
	if fact.Status != biz.OperationalFactStatusPosted && fact.Status != biz.OperationalFactStatusSettled {
		return nil, biz.ErrBadParam
	}
	outstanding, err := financeFactOutstanding(ctx, tx.client, fact.ID, fact.Amount)
	if err != nil {
		return nil, err
	}
	if in.Amount.GreaterThan(outstanding) {
		return nil, biz.ErrBadParam
	}
	row, err := tx.client.FinanceCreditNote.Create().SetCreditNoteNo(in.CreditNoteNo).SetFinanceFactID(fact.ID).SetAmount(in.Amount).SetCurrency(fact.Currency).SetStatus("POSTED").SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(payloadHash).SetCreatedBy(actorID).Save(ctx)
	if err != nil {
		return nil, err
	}
	if in.Amount.Equal(outstanding) {
		if err := setFinanceFactSettlement(ctx, tx, fact.ID, true); err != nil {
			return nil, err
		}
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entFinanceCreditNoteToBiz(row), nil
}

func (r *operationalFactRepo) ReverseFinanceCreditNote(ctx context.Context, in *biz.FinanceCreditNoteReverse, actorID int, payloadHash string) (*biz.FinanceCreditNote, error) {
	if replay, found, err := r.findFinanceCreditReplay(ctx, actorID, in.IdempotencyKey, payloadHash); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_credit_notes", in.CreditNoteID, biz.ErrBadParam); err != nil {
		return nil, err
	}
	source, err := tx.client.FinanceCreditNote.Get(ctx, in.CreditNoteID)
	if err != nil {
		return nil, err
	}
	if source.Status != "POSTED" || source.ReversalOfCreditNoteID != nil {
		return nil, biz.ErrBadParam
	}
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", source.FinanceFactID, biz.ErrBadParam); err != nil {
		return nil, err
	}
	row, err := tx.client.FinanceCreditNote.Create().SetCreditNoteNo(in.CreditNoteNo).SetFinanceFactID(source.FinanceFactID).SetReversalOfCreditNoteID(source.ID).SetAmount(source.Amount).SetCurrency(source.Currency).SetStatus("REVERSED").SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(payloadHash).SetCreatedBy(actorID).Save(ctx)
	if err != nil {
		return nil, err
	}
	if err := setFinanceFactSettlement(ctx, tx, source.FinanceFactID, false); err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entFinanceCreditNoteToBiz(row), nil
}

func validateFinancePaymentTarget(payment *ent.FinancePayment, fact *ent.FinanceFact) error {
	if payment == nil || fact == nil || fact.CounterpartyID == nil || *fact.CounterpartyID != payment.CounterpartyID || fact.CounterpartyType != payment.CounterpartyType || fact.Currency != payment.Currency || (fact.Status != biz.OperationalFactStatusPosted && fact.Status != biz.OperationalFactStatusSettled) {
		return biz.ErrBadParam
	}
	if payment.Direction == biz.FinancePaymentDirectionReceipt && fact.FactType != biz.FinanceFactReceivable {
		return biz.ErrBadParam
	}
	if payment.Direction == biz.FinancePaymentDirectionDisbursement && fact.FactType != biz.FinanceFactPayable {
		return biz.ErrBadParam
	}
	return nil
}
func financeFactOutstanding(ctx context.Context, client *ent.Client, factID int, amount decimal.Decimal) (decimal.Decimal, error) {
	allocs, err := client.FinanceAllocation.Query().Where(financeallocation.FinanceFactID(factID)).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	used := decimal.Zero
	for _, a := range allocs {
		switch a.Status {
		case biz.FinanceAllocationStatusPosted:
			used = used.Add(a.Amount)
		case biz.FinanceAllocationStatusReversed:
			used = used.Sub(a.Amount)
		}
	}
	credits, err := client.FinanceCreditNote.Query().Where(financecreditnote.FinanceFactID(factID)).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	for _, c := range credits {
		switch c.Status {
		case "POSTED":
			used = used.Add(c.Amount)
		case "REVERSED":
			used = used.Sub(c.Amount)
		}
	}
	out := amount.Sub(used)
	if out.IsNegative() {
		return decimal.Zero, biz.ErrBadParam
	}
	return out, nil
}
func setFinanceFactSettlement(ctx context.Context, tx *inventoryDBTx, id int, settled bool) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	status := biz.OperationalFactStatusPosted
	var at any = nil
	if settled {
		status = biz.OperationalFactStatusSettled
		at = time.Now()
	}
	result, err := tx.sqlTx.ExecContext(ctx, "UPDATE finance_facts SET status="+p[0]+", settled_at="+p[1]+", updated_at=CURRENT_TIMESTAMP WHERE id="+p[2], status, at, id)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		return biz.ErrBadParam
	}
	return nil
}
func updateFinancePaymentStatus(ctx context.Context, tx *inventoryDBTx, id, version int, status string, at time.Time, actorID int, reason string) error {
	p := inventorySQLPlaceholders(tx.dialect, 7)
	var q string
	var args []any
	if status == biz.FinancePaymentStatusPosted {
		q = "UPDATE finance_payments SET status=" + p[0] + ", version=version+1, posted_at=" + p[1] + ", posted_by=" + p[2] + ", updated_at=" + p[3] + " WHERE id=" + p[4] + " AND version=" + p[5]
		args = []any{status, at, actorID, at, id, version}
	} else {
		q = "UPDATE finance_payments SET status=" + p[0] + ", version=version+1, reversed_at=" + p[1] + ", reversed_by=" + p[2] + ", reverse_reason=" + p[3] + ", updated_at=" + p[4] + " WHERE id=" + p[5] + " AND version=" + p[6]
		args = []any{status, at, actorID, reason, at, id, version}
	}
	res, err := tx.sqlTx.ExecContext(ctx, q, args...)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return biz.ErrIdempotencyConflict
	}
	return nil
}
func (r *operationalFactRepo) GetFinancePayment(ctx context.Context, id int) (*biz.FinancePayment, error) {
	row, err := r.data.postgres.FinancePayment.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return financePaymentWithAllocations(ctx, r.data.postgres, row)
}
func (r *operationalFactRepo) ListFinancePayments(ctx context.Context, filter biz.FinancePaymentFilter) ([]*biz.FinancePayment, int, error) {
	query := r.data.postgres.FinancePayment.Query()
	if filter.Status != "" {
		query = query.Where(financepayment.Status(filter.Status))
	}
	if filter.Direction != "" {
		query = query.Where(financepayment.Direction(filter.Direction))
	}
	if filter.CounterpartyType != "" {
		query = query.Where(financepayment.CounterpartyType(filter.CounterpartyType))
	}
	if filter.CounterpartyID > 0 {
		query = query.Where(financepayment.CounterpartyID(filter.CounterpartyID))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(financepayment.FieldOccurredAt), ent.Desc(financepayment.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.FinancePayment, 0, len(rows))
	for _, row := range rows {
		item, err := financePaymentWithAllocations(ctx, r.data.postgres, row)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, nil
}
func (r *operationalFactRepo) GetFinanceCreditNote(ctx context.Context, id int) (*biz.FinanceCreditNote, error) {
	row, err := r.data.postgres.FinanceCreditNote.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return entFinanceCreditNoteToBiz(row), nil
}
func (r *operationalFactRepo) ListFinanceCreditNotes(ctx context.Context, filter biz.FinanceCreditNoteFilter) ([]*biz.FinanceCreditNote, int, error) {
	query := r.data.postgres.FinanceCreditNote.Query()
	if filter.Status != "" {
		query = query.Where(financecreditnote.Status(filter.Status))
	}
	if filter.FinanceFactID > 0 {
		query = query.Where(financecreditnote.FinanceFactID(filter.FinanceFactID))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(financecreditnote.FieldCreatedAt), ent.Desc(financecreditnote.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.FinanceCreditNote, 0, len(rows))
	for _, row := range rows {
		out = append(out, entFinanceCreditNoteToBiz(row))
	}
	return out, total, nil
}
func (r *operationalFactRepo) findFinancePaymentReplay(ctx context.Context, actorID int, key, hash string) (*biz.FinancePayment, bool, error) {
	row, err := r.data.postgres.FinancePayment.Query().Where(financepayment.CreatedBy(actorID), financepayment.IdempotencyKey(key)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	out, err := financePaymentWithAllocations(ctx, r.data.postgres, row)
	return out, true, err
}
func (r *operationalFactRepo) findFinanceCreditReplay(ctx context.Context, actorID int, key, hash string) (*biz.FinanceCreditNote, bool, error) {
	row, err := r.data.postgres.FinanceCreditNote.Query().Where(financecreditnote.CreatedBy(actorID), financecreditnote.IdempotencyKey(key)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entFinanceCreditNoteToBiz(row), true, nil
}
func financePaymentWithAllocations(ctx context.Context, client *ent.Client, row *ent.FinancePayment) (*biz.FinancePayment, error) {
	items, err := client.FinanceAllocation.Query().Where(financeallocation.PaymentID(row.ID)).Order(ent.Asc(financeallocation.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	return entFinancePaymentToBiz(row, items), nil
}
func entFinancePaymentToBiz(row *ent.FinancePayment, items []*ent.FinanceAllocation) *biz.FinancePayment {
	if row == nil {
		return nil
	}
	out := &biz.FinancePayment{ID: row.ID, PaymentNo: row.PaymentNo, Direction: row.Direction, Status: row.Status, CounterpartyType: row.CounterpartyType, CounterpartyID: row.CounterpartyID, Amount: row.Amount, Currency: row.Currency, AccountRef: row.AccountRef, EvidenceRef: row.EvidenceRef, IdempotencyKey: row.IdempotencyKey, IdempotencyPayloadHash: row.IdempotencyPayloadHash, Version: row.Version, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, PostedBy: row.PostedBy, ReversedAt: row.ReversedAt, ReversedBy: row.ReversedBy, ReverseReason: row.ReverseReason, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
	for _, a := range items {
		out.Allocations = append(out.Allocations, &biz.FinanceAllocation{ID: a.ID, PaymentID: a.PaymentID, FinanceFactID: a.FinanceFactID, Amount: a.Amount, Currency: a.Currency, Status: a.Status, ReversalOfAllocationID: a.ReversalOfAllocationID, IdempotencyKey: a.IdempotencyKey, CreatedBy: a.CreatedBy, CreatedAt: a.CreatedAt})
	}
	return out
}
func entFinanceCreditNoteToBiz(row *ent.FinanceCreditNote) *biz.FinanceCreditNote {
	if row == nil {
		return nil
	}
	return &biz.FinanceCreditNote{ID: row.ID, CreditNoteNo: row.CreditNoteNo, FinanceFactID: row.FinanceFactID, ReversalOfCreditNoteID: row.ReversalOfCreditNoteID, Amount: row.Amount, Currency: row.Currency, Status: row.Status, Reason: row.Reason, IdempotencyKey: row.IdempotencyKey, IdempotencyPayloadHash: row.IdempotencyPayloadHash, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt}
}
