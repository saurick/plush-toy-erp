package data

import (
	"context"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"errors"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuserrole"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/role"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/shipment"
)

func (r *workflowRepo) GetWorkflowFollowupSource(ctx context.Context, sourceType string, sourceID int) (*biz.WorkflowFollowupSource, error) {
	return r.workflowFollowupSource(ctx, r.data.postgres, sourceType, sourceID, false)
}

func (r *workflowRepo) ResolveWorkflowFollowupCreate(ctx context.Context, actorID int, key, intent string) (*biz.WorkflowTask, bool, error) {
	return r.resolveWorkflowTaskCreate(ctx, actorID, key, intent)
}

func (r *workflowRepo) workflowFollowupSource(ctx context.Context, client *ent.Client, sourceType string, sourceID int, lock bool) (*biz.WorkflowFollowupSource, error) {
	source := &biz.WorkflowFollowupSource{ID: sourceID, Type: sourceType}
	var err error
	switch sourceType {
	case "sales_order":
		query := client.SalesOrder.Query().Where(salesorder.ID(sourceID))
		if lock && r.data.sqlDialect == dialect.Postgres {
			query = query.Where(func(s *sql.Selector) { s.ForUpdate() })
		}
		row, readErr := query.Only(ctx)
		err = readErr
		if row != nil {
			source.No, source.Status = row.OrderNo, row.LifecycleStatus
		}
	case "purchase_order":
		query := client.PurchaseOrder.Query().Where(purchaseorder.ID(sourceID))
		if lock && r.data.sqlDialect == dialect.Postgres {
			query = query.Where(func(s *sql.Selector) { s.ForUpdate() })
		}
		row, readErr := query.Only(ctx)
		err = readErr
		if row != nil {
			source.No, source.Status = row.PurchaseOrderNo, row.LifecycleStatus
		}
	case "outsourcing_order":
		query := client.OutsourcingOrder.Query().Where(outsourcingorder.ID(sourceID))
		if lock && r.data.sqlDialect == dialect.Postgres {
			query = query.Where(func(s *sql.Selector) { s.ForUpdate() })
		}
		row, readErr := query.Only(ctx)
		err = readErr
		if row != nil {
			source.No, source.Status = row.OutsourcingOrderNo, row.LifecycleStatus
		}
	case "production_order":
		query := client.ProductionOrder.Query().Where(productionorder.ID(sourceID))
		if lock && r.data.sqlDialect == dialect.Postgres {
			query = query.Where(func(s *sql.Selector) { s.ForUpdate() })
		}
		row, readErr := query.Only(ctx)
		err = readErr
		if row != nil {
			source.No, source.Status = row.OrderNo, row.Status
		}
	case "shipment":
		query := client.Shipment.Query().Where(shipment.ID(sourceID))
		if lock && r.data.sqlDialect == dialect.Postgres {
			query = query.Where(func(s *sql.Selector) { s.ForUpdate() })
		}
		row, readErr := query.Only(ctx)
		err = readErr
		if row != nil {
			source.No, source.Status = row.ShipmentNo, row.Status
		}
	default:
		return nil, biz.ErrBadParam
	}
	if ent.IsNotFound(err) {
		return nil, biz.ErrWorkflowTaskNotFound
	}
	if err != nil {
		return nil, err
	}
	return source, nil
}

func (r *workflowRepo) prepareWorkflowFollowupInTx(ctx context.Context, tx *ent.Tx, in *biz.WorkflowTaskCreate) error {
	source, err := r.workflowFollowupSource(ctx, tx.Client(), in.SourceType, in.SourceID, true)
	if err != nil {
		return err
	}
	spec, ok := biz.WorkflowFollowupSourceSpecFor(source.Type)
	if !ok || !spec.CanCreate(source.Status) {
		return biz.ErrBadParam
	}
	in.SourceNo = &source.No
	task := &biz.WorkflowTask{TaskGroup: in.TaskGroup, OwnerRoleKey: in.OwnerRoleKey}
	validate := func(id int) error {
		return r.validateWorkflowAssignmentTargetInTx(ctx, tx, &biz.WorkflowTaskAssignment{
			TargetAssigneeID: &id, RequiredOwnerRoleKey: in.OwnerRoleKey,
			RequiredPermissionKeys:       []string{biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskUpdate, biz.WorkflowStatusActionPermission("done", task)},
			RequiredAccountPermissionAny: spec.ReadPermissions,
		})
	}
	if in.AssigneeID != nil {
		return validate(*in.AssigneeID)
	}
	ownerRole, err := tx.Role.Query().Where(role.RoleKey(in.OwnerRoleKey)).Only(ctx)
	if ent.IsNotFound(err) {
		return biz.ErrWorkflowAssigneeIneligible
	}
	if err != nil {
		return err
	}
	members, err := tx.AdminUserRole.Query().Where(adminuserrole.RoleID(ownerRole.ID)).Order(ent.Asc(adminuserrole.FieldAdminUserID)).All(ctx)
	if err != nil {
		return err
	}
	for _, member := range members {
		if err := validate(member.AdminUserID); err == nil {
			return nil
		} else if !errors.Is(err, biz.ErrWorkflowAssigneeIneligible) {
			return err
		}
	}
	return biz.ErrWorkflowAssigneeIneligible
}
