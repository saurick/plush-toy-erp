package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"

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
	case "list_attachments", "listAttachments":
		ownerType := biz.NormalizeBusinessAttachmentOwnerType(getString(pm, "owner_type"))
		ownerID := getInt(pm, "owner_id", 0)
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, ownerType, false); res != nil {
			return id, res, nil
		}
		items, err := d.attachmentUC.ListBusinessAttachments(ctx, ownerType, ownerID)
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"attachments": businessAttachmentsToAny(items, false),
		})}, nil
	case "upload_attachment", "uploadAttachment":
		ownerType := biz.NormalizeBusinessAttachmentOwnerType(getString(pm, "owner_type"))
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, ownerType, true); res != nil {
			return id, res, nil
		}
		admin, res := d.CurrentAdmin(ctx)
		if res != nil {
			return id, res, nil
		}
		uploadedBy := admin.ID
		item, err := d.attachmentUC.UploadBusinessAttachment(ctx, &biz.BusinessAttachmentUploadInput{
			OwnerType:      ownerType,
			OwnerID:        getInt(pm, "owner_id", 0),
			AttachmentType: getString(pm, "attachment_type"),
			SlotKey:        optionalStringFromParams(pm, "slot_key"),
			FileName:       getString(pm, "file_name"),
			MimeType:       getString(pm, "mime_type"),
			ContentBase64:  getString(pm, "content_base64"),
			UploadedBy:     &uploadedBy,
			Note:           optionalStringFromParams(pm, "note"),
		})
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"attachment": businessAttachmentToAny(item, false),
		})}, nil
	case "download_attachment", "downloadAttachment", "get_attachment_content", "getAttachmentContent":
		item, err := d.attachmentUC.GetBusinessAttachment(ctx, getInt(pm, "id", 0))
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, item.OwnerType, false); res != nil {
			return id, res, nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"attachment": businessAttachmentToAny(item, true),
		})}, nil
	case "delete_attachment", "deleteAttachment":
		item, err := d.attachmentUC.GetBusinessAttachment(ctx, getInt(pm, "id", 0))
		if err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		if res := d.requireBusinessAttachmentOwnerPermission(ctx, item.OwnerType, true); res != nil {
			return id, res, nil
		}
		if err := d.attachmentUC.DeleteBusinessAttachment(ctx, item.ID); err != nil {
			return id, d.mapBusinessAttachmentError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"deleted": true,
		})}, nil
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 attachment 接口 method=%s", method),
		}, nil
	}
}

func optionalStringFromParams(pm map[string]any, key string) *string {
	text := getString(pm, key)
	if text == "" {
		return nil
	}
	return &text
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
		return []string{biz.PermissionPMCPlanRead}
	case biz.BusinessAttachmentOwnerOutsourcingFact:
		return []string{biz.PermissionOutsourcingOrderRead}
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
		return []string{biz.PermissionPMCPlanCreate, biz.PermissionPMCPlanUpdate, biz.PermissionPMCRiskHandle}
	case biz.BusinessAttachmentOwnerOutsourcingFact:
		return []string{biz.PermissionOutsourcingOrderCreate, biz.PermissionOutsourcingOrderUpdate}
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
		return &v1.JsonrpcResult{Code: errcode.PayloadTooLarge.Code, Message: "附件超过 50MB，请压缩后再上传"}
	case errors.Is(err, biz.ErrBadParam),
		errors.Is(err, biz.ErrBusinessAttachmentOwnerInvalid),
		errors.Is(err, biz.ErrBusinessAttachmentContentInvalid),
		errors.Is(err, biz.ErrBusinessAttachmentMimeNotAllowed):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrBusinessAttachmentNotFound),
		errors.Is(err, biz.ErrBusinessAttachmentOwnerNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "附件或所属业务记录不存在"}
	default:
		d.log.WithContext(ctx).Errorf("business attachment error: %v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}
