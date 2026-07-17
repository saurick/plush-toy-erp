package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"math"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleBusinessAttachment(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.attachmentUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "list_attachments":
		ownerType := biz.NormalizeBusinessAttachmentOwnerType(getString(pm, "owner_type"))
		ownerID := getInt(pm, "owner_id", 0)
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, ownerType, false); res != nil {
			return id, res, nil
		}
		if res := d.requireWorkflowAttachmentTaskAccess(ctx, ownerType, ownerID, false); res != nil {
			return id, res, nil
		}
		items, err := d.attachmentUC.ListBusinessAttachments(ctx, ownerType, ownerID)
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"attachments": businessAttachmentsToAny(items, false),
		})}, nil
	case "upload_attachment":
		ownerType := biz.NormalizeBusinessAttachmentOwnerType(getString(pm, "owner_type"))
		ownerID := getInt(pm, "owner_id", 0)
		expectedVersion, expectedVersionOK := positiveSafeIntegerParam(pm, "expected_version")
		if ownerType == biz.BusinessAttachmentOwnerWorkflowTask && !expectedVersionOK {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, ownerType, true); res != nil {
			return id, res, nil
		}
		if res := d.requireBusinessAttachmentOwnerModuleEnabled(ctx, getString(pm, "customer_key"), ownerType); res != nil {
			return id, res, nil
		}
		if res := d.requireWorkflowAttachmentTaskAccess(ctx, ownerType, ownerID, true); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		uploadedBy := admin.ID
		var workflowGuard *biz.WorkflowAttachmentWriteGuard
		if ownerType == biz.BusinessAttachmentOwnerWorkflowTask {
			workflowGuard = &biz.WorkflowAttachmentWriteGuard{
				ExpectedVersion:      expectedVersion,
				ActorID:              admin.ID,
				VisibleOwnerRoleKeys: d.workflowVisibleOwnerRoleKeys(ctx, admin, biz.PermissionWorkflowTaskUpdate),
			}
		}
		item, err := d.attachmentUC.UploadBusinessAttachment(ctx, &biz.BusinessAttachmentUploadInput{
			OwnerType:      ownerType,
			OwnerID:        ownerID,
			AttachmentType: getString(pm, "attachment_type"),
			SlotKey:        optionalStringFromParams(pm, "slot_key"),
			FileName:       getString(pm, "file_name"),
			MimeType:       getString(pm, "mime_type"),
			ContentBase64:  getString(pm, "content_base64"),
			UploadedBy:     &uploadedBy,
			Note:           optionalStringFromParams(pm, "note"),
			WorkflowGuard:  workflowGuard,
		})
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"attachment": businessAttachmentToAny(item, false),
		})}, nil
	case "clear_product_image":
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, biz.BusinessAttachmentOwnerProduct, true); res != nil {
			return id, res, nil
		}
		if res := d.requireBusinessAttachmentOwnerModuleEnabled(ctx, getString(pm, "customer_key"), biz.BusinessAttachmentOwnerProduct); res != nil {
			return id, res, nil
		}
		if err := d.attachmentUC.ClearProductImage(ctx, getInt(pm, "owner_id", 0), getString(pm, "slot_key")); err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"cleared": true,
		})}, nil
	case "download_attachment":
		item, err := d.attachmentUC.GetBusinessAttachmentMetadata(ctx, getInt(pm, "id", 0))
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, item.OwnerType, false); res != nil {
			return id, res, nil
		}
		if res := d.requireWorkflowAttachmentTaskAccess(ctx, item.OwnerType, item.OwnerID, false); res != nil {
			return id, res, nil
		}
		content, err := d.attachmentUC.GetBusinessAttachmentContent(ctx, item)
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		item.Content = content
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"attachment": businessAttachmentToAny(item, true),
		})}, nil
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 attachment 接口 method=%s", method),
		}, nil
	}
}

func positiveSafeIntegerParam(pm map[string]any, key string) (int, bool) {
	raw, ok := pm[key]
	if !ok {
		return 0, false
	}
	value, ok := raw.(float64)
	if !ok || value <= 0 || value > float64(1<<53-1) || math.Trunc(value) != value {
		return 0, false
	}
	return int(value), true
}

