package data

import (
	"context"
	"database/sql"
	"entgo.io/ent/dialect"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financepayment"
)

// A statement is a projection of posted facts and their dated reversals. Payment
// allocations are deliberately absent: allocation moves no cash and would count
// the same settlement twice. Advances therefore appear as a credit balance.
func (r *operationalFactRepo) GetFinanceStatement(ctx context.Context, q biz.FinanceStatementQuery) (*biz.FinanceStatement, error) {
	from, to, err := biz.FinanceDateRange(q.DateFrom, q.DateTo)
	if err != nil {
		return nil, err
	}
	factType := biz.FinanceFactPayable
	direction := biz.FinancePaymentDirectionDisbursement
	if q.CounterpartyType == biz.FinanceCounterpartyCustomer {
		factType = biz.FinanceFactReceivable
		direction = biz.FinancePaymentDirectionReceipt
	}
	args := []any{q.CounterpartyType, q.CounterpartyID, q.Currency, factType, direction, q.SnapshotAt, from, to}
	cte := `WITH facts AS (
 SELECT * FROM finance_facts WHERE counterparty_type=$1 AND counterparty_id=$2 AND currency=$3 AND fact_type=$4 AND posted_at IS NOT NULL
), payments AS (
 SELECT *,CASE WHEN direction=$5 THEN -amount ELSE amount END AS effect FROM finance_payments
 WHERE counterparty_type=$1 AND counterparty_id=$2 AND currency=$3 AND posted_at IS NOT NULL
), events AS (
 SELECT 'BILL' AS kind,'fact:' || CAST(id AS TEXT) AS event_key,id AS source_id,fact_no AS number,posted_at AS event_at,amount AS amount FROM facts
 UNION ALL SELECT 'BILL_CANCEL','fact_cancel:' || CAST(id AS TEXT),id,fact_no,cancelled_at,-amount FROM facts WHERE cancelled_at IS NOT NULL
 UNION ALL SELECT 'PAYMENT','payment:' || CAST(id AS TEXT),id,payment_no,posted_at,effect FROM payments
 UNION ALL SELECT 'PAYMENT_REVERSE','payment_reverse:' || CAST(id AS TEXT),id,payment_no,reversed_at,-effect FROM payments WHERE reversed_at IS NOT NULL
 UNION ALL SELECT CASE WHEN n.status='REVERSED' THEN 'ADJUSTMENT_REVERSE' ELSE 'ADJUSTMENT' END,'adjustment:' || CAST(n.id AS TEXT),n.id,n.credit_note_no,n.created_at,
 n.amount*(CASE WHEN n.balance_direction='INCREASE' THEN 1 ELSE -1 END)*(CASE WHEN n.status='REVERSED' THEN -1 ELSE 1 END)
 FROM finance_credit_notes n JOIN facts f ON f.id=n.finance_fact_id
), visible AS (SELECT * FROM events WHERE event_at<=$6 AND event_at<$8), running AS (
 SELECT *,SUM(amount) OVER(ORDER BY event_at,event_key ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance FROM visible
) `
	// Keep opening, totals, rows and pagination on a single database snapshot.
	tx, err := r.data.sqldb.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	out := &biz.FinanceStatement{CounterpartyType: q.CounterpartyType, CounterpartyID: q.CounterpartyID, Currency: q.Currency, DateFrom: q.DateFrom, DateTo: q.DateTo, SnapshotAt: q.SnapshotAt, Entries: []*biz.FinanceStatementEntry{}}
	bind := func(query string) string {
		if r.data.sqlDialect == dialect.SQLite {
			return statisticsBindParameter.ReplaceAllString(query, `?${1}`)
		}
		return query
	}
	query := cte + `SELECT COALESCE(SUM(CASE WHEN event_at<$7 THEN amount ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN event_at>=$7 AND amount>0 THEN amount ELSE 0 END),0),
 COALESCE(SUM(CASE WHEN event_at>=$7 AND amount<0 THEN -amount ELSE 0 END),0),
 COALESCE(SUM(amount),0),COALESCE(SUM(CASE WHEN event_at>=$7 THEN 1 ELSE 0 END),0) FROM visible`
	if err := tx.QueryRowContext(ctx, bind(query), args...).Scan(&out.Opening, &out.Increase, &out.Decrease, &out.Closing, &out.Total); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, bind(cte+"SELECT event_key,CAST("+progressDateSQL("event_at", r.data.sqlDialect)+" AS TEXT),kind,source_id,number,amount,balance FROM running WHERE event_at>=$7 ORDER BY event_at,event_key LIMIT $9 OFFSET $10"), append(args, q.Limit, q.Offset)...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		item := &biz.FinanceStatementEntry{}
		if err := rows.Scan(&item.Key, &item.Date, &item.Kind, &item.SourceID, &item.Number, &item.Amount, &item.Balance); err != nil {
			_ = rows.Close()
			return nil, err
		}
		item.Amount, item.Balance = item.Amount.Round(6), item.Balance.Round(6)
		out.Entries = append(out.Entries, item)
	}
	err = rows.Err()
	if closeErr := rows.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return nil, err
	}
	out.Opening, out.Increase, out.Decrease, out.Closing = out.Opening.Round(6), out.Increase.Round(6), out.Decrease.Round(6), out.Closing.Round(6)
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *operationalFactRepo) FinancePaymentTotals(ctx context.Context, filter biz.FinancePaymentFilter) ([]*biz.FinancePaymentTotal, error) {
	rows := []*biz.FinancePaymentTotal{}
	err := r.financePaymentListQuery(filter).GroupBy(financepayment.FieldCurrency, financepayment.FieldDirection, financepayment.FieldStatus).
		Aggregate(ent.As(ent.Sum(financepayment.FieldAmount), "amount"), ent.Count()).Scan(ctx, &rows)
	return rows, err
}
