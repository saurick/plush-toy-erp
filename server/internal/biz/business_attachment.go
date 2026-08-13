package biz

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/image/webp"
)

const (
	BusinessAttachmentMaxBytes            = 5 * 1024 * 1024
	BusinessAttachmentMaxJSONRPCBodyBytes = 7 * 1024 * 1024

	BusinessAttachmentProductImageMaxWidth  = 8192
	BusinessAttachmentProductImageMaxHeight = 8192
	BusinessAttachmentProductImageMaxPixels = int64(20_000_000)
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
	BusinessAttachmentOwnerProduct           = "product"
	BusinessAttachmentOwnerProductSKU        = "product_sku"
	BusinessAttachmentOwnerBOMHeader         = "bom_header"
	BusinessAttachmentOwnerWorkflowTask      = "workflow_task"
)

const (
	BusinessAttachmentTypeProductImage          = "product_image"
	BusinessAttachmentTypePrintAppendix         = "print_appendix"
	BusinessAttachmentProductImageSlotPrimary   = "primary"
	BusinessAttachmentProductImageSlotSecondary = "secondary"
)

var (
	ErrBusinessAttachmentNotFound                    = errors.New("business attachment not found")
	ErrBusinessAttachmentOwnerNotFound               = errors.New("business attachment owner not found")
	ErrBusinessAttachmentOwnerInvalid                = errors.New("business attachment owner invalid")
	ErrBusinessAttachmentContentInvalid              = errors.New("business attachment content invalid")
	ErrBusinessAttachmentIntegrity                   = errors.New("business attachment integrity check failed")
	ErrBusinessAttachmentTooLarge                    = errors.New("business attachment too large")
	ErrBusinessAttachmentMimeNotAllowed              = errors.New("business attachment mime type not allowed")
	ErrBusinessAttachmentWithdrawn                   = errors.New("business attachment withdrawn")
	ErrBusinessAttachmentWithdrawnContentUnavailable = errors.New(
		"business attachment withdrawn content unavailable",
	)
	ErrBusinessAttachmentWithdrawalReasonInvalid = errors.New(
		"business attachment withdrawal reason invalid",
	)
	ErrBusinessAttachmentProductImageWithdrawalUnsupported = errors.New(
		"product image withdrawal unsupported",
	)

	ErrBusinessAttachmentProductImageContentInvalid    = fmt.Errorf("product image content invalid: %w", ErrBusinessAttachmentContentInvalid)
	ErrBusinessAttachmentProductImageMimeNotAllowed    = fmt.Errorf("product image mime type not allowed: %w", ErrBusinessAttachmentMimeNotAllowed)
	ErrBusinessAttachmentProductImageDimensionsInvalid = fmt.Errorf(
		"product image dimensions invalid: %w",
		ErrBusinessAttachmentContentInvalid,
	)
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
	BusinessAttachmentOwnerProduct:           {},
	BusinessAttachmentOwnerProductSKU:        {},
	BusinessAttachmentOwnerBOMHeader:         {},
	BusinessAttachmentOwnerWorkflowTask:      {},
}

var allowedBusinessAttachmentProductImageSlots = map[string]struct{}{
	BusinessAttachmentProductImageSlotPrimary:   {},
	BusinessAttachmentProductImageSlotSecondary: {},
}

var allowedBusinessAttachmentFileTypes = map[string]map[string]struct{}{
	".csv":  {"text/csv": {}},
	".doc":  {"application/msword": {}},
	".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {}},
	".dps":  {"application/x-wps-presentation": {}},
	".eml":  {"message/rfc822": {}},
	".et":   {"application/x-wps-spreadsheet": {}},
	".gif":  {"image/gif": {}},
	".heic": {"image/heic": {}},
	".heif": {"image/heif": {}},
	".jpeg": {"image/jpeg": {}},
	".jpg":  {"image/jpeg": {}},
	".msg":  {"application/vnd.ms-outlook": {}},
	".pdf":  {"application/pdf": {}},
	".png":  {"image/png": {}},
	".txt":  {"text/plain": {}},
	".webp": {"image/webp": {}},
	".wps":  {"application/x-wps-writer": {}},
	".xls":  {"application/vnd.ms-excel": {}},
	".xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}},
	".zip": {
		"application/zip":              {},
		"application/x-zip-compressed": {},
	},
}

var allowedBusinessAttachmentProductImageFileTypes = map[string]map[string]struct{}{
	".jpeg": {"image/jpeg": {}},
	".jpg":  {"image/jpeg": {}},
	".png":  {"image/png": {}},
	".webp": {"image/webp": {}},
}

