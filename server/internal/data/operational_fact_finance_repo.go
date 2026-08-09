package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financeallocation"
	"server/internal/data/model/ent/financecreditnote"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/shipmentitem"

	"github.com/shopspring/decimal"
)

func findFinanceFactReplay(ctx context.Context, client *ent.Client, in *biz.FinanceFactCreate) (*biz.FinanceFact, bool, error) {
	row, err := client.FinanceFact.Query().Where(financefact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !financeFactMatchesCreate(row, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entFinanceFactToBiz(row), true, nil
}

func findActiveFinanceFactBySource(ctx context.Context, client *ent.Client, in *biz.FinanceFactCreate) (*biz.FinanceFact, bool, error) {
	if in == nil || in.SourceType == nil || in.SourceID == nil {
		return nil, false, nil
	}
	row, err := client.FinanceFact.Query().Where(
		financefact.FactType(in.FactType),
		financefact.SourceType(*in.SourceType),
		financefact.SourceID(*in.SourceID),
		financefact.StatusNEQ(biz.OperationalFactStatusCancelled),
	).First(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return entFinanceFactToBiz(row), true, nil
}

func findFinanceFactFromShipmentReplay(
	ctx context.Context,
	client *ent.Client,
	factType string,
	in *biz.FinanceFactFromShipmentCreate,
) (*biz.FinanceFact, bool, error) {
	row, err := client.FinanceFact.Query().Where(financefact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.FactNo != in.FactNo || row.FactType != factType ||
		row.CounterpartyType != biz.FinanceCounterpartyCustomer || row.CounterpartyID == nil ||
		!row.Amount.GreaterThan(decimal.Zero) || !row.FeeAmount.IsZero() || row.Currency != biz.FinanceCurrencyCNY ||
		row.SourceType == nil || *row.SourceType != biz.ShipmentSourceType || row.SourceID == nil || *row.SourceID != in.ShipmentID || row.SourceLineID != nil ||
		!sameOptionalString(row.InvoiceCategory, in.InvoiceCategory) ||
		!sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) ||
		!sameOptionalString(row.Note, in.Note) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entFinanceFactToBiz(row), true, nil
}

func financeFactMatchesCreate(row *ent.FinanceFact, in *biz.FinanceFactCreate) bool {
	if row == nil || in == nil {
		return false
	}
	return row.FactNo == in.FactNo &&
		row.FactType == in.FactType &&
		row.CounterpartyType == in.CounterpartyType &&
		sameOptionalInt(row.CounterpartyID, in.CounterpartyID) &&
		row.Amount.Cmp(in.Amount) == 0 &&
		row.FeeAmount.Cmp(in.FeeAmount) == 0 &&
		row.Currency == in.Currency &&
		sameOptionalString(row.CollectionType, in.CollectionType) &&
		sameOptionalString(row.PaymentTerm, in.PaymentTerm) &&
		sameOptionalInt(row.PaymentTermDays, in.PaymentTermDays) &&
		sameOptionalString(row.InvoiceCategory, in.InvoiceCategory) &&
		sameOptionalString(row.SourceType, in.SourceType) &&
		sameOptionalInt(row.SourceID, in.SourceID) &&
		sameOptionalInt(row.SourceLineID, in.SourceLineID) &&
		sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) &&
		sameOptionalString(row.Note, in.Note)
}

func financeFactCanRecoverAppliedProcessResult(status string) bool {
	switch status {
	case biz.OperationalFactStatusDraft, biz.OperationalFactStatusPosted, biz.OperationalFactStatusSettled:
		return true
	default:
		return false
	}
}

func (r *operationalFactRepo) CreateFinanceFactDraft(ctx context.Context, in *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	if replay, found, err := findFinanceFactReplay(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	if _, found, err := findActiveFinanceFactBySource(ctx, r.data.postgres, in); err != nil {
		return nil, err
	} else if found {
		return nil, biz.ErrFinanceFactSourceConflict
	}
	row, err := r.data.postgres.FinanceFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(in.CounterpartyType).
		SetNillableCounterpartyID(in.CounterpartyID).
		SetAmount(in.Amount).
		SetFeeAmount(in.FeeAmount).
		SetCurrency(in.Currency).
		SetNillableCollectionType(in.CollectionType).
		SetNillablePaymentTerm(in.PaymentTerm).
		SetNillablePaymentTermDays(in.PaymentTermDays).
		SetNillableInvoiceCategory(in.InvoiceCategory).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if replay, found, replayErr := findFinanceFactReplay(ctx, r.data.postgres, in); replayErr != nil || found {
				return replay, replayErr
			}
			if _, found, sourceErr := findActiveFinanceFactBySource(ctx, r.data.postgres, in); sourceErr != nil {
				return nil, sourceErr
			} else if found {
				return nil, biz.ErrFinanceFactSourceConflict
			}
		}
		return nil, err
	}
	return entFinanceFactToBiz(row), nil
}

func (r *operationalFactRepo) CreateFinanceFactDraftFromShipment(
	ctx context.Context,
	factType string,
	in *biz.FinanceFactFromShipmentCreate,
) (*biz.FinanceFact, error) {
	if in == nil || in.ShipmentID <= 0 || (factType != biz.FinanceFactReceivable && factType != biz.FinanceFactInvoice) ||
		(factType == biz.FinanceFactReceivable && in.InvoiceCategory != nil) ||
		(factType == biz.FinanceFactInvoice && in.InvoiceCategory == nil) {
		return nil, biz.ErrBadParam
	}
	_, err := r.data.postgres.Shipment.Get(ctx, in.ShipmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if replay, found, replayErr := findFinanceFactFromShipmentReplay(ctx, tx.client, factType, in); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if err := lockOperationalFactRow(ctx, tx, "shipments", in.ShipmentID, biz.ErrShipmentNotFound); err != nil {
		return nil, err
	}
	// A concurrent exact-key request may have committed while this transaction
	// waited for the shipment lock. Replay it before classifying the existing
	// active source as a different-key conflict.
	if replay, found, replayErr := findFinanceFactFromShipmentReplay(ctx, tx.client, factType, in); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	parent, err := tx.client.Shipment.Get(ctx, in.ShipmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if parent.Status != biz.ShipmentStatusShipped || parent.CustomerID == nil || *parent.CustomerID <= 0 {
		return nil, biz.ErrBadParam
	}
	amount, err := shipmentFinanceAmountFromSnapshots(ctx, tx.client, parent.ID)
	if err != nil {
		return nil, err
	}
	var collectionType, paymentTerm *string
	var paymentTermDays *int
	if factType == biz.FinanceFactReceivable {
		collection := biz.FinanceCollectionAccountsReceivable
		collectionType = &collection
		paymentTerm, paymentTermDays, err = lockAndResolveShipmentFinancePaymentTermSnapshot(ctx, tx, parent)
		if err != nil {
			return nil, err
		}
	}
	sourceType := biz.ShipmentSourceType
	shipmentID := parent.ID
	customerID := *parent.CustomerID
	create := &biz.FinanceFactCreate{
		FactNo:              in.FactNo,
		FactType:            factType,
		CounterpartyType:    biz.FinanceCounterpartyCustomer,
		CounterpartyID:      &customerID,
		Amount:              amount,
		FeeAmount:           decimal.Zero,
		Currency:            biz.FinanceCurrencyCNY,
		CollectionType:      collectionType,
		PaymentTerm:         paymentTerm,
		PaymentTermDays:     paymentTermDays,
		InvoiceCategory:     in.InvoiceCategory,
		SourceType:          &sourceType,
		SourceID:            &shipmentID,
		IdempotencyKey:      in.IdempotencyKey,
		OccurredAt:          in.OccurredAt,
		OccurredAtSpecified: in.OccurredAtSpecified,
		Note:                in.Note,
	}
	if _, found, sourceErr := findActiveFinanceFactBySource(ctx, tx.client, create); sourceErr != nil {
		return nil, sourceErr
	} else if found {
		return nil, biz.ErrFinanceFactSourceConflict
	}
	row, err := tx.client.FinanceFact.Create().
		SetFactNo(create.FactNo).
		SetFactType(create.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(create.CounterpartyType).
		SetNillableCounterpartyID(create.CounterpartyID).
		SetAmount(create.Amount).
		SetFeeAmount(create.FeeAmount).
		SetCurrency(create.Currency).
		SetNillableCollectionType(create.CollectionType).
		SetNillablePaymentTerm(create.PaymentTerm).
		SetNillablePaymentTermDays(create.PaymentTermDays).
		SetNillableInvoiceCategory(create.InvoiceCategory).
		SetNillableSourceType(create.SourceType).
		SetNillableSourceID(create.SourceID).
		SetIdempotencyKey(create.IdempotencyKey).
		SetOccurredAt(create.OccurredAt).
		SetOccurredAtSpecified(create.OccurredAtSpecified).
		SetNillableNote(create.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, stdsql.ErrTxDone) {
				r.log.WithContext(ctx).Warnf("rollback shipment finance conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if replay, found, replayErr := findFinanceFactFromShipmentReplay(ctx, r.data.postgres, factType, in); replayErr != nil || found {
				return replay, replayErr
			}
			if _, found, sourceErr := findActiveFinanceFactBySource(ctx, r.data.postgres, create); sourceErr != nil {
				return nil, sourceErr
			} else if found {
				return nil, biz.ErrFinanceFactSourceConflict
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entFinanceFactToBiz(row), nil
}

func (r *operationalFactRepo) CreateFinanceFactDraftForProcessCommand(
	ctx context.Context,
	in *biz.FinanceFactCreate,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) (*biz.FinanceFact, error) {
	if in == nil || command == nil || r == nil || r.inv == nil {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if replay, found, replayErr := r.recoverFinanceFactProcessCommandReplayInTx(ctx, tx, in, command, actorID); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if err := lockAndValidateFinanceFactShipmentSource(ctx, tx, in); err != nil {
		return nil, err
	}
	// A concurrent exact command may have committed while this transaction
	// waited for the shipment parent lock. Rebind its result instead of
	// misclassifying the retry as a different-key source conflict.
	if replay, found, replayErr := r.recoverFinanceFactProcessCommandReplayInTx(ctx, tx, in, command, actorID); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if _, found, err := findActiveFinanceFactBySource(ctx, tx.client, in); err != nil {
		return nil, err
	} else if found {
		return nil, biz.ErrFinanceFactSourceConflict
	}
	row, err := tx.client.FinanceFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(in.CounterpartyType).
		SetNillableCounterpartyID(in.CounterpartyID).
		SetAmount(in.Amount).
		SetFeeAmount(in.FeeAmount).
		SetCurrency(in.Currency).
		SetNillableCollectionType(in.CollectionType).
		SetNillablePaymentTerm(in.PaymentTerm).
		SetNillablePaymentTermDays(in.PaymentTermDays).
		SetNillableInvoiceCategory(in.InvoiceCategory).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, stdsql.ErrTxDone) {
				r.log.WithContext(ctx).Warnf("rollback finance process command idempotency conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if _, found, replayErr := findFinanceFactReplay(ctx, r.data.postgres, in); replayErr != nil {
				return nil, replayErr
			} else if found {
				return r.CreateFinanceFactDraftForProcessCommand(ctx, in, command, actorID)
			}
			if _, found, sourceErr := findActiveFinanceFactBySource(ctx, r.data.postgres, in); sourceErr != nil {
				return nil, sourceErr
			} else if found {
				return nil, biz.ErrFinanceFactSourceConflict
			}
		}
		return nil, err
	}
	out := entFinanceFactToBiz(row)
	if err := recordFinanceFactProcessCommandResultInTx(ctx, tx, out, command, actorID); err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *operationalFactRepo) GetShipmentFinanceAmountSnapshot(
	ctx context.Context,
	shipmentID int,
) (decimal.Decimal, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || shipmentID <= 0 {
		return decimal.Zero, biz.ErrBadParam
	}
	parent, err := r.data.postgres.Shipment.Get(ctx, shipmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return decimal.Zero, biz.ErrShipmentNotFound
		}
		return decimal.Zero, err
	}
	if parent.Status != biz.ShipmentStatusShipped || parent.CustomerID == nil || *parent.CustomerID <= 0 {
		return decimal.Zero, biz.ErrBadParam
	}
	return shipmentFinanceAmountFromSnapshots(ctx, r.data.postgres, shipmentID)
}

func (r *operationalFactRepo) recoverFinanceFactProcessCommandReplayInTx(
	ctx context.Context,
	tx *inventoryDBTx,
	in *biz.FinanceFactCreate,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) (*biz.FinanceFact, bool, error) {
	replay, found, err := findFinanceFactReplay(ctx, tx.client, in)
	if err != nil || !found {
		return replay, found, err
	}
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", replay.ID, biz.ErrFinanceFactNotFound); err != nil {
		return nil, true, err
	}
	locked, err := tx.client.FinanceFact.Get(ctx, replay.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, true, biz.ErrFinanceFactNotFound
		}
		return nil, true, err
	}
	if !financeFactMatchesCreate(locked, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	if !financeFactCanRecoverAppliedProcessResult(locked.Status) {
		return nil, true, biz.ErrProcessDomainCommandRecoveryRequired
	}
	replay = entFinanceFactToBiz(locked)
	if err := recordFinanceFactProcessCommandResultInTx(ctx, tx, replay, command, actorID); err != nil {
		return nil, true, err
	}
	return replay, true, nil
}

func lockAndValidateFinanceFactShipmentSource(ctx context.Context, tx *inventoryDBTx, in *biz.FinanceFactCreate) error {
	if in == nil || in.FactType != biz.FinanceFactReceivable ||
		in.SourceType == nil || *in.SourceType != biz.ShipmentSourceType ||
		in.SourceID == nil || *in.SourceID <= 0 {
		return biz.ErrBadParam
	}
	if err := lockOperationalFactRow(ctx, tx, "shipments", *in.SourceID, biz.ErrShipmentNotFound); err != nil {
		return err
	}
	parent, err := tx.client.Shipment.Get(ctx, *in.SourceID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrShipmentNotFound
		}
		return err
	}
	if parent.Status != biz.ShipmentStatusShipped || parent.CustomerID == nil || *parent.CustomerID <= 0 ||
		in.CounterpartyType != biz.FinanceCounterpartyCustomer || in.CounterpartyID == nil || *in.CounterpartyID != *parent.CustomerID {
		return biz.ErrBadParam
	}
	if in.SourceLineID != nil || in.Currency != biz.FinanceCurrencyCNY {
		return biz.ErrFinanceFactShipmentAmountInvalid
	}
	amount, err := shipmentFinanceAmountFromSnapshots(ctx, tx.client, parent.ID)
	if err != nil {
		return err
	}
	if !in.Amount.Equal(amount) {
		return biz.ErrFinanceFactShipmentAmountInvalid
	}
	collectionType := biz.FinanceCollectionAccountsReceivable
	paymentTerm, paymentTermDays, err := lockAndResolveShipmentFinancePaymentTermSnapshot(ctx, tx, parent)
	if err != nil {
		return err
	}
	if in.CollectionType == nil || *in.CollectionType != collectionType ||
		!sameOptionalString(in.PaymentTerm, paymentTerm) ||
		!sameOptionalInt(in.PaymentTermDays, paymentTermDays) ||
		in.InvoiceCategory != nil {
		return biz.ErrBadParam
	}
	return nil
}

func (r *operationalFactRepo) GetShipmentPaymentTermDays(ctx context.Context, shipmentID int) (*int, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || shipmentID <= 0 {
		return nil, biz.ErrBadParam
	}
	parent, err := r.data.postgres.Shipment.Get(ctx, shipmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if parent.Status != biz.ShipmentStatusShipped || parent.CustomerID == nil || *parent.CustomerID <= 0 {
		return nil, biz.ErrBadParam
	}
	return shipmentFinancePaymentTermDaysFromSource(ctx, r.data.postgres, parent)
}

func lockAndResolveShipmentFinancePaymentTermSnapshot(ctx context.Context, tx *inventoryDBTx, parent *ent.Shipment) (*string, *int, error) {
	if tx == nil || parent == nil || parent.SalesOrderID == nil || *parent.SalesOrderID <= 0 {
		return nil, nil, biz.ErrFinanceFactSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "sales_orders", *parent.SalesOrderID, biz.ErrFinanceFactSourceInvalid); err != nil {
		return nil, nil, err
	}
	days, err := shipmentFinancePaymentTermDaysFromSource(ctx, tx.client, parent)
	if err != nil {
		return nil, nil, err
	}
	return biz.FinancePaymentTermSnapshotFromDays(days)
}

func shipmentFinancePaymentTermDaysFromSource(ctx context.Context, client *ent.Client, parent *ent.Shipment) (*int, error) {
	if client == nil || parent == nil || parent.SalesOrderID == nil || *parent.SalesOrderID <= 0 || parent.CustomerID == nil || *parent.CustomerID <= 0 {
		return nil, biz.ErrFinanceFactSourceInvalid
	}
	order, err := client.SalesOrder.Get(ctx, *parent.SalesOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
		return nil, err
	}
	if order.CustomerID != *parent.CustomerID {
		return nil, biz.ErrFinanceFactSourceInvalid
	}
	if order.PaymentTermDays == nil {
		return nil, biz.ErrFinanceFactPaymentTermMissing
	}
	days := *order.PaymentTermDays
	return &days, nil
}

func shipmentFinanceAmountFromSnapshots(ctx context.Context, client *ent.Client, shipmentID int) (decimal.Decimal, error) {
	items, err := client.ShipmentItem.Query().
		Where(shipmentitem.ShipmentID(shipmentID)).
		Order(ent.Asc(shipmentitem.FieldID)).
		All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	if len(items) == 0 {
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	amount := decimal.Zero
	for _, item := range items {
		if item.SalesOrderItemID == nil || item.AmountSnapshot == nil || !item.AmountSnapshot.GreaterThan(decimal.Zero) || item.CurrencySnapshot != biz.FinanceCurrencyCNY {
			return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
		}
		amount = amount.Add(*item.AmountSnapshot)
	}
	if !amount.GreaterThan(decimal.Zero) {
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	return amount, nil
}

func recordFinanceFactProcessCommandResultInTx(
	ctx context.Context,
	tx *inventoryDBTx,
	fact *biz.FinanceFact,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) error {
	result, err := biz.FinanceReceivableLeadProcessCommandResult(fact)
	if err != nil {
		return err
	}
	return recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID)
}

// ValidateFinanceFactCreateReplay performs the read-only exact-key and
// recoverable-status check used before Process Runtime binds its command
// fingerprint. Creation still repeats both checks and owns the unique-key race.
func (r *operationalFactRepo) ValidateFinanceFactCreateReplay(ctx context.Context, in *biz.FinanceFactCreate) error {
	if r == nil || r.data == nil || r.data.postgres == nil || in == nil {
		return biz.ErrBadParam
	}
	replay, found, err := findFinanceFactReplay(ctx, r.data.postgres, in)
	if err != nil {
		return err
	}
	if found && !financeFactCanRecoverAppliedProcessResult(replay.Status) {
		return biz.ErrProcessDomainCommandRecoveryRequired
	}
	return nil
}

func (r *operationalFactRepo) PostFinanceFact(ctx context.Context, in *biz.OperationalFactStatusMutation) (*biz.FinanceFact, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || in.Reason != "" {
		return nil, biz.ErrBadParam
	}
	return r.changeFinanceFactStatus(ctx, in, biz.OperationalFactStatusPosted)
}

func (r *operationalFactRepo) SettleFinanceFact(ctx context.Context, in *biz.OperationalFactStatusMutation) (*biz.FinanceFact, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || in.Reason != "" {
		return nil, biz.ErrBadParam
	}
	return r.changeFinanceFactStatus(ctx, in, biz.OperationalFactStatusSettled)
}

func (r *operationalFactRepo) CancelPostedFinanceFact(ctx context.Context, in *biz.OperationalFactStatusMutation) (*biz.FinanceFact, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 ||
		in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, biz.ErrBadParam
	}
	return r.cancelPostedFinanceFact(ctx, in)
}

func (r *operationalFactRepo) GetFinanceFact(ctx context.Context, id int) (*biz.FinanceFact, error) {
	if id <= 0 {
		return nil, biz.ErrBadParam
	}
	row, err := r.data.postgres.FinanceFact.Query().
		Where(financefact.ID(id)).
		WithPoster().
		WithSettler().
		WithCanceller().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrFinanceFactNotFound
		}
		return nil, err
	}
	outstanding, err := financeFactOutstandingAmounts(ctx, r.data.postgres, []*ent.FinanceFact{row})
	if err != nil {
		return nil, err
	}
	out := entFinanceFactToBiz(row)
	out.OutstandingAmount = outstanding[row.ID]
	return out, nil
}

func (r *operationalFactRepo) ListFinanceFacts(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.FinanceFact, int, error) {
	return r.listFinanceFacts(ctx, filter, nil)
}

func (r *operationalFactRepo) ListFinanceFactsForAccess(
	ctx context.Context,
	filter biz.OperationalFactFilter,
	scope biz.FinanceFactAccessScope,
) ([]*biz.FinanceFact, int, error) {
	if scope.Empty() {
		return []*biz.FinanceFact{}, 0, nil
	}
	return r.listFinanceFacts(ctx, filter, &scope)
}

func (r *operationalFactRepo) listFinanceFacts(
	ctx context.Context,
	filter biz.OperationalFactFilter,
	scope *biz.FinanceFactAccessScope,
) ([]*biz.FinanceFact, int, error) {
	q := r.data.postgres.FinanceFact.Query()
	if scope != nil {
		q = q.Where(financefact.FactTypeIn(scope.AllowedTypes()...))
	}
	if filter.Status != "" {
		q = q.Where(financefact.Status(filter.Status))
	}
	if filter.FactType != "" {
		q = q.Where(financefact.FactType(filter.FactType))
	}
	if filter.CounterpartyID > 0 {
		q = q.Where(financefact.CounterpartyID(filter.CounterpartyID))
	}
	if filter.SourceType != "" {
		q = q.Where(financefact.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		q = q.Where(financefact.SourceID(filter.SourceID))
	}
	if filter.Keyword != "" {
		q = q.Where(financefact.Or(
			financefact.FactNoContainsFold(filter.Keyword),
			financefact.FactTypeContainsFold(filter.Keyword),
			financefact.StatusContainsFold(filter.Keyword),
			financefact.CounterpartyTypeContainsFold(filter.Keyword),
			financefact.CurrencyContainsFold(filter.Keyword),
			financefact.CollectionTypeContainsFold(filter.Keyword),
			financefact.PaymentTermContainsFold(filter.Keyword),
			financefact.InvoiceCategoryContainsFold(filter.Keyword),
			financefact.SourceTypeContainsFold(filter.Keyword),
			financefact.IdempotencyKeyContainsFold(filter.Keyword),
			financefact.NoteContainsFold(filter.Keyword),
			financefact.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			financefact.CounterpartyIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			financefact.SourceIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			financefact.SourceLineIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	if filter.DateFrom != nil {
		q = q.Where(financefact.OccurredAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where(financefact.OccurredAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.WithPoster().WithSettler().WithCanceller().Order(ent.Desc(financefact.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	references := make([]businessSourceReference, 0, len(rows))
	for _, row := range rows {
		references = append(references, businessSourceReference{sourceType: row.SourceType, sourceID: row.SourceID})
	}
	sourceNos, err := resolveBusinessSourceNos(ctx, r.data.postgres, references)
	if err != nil {
		return nil, 0, err
	}
	outstanding, err := financeFactOutstandingAmounts(ctx, r.data.postgres, rows)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.FinanceFact, 0, len(rows))
	for _, row := range rows {
		item := entFinanceFactToBiz(row)
		item.SourceNo = businessSourceNo(sourceNos, row.SourceType, row.SourceID)
		item.OutstandingAmount = outstanding[row.ID]
		out = append(out, item)
	}
	return out, total, nil
}

func financeFactOutstandingAmounts(
	ctx context.Context,
	client *ent.Client,
	facts []*ent.FinanceFact,
) (map[int]decimal.Decimal, error) {
	// Keep the read projection on the same netting rule used by payment and
	// credit-note write guards: posted rows consume, reversing rows restore.
	outstanding := make(map[int]decimal.Decimal, len(facts))
	factIDs := make([]int, 0, len(facts))
	for _, fact := range facts {
		if fact == nil || fact.ID <= 0 {
			continue
		}
		if _, exists := outstanding[fact.ID]; exists {
			continue
		}
		outstanding[fact.ID] = fact.Amount
		factIDs = append(factIDs, fact.ID)
	}
	if len(factIDs) == 0 {
		return outstanding, nil
	}

	allocations, err := client.FinanceAllocation.Query().
		Where(financeallocation.FinanceFactIDIn(factIDs...)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, allocation := range allocations {
		switch allocation.Status {
		case biz.FinanceAllocationStatusPosted:
			outstanding[allocation.FinanceFactID] = outstanding[allocation.FinanceFactID].Sub(allocation.Amount)
		case biz.FinanceAllocationStatusReversed:
			outstanding[allocation.FinanceFactID] = outstanding[allocation.FinanceFactID].Add(allocation.Amount)
		}
	}

	creditNotes, err := client.FinanceCreditNote.Query().
		Where(financecreditnote.FinanceFactIDIn(factIDs...)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, creditNote := range creditNotes {
		switch creditNote.Status {
		case "POSTED":
			outstanding[creditNote.FinanceFactID] = outstanding[creditNote.FinanceFactID].Sub(creditNote.Amount)
		case "REVERSED":
			outstanding[creditNote.FinanceFactID] = outstanding[creditNote.FinanceFactID].Add(creditNote.Amount)
		}
	}
	for _, amount := range outstanding {
		if amount.IsNegative() {
			return nil, biz.ErrBadParam
		}
	}
	return outstanding, nil
}

func (r *operationalFactRepo) changeFinanceFactStatus(ctx context.Context, in *biz.OperationalFactStatusMutation, status string) (*biz.FinanceFact, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", in.ID, biz.ErrFinanceFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.FinanceFact.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrFinanceFactNotFound
		}
		return nil, err
	}
	transitionActor := row.PostedBy
	if status == biz.OperationalFactStatusSettled {
		transitionActor = row.SettledBy
	}
	if row.Status == status {
		if row.Version == in.ExpectedVersion+1 && transitionActor != nil && *transitionActor == in.ActorID {
			if err := tx.sqlTx.Commit(); err != nil {
				return nil, err
			}
			tx = nil
			return entFinanceFactToBiz(row), nil
		}
		return nil, biz.ErrOperationalFactVersionConflict
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrOperationalFactVersionConflict
	}
	expectedStatus := ""
	switch status {
	case biz.OperationalFactStatusPosted:
		expectedStatus = biz.OperationalFactStatusDraft
		if row.Status != expectedStatus {
			return nil, biz.ErrBadParam
		}
		if err := validateFinanceFactTransitionSource(row); err != nil {
			return nil, err
		}
	case biz.OperationalFactStatusSettled:
		expectedStatus = biz.OperationalFactStatusPosted
		if row.FactType != biz.FinanceFactReconciliation {
			return nil, biz.ErrFinanceFactSettlementNotAllowed
		}
		if row.Status != expectedStatus {
			return nil, biz.ErrBadParam
		}
		if err := validateFinanceFactTransitionSource(row); err != nil {
			return nil, err
		}
	default:
		return nil, biz.ErrBadParam
	}
	tsField := "posted_at"
	if status == biz.OperationalFactStatusSettled {
		tsField = "settled_at"
	}
	now := time.Now()
	actorField := "posted_by"
	if status == biz.OperationalFactStatusSettled {
		actorField = "settled_by"
	}
	if err := updateVersionedOperationalFactStatus(
		ctx,
		tx,
		"finance_facts",
		in.ID,
		in.ExpectedVersion,
		expectedStatus,
		status,
		tsField,
		now,
		actorField,
		in.ActorID,
	); err != nil {
		return nil, err
	}
	row, err = tx.client.FinanceFact.Query().
		Where(financefact.ID(in.ID)).
		WithPoster().
		WithSettler().
		WithCanceller().
		Only(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entFinanceFactToBiz(row), nil
}

func validateFinanceFactTransitionSource(row *ent.FinanceFact) error {
	if row == nil || row.SourceType == nil || row.SourceID == nil || *row.SourceID <= 0 {
		return biz.ErrFinanceFactSourceInvalid
	}
	switch row.FactType {
	case biz.FinanceFactReceivable, biz.FinanceFactInvoice:
		if *row.SourceType != biz.ShipmentSourceType {
			return biz.ErrFinanceFactSourceInvalid
		}
	case biz.FinanceFactPayable:
		if *row.SourceType != biz.PurchaseReceiptSourceType && *row.SourceType != biz.OutsourcingFactSourceType {
			return biz.ErrFinanceFactSourceInvalid
		}
	case biz.FinanceFactReconciliation:
		if *row.SourceType != biz.FinanceFactSourceType {
			return biz.ErrFinanceFactSourceInvalid
		}
	default:
		return biz.ErrFinanceFactSourceInvalid
	}
	return nil
}

func (r *operationalFactRepo) cancelPostedFinanceFact(ctx context.Context, in *biz.OperationalFactStatusMutation) (*biz.FinanceFact, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", in.ID, biz.ErrFinanceFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.FinanceFact.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrFinanceFactNotFound
		}
		return nil, err
	}
	if row.Status == biz.OperationalFactStatusCancelled {
		if row.Version != in.ExpectedVersion+1 {
			return nil, biz.ErrOperationalFactVersionConflict
		}
		if row.CancelledBy == nil || row.CancelReason == nil ||
			*row.CancelledBy != in.ActorID || *row.CancelReason != in.Reason {
			return nil, biz.ErrIdempotencyConflict
		}
	} else {
		if row.Version != in.ExpectedVersion {
			return nil, biz.ErrOperationalFactVersionConflict
		}
		if row.Status != biz.OperationalFactStatusDraft && row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		if row.Status == biz.OperationalFactStatusDraft {
			if err := validateFinanceFactTransitionSource(row); err != nil {
				return nil, err
			}
		}
		activeReconciliation, err := hasActiveFinanceFactForSource(ctx, tx.client, biz.FinanceFactReconciliation, biz.FinanceFactSourceType, row.ID)
		if err != nil {
			return nil, err
		}
		if activeReconciliation {
			return nil, biz.ErrFinanceReconciliationDependency
		}
		hasActiveAllocation, err := hasActiveFinanceAllocationForFact(ctx, tx.client, row.ID)
		if err != nil {
			return nil, err
		}
		if hasActiveAllocation {
			return nil, biz.ErrFinanceAllocationDependency
		}
		hasActiveCredit, err := hasActiveFinanceCreditForFact(ctx, tx.client, row.ID)
		if err != nil {
			return nil, err
		}
		if hasActiveCredit {
			return nil, biz.ErrFinanceCreditNoteDependency
		}
		now := time.Now()
		if err := updateVersionedOperationalFactCancellation(
			ctx,
			tx,
			"finance_facts",
			in.ID,
			in.ExpectedVersion,
			row.Status,
			in.ActorID,
			in.Reason,
			now,
		); err != nil {
			return nil, err
		}
		if err := markProcessDomainCommandEffectCompensatedWithClient(
			ctx,
			tx.client,
			biz.ProcessDomainCommandFinanceReceivableLead,
			"finance_fact",
			row.ID,
			in.Reason,
			in.ActorID,
		); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.FinanceFact.Query().
		Where(financefact.ID(in.ID)).
		WithPoster().
		WithSettler().
		WithCanceller().
		Only(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entFinanceFactToBiz(row), nil
}

func hasActiveFinanceAllocationForFact(ctx context.Context, client *ent.Client, factID int) (bool, error) {
	rows, err := client.FinanceAllocation.Query().Where(
		financeallocation.FinanceFactID(factID),
	).All(ctx)
	if err != nil {
		return false, err
	}
	reversed := make(map[int]struct{}, len(rows))
	for _, row := range rows {
		if row.Status == biz.FinanceAllocationStatusReversed && row.ReversalOfAllocationID != nil {
			reversed[*row.ReversalOfAllocationID] = struct{}{}
		}
	}
	for _, row := range rows {
		if row.Status == biz.FinanceAllocationStatusPosted && row.ReversalOfAllocationID == nil {
			if _, found := reversed[row.ID]; !found {
				return true, nil
			}
		}
	}
	return false, nil
}

func hasActiveFinanceCreditForFact(ctx context.Context, client *ent.Client, factID int) (bool, error) {
	rows, err := client.FinanceCreditNote.Query().Where(
		financecreditnote.FinanceFactID(factID),
	).All(ctx)
	if err != nil {
		return false, err
	}
	reversed := make(map[int]struct{}, len(rows))
	for _, row := range rows {
		if row.Status == "REVERSED" && row.ReversalOfCreditNoteID != nil {
			reversed[*row.ReversalOfCreditNoteID] = struct{}{}
		}
	}
	for _, row := range rows {
		if row.Status == "POSTED" && row.ReversalOfCreditNoteID == nil {
			if _, found := reversed[row.ID]; !found {
				return true, nil
			}
		}
	}
	return false, nil
}

func entFinanceFactToBiz(row *ent.FinanceFact) *biz.FinanceFact {
	if row == nil {
		return nil
	}
	var cancellerName *string
	var posterName *string
	var settlerName *string
	if poster, err := row.Edges.PosterOrErr(); err == nil && poster != nil {
		name := poster.Username
		posterName = &name
	}
	if settler, err := row.Edges.SettlerOrErr(); err == nil && settler != nil {
		name := settler.Username
		settlerName = &name
	}
	if canceller, err := row.Edges.CancellerOrErr(); err == nil && canceller != nil {
		name := canceller.Username
		cancellerName = &name
	}
	return &biz.FinanceFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, Version: row.Version, CounterpartyType: row.CounterpartyType, CounterpartyID: row.CounterpartyID, Amount: row.Amount, OutstandingAmount: row.Amount, FeeAmount: row.FeeAmount, Currency: row.Currency, CollectionType: row.CollectionType, PaymentTerm: row.PaymentTerm, PaymentTermDays: row.PaymentTermDays, InvoiceCategory: row.InvoiceCategory, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, PostedBy: row.PostedBy, PostedByName: posterName, SettledAt: row.SettledAt, SettledBy: row.SettledBy, SettledByName: settlerName, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelledByName: cancellerName, CancelReason: row.CancelReason, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
