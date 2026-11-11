package biz

import "context"

const (
	DocumentProductPreviewSalesOrder       = "sales_order"
	DocumentProductPreviewProductionOrder  = "production_order"
	DocumentProductPreviewOutsourcingOrder = "outsourcing_order"
	DocumentProductPreviewBatchLimit       = 80
)

// DocumentProductPreview is a read projection of linked products, not order lines or image content.
type DocumentProductPreview struct {
	DocumentID      int
	ProductCount    int
	ProductID       int
	ProductName     string
	ProductCode     string
	StyleNo         string
	CustomerStyleNo string
	Products        []DocumentProductIdentity
}

type DocumentProductIdentity struct {
	ProductID   int
	ProductName string
	ProductCode string
}

type DocumentProductPreviewOptions struct {
	IncludeProducts bool
	ExpectedVersion int
}

type DocumentProductPreviewRepo interface {
	ListDocumentProductPreviews(context.Context, string, []int, DocumentProductPreviewOptions) ([]DocumentProductPreview, error)
}

func DocumentProductPreviewPermissions(source string) []string {
	switch source {
	case DocumentProductPreviewSalesOrder:
		return []string{PermissionSalesOrderRead, PermissionSalesOrderItemRead, PermissionProductRead}
	case DocumentProductPreviewProductionOrder:
		return []string{PermissionPMCPlanRead, PermissionProductRead}
	case DocumentProductPreviewOutsourcingOrder:
		return []string{PermissionOutsourcingOrderRead, PermissionProductRead}
	default:
		return nil
	}
}

func (uc *BusinessAttachmentUsecase) ListDocumentProductPreviews(ctx context.Context, source string, documentIDs []int, options DocumentProductPreviewOptions) ([]DocumentProductPreview, error) {
	if uc == nil || uc.repo == nil || len(DocumentProductPreviewPermissions(source)) == 0 || len(documentIDs) == 0 || len(documentIDs) > DocumentProductPreviewBatchLimit {
		return nil, ErrBadParam
	}
	if options.ExpectedVersion < 0 || (options.ExpectedVersion != 0 && !options.IncludeProducts) ||
		(options.IncludeProducts && (source != DocumentProductPreviewOutsourcingOrder || len(documentIDs) != 1)) {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(DocumentProductPreviewRepo)
	if !ok {
		return nil, ErrBadParam
	}
	seen := make(map[int]bool, len(documentIDs))
	ids := make([]int, 0, len(documentIDs))
	for _, id := range documentIDs {
		if id <= 0 || seen[id] {
			return nil, ErrBadParam
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return repo.ListDocumentProductPreviews(ctx, source, ids, options)
}
