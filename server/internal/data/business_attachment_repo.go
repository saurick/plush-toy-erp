package data

import (
	"context"
	stdsql "database/sql"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/businessattachment"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/workflowtask"

	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
)

type businessAttachmentRepo struct {
	data *Data
	log  *log.Helper
}

func NewBusinessAttachmentRepo(d *Data, logger log.Logger) *businessAttachmentRepo {
	return &businessAttachmentRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.business_attachment_repo")),
	}
}

var _ biz.BusinessAttachmentRepo = (*businessAttachmentRepo)(nil)

func (r *businessAttachmentRepo) CreateBusinessAttachment(ctx context.Context, in *biz.BusinessAttachmentCreate) (*biz.BusinessAttachment, error) {
	ownerTable, ok := businessAttachmentOwnerTable(in.OwnerType)
	if !ok || r == nil || r.data == nil || r.data.sqldb == nil {
		return nil, biz.ErrBusinessAttachmentOwnerInvalid
	}
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	ownerQuery := fmt.Sprintf("SELECT id FROM %s WHERE id = $1 FOR KEY SHARE", ownerTable)
	workflowGuard := in.WorkflowGuard
	if in.OwnerType == biz.BusinessAttachmentOwnerWorkflowTask {
		if workflowGuard == nil || workflowGuard.ExpectedVersion <= 0 || workflowGuard.ActorID <= 0 {
			return nil, biz.ErrBadParam
		}
		ownerQuery = "SELECT id, version, task_status_key, owner_role_key, assignee_id FROM workflow_tasks WHERE id = $1 FOR UPDATE"
	}
	if r.data.sqlDialect == "sqlite3" {
		ownerQuery = fmt.Sprintf("SELECT id FROM %s WHERE id = ?", ownerTable)
		if in.OwnerType == biz.BusinessAttachmentOwnerWorkflowTask {
			ownerQuery = "SELECT id, version, task_status_key, owner_role_key, assignee_id FROM workflow_tasks WHERE id = ?"
		}
	}
	var ownerID int
	var ownerErr error
	if in.OwnerType == biz.BusinessAttachmentOwnerWorkflowTask {
		var version int
		var statusKey, ownerRoleKey string
		var assigneeID stdsql.NullInt64
		ownerErr = tx.QueryRowContext(ctx, ownerQuery, in.OwnerID).Scan(&ownerID, &version, &statusKey, &ownerRoleKey, &assigneeID)
		if ownerErr == nil {
			if version != workflowGuard.ExpectedVersion {
				return nil, biz.ErrWorkflowTaskConflict
			}
			if biz.IsTerminalWorkflowTaskStatus(statusKey) {
				return nil, biz.ErrWorkflowTaskSettled
			}
			allowed := assigneeID.Valid && int(assigneeID.Int64) == workflowGuard.ActorID
			if !assigneeID.Valid {
				for _, roleKey := range workflowGuard.VisibleOwnerRoleKeys {
					if roleKey == ownerRoleKey {
						allowed = true
						break
					}
				}
			}
			if !allowed {
				return nil, biz.ErrForbidden
			}
		}
	} else {
		ownerErr = tx.QueryRowContext(ctx, ownerQuery, in.OwnerID).Scan(&ownerID)
	}
	if err := ownerErr; err != nil {
		if err == stdsql.ErrNoRows {
			return nil, biz.ErrBusinessAttachmentOwnerNotFound
		}
		return nil, err
	}

	insertQuery := `
		INSERT INTO business_attachments
			(owner_type, owner_id, attachment_type, slot_key, file_name, mime_type, file_size, sha256, content, uploaded_by, note, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
		RETURNING id, created_at`
	if r.data.sqlDialect == "sqlite3" {
		insertQuery = `
			INSERT INTO business_attachments
				(owner_type, owner_id, attachment_type, slot_key, file_name, mime_type, file_size, sha256, content, uploaded_by, note, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			RETURNING id, created_at`
	}
	var id int
	var createdAt time.Time
	if err := tx.QueryRowContext(
		ctx,
		insertQuery,
		in.OwnerType,
		in.OwnerID,
		in.AttachmentType,
		in.SlotKey,
		in.FileName,
		in.MimeType,
		in.FileSize,
		in.SHA256,
		in.Content,
		in.UploadedBy,
		in.Note,
	).Scan(&id, &createdAt); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &biz.BusinessAttachment{
		ID:             id,
		OwnerType:      in.OwnerType,
		OwnerID:        in.OwnerID,
		AttachmentType: in.AttachmentType,
		SlotKey:        in.SlotKey,
		FileName:       in.FileName,
		MimeType:       in.MimeType,
		FileSize:       in.FileSize,
		SHA256:         in.SHA256,
		Content:        append([]byte(nil), in.Content...),
		UploadedBy:     in.UploadedBy,
		Note:           in.Note,
		CreatedAt:      createdAt,
	}, nil
}