func (d *jsonrpcDispatcher) requireWorkflowAttachmentTaskAccess(ctx context.Context, ownerType string, ownerID int, write bool) *v1.JsonrpcResult {
	if ownerType != biz.BusinessAttachmentOwnerWorkflowTask {
		return nil
	}
	if d.workflowUC == nil || ownerID <= 0 {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	}
	requiredPermission := biz.PermissionWorkflowTaskRead
	if write {
		requiredPermission = biz.PermissionWorkflowTaskUpdate
	}
	if res := d.RequireAdminPermission(ctx, requiredPermission); res != nil {
		return res
	}
	task, err := d.workflowUC.GetTask(ctx, ownerID)
	if err != nil {
		return d.mapWorkflowError(ctx, err)
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return res
	}
	visibleOwnerRoleKeys := d.workflowVisibleOwnerRoleKeys(ctx, admin, requiredPermission)
	if !workflowAdminCanViewTask(admin, task, visibleOwnerRoleKeys) {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	if write && !workflowAdminCanHandleTask(admin, task, "blocked", visibleOwnerRoleKeys) {
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	}
	return nil
}

func optionalStringFromParams(pm map[string]any, key string) *string {
	text := getString(pm, key)
	if text == "" {
		return nil
	}
	return &text
}

func (d *jsonrpcDispatcher) requireBusinessAttachmentOwnerModuleEnabled(ctx context.Context, customerKey string, ownerType string) *v1.JsonrpcResult {
	moduleKeys := businessAttachmentOwnerModuleKeys(ownerType)
	if len(moduleKeys) == 0 {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	}
	return d.requireCustomerConfigModulesEnabled(ctx, customerKey, moduleKeys...)
}

func (d *jsonrpcDispatcher) requireBusinessAttachmentOwnerPermission(ctx context.Context, ownerType string, write bool) *v1.JsonrpcResult {
	if !biz.IsBusinessAttachmentOwnerTypeAllowed(ownerType) {
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	}
	if write {
		return d.RequireAdminAnyPermission(ctx, businessAttachmentWritePermissions(ownerType)...)
	}
	return d.RequireAdminAnyPermission(ctx, businessAttachmentReadPermissions(ownerType)...)
}

func businessAttachmentOwnerModuleKeys(ownerType string) []string {
	switch ownerType {
	case biz.BusinessAttachmentOwnerSalesOrder:
		return []string{"sales_orders"}
	case biz.BusinessAttachmentOwnerPurchaseOrder:
		return []string{"purchase_orders"}
	case biz.BusinessAttachmentOwnerOutsourcingOrder, biz.BusinessAttachmentOwnerOutsourcingFact:
		return []string{"outsourcing_orders"}
	case biz.BusinessAttachmentOwnerPurchaseReceipt:
		return []string{"purchase_receipts"}
	case biz.BusinessAttachmentOwnerQualityInspection:
		return []string{"quality_inspections"}
	case biz.BusinessAttachmentOwnerShipment:
		return []string{"shipments"}
	case biz.BusinessAttachmentOwnerFinanceFact:
		return []string{"finance"}
	case biz.BusinessAttachmentOwnerProductionFact:
		return []string{"production"}
	case biz.BusinessAttachmentOwnerProduct:
		return []string{"products"}
	case biz.BusinessAttachmentOwnerProductSKU:
		return []string{"products"}
	case biz.BusinessAttachmentOwnerBOMHeader:
		return []string{"material_bom"}
	case biz.BusinessAttachmentOwnerWorkflowTask:
		return []string{"workflow_tasks"}
	default:
		return nil
	}
}

func businessAttachmentReadPermissions(ownerType string) []string {
	switch ownerType {
	case biz.BusinessAttachmentOwnerSalesOrder:
		return []string{biz.PermissionSalesOrderRead}
	case biz.BusinessAttachmentOwnerPurchaseOrder:
		return []string{biz.PermissionPurchaseOrderRead}
	case biz.BusinessAttachmentOwnerOutsourcingOrder:
		return []string{biz.PermissionOutsourcingOrderRead}
	case biz.BusinessAttachmentOwnerPurchaseReceipt:
		return []string{biz.PermissionPurchaseReceiptRead, biz.PermissionWarehouseInboundRead}
	case biz.BusinessAttachmentOwnerQualityInspection:
		return []string{biz.PermissionQualityInspectionRead}
	case biz.BusinessAttachmentOwnerShipment:
		return []string{biz.PermissionShipmentRead}
	case biz.BusinessAttachmentOwnerFinanceFact:
		return []string{biz.PermissionFinancePayableRead, biz.PermissionFinanceReceivableRead, biz.PermissionFinanceReportRead}
	case biz.BusinessAttachmentOwnerProductionFact:
		return []string{biz.PermissionProductionFactRead}
	case biz.BusinessAttachmentOwnerOutsourcingFact:
		return []string{biz.PermissionOutsourcingOrderRead}
	case biz.BusinessAttachmentOwnerProduct:
		return []string{biz.PermissionProductRead}
	case biz.BusinessAttachmentOwnerProductSKU:
		return []string{biz.PermissionProductSKURead, biz.PermissionProductRead}
	case biz.BusinessAttachmentOwnerBOMHeader:
		return []string{biz.PermissionBOMRead}
	case biz.BusinessAttachmentOwnerWorkflowTask:
		return []string{biz.PermissionWorkflowTaskRead}
	default:
		return []string{}
	}
}

func businessAttachmentWritePermissions(ownerType string) []string {
	switch ownerType {
	case biz.BusinessAttachmentOwnerSalesOrder:
		return []string{biz.PermissionSalesOrderCreate, biz.PermissionSalesOrderUpdate}
	case biz.BusinessAttachmentOwnerPurchaseOrder:
		return []string{biz.PermissionPurchaseOrderCreate, biz.PermissionPurchaseOrderUpdate}
	case biz.BusinessAttachmentOwnerOutsourcingOrder:
		return []string{biz.PermissionOutsourcingOrderCreate, biz.PermissionOutsourcingOrderUpdate}
	case biz.BusinessAttachmentOwnerPurchaseReceipt:
		return []string{biz.PermissionPurchaseReceiptCreate, biz.PermissionWarehouseInboundConfirm}
	case biz.BusinessAttachmentOwnerQualityInspection:
		return []string{biz.PermissionQualityInspectionCreate, biz.PermissionQualityInspectionUpdate, biz.PermissionQualityExceptionHandle}
	case biz.BusinessAttachmentOwnerShipment:
		return []string{biz.PermissionShipmentCreate, biz.PermissionShipmentShip}
	case biz.BusinessAttachmentOwnerFinanceFact:
		return []string{biz.PermissionFinancePayableConfirm, biz.PermissionFinanceReceivableConfirm}
	case biz.BusinessAttachmentOwnerProductionFact:
		return []string{biz.PermissionProductionCompletionCreate, biz.PermissionProductionFactPost, biz.PermissionProductionFactCancel}
	case biz.BusinessAttachmentOwnerOutsourcingFact:
		return []string{biz.PermissionOutsourcingOrderCreate, biz.PermissionOutsourcingOrderUpdate}
	case biz.BusinessAttachmentOwnerProduct:
		return []string{biz.PermissionProductUpdate}
	case biz.BusinessAttachmentOwnerProductSKU:
		return []string{biz.PermissionProductSKUCreate, biz.PermissionProductSKUUpdate}
	case biz.BusinessAttachmentOwnerBOMHeader:
		return []string{biz.PermissionBOMCreate, biz.PermissionBOMUpdate}
	case biz.BusinessAttachmentOwnerWorkflowTask:
		return []string{biz.PermissionWorkflowTaskCreate, biz.PermissionWorkflowTaskUpdate, biz.PermissionWorkflowTaskComplete, biz.PermissionWorkflowTaskReject}
	default:
		return []string{}
	}
}

func businessAttachmentToAny(item *biz.BusinessAttachment, includeContent bool) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	out := map[string]any{
		"id":              item.ID,
		"owner_type":      item.OwnerType,
		"owner_id":        item.OwnerID,
		"attachment_type": item.AttachmentType,
		"slot_key":        optionalStringValue(item.SlotKey),
		"file_name":       item.FileName,
		"mime_type":       item.MimeType,
		"file_size":       item.FileSize,
		"sha256":          item.SHA256,
		"uploaded_by":     optionalIntValue(item.UploadedBy),
		"note":            optionalStringValue(item.Note),
		"created_at":      item.CreatedAt.Unix(),
	}
	if includeContent {
		out["content_base64"] = base64.StdEncoding.EncodeToString(item.Content)
	}
	return out
}

