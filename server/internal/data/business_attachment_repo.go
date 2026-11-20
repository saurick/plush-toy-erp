package data

import (
	"context"
	"crypto/sha256"
	stdsql "database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"server/internal/attachmentstore"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/businessattachment"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/financepayment"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/product"
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
	data    *Data
	log     *log.Helper
	objects attachmentstore.Store
}

func NewBusinessAttachmentRepo(d *Data, objects attachmentstore.Store, logger log.Logger) *businessAttachmentRepo {
	return &businessAttachmentRepo{
		data:    d,
		log:     log.NewHelper(log.With(logger, "module", "data.business_attachment_repo")),
		objects: objects,
	}
}

var _ biz.BusinessAttachmentRepo = (*businessAttachmentRepo)(nil)

func (r *businessAttachmentRepo) ListProductImageReferences(ctx context.Context, productIDs []int) (map[int]int, error) {
	return r.listPrimaryImageReferences(ctx, biz.BusinessAttachmentOwnerProduct, biz.BusinessAttachmentTypeProductImage, product.Table, productIDs)
}

func (r *businessAttachmentRepo) ListMaterialImageReferences(ctx context.Context, materialIDs []int) (map[int]int, error) {
	return r.listPrimaryImageReferences(ctx, biz.BusinessAttachmentOwnerMaterial, biz.BusinessAttachmentTypeMaterialImage, material.Table, materialIDs)
}

func (r *businessAttachmentRepo) listPrimaryImageReferences(ctx context.Context, ownerType, attachmentType, ownerTable string, ownerIDs []int) (map[int]int, error) {
	refs := make(map[int]int, len(ownerIDs))
	for _, id := range ownerIDs {
		refs[id] = 0
	}
	if len(ownerIDs) == 0 {
		return refs, nil
	}
	rows, err := r.data.postgres.BusinessAttachment.Query().
		Select(businessattachment.FieldID, businessattachment.FieldOwnerID).
		Where(
			businessattachment.OwnerTypeEQ(ownerType),
			businessattachment.OwnerIDIn(ownerIDs...),
			businessattachment.AttachmentTypeEQ(attachmentType),
			businessattachment.SlotKeyEQ(biz.BusinessAttachmentProductImageSlotPrimary),
			businessattachment.WithdrawnAtIsNil(),
			func(s *entsql.Selector) {
				owner := entsql.Table(ownerTable)
				s.Where(entsql.In(s.C(businessattachment.FieldOwnerID), entsql.Select(owner.C("id")).From(owner)))
			},
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		refs[row.OwnerID] = row.ID
	}
	return refs, nil
}

