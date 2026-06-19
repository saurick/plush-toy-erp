package biz

import "time"

func buildEngineeringTaskFromApprovedOrder(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowEngineeringPreparingStatusKey
	dueAt := resolveEngineeringDueAt(current.Payload, time.Now())
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("engineering-data", current.SourceID),
		TaskGroup:         workflowEngineeringDataTaskGroup,
		TaskName:          "准备 BOM / 色卡 / 作业指导书",
		SourceType:        workflowProjectOrderModuleKey,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "engineering",
		Priority:          2,
		DueAt:             &dueAt,
		Payload: map[string]any{
			"record_title":       workflowOrderRecordTitle(current),
			"customer_name":      workflowPayloadString(current.Payload, "customer_name"),
			"style_no":           workflowPayloadString(current.Payload, "style_no"),
			"product_no":         workflowPayloadString(current.Payload, "product_no"),
			"product_name":       workflowPayloadString(current.Payload, "product_name"),
			"due_date":           workflowPayloadString(current.Payload, "due_date"),
			"complete_condition": "BOM、色卡、作业指导书或包装要求已补齐并确认",
			"related_documents": workflowOrderRelatedDocuments(current, workflowOrderRelatedDocumentOptions{
				includeMaterialBOM: true,
			}),
			"next_module_key": workflowMaterialBOMModuleKey,
			"entry_path":      "/erp/business-dashboard",
			"critical_path":   true,
		},
	}
}

func buildRevisionTaskFromRejectedOrder(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowOrderApprovalStatusKey
	payload := map[string]any{
		"record_title":       workflowOrderRecordTitle(current),
		"customer_name":      workflowPayloadString(current.Payload, "customer_name"),
		"style_no":           workflowPayloadString(current.Payload, "style_no"),
		"due_date":           workflowPayloadString(current.Payload, "due_date"),
		"complete_condition": "补齐客户资料、款式资料、交期或审批驳回原因后重新提交",
		"related_documents": workflowOrderRelatedDocuments(current, workflowOrderRelatedDocumentOptions{
			includeArtwork: true,
		}),
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"rejected_reason":   reason,
		"notification_type": "task_rejected",
		"alert_type":        "approval_pending",
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		payload["blocked_reason"] = reason
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("order-revision", current.SourceID),
		TaskGroup:         workflowOrderRevisionTaskGroup,
		TaskName:          "补充订单资料后重新提交",
		SourceType:        workflowProjectOrderModuleKey,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      BusinessRoleKey,
		Priority:          2,
		Payload:           payload,
	}
}
