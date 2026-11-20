package data

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"regexp"
	"strings"

	"server/internal/biz"
	"server/internal/unitpolicy"

	"github.com/shopspring/decimal"
)

const LegacyProductionMaterialRecoveryVersion = "20260927095806"

var legacyMaterialRecoveryDatabase = regexp.MustCompile(`^plush_erp_ci_[a-z0-9_]+$`)

type LegacyProductionMaterialRepair struct {
	RequirementID int             `json:"requirement_id"`
	Before        decimal.Decimal `json:"before"`
	After         decimal.Decimal `json:"after"`
}

// RepairLegacyProductionMaterialRequirements corrects proven backfilled
// demand on an offline restored copy immediately before unit normalization.
func RepairLegacyProductionMaterialRequirements(ctx context.Context, db *sql.DB, database string, apply bool) ([]LegacyProductionMaterialRepair, error) {
	if !legacyMaterialRecoveryDatabase.MatchString(database) {
		return nil, fmt.Errorf("material repair requires a disposable restore database")
	}
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable, ReadOnly: !apply})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var actual, serverAddress string
	var otherClients int
	if err := tx.QueryRowContext(ctx, `
SELECT current_database(), COALESCE(host(inet_server_addr()), ''),
       (SELECT count(*) FROM pg_stat_activity
        WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid())`).
		Scan(&actual, &serverAddress, &otherClients); err != nil {
		return nil, err
	}
	if actual != database || !net.ParseIP(serverAddress).IsLoopback() || otherClients != 0 {
		return nil, fmt.Errorf("material repair requires the exact offline loopback restore database")
	}
	var version string
	var complete bool
	if err := tx.QueryRowContext(ctx, `
SELECT version, applied = total FROM atlas_schema_revisions.atlas_schema_revisions
ORDER BY version DESC LIMIT 1`).Scan(&version, &complete); err != nil {
		return nil, err
	}
	if version != LegacyProductionMaterialRecoveryVersion || !complete {
		return nil, fmt.Errorf("material repair requires complete Atlas version %s", LegacyProductionMaterialRecoveryVersion)
	}
	if apply {
		if _, err := tx.ExecContext(ctx, `LOCK TABLE production_order_material_requirements, production_order_items,
production_orders, production_facts, production_wip_outsourcing_allocations, production_exception_decisions
IN SHARE ROW EXCLUSIVE MODE NOWAIT`); err != nil {
			return nil, fmt.Errorf("historical material sources are in use: %w", err)
		}
	}
	rows, err := tx.QueryContext(ctx, `
SELECT r.id, r.planned_quantity, u.name,
       oi.planned_quantity * r.unit_quantity_snapshot * (1 + r.loss_rate_snapshot),
       COALESCE(o.status IN ('RELEASED', 'CLOSED') AND o.released_at IS NOT NULL
         AND r.created_at = o.released_at AND r.updated_at = r.created_at
         AND oi.production_order_id = o.id AND oi.bom_header_id = r.bom_header_id, false),
       EXISTS (SELECT 1 FROM production_facts f
               WHERE f.fact_type = 'MATERIAL_ISSUE' AND f.subject_id = r.material_id
                 AND f.source_type = 'PRODUCTION_ORDER' AND f.source_id = o.id)
         OR EXISTS (SELECT 1 FROM production_wip_outsourcing_allocations a
                    WHERE a.production_order_material_requirement_id = r.id)
         OR EXISTS (SELECT 1 FROM production_exception_decisions x WHERE x.production_material_requirement_id = r.id)
  FROM production_order_material_requirements r
  JOIN production_order_items oi ON oi.id = r.production_order_item_id
  JOIN production_orders o ON o.id = r.production_order_id
  JOIN units u ON u.id = r.unit_id
 ORDER BY r.id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	precisions := map[string]int{}
	for _, unit := range unitpolicy.Standards() {
		for _, name := range append([]string{unit.Code, unit.Name}, unit.Aliases...) {
			precisions[strings.ToLower(name)] = unit.Precision
		}
	}
	repairs := []LegacyProductionMaterialRepair{}
	for rows.Next() {
		var repair LegacyProductionMaterialRepair
		var demand decimal.Decimal
		var unit string
		var backfilled, referenced bool
		if err := rows.Scan(&repair.RequirementID, &repair.Before, &unit, &demand, &backfilled, &referenced); err != nil {
			return nil, err
		}
		unit = strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(unit, "核心演示单位-"), "核心演示单位－"))
		precision, known := precisions[strings.ToLower(unit)]
		if !known || repair.Before.Equal(repair.Before.Truncate(int32(precision))) {
			continue
		}
		if !backfilled || referenced || !repair.Before.Equal(demand.Round(6)) {
			return nil, fmt.Errorf("requirement %d needs manual source or linked-fact reconciliation", repair.RequirementID)
		}
		repair.After, err = biz.RoundRequiredUnitQuantity(demand, precision)
		if err != nil {
			return nil, fmt.Errorf("requirement %d: %w", repair.RequirementID, err)
		}
		repairs = append(repairs, repair)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if !apply {
		return repairs, nil
	}
	for _, repair := range repairs {
		result, err := tx.ExecContext(ctx, `UPDATE production_order_material_requirements
SET planned_quantity = $1, updated_at = now() WHERE id = $2 AND planned_quantity = $3`,
			repair.After, repair.RequirementID, repair.Before)
		if err != nil {
			return nil, err
		}
		n, err := result.RowsAffected()
		if err != nil || n != 1 {
			return nil, fmt.Errorf("material requirement %d changed during repair", repair.RequirementID)
		}
	}
	return repairs, tx.Commit()
}
