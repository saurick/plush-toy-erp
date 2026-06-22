package biz

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"path/filepath"
	"strings"
	"time"
)

const (
	BusinessAttachmentMaxBytes = 5 * 1024 * 1024
)

const (
	BusinessAttachmentOwnerSalesOrder        = "sales_order"
	BusinessAttachmentOwnerPurchaseOrder     = "purchase_order"
	BusinessAttachmentOwnerOutsourcingOrder  = "outsourcing_order"
	BusinessAttachmentOwnerPurchaseReceipt   = "purchase_receipt"
	BusinessAttachmentOwnerQualityInspection = "quality_inspection"
	BusinessAttachmentOwnerShipment          = "shipment"
	BusinessAttachmentOwnerFinanceFact       = "finance_fact"
	BusinessAttachmentOwnerProductionFact    = "production_fact"
	BusinessAttachmentOwnerOutsourcingFact   = "outsourcing_fact"
	BusinessAttachmentOwnerProductSKU        = "product_sku"
	BusinessAttachmentOwnerBOMHeader         = "bom_header"
	BusinessAttachmentOwnerWorkflowTask      = "workflow_task"
)

var (
	ErrBusinessAttachmentNotFound       = errors.New("business attachment not found")
	ErrBusinessAttachmentOwnerNotFound  = errors.New("business attachment owner not found")
	ErrBusinessAttachmentOwnerInvalid   = errors.New("business attachment owner invalid")
	ErrBusinessAttachmentContentInvalid = errors.New("business attachment content invalid")
	ErrBusinessAttachmentTooLarge       = errors.New("business attachment too large")
	ErrBusinessAttachmentMimeNotAllowed = errors.New("business attachment mime type not allowed")
)

var allowedBusinessAttachmentOwnerTypes = map[string]struct{}{
	BusinessAttachmentOwnerSalesOrder:        {},
	BusinessAttachmentOwnerPurchaseOrder:     {},
	BusinessAttachmentOwnerOutsourcingOrder:  {},
	BusinessAttachmentOwnerPurchaseReceipt:   {},
	BusinessAttachmentOwnerQualityInspection: {},
	BusinessAttachmentOwnerShipment:          {},
	BusinessAttachmentOwnerFinanceFact:       {},
	BusinessAttachmentOwnerProductionFact:    {},
	BusinessAttachmentOwnerOutsourcingFact:   {},
	BusinessAttachmentOwnerProductSKU:        {},
	BusinessAttachmentOwnerBOMHeader:         {},
	BusinessAttachmentOwnerWorkflowTask:      {},
}

var allowedBusinessAttachmentMIMETypes = map[string]struct{}{
	"application/msword":       {},
	"application/pdf":          {},
	"application/vnd.ms-excel": {},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":       {},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {},
	"image/gif":  {},
	"image/jpeg": {},
	"image/png":  {},
	"image/webp": {},
	"text/csv":   {},
	"text/plain": {},
}

type BusinessAttachment struct {
	ID             int
	OwnerType      string
	OwnerID        int
	AttachmentType string
	SlotKey        *string
	FileName       string
	MimeType       string
	FileSize       int
	SHA256         string
	Content        []byte
	UploadedBy     *int
	Note           *string
	CreatedAt      time.Time
}

type BusinessAttachmentUploadInput struct {
	OwnerType      string
	OwnerID        int
	AttachmentType string
	SlotKey        *string
	FileName       string
	MimeType       string
	ContentBase64  string
	UploadedBy     *int
	Note           *string
}

type BusinessAttachmentCreate struct {
	OwnerType      string
	OwnerID        int
	AttachmentType string
	SlotKey        *string
	FileName       string
	MimeType       string
	FileSize       int
	SHA256         string
	Content        []byte
	UploadedBy     *int
	Note           *string
}

type BusinessAttachmentRepo interface {
	CreateBusinessAttachment(ctx context.Context, in *BusinessAttachmentCreate) (*BusinessAttachment, error)
	ListBusinessAttachments(ctx context.Context, ownerType string, ownerID int) ([]*BusinessAttachment, error)
	GetBusinessAttachment(ctx context.Context, id int) (*BusinessAttachment, error)
	DeleteBusinessAttachment(ctx context.Context, id int) error
	BusinessAttachmentOwnerExists(ctx context.Context, ownerType string, ownerID int) (bool, error)
}

type BusinessAttachmentUsecase struct {
	repo BusinessAttachmentRepo
}

func NewBusinessAttachmentUsecase(repo BusinessAttachmentRepo) *BusinessAttachmentUsecase {
	return &BusinessAttachmentUsecase{repo: repo}
}