func businessAttachmentOwnerTable(ownerType string) (string, bool) {
	tables := map[string]string{
		biz.BusinessAttachmentOwnerSalesOrder:        "sales_orders",
		biz.BusinessAttachmentOwnerPurchaseOrder:     "purchase_orders",
		biz.BusinessAttachmentOwnerOutsourcingOrder:  "outsourcing_orders",
		biz.BusinessAttachmentOwnerPurchaseReceipt:   "purchase_receipts",
		biz.BusinessAttachmentOwnerQualityInspection: "quality_inspections",
		biz.BusinessAttachmentOwnerShipment:          "shipments",
		biz.BusinessAttachmentOwnerFinanceFact:       "finance_facts",
		biz.BusinessAttachmentOwnerProductionFact:    "production_facts",
		biz.BusinessAttachmentOwnerOutsourcingFact:   "outsourcing_facts",
		biz.BusinessAttachmentOwnerProductSKU:        "product_skus",
		biz.BusinessAttachmentOwnerBOMHeader:         "bom_headers",
		biz.BusinessAttachmentOwnerWorkflowTask:      "workflow_tasks",
	}
	table, ok := tables[ownerType]
	return table, ok
}

func (r *businessAttachmentRepo) ListBusinessAttachments(ctx context.Context, ownerType string, ownerID int) ([]*biz.BusinessAttachment, error) {
	rows, err := r.data.postgres.BusinessAttachment.Query().
		Select(
			businessattachment.FieldID,
			businessattachment.FieldOwnerType,
			businessattachment.FieldOwnerID,
			businessattachment.FieldAttachmentType,
			businessattachment.FieldSlotKey,
			businessattachment.FieldFileName,
			businessattachment.FieldMimeType,
			businessattachment.FieldFileSize,
			businessattachment.FieldSha256,
			businessattachment.FieldUploadedBy,
			businessattachment.FieldNote,
			businessattachment.FieldCreatedAt,
		).
		Where(
			businessattachment.OwnerType(ownerType),
			businessattachment.OwnerID(ownerID),
		).
		Order(businessattachment.ByCreatedAt(entsql.OrderDesc()), businessattachment.ByID(entsql.OrderDesc())).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return entBusinessAttachmentsToBiz(rows), nil
}

func (r *businessAttachmentRepo) GetBusinessAttachmentMetadata(ctx context.Context, id int) (*biz.BusinessAttachment, error) {
	row, err := r.data.postgres.BusinessAttachment.Query().
		Select(
			businessattachment.FieldID,
			businessattachment.FieldOwnerType,
			businessattachment.FieldOwnerID,
			businessattachment.FieldAttachmentType,
			businessattachment.FieldSlotKey,
			businessattachment.FieldFileName,
			businessattachment.FieldMimeType,
			businessattachment.FieldFileSize,
			businessattachment.FieldSha256,
			businessattachment.FieldUploadedBy,
			businessattachment.FieldNote,
			businessattachment.FieldCreatedAt,
		).
		Where(businessattachment.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessAttachmentNotFound
		}
		return nil, err
	}
	return entBusinessAttachmentToBiz(row), nil
}