func businessAttachmentsToAny(items []*biz.BusinessAttachment, includeContent bool) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, businessAttachmentToAny(item, includeContent))
	}
	return out
}

func (d *jsonrpcDispatcher) mapBusinessAttachmentError(ctx context.Context, err error) *v1.JsonrpcResult {
	if err == nil {
		return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message}
	}
	switch {
	case errors.Is(err, biz.ErrBusinessAttachmentTooLarge):
		return &v1.JsonrpcResult{Code: errcode.PayloadTooLarge.Code, Message: "附件超过 5MB，请压缩后再上传"}
	case errors.Is(err, biz.ErrBusinessAttachmentProductImageMimeNotAllowed):
		return &v1.JsonrpcResult{
			Code:    errcode.InvalidParam.Code,
			Message: "产品图片仅支持 PNG、JPG/JPEG 或 WebP 格式，请重新选择图片",
		}
	case errors.Is(err, biz.ErrBusinessAttachmentProductImageDimensionsInvalid):
		return &v1.JsonrpcResult{
			Code: errcode.InvalidParam.Code,
			Message: fmt.Sprintf(
				"产品图片尺寸过大，请将宽高压缩至 %d 像素以内且总像素不超过 %d 万",
				biz.BusinessAttachmentProductImageMaxWidth,
				biz.BusinessAttachmentProductImageMaxPixels/10_000,
			),
		}
	case errors.Is(err, biz.ErrBusinessAttachmentProductImageContentInvalid):
		return &v1.JsonrpcResult{
			Code:    errcode.InvalidParam.Code,
			Message: "无法识别产品图片内容，请确认文件未损坏，且实际格式与文件扩展名一致",
		}
	case errors.Is(err, biz.ErrBadParam),
		errors.Is(err, biz.ErrBusinessAttachmentOwnerInvalid),
		errors.Is(err, biz.ErrBusinessAttachmentContentInvalid),
		errors.Is(err, biz.ErrBusinessAttachmentMimeNotAllowed):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrBusinessAttachmentNotFound),
		errors.Is(err, biz.ErrBusinessAttachmentOwnerNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "附件或所属业务记录不存在"}
	case errors.Is(err, biz.ErrWorkflowTaskConflict), errors.Is(err, biz.ErrWorkflowTaskSettled):
		return d.mapWorkflowError(ctx, err)
	case errors.Is(err, biz.ErrForbidden):
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	default:
		d.log.WithContext(ctx).Errorf("business attachment error: %v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}