var allowedBusinessAttachmentPrintAppendixFileTypes = map[string]map[string]struct{}{
	".gif":  {"image/gif": {}},
	".jpeg": {"image/jpeg": {}},
	".jpg":  {"image/jpeg": {}},
	".png":  {"image/png": {}},
	".webp": {"image/webp": {}},
}

type BusinessAttachment struct {
	ID                  int
	OwnerType           string
	OwnerID             int
	AttachmentType      string
	SlotKey             *string
	FileName            string
	MimeType            string
	FileSize            int
	SHA256              string
	Content             []byte
	UploadedBy          *int
	UploadedByUsername  *string
	Note                *string
	WithdrawnAt         *time.Time
	WithdrawnBy         *int
	WithdrawnByUsername *string
	WithdrawalReason    *string
	CreatedAt           time.Time
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
	WorkflowGuard  *WorkflowAttachmentWriteGuard
}

type WorkflowAttachmentWriteGuard struct {
	ExpectedVersion      int
	ActorID              int
	ActorUsername        string
	VisibleOwnerRoleKeys []string
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
	WorkflowGuard  *WorkflowAttachmentWriteGuard
}

type BusinessAttachmentWithdrawInput struct {
	Attachment    *BusinessAttachment
	Reason        string
	WithdrawnBy   int
	WorkflowGuard *WorkflowAttachmentWriteGuard
}

type BusinessAttachmentWithdraw struct {
	ID             int
	OwnerType      string
	OwnerID        int
	AttachmentType string
	Reason         string
	WithdrawnBy    int
	WorkflowGuard  *WorkflowAttachmentWriteGuard
}