func (r *businessAttachmentRepo) GetBusinessAttachmentContent(ctx context.Context, id int, ownerType string, ownerID int) ([]byte, error) {
	ownerTable, ok := businessAttachmentOwnerTable(ownerType)
	if !ok || r == nil || r.data == nil || r.data.sqldb == nil || id <= 0 || ownerID <= 0 {
		return nil, biz.ErrBusinessAttachmentOwnerInvalid
	}
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	ownerQuery := fmt.Sprintf("SELECT id FROM %s WHERE id = $1 FOR KEY SHARE", ownerTable)
	contentQuery := "SELECT content FROM business_attachments WHERE id = $1 AND owner_type = $2 AND owner_id = $3"
	if r.data.sqlDialect == "sqlite3" {
		ownerQuery = fmt.Sprintf("SELECT id FROM %s WHERE id = ?", ownerTable)
		contentQuery = "SELECT content FROM business_attachments WHERE id = ? AND owner_type = ? AND owner_id = ?"
	}
	var lockedOwnerID int
	if err := tx.QueryRowContext(ctx, ownerQuery, ownerID).Scan(&lockedOwnerID); err != nil {
		if err == stdsql.ErrNoRows {
			return nil, biz.ErrBusinessAttachmentOwnerNotFound
		}
		return nil, err
	}
	var content []byte
	if err := tx.QueryRowContext(ctx, contentQuery, id, ownerType, ownerID).Scan(&content); err != nil {
		if err == stdsql.ErrNoRows {
			return nil, biz.ErrBusinessAttachmentNotFound
		}
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return content, nil
}

func (r *businessAttachmentRepo) BusinessAttachmentOwnerExists(ctx context.Context, ownerType string, ownerID int) (bool, error) {
	switch ownerType {
	case biz.BusinessAttachmentOwnerSalesOrder:
		return r.data.postgres.SalesOrder.Query().Where(salesorder.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerPurchaseOrder:
		return r.data.postgres.PurchaseOrder.Query().Where(purchaseorder.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerOutsourcingOrder:
		return r.data.postgres.OutsourcingOrder.Query().Where(outsourcingorder.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerPurchaseReceipt:
		return r.data.postgres.PurchaseReceipt.Query().Where(purchasereceipt.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerQualityInspection:
		return r.data.postgres.QualityInspection.Query().Where(qualityinspection.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerShipment:
		return r.data.postgres.Shipment.Query().Where(shipment.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerFinanceFact:
		return r.data.postgres.FinanceFact.Query().Where(financefact.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerProductionFact:
		return r.data.postgres.ProductionFact.Query().Where(productionfact.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerOutsourcingFact:
		return r.data.postgres.OutsourcingFact.Query().Where(outsourcingfact.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerProductSKU:
		return r.data.postgres.ProductSKU.Query().Where(productsku.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerBOMHeader:
		return r.data.postgres.BOMHeader.Query().Where(bomheader.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerWorkflowTask:
		return r.data.postgres.WorkflowTask.Query().Where(workflowtask.ID(ownerID)).Exist(ctx)
	default:
		return false, nil
	}
}

func entBusinessAttachmentToBiz(row *ent.BusinessAttachment) *biz.BusinessAttachment {
	if row == nil {
		return nil
	}
	return &biz.BusinessAttachment{
		ID:             row.ID,
		OwnerType:      row.OwnerType,
		OwnerID:        row.OwnerID,
		AttachmentType: row.AttachmentType,
		SlotKey:        row.SlotKey,
		FileName:       row.FileName,
		MimeType:       row.MimeType,
		FileSize:       row.FileSize,
		SHA256:         row.Sha256,
		UploadedBy:     row.UploadedBy,
		Note:           row.Note,
		CreatedAt:      row.CreatedAt,
	}
}

func entBusinessAttachmentsToBiz(rows []*ent.BusinessAttachment) []*biz.BusinessAttachment {
	out := make([]*biz.BusinessAttachment, 0, len(rows))
	for _, row := range rows {
		out = append(out, entBusinessAttachmentToBiz(row))
	}
	return out
}
