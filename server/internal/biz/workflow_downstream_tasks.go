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
		"complete_condition": "采购确认退货、补货、让步接收或重新到货安排",
		"related_documents": workflowPurchaseInboundRelatedDocuments(current, workflowPurchaseInboundRelatedDocumentOptions{
			qcResult: qcResult,
			reason:   reason,
		}),
		"notification_type": "qc_failed",
		"alert_type":        "qc_failed",
		"critical_path":     true,
	}
	setWorkflowTransitionReasonPayload(payload, taskStatusKey, reason)
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

func buildOutsourceReturnQCTaskFromTracking(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowQCPendingStatusKey
	dueAt := time.Now().Add(4 * time.Hour)
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	payload := workflowOutsourceReturnCommonPayload(current)
	payload["return_task_id"] = current.ID
	payload["complete_condition"] = "品质完成委外回货检验，并给出合格、不合格、返工或让步接收结论"
	payload["related_documents"] = workflowOutsourceReturnRelatedDocuments(current, workflowOutsourceReturnRelatedDocumentOptions{})
	payload["notification_type"] = "task_created"
	payload["alert_type"] = "outsource_return_qc_pending"
	payload["critical_path"] = true
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("outsource-return-qc", current.SourceID),
		TaskGroup:         workflowOutsourceReturnQCTaskGroup,
		TaskName:          "委外回货检验",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "quality",
		Priority:          priority,
		DueAt:             &dueAt,
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
	payload["complete_condition"] = "生产/委外负责人确认返工、补做、让步接收或重新回货安排"
	payload["related_documents"] = workflowOutsourceReturnRelatedDocuments(current, workflowOutsourceReturnRelatedDocumentOptions{
		qcResult: "fail",
		reason:   reason,
	})
	payload["notification_type"] = "qc_failed"
	payload["alert_type"] = "qc_failed"
	payload["critical_path"] = true
	payload["outsource_owner_role_key"] = "outsource"
	setWorkflowTransitionReasonPayload(payload, taskStatusKey, reason)
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

func buildOutsourcePayableRegistrationTaskFromInbound(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowInboundDoneStatusKey
	dueAt := workflowPayableDueAt(current.Payload, time.Now())
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	payload := workflowOutsourceReturnCommonPayload(current)
	payload["warehouse_task_id"] = current.ID
	payload["inbound_result"] = "done"
	payload["complete_condition"] = "财务确认加工厂、回货数量、加工费、税率、含税/不含税金额和应付状态"
	payload["related_documents"] = workflowOutsourcePayableRelatedDocuments(current)
	payload["notification_type"] = "finance_pending"
	payload["alert_type"] = "payable_pending"
	payload["critical_path"] = false
	payload["next_module_key"] = "payables"
	payload["payable_type"] = "outsource"
	payload["amount"] = workflowPayloadValue(current.Payload, "amount")
	payload["tax_rate"] = workflowPayloadValue(current.Payload, "tax_rate")
	payload["tax_amount"] = workflowPayloadValue(current.Payload, "tax_amount")
	payload["amount_with_tax"] = workflowPayloadValue(current.Payload, "amount_with_tax")
	payload["amount_without_tax"] = workflowPayloadValue(current.Payload, "amount_without_tax")
	payload["payment_due_date"] = workflowPayableDueDateString(current.Payload)
	payload["inbound_date"] = workflowInboundDateString(current.Payload)
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("outsource-payable-registration", current.SourceID),
		TaskGroup:         workflowOutsourcePayableRegistrationGroup,
		TaskName:          "委外应付登记",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "finance",
		Priority:          priority,
		DueAt:             &dueAt,
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
	setWorkflowTransitionReasonPayload(payload, taskStatusKey, reason)
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

func buildInvoiceRegistrationTaskFromReceivable(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	businessStatusKey := workflowReconcilingStatusKey
	dueAt := workflowShipmentFinanceInvoiceDueAt(current.Payload, time.Now())
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	payload := workflowShipmentFinanceCommonPayload(current)
	payload["receivable_task_id"] = current.ID
	payload["receivable_result"] = "registered"
	payload["complete_condition"] = "财务登记发票号、发票类型、税率、税额、含税金额、不含税金额和发票状态"
	payload["related_documents"] = workflowShipmentFinanceRelatedDocuments(current, "")
	payload["notification_type"] = "finance_pending"
	payload["alert_type"] = "invoice_pending"
	payload["critical_path"] = false
	payload["next_module_key"] = workflowInvoicesModuleKey
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode("invoice-registration", current.SourceID),
		TaskGroup:         workflowInvoiceRegistrationTaskGroup,
		TaskName:          "开票登记",
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "finance",
		Priority:          priority,
		DueAt:             &dueAt,
		Payload:           payload,
	}
}

func buildPayableReconciliationTaskFromPayable(current *WorkflowTask) *WorkflowTaskCreate {
	if current == nil || current.SourceID <= 0 {
		return nil
	}
	payableType := workflowPayableType(current)
	isOutsource := payableType == "outsource"
	taskGroup := workflowPurchaseReconciliationGroup
	taskName := "采购对账"
	taskCodePrefix := "purchase-reconciliation"
	if isOutsource {
		taskGroup = workflowOutsourceReconciliationGroup
		taskName = "委外对账"
		taskCodePrefix = "outsource-reconciliation"
	}
	businessStatusKey := workflowReconcilingStatusKey
	dueAt := workflowReconciliationDueAt(time.Now())
	priority := current.Priority
	if priority <= 0 {
		priority = 2
	}
	payload := workflowPayableCommonPayload(current, payableType)
	payload["payable_task_id"] = current.ID
	if isOutsource {
		payload["complete_condition"] = "财务完成加工合同、回货记录、检验结果、加工费、扣款或差异核对"
	} else {
		payload["complete_condition"] = "财务完成采购单、入库记录、发票/对账资料、金额差异核对"
	}
	payload["related_documents"] = workflowPayableRelatedDocuments(current, payableType, "")
	payload["notification_type"] = "finance_pending"
	payload["alert_type"] = "reconciliation_pending"
	payload["critical_path"] = false
	payload["next_module_key"] = workflowReconciliationModuleKey
	payload["payable_type"] = payableType
	return &WorkflowTaskCreate{
		TaskCode:          workflowTaskCode(taskCodePrefix, current.SourceID),
		TaskGroup:         taskGroup,
		TaskName:          taskName,
		SourceType:        current.SourceType,
		SourceID:          current.SourceID,
		SourceNo:          workflowTaskSourceNo(current),
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "finance",
		Priority:          priority,
		DueAt:             &dueAt,
		Payload:           payload,
	}
}