type BusinessAttachmentRepo interface {
	CreateBusinessAttachment(ctx context.Context, in *BusinessAttachmentCreate) (*BusinessAttachment, error)
	WithdrawBusinessAttachment(ctx context.Context, in *BusinessAttachmentWithdraw) (time.Time, error)
	ClearProductImage(ctx context.Context, productID int, slotKey string) error
	ListBusinessAttachments(ctx context.Context, ownerType string, ownerID int) ([]*BusinessAttachment, error)
	GetBusinessAttachmentMetadata(ctx context.Context, id int) (*BusinessAttachment, error)
	GetBusinessAttachmentContent(ctx context.Context, id int, ownerType string, ownerID int) ([]byte, error)
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

func NormalizeBusinessAttachmentProductImageSlot(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func NormalizeBusinessAttachmentWithdrawalReason(raw string) (string, error) {
	reason := strings.TrimSpace(raw)
	if reason == "" || len([]rune(reason)) > 255 {
		return "", ErrBusinessAttachmentWithdrawalReasonInvalid
	}
	return reason, nil
}

func IsBusinessAttachmentProductImageSlotAllowed(slotKey string) bool {
	_, ok := allowedBusinessAttachmentProductImageSlots[NormalizeBusinessAttachmentProductImageSlot(slotKey)]
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
		if normalized.AttachmentType == BusinessAttachmentTypeProductImage && errors.Is(err, ErrBusinessAttachmentContentInvalid) {
			return nil, ErrBusinessAttachmentProductImageContentInvalid
		}
		return nil, err
	}
	if normalized.AttachmentType == BusinessAttachmentTypeProductImage {
		if err := validateBusinessAttachmentProductImageContent(content, normalized.MimeType); err != nil {
			return nil, err
		}
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
		WorkflowGuard:  normalized.WorkflowGuard,
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

func (uc *BusinessAttachmentUsecase) ClearProductImage(ctx context.Context, productID int, slotKey string) error {
	if uc == nil || uc.repo == nil || productID <= 0 {
		return ErrBadParam
	}
	normalizedSlotKey := NormalizeBusinessAttachmentProductImageSlot(slotKey)
	if !IsBusinessAttachmentProductImageSlotAllowed(normalizedSlotKey) {
		return ErrBadParam
	}
	return uc.repo.ClearProductImage(ctx, productID, normalizedSlotKey)
}

func (uc *BusinessAttachmentUsecase) WithdrawBusinessAttachment(
	ctx context.Context,
	in *BusinessAttachmentWithdrawInput,
) (*BusinessAttachment, error) {
	if uc == nil || uc.repo == nil || in == nil || in.Attachment == nil {
		return nil, ErrBadParam
	}
	attachment := in.Attachment
	ownerType := NormalizeBusinessAttachmentOwnerType(attachment.OwnerType)
	attachmentType := strings.ToLower(strings.TrimSpace(attachment.AttachmentType))
	if attachment.ID <= 0 || attachment.OwnerID <= 0 || !IsBusinessAttachmentOwnerTypeAllowed(ownerType) ||
		attachmentType == "" || in.WithdrawnBy <= 0 {
		return nil, ErrBadParam
	}
	if ownerType == BusinessAttachmentOwnerProduct || attachmentType == BusinessAttachmentTypeProductImage {
		return nil, ErrBusinessAttachmentProductImageWithdrawalUnsupported
	}
	reason, err := NormalizeBusinessAttachmentWithdrawalReason(in.Reason)
	if err != nil {
		return nil, err
	}
	if attachment.WithdrawnAt != nil {
		if attachment.WithdrawnBy != nil && *attachment.WithdrawnBy == in.WithdrawnBy &&
			attachment.WithdrawalReason != nil && *attachment.WithdrawalReason == reason {
			out := *attachment
			out.Content = nil
			return &out, nil
		}
		return nil, ErrBusinessAttachmentWithdrawn
	}
	if ownerType == BusinessAttachmentOwnerWorkflowTask &&
		(in.WorkflowGuard == nil || in.WorkflowGuard.ExpectedVersion <= 0 ||
			in.WorkflowGuard.ActorID <= 0 || in.WorkflowGuard.ActorID != in.WithdrawnBy) {
		return nil, ErrBadParam
	}

	withdrawnAt, err := uc.repo.WithdrawBusinessAttachment(ctx, &BusinessAttachmentWithdraw{
		ID:             attachment.ID,
		OwnerType:      ownerType,
		OwnerID:        attachment.OwnerID,
		AttachmentType: attachmentType,
		Reason:         reason,
		WithdrawnBy:    in.WithdrawnBy,
		WorkflowGuard:  in.WorkflowGuard,
	})
	if err != nil {
		return nil, err
	}
	out := *attachment
	out.OwnerType = ownerType
	out.AttachmentType = attachmentType
	out.Content = nil
	out.WithdrawnAt = &withdrawnAt
	out.WithdrawnBy = &in.WithdrawnBy
	out.WithdrawalReason = &reason
	return &out, nil
}

func (uc *BusinessAttachmentUsecase) GetBusinessAttachmentMetadata(ctx context.Context, id int) (*BusinessAttachment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	item, err := uc.repo.GetBusinessAttachmentMetadata(ctx, id)
	if err != nil {
		return nil, err
	}
	exists, err := uc.repo.BusinessAttachmentOwnerExists(ctx, item.OwnerType, item.OwnerID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrBusinessAttachmentOwnerNotFound
	}
	return item, nil
}

func (uc *BusinessAttachmentUsecase) GetBusinessAttachmentContent(ctx context.Context, metadata *BusinessAttachment) ([]byte, error) {
	if uc == nil || uc.repo == nil || metadata == nil || metadata.ID <= 0 || metadata.OwnerID <= 0 || !IsBusinessAttachmentOwnerTypeAllowed(metadata.OwnerType) {
		return nil, ErrBadParam
	}
	if metadata.WithdrawnAt != nil {
		return nil, ErrBusinessAttachmentWithdrawnContentUnavailable
	}
	content, err := uc.repo.GetBusinessAttachmentContent(ctx, metadata.ID, metadata.OwnerType, metadata.OwnerID)
	if err != nil {
		return nil, err
	}
	expectedSHA256 := strings.ToLower(strings.TrimSpace(metadata.SHA256))
	if metadata.FileSize <= 0 ||
		len(content) != metadata.FileSize ||
		len(expectedSHA256) != sha256.Size*2 {
		return nil, ErrBusinessAttachmentIntegrity
	}
	sum := sha256.Sum256(content)
	if hex.EncodeToString(sum[:]) != expectedSHA256 {
		return nil, ErrBusinessAttachmentIntegrity
	}
	return content, nil
}

func normalizeBusinessAttachmentUploadInput(in BusinessAttachmentUploadInput) (BusinessAttachmentUploadInput, error) {
	in.OwnerType = NormalizeBusinessAttachmentOwnerType(in.OwnerType)
	if !IsBusinessAttachmentOwnerTypeAllowed(in.OwnerType) || in.OwnerID <= 0 {
		return in, ErrBusinessAttachmentOwnerInvalid
	}
	if in.OwnerType == BusinessAttachmentOwnerWorkflowTask &&
		(in.WorkflowGuard == nil || in.WorkflowGuard.ExpectedVersion <= 0 || in.WorkflowGuard.ActorID <= 0) {
		return in, ErrBadParam
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

	isProductOwner := in.OwnerType == BusinessAttachmentOwnerProduct
	isProductImage := in.AttachmentType == BusinessAttachmentTypeProductImage
	isPrintAppendix := in.AttachmentType == BusinessAttachmentTypePrintAppendix
	if isProductOwner != isProductImage {
		return in, ErrBadParam
	}
	if isPrintAppendix &&
		(in.OwnerType != BusinessAttachmentOwnerOutsourcingOrder || in.SlotKey != nil) {
		return in, ErrBadParam
	}

	in.MimeType = strings.ToLower(strings.TrimSpace(in.MimeType))
	if isProductImage {
		if in.SlotKey == nil || !IsBusinessAttachmentProductImageSlotAllowed(*in.SlotKey) {
			return in, ErrBadParam
		}
		if !isBusinessAttachmentProductImageFileTypeAllowed(in.FileName, in.MimeType) {
			return in, ErrBusinessAttachmentProductImageMimeNotAllowed
		}
	} else if isPrintAppendix && !isBusinessAttachmentPrintAppendixFileTypeAllowed(in.FileName, in.MimeType) {
		return in, ErrBusinessAttachmentMimeNotAllowed
	} else if !isPrintAppendix && !isBusinessAttachmentFileTypeAllowed(in.FileName, in.MimeType) {
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

func isBusinessAttachmentFileTypeAllowed(fileName string, mimeType string) bool {
	allowedMIMETypes, ok := allowedBusinessAttachmentFileTypes[strings.ToLower(filepath.Ext(fileName))]
	if !ok {
		return false
	}
	_, ok = allowedMIMETypes[mimeType]
	return ok
}

func isBusinessAttachmentProductImageFileTypeAllowed(fileName string, mimeType string) bool {
	allowedMIMETypes, ok := allowedBusinessAttachmentProductImageFileTypes[strings.ToLower(filepath.Ext(fileName))]
	if !ok {
		return false
	}
	_, ok = allowedMIMETypes[mimeType]
	return ok
}

func isBusinessAttachmentPrintAppendixFileTypeAllowed(fileName string, mimeType string) bool {
	allowedMIMETypes, ok := allowedBusinessAttachmentPrintAppendixFileTypes[strings.ToLower(filepath.Ext(fileName))]
	if !ok {
		return false
	}
	_, ok = allowedMIMETypes[mimeType]
	return ok
}

func validateBusinessAttachmentProductImageContent(content []byte, mimeType string) error {
	var (
		config image.Config
		err    error
	)
	switch mimeType {
	case "image/png":
		config, err = png.DecodeConfig(bytes.NewReader(content))
	case "image/jpeg":
		config, err = jpeg.DecodeConfig(bytes.NewReader(content))
	case "image/webp":
		config, err = webp.DecodeConfig(bytes.NewReader(content))
	default:
		return ErrBusinessAttachmentProductImageMimeNotAllowed
	}
	if err != nil {
		return ErrBusinessAttachmentProductImageContentInvalid
	}
	if !isBusinessAttachmentProductImageDimensionsAllowed(config.Width, config.Height) {
		return ErrBusinessAttachmentProductImageDimensionsInvalid
	}
	switch mimeType {
	case "image/png":
		_, err = png.Decode(bytes.NewReader(content))
	case "image/jpeg":
		_, err = jpeg.Decode(bytes.NewReader(content))
	case "image/webp":
		_, err = webp.Decode(bytes.NewReader(content))
	}
	if err != nil {
		return ErrBusinessAttachmentProductImageContentInvalid
	}
	return nil
}

func isBusinessAttachmentProductImageDimensionsAllowed(width, height int) bool {
	if width <= 0 || height <= 0 ||
		width > BusinessAttachmentProductImageMaxWidth ||
		height > BusinessAttachmentProductImageMaxHeight {
		return false
	}
	width64 := int64(width)
	height64 := int64(height)
	return height64 <= BusinessAttachmentProductImageMaxPixels &&
		width64 <= BusinessAttachmentProductImageMaxPixels/height64
}

func decodeBusinessAttachmentContent(raw string) ([]byte, error) {
	return decodeBusinessAttachmentContentWithMax(raw, BusinessAttachmentMaxBytes)
}

func decodeBusinessAttachmentContentWithMax(raw string, maxBytes int) ([]byte, error) {
	text := strings.TrimSpace(raw)
	if text == "" {
		return nil, ErrBusinessAttachmentContentInvalid
	}
	if idx := strings.Index(text, "base64,"); idx >= 0 {
		text = text[idx+len("base64,"):]
	}
	if maxBytes <= 0 || len(text) > base64.StdEncoding.EncodedLen(maxBytes) {
		return nil, ErrBusinessAttachmentTooLarge
	}
	content, err := base64.StdEncoding.DecodeString(text)
	if err != nil || len(content) == 0 {
		return nil, ErrBusinessAttachmentContentInvalid
	}
	if len(content) > maxBytes {
		return nil, ErrBusinessAttachmentTooLarge
	}
	return content, nil
}