func NormalizeBusinessAttachmentOwnerType(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func IsBusinessAttachmentOwnerTypeAllowed(ownerType string) bool {
	_, ok := allowedBusinessAttachmentOwnerTypes[NormalizeBusinessAttachmentOwnerType(ownerType)]
	return ok
}

func (uc *BusinessAttachmentUsecase) UploadBusinessAttachment(ctx context.Context, in *BusinessAttachmentUploadInput) (*BusinessAttachment, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBusinessAttachmentUploadInput(*in)
	if err != nil {
		return nil, err
	}
	exists, err := uc.repo.BusinessAttachmentOwnerExists(ctx, normalized.OwnerType, normalized.OwnerID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrBusinessAttachmentOwnerNotFound
	}
	content, err := decodeBusinessAttachmentContent(in.ContentBase64)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(content)
	return uc.repo.CreateBusinessAttachment(ctx, &BusinessAttachmentCreate{
		OwnerType:      normalized.OwnerType,
		OwnerID:        normalized.OwnerID,
		AttachmentType: normalized.AttachmentType,
		SlotKey:        normalized.SlotKey,
		FileName:       normalized.FileName,
		MimeType:       normalized.MimeType,
		FileSize:       len(content),
		SHA256:         hex.EncodeToString(sum[:]),
		Content:        content,
		UploadedBy:     normalized.UploadedBy,
		Note:           normalized.Note,
	})
}

func (uc *BusinessAttachmentUsecase) ListBusinessAttachments(ctx context.Context, ownerType string, ownerID int) ([]*BusinessAttachment, error) {
	if uc == nil || uc.repo == nil || ownerID <= 0 {
		return nil, ErrBadParam
	}
	normalizedOwnerType := NormalizeBusinessAttachmentOwnerType(ownerType)
	if !IsBusinessAttachmentOwnerTypeAllowed(normalizedOwnerType) {
		return nil, ErrBusinessAttachmentOwnerInvalid
	}
	exists, err := uc.repo.BusinessAttachmentOwnerExists(ctx, normalizedOwnerType, ownerID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrBusinessAttachmentOwnerNotFound
	}
	return uc.repo.ListBusinessAttachments(ctx, normalizedOwnerType, ownerID)
}

func (uc *BusinessAttachmentUsecase) GetBusinessAttachment(ctx context.Context, id int) (*BusinessAttachment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetBusinessAttachment(ctx, id)
}

func (uc *BusinessAttachmentUsecase) DeleteBusinessAttachment(ctx context.Context, id int) error {
	if uc == nil || uc.repo == nil || id <= 0 {
		return ErrBadParam
	}
	return uc.repo.DeleteBusinessAttachment(ctx, id)
}

func normalizeBusinessAttachmentUploadInput(in BusinessAttachmentUploadInput) (BusinessAttachmentUploadInput, error) {
	in.OwnerType = NormalizeBusinessAttachmentOwnerType(in.OwnerType)
	if !IsBusinessAttachmentOwnerTypeAllowed(in.OwnerType) || in.OwnerID <= 0 {
		return in, ErrBusinessAttachmentOwnerInvalid
	}

	in.AttachmentType = strings.ToLower(strings.TrimSpace(in.AttachmentType))
	if in.AttachmentType == "" {
		in.AttachmentType = "evidence"
	}
	if len(in.AttachmentType) > 64 {
		return in, ErrBadParam
	}

	if in.SlotKey != nil {
		slotKey := strings.ToLower(strings.TrimSpace(*in.SlotKey))
		if slotKey == "" {
			in.SlotKey = nil
		} else {
			if len(slotKey) > 64 {
				return in, ErrBadParam
			}
			in.SlotKey = &slotKey
		}
	}

	in.FileName = filepath.Base(strings.TrimSpace(in.FileName))
	if in.FileName == "." || in.FileName == "/" || in.FileName == "" || len(in.FileName) > 255 {
		return in, ErrBadParam
	}

	in.MimeType = strings.ToLower(strings.TrimSpace(in.MimeType))
	if _, ok := allowedBusinessAttachmentMIMETypes[in.MimeType]; !ok {
		return in, ErrBusinessAttachmentMimeNotAllowed
	}

	if in.UploadedBy != nil && *in.UploadedBy <= 0 {
		in.UploadedBy = nil
	}
	if in.Note != nil {
		note := strings.TrimSpace(*in.Note)
		if note == "" {
			in.Note = nil
		} else {
			if len([]rune(note)) > 255 {
				return in, ErrBadParam
			}
			in.Note = &note
		}
	}

	return in, nil
}

func decodeBusinessAttachmentContent(raw string) ([]byte, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return nil, ErrBusinessAttachmentContentInvalid
	}
	if idx := strings.Index(text, "base64,"); idx >= 0 {
		text = text[idx+len("base64,"):]
	}
	content, err := base64.StdEncoding.DecodeString(text)
	if err != nil || len(content) == 0 {
		return nil, ErrBusinessAttachmentContentInvalid
	}
	if len(content) > BusinessAttachmentMaxBytes {
		return nil, ErrBusinessAttachmentTooLarge
	}
	return content, nil
}