func (r *businessAttachmentRepo) CreateBusinessAttachment(ctx context.Context, in *biz.BusinessAttachmentCreate) (*biz.BusinessAttachment, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil || in == nil {
		return nil, biz.ErrBusinessAttachmentOwnerInvalid
	}
	ownerTable, ok := businessAttachmentOwnerTable(in.OwnerType)
	if !ok {
		return nil, biz.ErrBusinessAttachmentOwnerInvalid
	}
	productImageWrite := in.OwnerType == biz.BusinessAttachmentOwnerProduct || in.AttachmentType == biz.BusinessAttachmentTypeProductImage
	if productImageWrite && (in.OwnerType != biz.BusinessAttachmentOwnerProduct ||
		in.AttachmentType != biz.BusinessAttachmentTypeProductImage ||
		in.SlotKey == nil ||
		!biz.IsBusinessAttachmentProductImageUploadSlot(*in.SlotKey)) {
		return nil, biz.ErrBadParam
	}
	materialImageWrite := in.AttachmentType == biz.BusinessAttachmentTypeMaterialImage
	if materialImageWrite && (in.OwnerType != biz.BusinessAttachmentOwnerMaterial ||
		in.SlotKey == nil || *in.SlotKey != biz.BusinessAttachmentProductImageSlotPrimary) {
		return nil, biz.ErrBadParam
	}
	if in.OwnerType == biz.BusinessAttachmentOwnerMaterial && !materialImageWrite && (in.AttachmentType != "evidence" || in.SlotKey != nil) {
		return nil, biz.ErrBadParam
	}
	referenceImageWrite := productImageWrite || materialImageWrite
	if r.objects == nil {
		return nil, biz.ErrBusinessAttachmentStorageUnavailable
	}
	digest := sha256.Sum256(in.Content)
	maxFileBytes := biz.BusinessAttachmentMaxBytes
	if referenceImageWrite {
		maxFileBytes = biz.BusinessAttachmentProductImageMaxBytes
	}
	if len(in.Content) != in.FileSize || in.FileSize <= 0 || in.FileSize > maxFileBytes ||
		hex.EncodeToString(digest[:]) != in.SHA256 {
		return nil, biz.ErrBusinessAttachmentIntegrity
	}
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	ownerQuery := fmt.Sprintf("SELECT id FROM %s WHERE id = $1 FOR KEY SHARE", ownerTable)
	workflowGuard := in.WorkflowGuard
	if referenceImageWrite {
		ownerQuery = businessAttachmentImageOwnerLockSQL(ownerTable, r.data.sqlDialect)
	} else if in.OwnerType == biz.BusinessAttachmentOwnerWorkflowTask {
		if workflowGuard == nil || workflowGuard.ExpectedVersion <= 0 || workflowGuard.ActorID <= 0 {
			return nil, biz.ErrBadParam
		}
		ownerQuery = "SELECT id, version, task_status_key, owner_role_key, assignee_id FROM workflow_tasks WHERE id = $1 FOR UPDATE"
	}
	if r.data.sqlDialect == "sqlite3" {
		ownerQuery = fmt.Sprintf("SELECT id FROM %s WHERE id = ?", ownerTable)
		if referenceImageWrite {
			ownerQuery = businessAttachmentImageOwnerLockSQL(ownerTable, r.data.sqlDialect)
		} else if in.OwnerType == biz.BusinessAttachmentOwnerWorkflowTask {
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
	slotKey := in.SlotKey
	supplemental := productImageWrite && *slotKey == biz.BusinessAttachmentProductImageSlotSupplemental
	if supplemental {
		slot, existing, err := resolveSupplementalProductImageSlot(ctx, tx, r.data.sqlDialect, in.OwnerID, in.SHA256)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			return existing, nil
		}
		slotKey = &slot
	} else if productImageWrite {
		if err := requireUnreferencedProductImage(ctx, tx, in.OwnerID, *slotKey, r.data.sqlDialect); err != nil {
			return nil, err
		}
	}
	// Keep the owner lock through the bounded object write. The SQL transaction
	// still owns slot replacement and reference publication; it never deletes blobs.
	objectKey := attachmentstore.NewKey()
	if err := r.objects.Put(ctx, objectKey, in.Content); err != nil {
		r.log.WithContext(ctx).Warnw("msg", "attachment object write failed", "object_key", objectKey)
		return nil, biz.ErrBusinessAttachmentStorageUnavailable
	}
	if referenceImageWrite && !supplemental {
		if _, err := tx.ExecContext(ctx, businessAttachmentImageSlotDeleteSQL(r.data.sqlDialect), in.OwnerType, in.OwnerID, in.AttachmentType, *slotKey); err != nil {
			return nil, err
		}
	}

	insertQuery := `
		INSERT INTO business_attachments
			(owner_type, owner_id, attachment_type, slot_key, file_name, mime_type, file_size, sha256, object_key, uploaded_by, note, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
		RETURNING id, created_at`
	if r.data.sqlDialect == "sqlite3" {
		insertQuery = `
			INSERT INTO business_attachments
				(owner_type, owner_id, attachment_type, slot_key, file_name, mime_type, file_size, sha256, object_key, uploaded_by, note, created_at)
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
		slotKey,
		in.FileName,
		in.MimeType,
		in.FileSize,
		in.SHA256,
		objectKey,
		in.UploadedBy,
		in.Note,
	).Scan(&id, &createdAt); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		// A commit error can be an unknown outcome. Retain the object for
		// reconciliation; deleting it here could destroy a committed attachment.
		r.log.WithContext(ctx).Warnw("msg", "attachment commit requires reconciliation", "object_key", objectKey)
		return nil, err
	}
	return &biz.BusinessAttachment{
		ID:             id,
		OwnerType:      in.OwnerType,
		OwnerID:        in.OwnerID,
		AttachmentType: in.AttachmentType,
		SlotKey:        slotKey,
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

// The product lock serializes free-slot allocation and exact-content retries.
func resolveSupplementalProductImageSlot(ctx context.Context, tx *stdsql.Tx, dialect string, productID int, sha string) (string, *biz.BusinessAttachment, error) {
	const query = `SELECT id, slot_key, file_name, mime_type, file_size, sha256, uploaded_by, note, created_at
		FROM business_attachments WHERE owner_type = 'product' AND owner_id = $1
		AND attachment_type = 'product_image' AND slot_key NOT IN ('primary', 'secondary')`
	sql := query
	if dialect == "sqlite3" {
		sql = strings.Replace(query, "$1", "?", 1)
	}
	rows, err := tx.QueryContext(ctx, sql, productID)
	if err != nil {
		return "", nil, err
	}
	defer func() { _ = rows.Close() }()
	used := make(map[string]bool, biz.BusinessAttachmentProductImageSupplementalMaxCount)
	for rows.Next() {
		item := &biz.BusinessAttachment{OwnerType: biz.BusinessAttachmentOwnerProduct, OwnerID: productID, AttachmentType: biz.BusinessAttachmentTypeProductImage}
		var slot string
		if err := rows.Scan(&item.ID, &slot, &item.FileName, &item.MimeType, &item.FileSize, &item.SHA256, &item.UploadedBy, &item.Note, &item.CreatedAt); err != nil {
			return "", nil, err
		}
		if item.SHA256 == sha {
			if err := rows.Close(); err != nil {
				return "", nil, err
			}
			item.SlotKey = &slot
			return "", item, nil
		}
		used[slot] = true
	}
	if err := rows.Err(); err != nil {
		return "", nil, err
	}
	if err := rows.Close(); err != nil {
		return "", nil, err
	}
	for _, slot := range biz.BusinessAttachmentProductImageSupplementalSlots() {
		if !used[slot] {
			return slot, nil, nil
		}
	}
	return "", nil, biz.ErrBusinessAttachmentProductImageSupplementalLimit
}

func (r *businessAttachmentRepo) WithdrawBusinessAttachment(
	ctx context.Context,
	in *biz.BusinessAttachmentWithdraw,
) (time.Time, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil || in == nil ||
		in.ID <= 0 || in.OwnerID <= 0 || in.WithdrawnBy <= 0 {
		return time.Time{}, biz.ErrBadParam
	}
	ownerTable, ok := businessAttachmentOwnerTable(in.OwnerType)
	if !ok {
		return time.Time{}, biz.ErrBusinessAttachmentOwnerInvalid
	}
	if in.OwnerType == biz.BusinessAttachmentOwnerProduct ||
		in.AttachmentType == biz.BusinessAttachmentTypeProductImage {
		return time.Time{}, biz.ErrBusinessAttachmentProductImageWithdrawalUnsupported
	}
	if in.AttachmentType == biz.BusinessAttachmentTypeMaterialImage {
		return time.Time{}, biz.ErrBadParam
	}
	workflowGuard := in.WorkflowGuard
	if in.OwnerType == biz.BusinessAttachmentOwnerWorkflowTask &&
		(workflowGuard == nil || workflowGuard.ExpectedVersion <= 0 || workflowGuard.ActorID <= 0 ||
			workflowGuard.ActorID != in.WithdrawnBy) {
		return time.Time{}, biz.ErrBadParam
	}

	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return time.Time{}, err
	}
	defer func() { _ = tx.Rollback() }()

	ownerQuery := fmt.Sprintf("SELECT id FROM %s WHERE id = $1 FOR KEY SHARE", ownerTable)
	if in.OwnerType == biz.BusinessAttachmentOwnerWorkflowTask {
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
		ownerErr = tx.QueryRowContext(ctx, ownerQuery, in.OwnerID).Scan(
			&ownerID,
			&version,
			&statusKey,
			&ownerRoleKey,
			&assigneeID,
		)
		if ownerErr == nil {
			if version != workflowGuard.ExpectedVersion {
				return time.Time{}, biz.ErrWorkflowTaskConflict
			}
			if biz.IsTerminalWorkflowTaskStatus(statusKey) {
				return time.Time{}, biz.ErrWorkflowTaskSettled
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
				return time.Time{}, biz.ErrForbidden
			}
		}
	} else {
		ownerErr = tx.QueryRowContext(ctx, ownerQuery, in.OwnerID).Scan(&ownerID)
	}
	if ownerErr != nil {
		if ownerErr == stdsql.ErrNoRows {
			return time.Time{}, biz.ErrBusinessAttachmentOwnerNotFound
		}
		return time.Time{}, ownerErr
	}

	attachmentQuery := "SELECT owner_type, owner_id, attachment_type, withdrawn_at, withdrawn_by, withdrawal_reason FROM business_attachments WHERE id = $1 FOR UPDATE"
	updateQuery := "UPDATE business_attachments SET withdrawn_at = CURRENT_TIMESTAMP, withdrawn_by = $1, withdrawal_reason = $2 WHERE id = $3 AND withdrawn_at IS NULL RETURNING withdrawn_at"
	if r.data.sqlDialect == "sqlite3" {
		attachmentQuery = "SELECT owner_type, owner_id, attachment_type, withdrawn_at, withdrawn_by, withdrawal_reason FROM business_attachments WHERE id = ?"
		updateQuery = "UPDATE business_attachments SET withdrawn_at = CURRENT_TIMESTAMP, withdrawn_by = ?, withdrawal_reason = ? WHERE id = ? AND withdrawn_at IS NULL RETURNING withdrawn_at"
	}
	var persistedOwnerType, persistedAttachmentType string
	var persistedOwnerID int
	var persistedWithdrawnAt stdsql.NullTime
	var persistedWithdrawnBy stdsql.NullInt64
	var persistedWithdrawalReason stdsql.NullString
	if err := tx.QueryRowContext(ctx, attachmentQuery, in.ID).Scan(
		&persistedOwnerType,
		&persistedOwnerID,
		&persistedAttachmentType,
		&persistedWithdrawnAt,
		&persistedWithdrawnBy,
		&persistedWithdrawalReason,
	); err != nil {
		if err == stdsql.ErrNoRows {
			return time.Time{}, biz.ErrBusinessAttachmentNotFound
		}
		return time.Time{}, err
	}
	if persistedOwnerType != in.OwnerType || persistedOwnerID != in.OwnerID ||
		persistedAttachmentType != in.AttachmentType {
		return time.Time{}, biz.ErrBusinessAttachmentNotFound
	}
	if persistedOwnerType == biz.BusinessAttachmentOwnerProduct ||
		persistedAttachmentType == biz.BusinessAttachmentTypeProductImage {
		return time.Time{}, biz.ErrBusinessAttachmentProductImageWithdrawalUnsupported
	}
	if persistedWithdrawnAt.Valid {
		if persistedWithdrawnBy.Valid && int(persistedWithdrawnBy.Int64) == in.WithdrawnBy &&
			persistedWithdrawalReason.Valid && persistedWithdrawalReason.String == in.Reason {
			if err := tx.Commit(); err != nil {
				return time.Time{}, err
			}
			return persistedWithdrawnAt.Time, nil
		}
		return time.Time{}, biz.ErrBusinessAttachmentWithdrawn
	}

	var withdrawnAt time.Time
	if err := tx.QueryRowContext(ctx, updateQuery, in.WithdrawnBy, in.Reason, in.ID).Scan(&withdrawnAt); err != nil {
		if err == stdsql.ErrNoRows {
			return time.Time{}, biz.ErrBusinessAttachmentWithdrawn
		}
		return time.Time{}, err
	}
	if err := tx.Commit(); err != nil {
		return time.Time{}, err
	}
	return withdrawnAt, nil
}

func (r *businessAttachmentRepo) ClearProductImage(ctx context.Context, productID int, slotKey string, attachmentID int) error {
	if r == nil || r.data == nil || r.data.sqldb == nil || productID <= 0 {
		return biz.ErrBadParam
	}
	slotKey = biz.NormalizeBusinessAttachmentProductImageSlot(slotKey)
	if !biz.IsBusinessAttachmentProductImageClearTarget(slotKey, attachmentID) {
		return biz.ErrBadParam
	}
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	ownerQuery := businessAttachmentImageOwnerLockSQL(product.Table, r.data.sqlDialect)
	var lockedProductID int
	if err := tx.QueryRowContext(ctx, ownerQuery, productID).Scan(&lockedProductID); err != nil {
		if err == stdsql.ErrNoRows {
			return biz.ErrBusinessAttachmentOwnerNotFound
		}
		return err
	}
	if attachmentID > 0 {
		query := "SELECT slot_key FROM business_attachments WHERE id = $1 AND owner_id = $2 AND owner_type = 'product' AND attachment_type = 'product_image'"
		if r.data.sqlDialect == "sqlite3" {
			query = strings.NewReplacer("$1", "?", "$2", "?").Replace(query)
		}
		if err := tx.QueryRowContext(ctx, query, attachmentID, productID).Scan(&slotKey); err != nil {
			if err == stdsql.ErrNoRows {
				return nil
			}
			return err
		}
		if !biz.IsBusinessAttachmentProductImageSupplementalSlot(slotKey) {
			return biz.ErrBadParam
		}
	}
	if err := requireUnreferencedProductImage(ctx, tx, productID, slotKey, r.data.sqlDialect); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, businessAttachmentImageSlotDeleteSQL(r.data.sqlDialect), biz.BusinessAttachmentOwnerProduct, productID, biz.BusinessAttachmentTypeProductImage, slotKey); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *businessAttachmentRepo) ClearMaterialImage(ctx context.Context, materialID, attachmentID int) error {
	if r == nil || r.data == nil || r.data.sqldb == nil || materialID <= 0 || attachmentID <= 0 {
		return biz.ErrBadParam
	}
	tx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var lockedID int
	if err := tx.QueryRowContext(ctx, businessAttachmentImageOwnerLockSQL(material.Table, r.data.sqlDialect), materialID).Scan(&lockedID); err != nil {
		if err == stdsql.ErrNoRows {
			return biz.ErrBusinessAttachmentOwnerNotFound
		}
		return err
	}
	query := "DELETE FROM business_attachments WHERE owner_type = 'material' AND owner_id = $1 AND attachment_type = 'material_image' AND id = $2"
	if r.data.sqlDialect == "sqlite3" {
		query = strings.NewReplacer("$1", "?", "$2", "?").Replace(query)
	}
	// Clearing a stale or already cleared reference never removes a replacement.
	if _, err := tx.ExecContext(ctx, query, materialID, attachmentID); err != nil {
		return err
	}
	return tx.Commit()
}

// Frozen approvals can reference historical product images. New engineering
// completion does not bind images, but existing audit evidence remains protected.
func requireUnreferencedProductImage(ctx context.Context, tx *stdsql.Tx, productID int, slotKey, sqlDialect string) error {
	query := `SELECT EXISTS (SELECT 1 FROM business_attachments a
 JOIN engineering_material_requests r ON EXISTS (SELECT 1 FROM jsonb_array_elements(r.source_snapshot) source WHERE source->>'sample_image_attachment_id' = a.id::text)
 WHERE a.owner_type = 'product' AND a.owner_id = $1 AND a.attachment_type = 'product_image' AND a.slot_key = $2)`
	if sqlDialect == "sqlite3" {
		query = `SELECT EXISTS (SELECT 1 FROM business_attachments a
 JOIN engineering_material_requests r ON EXISTS (SELECT 1 FROM json_each(r.source_snapshot) source WHERE json_extract(source.value, '$.sample_image_attachment_id') = a.id)
 WHERE a.owner_type = 'product' AND a.owner_id = ? AND a.attachment_type = 'product_image' AND a.slot_key = ?)`
	}
	var referenced bool
	if err := tx.QueryRowContext(ctx, query, productID, slotKey).Scan(&referenced); err != nil {
		return err
	}
	if referenced {
		return biz.ErrBusinessAttachmentReferenced
	}
	return nil
}

func businessAttachmentImageOwnerLockSQL(ownerTable, sqlDialect string) string {
	if sqlDialect == "sqlite3" {
		return fmt.Sprintf("UPDATE %s SET id = id WHERE id = ? RETURNING id", ownerTable)
	}
	return fmt.Sprintf("SELECT id FROM %s WHERE id = $1 FOR UPDATE", ownerTable)
}

func businessAttachmentImageSlotDeleteSQL(sqlDialect string) string {
	if sqlDialect == "sqlite3" {
		return "DELETE FROM business_attachments WHERE owner_type = ? AND owner_id = ? AND attachment_type = ? AND slot_key = ?"
	}
	return "DELETE FROM business_attachments WHERE owner_type = $1 AND owner_id = $2 AND attachment_type = $3 AND slot_key = $4"
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
		biz.BusinessAttachmentOwnerFinancePayment:    "finance_payments",
		biz.BusinessAttachmentOwnerProductionFact:    "production_facts",
		biz.BusinessAttachmentOwnerOutsourcingFact:   "outsourcing_facts",
		biz.BusinessAttachmentOwnerProduct:           "products",
		biz.BusinessAttachmentOwnerMaterial:          "materials",
		biz.BusinessAttachmentOwnerProductSKU:        "product_skus",
		biz.BusinessAttachmentOwnerBOMHeader:         "bom_headers",
		biz.BusinessAttachmentOwnerWorkflowTask:      "workflow_tasks",
	}
	table, ok := tables[ownerType]
	return table, ok
}

func (r *businessAttachmentRepo) ListBusinessAttachments(ctx context.Context, ownerType string, ownerID int) ([]*biz.BusinessAttachment, error) {
	query := r.data.postgres.BusinessAttachment.Query().
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
			businessattachment.FieldWithdrawnAt,
			businessattachment.FieldWithdrawnBy,
			businessattachment.FieldWithdrawalReason,
			businessattachment.FieldCreatedAt,
		).
		Where(
			businessattachment.OwnerType(ownerType),
			businessattachment.OwnerID(ownerID),
		)
	if ownerType == biz.BusinessAttachmentOwnerMaterial {
		query.Where(businessattachment.AttachmentTypeEQ("evidence"))
	}
	rows, err := query.Order(businessattachment.ByCreatedAt(entsql.OrderDesc()), businessattachment.ByID(entsql.OrderDesc())).
		All(ctx)
	if err != nil {
		return nil, err
	}
	items := entBusinessAttachmentsToBiz(rows)
	if err := r.resolveBusinessAttachmentAuditUsernames(ctx, items); err != nil {
		return nil, err
	}
	return items, nil
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
			businessattachment.FieldWithdrawnAt,
			businessattachment.FieldWithdrawnBy,
			businessattachment.FieldWithdrawalReason,
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
	item := entBusinessAttachmentToBiz(row)
	if err := r.resolveBusinessAttachmentAuditUsernames(ctx, []*biz.BusinessAttachment{item}); err != nil {
		return nil, err
	}
	return item, nil
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
	contentQuery := "SELECT object_key, file_size FROM business_attachments WHERE id = $1 AND owner_type = $2 AND owner_id = $3 AND withdrawn_at IS NULL"
	if r.data.sqlDialect == "sqlite3" {
		ownerQuery = fmt.Sprintf("SELECT id FROM %s WHERE id = ?", ownerTable)
		contentQuery = "SELECT object_key, file_size FROM business_attachments WHERE id = ? AND owner_type = ? AND owner_id = ? AND withdrawn_at IS NULL"
	}
	var lockedOwnerID int
	if err := tx.QueryRowContext(ctx, ownerQuery, ownerID).Scan(&lockedOwnerID); err != nil {
		if err == stdsql.ErrNoRows {
			return nil, biz.ErrBusinessAttachmentOwnerNotFound
		}
		return nil, err
	}
	var objectKey string
	var fileSize int64
	if err := tx.QueryRowContext(ctx, contentQuery, id, ownerType, ownerID).Scan(&objectKey, &fileSize); err != nil {
		if err == stdsql.ErrNoRows {
			return nil, biz.ErrBusinessAttachmentNotFound
		}
		return nil, err
	}
	if r.objects == nil {
		return nil, biz.ErrBusinessAttachmentStorageUnavailable
	}
	maxFileBytes := int64(biz.BusinessAttachmentMaxBytes)
	if ownerType == biz.BusinessAttachmentOwnerProduct {
		maxFileBytes = int64(biz.BusinessAttachmentProductImageMaxBytes)
	}
	if !attachmentstore.ValidKey(objectKey) || fileSize <= 0 || fileSize > maxFileBytes {
		return nil, biz.ErrBusinessAttachmentIntegrity
	}
	content, err := r.objects.Get(ctx, objectKey, fileSize)
	if err != nil {
		r.log.WithContext(ctx).Warnw("msg", "attachment object read failed", "attachment_id", id)
		if err == attachmentstore.ErrIntegrity || err == attachmentstore.ErrNotFound {
			return nil, biz.ErrBusinessAttachmentIntegrity
		}
		return nil, biz.ErrBusinessAttachmentStorageUnavailable
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
	case biz.BusinessAttachmentOwnerFinancePayment:
		return r.data.postgres.FinancePayment.Query().Where(financepayment.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerFinanceFact:
		return r.data.postgres.FinanceFact.Query().Where(financefact.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerProductionFact:
		return r.data.postgres.ProductionFact.Query().Where(productionfact.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerOutsourcingFact:
		return r.data.postgres.OutsourcingFact.Query().Where(outsourcingfact.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerProduct:
		return r.data.postgres.Product.Query().Where(product.ID(ownerID)).Exist(ctx)
	case biz.BusinessAttachmentOwnerMaterial:
		return r.data.postgres.Material.Query().Where(material.ID(ownerID)).Exist(ctx)
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
		ID:               row.ID,
		OwnerType:        row.OwnerType,
		OwnerID:          row.OwnerID,
		AttachmentType:   row.AttachmentType,
		SlotKey:          row.SlotKey,
		FileName:         row.FileName,
		MimeType:         row.MimeType,
		FileSize:         row.FileSize,
		SHA256:           row.Sha256,
		UploadedBy:       row.UploadedBy,
		Note:             row.Note,
		WithdrawnAt:      row.WithdrawnAt,
		WithdrawnBy:      row.WithdrawnBy,
		WithdrawalReason: row.WithdrawalReason,
		CreatedAt:        row.CreatedAt,
	}
}

func entBusinessAttachmentsToBiz(rows []*ent.BusinessAttachment) []*biz.BusinessAttachment {
	out := make([]*biz.BusinessAttachment, 0, len(rows))
	for _, row := range rows {
		out = append(out, entBusinessAttachmentToBiz(row))
	}
	return out
}

func (r *businessAttachmentRepo) resolveBusinessAttachmentAuditUsernames(
	ctx context.Context,
	items []*biz.BusinessAttachment,
) error {
	actorIDs := make(map[int]struct{})
	for _, item := range items {
		if item != nil && item.UploadedBy != nil && *item.UploadedBy > 0 {
			actorIDs[*item.UploadedBy] = struct{}{}
		}
		if item != nil && item.WithdrawnBy != nil && *item.WithdrawnBy > 0 {
			actorIDs[*item.WithdrawnBy] = struct{}{}
		}
	}
	if len(actorIDs) == 0 {
		return nil
	}
	ids := make([]int, 0, len(actorIDs))
	for id := range actorIDs {
		ids = append(ids, id)
	}
	admins, err := r.data.postgres.AdminUser.Query().
		Select(adminuser.FieldID, adminuser.FieldUsername, adminuser.FieldDisplayName).
		Where(adminuser.IDIn(ids...)).
		All(ctx)
	if err != nil {
		return err
	}
	usernameByID := make(map[int]string, len(admins))
	displayNameByID := make(map[int]string, len(admins))
	for _, admin := range admins {
		if admin == nil {
			continue
		}
		if username := strings.TrimSpace(admin.Username); username != "" {
			usernameByID[admin.ID] = username
		}
		if displayName := strings.TrimSpace(stringValue(admin.DisplayName)); displayName != "" {
			displayNameByID[admin.ID] = displayName
		}
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		if item.UploadedBy != nil {
			if username := usernameByID[*item.UploadedBy]; username != "" {
				item.UploadedByUsername = &username
			}
			if displayName := displayNameByID[*item.UploadedBy]; displayName != "" {
				item.UploadedByDisplayName = &displayName
			}
		}
		if item.WithdrawnBy != nil {
			if username := usernameByID[*item.WithdrawnBy]; username != "" {
				item.WithdrawnByUsername = &username
			}
			if displayName := displayNameByID[*item.WithdrawnBy]; displayName != "" {
				item.WithdrawnByDisplayName = &displayName
			}
		}
	}
	return nil
}
