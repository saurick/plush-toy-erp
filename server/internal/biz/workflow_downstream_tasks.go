package biz

import "time"

func buildWarehouseInboundTaskFromPurchaseIqc(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowWarehouseInboundPendingKey
	dueAt := time.Now().Add(4 * time.Hour)
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("warehouse-inbound", current.SourceID),
		TaskGroup:         workflowWarehouseInboundTaskGroup,
		TaskName:          "确认入库",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          priority,
		DueAt:             &dueAt,
		Payload: map[string]any{
			"record_title":       workflowPurchaseInboundRecordTitle(current),
			"supplier_name":      workflowPayloadString(current.Payload, "supplier_name"),
			"material_name":      workflowPayloadString(current.Payload, "material_name"),
			"product_name":       workflowPayloadString(current.Payload, "product_name"),
			"quantity":           workflowPayloadString(current.Payload, "quantity"),
			"unit":               workflowPayloadString(current.Payload, "unit"),
			"due_date":           workflowPayloadString(current.Payload, "due_date"),
			"qc_result":          "pass",
			"complete_condition": "仓库确认入库数量、库位和经手人，业务状态更新为已入库",
			"related_documents": workflowPurchaseInboundRelatedDocuments(current, workflowPurchaseInboundRelatedDocumentOptions{
				qcResult: "pass",
			}),
			"notification_type": "task_created",
			"alert_type":        "inbound_pending",
			"critical_path":     true,
		},
	}
}

func buildPurchaseQualityExceptionTaskFromIqc(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowQCFailedStatusKey
	qcResult := "fail"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	payload := map[string]any{
		"record_title":       workflowPurchaseInboundRecordTitle(current),
		"supplier_name":      workflowPayloadString(current.Payload, "supplier_name"),
		"material_name":      workflowPayloadString(current.Payload, "material_name"),
		"product_name":       workflowPayloadString(current.Payload, "product_name"),
		"quantity":           workflowPayloadString(current.Payload, "quantity"),
		"unit":               workflowPayloadString(current.Payload, "unit"),
		"due_date":           workflowPayloadString(current.Payload, "due_date"),
		"iqc_task_id":        current.ID,
		"qc_result":          qcResult,
		"decision":           taskStatusKey,
		"transition_status":  taskStatusKey,
		"rejected_reason":    reason,
		"complete_condition": "采购确认退货、补货、让步接收或重新到货安排",
		"related_documents": workflowPurchaseInboundRelatedDocuments(current, workflowPurchaseInboundRelatedDocumentOptions{
			qcResult: qcResult,
			reason:   reason,
		}),
		"notification_type": "qc_failed",
		"alert_type":        "qc_failed",
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		payload["blocked_reason"] = reason
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("purchase-qc-exception", current.SourceID),
		TaskGroup:         workflowPurchaseQualityExceptionGroup,
		TaskName:          "处理来料不良 / 补货 / 退货",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      PurchaseRoleKey,
		Priority:          3,
		Payload:           payload,
	}
}

func buildOutsourceWarehouseInboundTaskFromReturnQC(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowWarehouseInboundPendingKey
	dueAt := time.Now().Add(4 * time.Hour)
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	qcResult := workflowPayloadString(current.Payload, "qc_result")
	if qcResult == "" {
		qcResult = "pass"
	}
	payload := workflowOutsourceReturnCommonPayload(current)
	payload["qc_task_id"] = current.ID
	payload["qc_result"] = qcResult
	payload["complete_condition"] = "仓库确认委外回货入库数量、库位和经手人"
	payload["related_documents"] = workflowOutsourceReturnRelatedDocuments(current, workflowOutsourceReturnRelatedDocumentOptions{
		qcResult: qcResult,
	})
	payload["notification_type"] = "task_created"
	payload["alert_type"] = "inbound_pending"
	payload["critical_path"] = true
	payload["inventory_balance_deferred"] = true
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("outsource-warehouse-inbound", current.SourceID),
		TaskGroup:         workflowOutsourceWarehouseInboundTaskGroup,
		TaskName:          "委外回货入库",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          priority,
		DueAt:             &dueAt,
		Payload:           payload,
	}
}

func buildOutsourceReworkTaskFromReturnQC(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowQCFailedStatusKey
	payload := workflowOutsourceReturnCommonPayload(current)
	payload["qc_task_id"] = current.ID
	payload["qc_result"] = "fail"
	payload["decision"] = taskStatusKey
	payload["transition_status"] = taskStatusKey
	payload["rejected_reason"] = reason
	payload["complete_condition"] = "生产/委外负责人确认返工、补做、让步接收或重新回货安排"
	payload["related_documents"] = workflowOutsourceReturnRelatedDocuments(current, workflowOutsourceReturnRelatedDocumentOptions{
		qcResult: "fail",
		reason:   reason,
	})
	payload["notification_type"] = "qc_failed"
	payload["alert_type"] = "qc_failed"
	payload["critical_path"] = true
	payload["outsource_owner_role_key"] = "outsource"
	if taskStatusKey == "blocked" {
		payload["blocked_reason"] = reason
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("outsource-rework", current.SourceID),
		TaskGroup:         workflowOutsourceReworkTaskGroup,
		TaskName:          "委外返工 / 补做处理",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "production",
		Priority:          3,
		Payload:           payload,
	}
}

func buildFinishedGoodsInboundTaskFromQC(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowWarehouseInboundPendingKey
	dueAt := time.Now().Add(4 * time.Hour)
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	qcResult := workflowPayloadString(current.Payload, "qc_result")
	if qcResult == "" {
		qcResult = "pass"
	}
	payload := workflowFinishedGoodsCommonPayload(current)
	payload["qc_task_id"] = current.ID
	payload["qc_result"] = qcResult
	payload["complete_condition"] = "仓库确认成品入库数量、库位和经手人"
	payload["related_documents"] = workflowFinishedGoodsRelatedDocuments(current, workflowFinishedGoodsRelatedDocumentOptions{
		qcResult: qcResult,
	})
	payload["notification_type"] = "task_created"
	payload["alert_type"] = "finished_goods_inbound_pending"
	payload["critical_path"] = true
	payload["inventory_balance_deferred"] = true
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("finished-goods-inbound", current.SourceID),
		TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
		TaskName:          "成品入库",
		SourceType:        workflowProductionProgressModuleKey,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "warehouse",
		Priority:          priority,
		DueAt:             &dueAt,
		Payload:           payload,
	}
}

func buildFinishedGoodsReworkTaskFromQC(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowQCFailedStatusKey
	qcResult := "blocked"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	payload := workflowFinishedGoodsCommonPayload(current)
	payload["qc_task_id"] = current.ID
	payload["qc_result"] = qcResult
	payload["decision"] = taskStatusKey
	payload["transition_status"] = taskStatusKey
	payload["complete_condition"] = "生产确认返工完成、重新提交成品抽检或让步放行处理"
	payload["related_documents"] = workflowFinishedGoodsRelatedDocuments(current, workflowFinishedGoodsRelatedDocumentOptions{
		qcResult: qcResult,
		reason:   reason,
	})
	payload["notification_type"] = "qc_failed"
	payload["alert_type"] = "qc_failed"
	payload["critical_path"] = true
	if taskStatusKey == "blocked" {
		payload["blocked_reason"] = reason
	} else {
		payload["rejected_reason"] = reason
	}
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("finished-goods-rework", current.SourceID),
		TaskGroup:         workflowFinishedGoodsReworkTaskGroup,
		TaskName:          "成品返工处理",
		SourceType:        workflowProductionProgressModuleKey,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "production",
		Priority:          3,
		Payload:           payload,
	}
}
