package data

import (
	"context"

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

	"entgo.io/ent/dialect/sql"
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
	row, err := r.data.postgres.BusinessAttachment.Create().
		SetOwnerType(in.OwnerType).
		SetOwnerID(in.OwnerID).
		SetAttachmentType(in.AttachmentType).
		SetNillableSlotKey(in.SlotKey).
		SetFileName(in.FileName).
		SetMimeType(in.MimeType).
		SetFileSize(in.FileSize).
		SetSha256(in.SHA256).
		SetContent(in.Content).
		SetNillableUploadedBy(in.UploadedBy).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBusinessAttachmentToBiz(row), nil
}

func (r *businessAttachmentRepo) ListBusinessAttachments(ctx context.Context, ownerType string, ownerID int) ([]*biz.BusinessAttachment, error) {
	rows, err := r.data.postgres.BusinessAttachment.Query().
		Where(
			businessattachment.OwnerType(ownerType),
			businessattachment.OwnerID(ownerID),
		).
		Order(businessattachment.ByCreatedAt(sql.OrderDesc()), businessattachment.ByID(sql.OrderDesc())).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return entBusinessAttachmentsToBiz(rows), nil
}

func (r *businessAttachmentRepo) GetBusinessAttachment(ctx context.Context, id int) (*biz.BusinessAttachment, error) {
	row, err := r.data.postgres.BusinessAttachment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBusinessAttachmentNotFound
		}
		return nil, err
	}
	return entBusinessAttachmentToBiz(row), nil
}

func (r *businessAttachmentRepo) DeleteBusinessAttachment(ctx context.Context, id int) error {
	err := r.data.postgres.BusinessAttachment.DeleteOneID(id).Exec(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBusinessAttachmentNotFound
		}
		return err
	}
	return nil
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
		Content:        append([]byte(nil), row.Content...),
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
