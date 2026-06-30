package biz

func buildPurchaseIQCDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowWarehouseInboundPendingKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":  workflowPurchaseInboundRecordTitle(current),
				"iqc_task_id":   current.ID,
				"qc_result":     "pass",
				"critical_path": true,
			},
		},
		DerivedTask:       buildWarehouseInboundTaskFromPurchaseIqc(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "purchase_iqc_done_to_warehouse_inbound",
	}
}

func buildPurchaseIQCExceptionSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := PurchaseRoleKey
	qcResult := "fail"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	statePayload := map[string]any{
		"record_title":      workflowPurchaseInboundRecordTitle(current),
		"iqc_task_id":       current.ID,
		"qc_result":         qcResult,
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"rejected_reason":   reason,
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	}
	workflowRuleKey := "purchase_iqc_rejected_to_quality_exception"
	if taskStatusKey == "blocked" {
		workflowRuleKey = "purchase_iqc_blocked_to_quality_exception"
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCFailedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedTask:       buildPurchaseQualityExceptionTaskFromIqc(current, taskStatusKey, reason),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   workflowRuleKey,
	}
}

func buildPurchaseWarehouseInboundDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowInboundDoneStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":               workflowPurchaseInboundRecordTitle(current),
				"warehouse_task_id":          current.ID,
				"inbound_result":             "done",
				"inventory_balance_deferred": true,
				"critical_path":              true,
				"decision":                   "done",
				"transition_status":          "done",
			},
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "warehouse_inbound_done_to_inbound_done",
	}
}

func buildPurchaseWarehouseInboundBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	statePayload := map[string]any{
		"record_title":      workflowPurchaseInboundRecordTitle(current),
		"warehouse_task_id": current.ID,
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowBlockedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "warehouse_inbound_" + taskStatusKey + "_to_blocked",
	}
}

func buildOutsourceReturnTrackingDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "quality"
	statePayload := workflowOutsourceReturnCommonPayload(current)
	statePayload["return_task_id"] = current.ID
	statePayload["notification_type"] = "task_created"
	statePayload["alert_type"] = "outsource_return_qc_pending"
	statePayload["critical_path"] = true
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCPendingStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedTask:       buildOutsourceReturnQCTaskFromTracking(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "outsource_return_tracking_done_to_return_qc",
	}
}

func buildOutsourceReturnQCDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	qcResult := workflowPayloadString(current.Payload, "qc_result")
	if qcResult == "" {
		qcResult = "pass"
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowWarehouseInboundPendingKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":         workflowOutsourceReturnRecordTitle(current),
				"qc_task_id":           current.ID,
				"qc_result":            qcResult,
				"qc_type":              "outsource_return",
				"notification_type":    "task_created",
				"alert_type":           "inbound_pending",
				"critical_path":        true,
				"outsource_processing": true,
			},
		},
		DerivedTask:       buildOutsourceWarehouseInboundTaskFromReturnQC(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "outsource_return_qc_done_to_outsource_warehouse_inbound",
	}
}

func buildOutsourceWarehouseInboundDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "finance"
	statePayload := workflowOutsourceReturnCommonPayload(current)
	statePayload["warehouse_task_id"] = current.ID
	statePayload["inbound_result"] = "done"
	statePayload["inventory_balance_deferred"] = true
	statePayload["notification_type"] = "finance_pending"
	statePayload["alert_type"] = "payable_pending"
	statePayload["critical_path"] = true
	statePayload["next_module_key"] = "payables"
	statePayload["payable_type"] = "outsource"
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowInboundDoneStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedTask:       buildOutsourcePayableRegistrationTaskFromInbound(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "outsource_warehouse_inbound_done_to_outsource_payable_registration",
	}
}

func buildOutsourceReturnQCReworkSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "production"
	qcResult := "fail"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	statePayload := map[string]any{
		"record_title":         workflowOutsourceReturnRecordTitle(current),
		"qc_task_id":           current.ID,
		"qc_result":            qcResult,
		"qc_type":              "outsource_return",
		"decision":             taskStatusKey,
		"transition_status":    taskStatusKey,
		"rejected_reason":      reason,
		"notification_type":    "qc_failed",
		"alert_type":           "qc_failed",
		"critical_path":        true,
		"outsource_processing": true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	}
	workflowRuleKey := "outsource_return_qc_rejected_to_outsource_rework"
	if taskStatusKey == "blocked" {
		workflowRuleKey = "outsource_return_qc_blocked_to_outsource_rework"
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCFailedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedTask:       buildOutsourceReworkTaskFromReturnQC(current, taskStatusKey, reason),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   workflowRuleKey,
	}
}

func buildOutsourceReworkDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "production"
	statePayload := workflowOutsourceReturnCommonPayload(current)
	statePayload["rework_task_id"] = current.ID
	statePayload["rework_result"] = "arranged"
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	statePayload["critical_path"] = true
	statePayload["outsource_owner_role_key"] = "outsource"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowProductionProcessingStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "outsource_rework_done_to_production_processing",
	}
}

func buildOutsourceReworkBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "production"
	statePayload := workflowOutsourceReturnCommonPayload(current)
	statePayload["rework_task_id"] = current.ID
	statePayload["decision"] = taskStatusKey
	statePayload["transition_status"] = taskStatusKey
	statePayload["critical_path"] = true
	statePayload["outsource_owner_role_key"] = "outsource"
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCFailedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "outsource_rework_" + taskStatusKey + "_to_qc_failed",
	}
}

func buildFinishedGoodsQCDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	qcResult := workflowPayloadString(current.Payload, "qc_result")
	if qcResult == "" {
		qcResult = "pass"
	}
	statePayload := workflowFinishedGoodsCommonPayload(current)
	statePayload["qc_task_id"] = current.ID
	statePayload["qc_result"] = qcResult
	statePayload["notification_type"] = "task_created"
	statePayload["alert_type"] = "finished_goods_inbound_pending"
	statePayload["critical_path"] = true
	statePayload["inventory_balance_deferred"] = true
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowWarehouseInboundPendingKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedTask:       buildFinishedGoodsInboundTaskFromQC(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "finished_goods_qc_done_to_finished_goods_inbound",
	}
}

func buildFinishedGoodsQCReworkSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "production"
	qcResult := "blocked"
	if taskStatusKey == "rejected" {
		qcResult = "rejected"
	}
	statePayload := workflowFinishedGoodsCommonPayload(current)
	statePayload["qc_task_id"] = current.ID
	statePayload["qc_result"] = qcResult
	statePayload["decision"] = taskStatusKey
	statePayload["transition_status"] = taskStatusKey
	statePayload["notification_type"] = "qc_failed"
	statePayload["alert_type"] = "qc_failed"
	statePayload["critical_path"] = true
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	workflowRuleKey := "finished_goods_qc_rejected_to_finished_goods_rework"
	if taskStatusKey == "blocked" {
		workflowRuleKey = "finished_goods_qc_blocked_to_finished_goods_rework"
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCFailedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedTask:                       buildFinishedGoodsReworkTaskFromQC(current, taskStatusKey, reason),
		DerivedFromTaskID:                 current.ID,
		WorkflowRuleKey:                   workflowRuleKey,
		RefreshExistingDerivedTaskPayload: true,
	}
}

func buildFinishedGoodsInboundDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	statePayload := workflowFinishedGoodsCommonPayload(current)
	statePayload["inbound_task_id"] = current.ID
	statePayload["inbound_result"] = "done"
	statePayload["inventory_balance_deferred"] = true
	statePayload["shipment_release_deferred"] = true
	statePayload["critical_path"] = true
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowInboundDoneStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "finished_goods_inbound_done_to_inbound_done",
	}
}

func buildFinishedGoodsInboundBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	statePayload := workflowFinishedGoodsCommonPayload(current)
	statePayload["inbound_task_id"] = current.ID
	statePayload["critical_path"] = true
	statePayload["decision"] = taskStatusKey
	statePayload["transition_status"] = taskStatusKey
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowBlockedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "finished_goods_inbound_" + taskStatusKey + "_to_blocked",
	}
}

func buildFinishedGoodsReworkDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "production"
	statePayload := workflowFinishedGoodsCommonPayload(current)
	statePayload["rework_task_id"] = current.ID
	statePayload["rework_result"] = "arranged"
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	statePayload["critical_path"] = true
	statePayload["finished_goods"] = true
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowProductionProcessingStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "finished_goods_rework_done_to_production_processing",
	}
}

func buildFinishedGoodsReworkBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "production"
	statePayload := workflowFinishedGoodsCommonPayload(current)
	statePayload["rework_task_id"] = current.ID
	statePayload["decision"] = taskStatusKey
	statePayload["transition_status"] = taskStatusKey
	statePayload["critical_path"] = true
	statePayload["finished_goods"] = true
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowQCFailedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "finished_goods_rework_" + taskStatusKey + "_to_qc_failed",
	}
}

func buildShipmentReleaseDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	statePayload := workflowShipmentReleaseCommonPayload(current)
	statePayload["shipment_release_task_id"] = current.ID
	statePayload["shipment_release_result"] = "done"
	statePayload["shipment_release_deferred_inventory"] = true
	statePayload["shipment_execution_required"] = true
	statePayload["inventory_out_deferred"] = true
	statePayload["receivable_deferred"] = true
	statePayload["invoice_deferred"] = true
	statePayload["critical_path"] = true
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowShippingReleasedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "shipment_release_done_to_shipping_released",
	}
}

func buildShipmentReleaseBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "warehouse"
	statePayload := workflowShipmentReleaseCommonPayload(current)
	statePayload["shipment_release_task_id"] = current.ID
	statePayload["critical_path"] = true
	statePayload["decision"] = taskStatusKey
	statePayload["transition_status"] = taskStatusKey
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowBlockedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "shipment_release_" + taskStatusKey + "_to_blocked",
	}
}

func buildReceivableRegistrationDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "finance"
	statePayload := workflowShipmentFinanceCommonPayload(current)
	statePayload["receivable_task_id"] = current.ID
	statePayload["receivable_result"] = "registered"
	statePayload["notification_type"] = "finance_pending"
	statePayload["alert_type"] = "invoice_pending"
	statePayload["critical_path"] = false
	statePayload["next_module_key"] = workflowInvoicesModuleKey
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowReconcilingStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedTask:       buildInvoiceRegistrationTaskFromReceivable(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "receivable_registration_done_to_invoice_registration",
	}
}

func buildInvoiceRegistrationDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "finance"
	statePayload := workflowShipmentFinanceCommonPayload(current)
	statePayload["invoice_task_id"] = current.ID
	statePayload["invoice_result"] = "registered"
	statePayload["critical_path"] = false
	statePayload["next_module_key"] = "reconciliation"
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowReconcilingStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "invoice_registration_done_to_reconciling",
	}
}

func buildShipmentFinanceBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "finance"
	statePayload := workflowShipmentFinanceCommonPayload(current)
	statePayload["finance_task_id"] = current.ID
	statePayload["notification_type"] = "finance_pending"
	statePayload["alert_type"] = "finance_pending"
	statePayload["critical_path"] = true
	statePayload["decision"] = taskStatusKey
	statePayload["transition_status"] = taskStatusKey
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowBlockedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "shipment_finance_" + taskStatusKey + "_to_blocked",
	}
}

func buildPayableRegistrationDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "finance"
	payableType := workflowPayableType(current)
	statePayload := workflowPayableCommonPayload(current, payableType)
	statePayload["payable_task_id"] = current.ID
	statePayload["payable_result"] = "registered"
	statePayload["notification_type"] = "finance_pending"
	statePayload["alert_type"] = "reconciliation_pending"
	statePayload["critical_path"] = false
	statePayload["next_module_key"] = workflowReconciliationModuleKey
	statePayload["payable_type"] = payableType
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowReconcilingStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedTask:       buildPayableReconciliationTaskFromPayable(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "payable_registration_done_to_reconciliation",
	}
}

func buildPayableReconciliationDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "finance"
	payableType := workflowPayableType(current)
	statePayload := workflowPayableCommonPayload(current, payableType)
	statePayload["reconciliation_task_id"] = current.ID
	statePayload["reconciliation_result"] = "settled"
	statePayload["payable_type"] = payableType
	statePayload["decision"] = "done"
	statePayload["transition_status"] = "done"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowSettledStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "payable_reconciliation_done_to_settled",
	}
}

func buildPayableFinanceBlockedSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "finance"
	payableType := workflowPayableType(current)
	statePayload := workflowPayableCommonPayload(current, payableType)
	statePayload["finance_task_id"] = current.ID
	statePayload["notification_type"] = "finance_pending"
	statePayload["alert_type"] = "finance_pending"
	statePayload["critical_path"] = true
	statePayload["payable_type"] = payableType
	statePayload["decision"] = taskStatusKey
	statePayload["transition_status"] = taskStatusKey
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	} else {
		statePayload["rejected_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        current.SourceType,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowBlockedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "payable_finance_" + taskStatusKey + "_to_blocked",
	}
}
