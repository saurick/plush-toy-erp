package biz

import (
	"fmt"
	"strings"
	"time"
)

type workflowOrderRelatedDocumentOptions struct {
	includeMaterialBOM bool
	includeArtwork     bool
}

func workflowOrderRelatedDocuments(current *WorkflowTask, options workflowOrderRelatedDocumentOptions) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 6)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		documents = append(documents, "订单/款式立项记录："+sourceNo)
	}
	if customerName := workflowPayloadString(current.Payload, "customer_name"); customerName != "" {
		documents = append(documents, "客户："+customerName)
	}
	if styleNo := workflowPayloadString(current.Payload, "style_no"); styleNo != "" {
		documents = append(documents, "款式："+styleNo)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if dueDate := workflowPayloadString(current.Payload, "due_date"); dueDate != "" {
		documents = append(documents, "交期："+dueDate)
	}
	if options.includeMaterialBOM {
		documents = append(documents, "材料 BOM：待工程资料补齐")
	}
	if options.includeArtwork {
		documents = append(documents, "款图/资料：随订单资料检查")
	}
	return documents
}

type workflowPurchaseInboundRelatedDocumentOptions struct {
	qcResult string
	reason   string
}

func workflowPurchaseInboundRelatedDocuments(current *WorkflowTask, options workflowPurchaseInboundRelatedDocumentOptions) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 8)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		documents = append(documents, "到货记录："+sourceNo)
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "采购记录："+sourceNo)
	}
	if supplierName := workflowPayloadString(current.Payload, "supplier_name"); supplierName != "" {
		documents = append(documents, "供应商："+supplierName)
	}
	if materialName := workflowPayloadString(current.Payload, "material_name"); materialName != "" {
		documents = append(documents, "物料："+materialName)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if quantity := workflowPayloadString(current.Payload, "quantity"); quantity != "" {
		documents = append(documents, "数量："+quantity+workflowPayloadString(current.Payload, "unit"))
	}
	if options.qcResult != "" {
		documents = append(documents, "IQC 结果："+options.qcResult)
	}
	if options.reason != "" {
		documents = append(documents, "不良原因："+options.reason)
	}
	return documents
}

type workflowOutsourceReturnRelatedDocumentOptions struct {
	qcResult string
	reason   string
}

type workflowFinishedGoodsRelatedDocumentOptions struct {
	qcResult string
	reason   string
}

func workflowOutsourceReturnCommonPayload(current *WorkflowTask) map[string]any {
	return map[string]any{
		"record_title":         workflowOutsourceReturnRecordTitle(current),
		"supplier_name":        workflowPayloadString(current.Payload, "supplier_name"),
		"material_name":        workflowPayloadString(current.Payload, "material_name"),
		"product_no":           workflowPayloadString(current.Payload, "product_no"),
		"product_name":         workflowPayloadString(current.Payload, "product_name"),
		"quantity":             workflowPayloadValue(current.Payload, "quantity"),
		"unit":                 workflowPayloadString(current.Payload, "unit"),
		"due_date":             workflowPayloadString(current.Payload, "due_date"),
		"expected_return_date": workflowPayloadString(current.Payload, "expected_return_date"),
		"outsource_processing": true,
		"qc_type":              "outsource_return",
	}
}

func workflowOutsourceReturnRelatedDocuments(current *WorkflowTask, options workflowOutsourceReturnRelatedDocumentOptions) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 9)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		if strings.TrimSpace(current.SourceType) == workflowProcessingContractsModuleKey {
			documents = append(documents, "加工合同："+sourceNo)
		} else {
			documents = append(documents, "回货记录："+sourceNo)
		}
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "委外单："+sourceNo)
	}
	if issueNo := workflowPayloadString(current.Payload, "issue_no"); issueNo != "" {
		documents = append(documents, "发料记录："+issueNo)
	}
	if supplierName := workflowPayloadString(current.Payload, "supplier_name"); supplierName != "" {
		documents = append(documents, "加工厂："+supplierName)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if materialName := workflowPayloadString(current.Payload, "material_name"); materialName != "" {
		documents = append(documents, "物料 / 成品："+materialName)
	}
	if quantity := workflowPayloadString(current.Payload, "quantity"); quantity != "" {
		documents = append(documents, "数量："+quantity+workflowPayloadString(current.Payload, "unit"))
	}
	if options.qcResult != "" {
		documents = append(documents, "回货检验结果："+options.qcResult)
	}
	if options.reason != "" {
		documents = append(documents, "不良原因："+options.reason)
	}
	return documents
}

func workflowFinishedGoodsCommonPayload(current *WorkflowTask) map[string]any {
	return map[string]any{
		"record_title":          workflowFinishedGoodsRecordTitle(current),
		"customer_name":         workflowPayloadString(current.Payload, "customer_name"),
		"style_no":              workflowPayloadString(current.Payload, "style_no"),
		"material_name":         workflowPayloadString(current.Payload, "material_name"),
		"product_no":            workflowPayloadString(current.Payload, "product_no"),
		"product_name":          workflowPayloadString(current.Payload, "product_name"),
		"quantity":              workflowPayloadValue(current.Payload, "quantity"),
		"unit":                  workflowPayloadString(current.Payload, "unit"),
		"due_date":              workflowPayloadString(current.Payload, "due_date"),
		"shipment_date":         workflowPayloadString(current.Payload, "shipment_date"),
		"packaging_requirement": workflowPayloadString(current.Payload, "packaging_requirement"),
		"shipping_requirement":  workflowPayloadString(current.Payload, "shipping_requirement"),
		"finished_goods":        true,
	}
}

func workflowShipmentReleaseCommonPayload(current *WorkflowTask) map[string]any {
	return map[string]any{
		"record_title":          workflowShipmentReleaseRecordTitle(current),
		"customer_name":         workflowPayloadString(current.Payload, "customer_name"),
		"style_no":              workflowPayloadString(current.Payload, "style_no"),
		"material_name":         workflowPayloadString(current.Payload, "material_name"),
		"product_no":            workflowPayloadString(current.Payload, "product_no"),
		"product_name":          workflowPayloadString(current.Payload, "product_name"),
		"quantity":              workflowPayloadValue(current.Payload, "quantity"),
		"unit":                  workflowPayloadString(current.Payload, "unit"),
		"due_date":              workflowPayloadString(current.Payload, "due_date"),
		"shipment_date":         workflowPayloadString(current.Payload, "shipment_date"),
		"warehouse_location":    workflowPayloadString(current.Payload, "warehouse_location"),
		"packaging_requirement": workflowPayloadString(current.Payload, "packaging_requirement"),
		"shipping_requirement":  workflowPayloadString(current.Payload, "shipping_requirement"),
		"finished_goods":        workflowPayloadString(current.Payload, "finished_goods") == "true",
		"shipment_release":      true,
	}
}

func workflowShipmentFinanceCommonPayload(current *WorkflowTask) map[string]any {
	return map[string]any{
		"record_title":        workflowShipmentFinanceRecordTitle(current),
		"customer_name":       workflowPayloadString(current.Payload, "customer_name"),
		"product_name":        workflowPayloadString(current.Payload, "product_name"),
		"material_name":       workflowPayloadString(current.Payload, "material_name"),
		"quantity":            workflowPayloadValue(current.Payload, "quantity"),
		"unit":                workflowPayloadString(current.Payload, "unit"),
		"amount":              workflowPayloadValue(current.Payload, "amount"),
		"tax_rate":            workflowPayloadValue(current.Payload, "tax_rate"),
		"tax_amount":          workflowPayloadValue(current.Payload, "tax_amount"),
		"amount_with_tax":     workflowPayloadValue(current.Payload, "amount_with_tax"),
		"amount_without_tax":  workflowPayloadValue(current.Payload, "amount_without_tax"),
		"payment_due_date":    workflowShipmentFinancePaymentDueDate(current.Payload),
		"invoice_due_date":    workflowShipmentFinanceInvoiceDueDate(current.Payload),
		"shipment_date":       workflowShipmentFinanceShipmentDate(current.Payload),
		"receivable_due_date": workflowPayloadString(current.Payload, "receivable_due_date"),
	}
}

func workflowPayableCommonPayload(current *WorkflowTask, payableType string) map[string]any {
	return map[string]any{
		"record_title":       workflowPayableRecordTitle(current),
		"supplier_name":      workflowPayloadString(current.Payload, "supplier_name"),
		"customer_name":      workflowPayloadString(current.Payload, "customer_name"),
		"material_name":      workflowPayloadString(current.Payload, "material_name"),
		"product_name":       workflowPayloadString(current.Payload, "product_name"),
		"quantity":           workflowPayloadValue(current.Payload, "quantity"),
		"unit":               workflowPayloadString(current.Payload, "unit"),
		"amount":             workflowPayloadValue(current.Payload, "amount"),
		"tax_rate":           workflowPayloadValue(current.Payload, "tax_rate"),
		"tax_amount":         workflowPayloadValue(current.Payload, "tax_amount"),
		"amount_with_tax":    workflowPayloadValue(current.Payload, "amount_with_tax"),
		"amount_without_tax": workflowPayloadValue(current.Payload, "amount_without_tax"),
		"payment_due_date":   workflowPayableDueDateString(current.Payload),
		"inbound_date":       workflowInboundDateString(current.Payload),
		"payable_type":       payableType,
	}
}

func workflowFinishedGoodsRelatedDocuments(current *WorkflowTask, options workflowFinishedGoodsRelatedDocumentOptions) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 10)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		documents = append(documents, "生产进度："+sourceNo)
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "订单："+sourceNo)
	}
	if customerName := workflowPayloadString(current.Payload, "customer_name"); customerName != "" {
		documents = append(documents, "客户："+customerName)
	}
	if styleNo := workflowPayloadString(current.Payload, "style_no"); styleNo != "" {
		documents = append(documents, "款式："+styleNo)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if quantity := workflowPayloadString(current.Payload, "quantity"); quantity != "" {
		documents = append(documents, "数量："+quantity+workflowPayloadString(current.Payload, "unit"))
	}
	if packagingRequirement := workflowPayloadString(current.Payload, "packaging_requirement"); packagingRequirement != "" {
		documents = append(documents, "包装要求："+packagingRequirement)
	}
	if shippingRequirement := workflowPayloadString(current.Payload, "shipping_requirement"); shippingRequirement != "" {
		documents = append(documents, "出货要求："+shippingRequirement)
	}
	if options.qcResult != "" {
		documents = append(documents, "成品抽检结果："+options.qcResult)
	}
	if options.reason != "" {
		documents = append(documents, "不良原因："+options.reason)
	}
	return documents
}

func workflowTaskSourceNo(task *WorkflowTask) *string {
	if task == nil || task.SourceNo == nil {
		return nil
	}
	sourceNo := strings.TrimSpace(*task.SourceNo)
	if sourceNo == "" {
		return nil
	}
	return &sourceNo
}

func workflowSourceNoValue(task *WorkflowTask) string {
	if sourceNo := workflowTaskSourceNo(task); sourceNo != nil {
		return *sourceNo
	}
	return ""
}

func workflowOrderRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "订单/款式立项记录"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "style_no"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "订单/款式立项记录"
}

func workflowPurchaseInboundRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "采购到货 / 入库通知"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "material_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "采购到货 / 入库通知"
}

func workflowOutsourceReturnRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "委外回货检验"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "material_name"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "委外回货检验"
}

func workflowFinishedGoodsRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "成品抽检"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "style_no"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "成品抽检"
}

func workflowShipmentReleaseRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "出货放行"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "customer_name"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "出货放行"
}

func workflowShipmentFinanceRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "财务登记"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "customer_name"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "财务登记"
}

func workflowPayableRecordTitle(task *WorkflowTask) string {
	if task == nil {
		return "财务应付 / 对账"
	}
	if title := workflowPayloadString(task.Payload, "record_title"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "supplier_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "product_name"); title != "" {
		return title
	}
	if title := workflowPayloadString(task.Payload, "material_name"); title != "" {
		return title
	}
	if title := workflowSourceNoValue(task); title != "" {
		return title
	}
	return "财务应付 / 对账"
}

func workflowPayloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func workflowPayloadValue(payload map[string]any, key string) any {
	if payload == nil {
		return ""
	}
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return value
}

func mergeWorkflowPayload(base map[string]any, override map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range base {
		out[key] = value
	}
	for key, value := range override {
		out[key] = value
	}
	return out
}

func workflowTaskWithPayload(task *WorkflowTask, payload map[string]any) *WorkflowTask {
	if task == nil {
		return nil
	}
	next := *task
	next.Payload = payload
	return &next
}

func ensureWorkflowPayload(payload *map[string]any) {
	if payload == nil {
		return
	}
	if *payload == nil {
		*payload = map[string]any{}
	}
}

func workflowTaskCode(prefix string, sourceID int) string {
	return fmt.Sprintf("%s-%d-%d", prefix, sourceID, time.Now().UnixNano())
}

func resolveEngineeringDueAt(payload map[string]any, now time.Time) time.Time {
	defaultDueAt := now.Add(24 * time.Hour)
	orderDueAt, ok := parseBusinessDateEnd(payload)
	if !ok {
		return defaultDueAt
	}
	if !orderDueAt.After(now.Add(12 * time.Hour)) {
		return now.Add(4 * time.Hour)
	}
	if !orderDueAt.After(now.Add(48 * time.Hour)) {
		minDueAt := now.Add(4 * time.Hour)
		dueAt := orderDueAt.Add(-12 * time.Hour)
		if dueAt.Before(minDueAt) {
			return minDueAt
		}
		return dueAt
	}
	return defaultDueAt
}

func parseBusinessDateEnd(payload map[string]any) (time.Time, bool) {
	dueDate := workflowPayloadString(payload, "due_date")
	if dueDate == "" {
		return time.Time{}, false
	}
	day, err := time.ParseInLocation("2006-01-02", dueDate, time.Local)
	if err != nil {
		return time.Time{}, false
	}
	return time.Date(day.Year(), day.Month(), day.Day(), 23, 59, 59, 0, time.Local), true
}

func workflowPayableDueAt(payload map[string]any, now time.Time) time.Time {
	for _, key := range []string{"payment_due_date", "payable_due_date", "due_date"} {
		value := workflowPayloadString(payload, key)
		if value == "" {
			continue
		}
		day, err := time.ParseInLocation("2006-01-02", value, time.Local)
		if err == nil {
			return time.Date(day.Year(), day.Month(), day.Day(), 23, 59, 59, 0, time.Local)
		}
	}
	return now.Add(24 * time.Hour)
}

func workflowShipmentFinanceInvoiceDueAt(payload map[string]any, now time.Time) time.Time {
	for _, key := range []string{"invoice_due_date", "billing_due_date", "due_date"} {
		value := workflowPayloadString(payload, key)
		if value == "" {
			continue
		}
		day, err := time.ParseInLocation("2006-01-02", value, time.Local)
		if err == nil {
			return time.Date(day.Year(), day.Month(), day.Day(), 23, 59, 59, 0, time.Local)
		}
	}
	return now.Add(24 * time.Hour)
}

func workflowReconciliationDueAt(now time.Time) time.Time {
	return now.Add(48 * time.Hour)
}

func workflowShipmentFinancePaymentDueDate(payload map[string]any) string {
	for _, key := range []string{"payment_due_date", "receivable_due_date"} {
		if value := workflowPayloadString(payload, key); value != "" {
			return value
		}
	}
	return ""
}

func workflowShipmentFinanceInvoiceDueDate(payload map[string]any) string {
	for _, key := range []string{"invoice_due_date", "billing_due_date"} {
		if value := workflowPayloadString(payload, key); value != "" {
			return value
		}
	}
	return ""
}

func workflowShipmentFinanceShipmentDate(payload map[string]any) string {
	for _, key := range []string{"shipment_date", "ship_date", "delivery_date", "due_date"} {
		if value := workflowPayloadString(payload, key); value != "" {
			return value
		}
	}
	return ""
}

func workflowPayableDueDateString(payload map[string]any) string {
	for _, key := range []string{"payment_due_date", "payable_due_date", "due_date"} {
		if value := workflowPayloadString(payload, key); value != "" {
			return value
		}
	}
	return ""
}

func workflowInboundDateString(payload map[string]any) string {
	for _, key := range []string{"inbound_date", "return_date", "arrival_date", "document_date"} {
		if value := workflowPayloadString(payload, key); value != "" {
			return value
		}
	}
	return ""
}

func workflowOutsourcePayableRelatedDocuments(current *WorkflowTask) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 7)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		documents = append(documents, "加工合同："+sourceNo)
		if strings.TrimSpace(current.SourceType) == workflowInboundModuleKey {
			documents = append(documents, "入库记录："+sourceNo)
		}
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "来源单号："+sourceNo)
	}
	if qcResult := workflowPayloadString(current.Payload, "qc_result"); qcResult != "" {
		documents = append(documents, "检验结果："+qcResult)
	}
	if supplierName := workflowPayloadString(current.Payload, "supplier_name"); supplierName != "" {
		documents = append(documents, "供应商 / 加工厂："+supplierName)
	}
	if materialName := workflowPayloadString(current.Payload, "material_name"); materialName != "" {
		documents = append(documents, "物料："+materialName)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	return documents
}

func workflowShipmentFinanceRelatedDocuments(current *WorkflowTask, reason string) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 9)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		documents = append(documents, "出货记录："+sourceNo)
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "订单："+sourceNo)
	}
	if customerName := workflowPayloadString(current.Payload, "customer_name"); customerName != "" {
		documents = append(documents, "客户："+customerName)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if quantity := workflowPayloadString(current.Payload, "quantity"); quantity != "" {
		documents = append(documents, "数量："+quantity+workflowPayloadString(current.Payload, "unit"))
	}
	if amount := workflowPayloadString(current.Payload, "amount"); amount != "" {
		documents = append(documents, "金额："+amount)
	}
	if contractNo := workflowPayloadString(current.Payload, "contract_no"); contractNo != "" {
		documents = append(documents, "合同："+contractNo)
	}
	if reconciliationNo := workflowPayloadString(current.Payload, "reconciliation_no"); reconciliationNo != "" {
		documents = append(documents, "对账资料："+reconciliationNo)
	}
	if reason != "" {
		documents = append(documents, "异常原因："+reason)
	}
	return documents
}

func workflowPayableRelatedDocuments(current *WorkflowTask, payableType string, reason string) []string {
	if current == nil {
		return nil
	}
	documents := make([]string, 0, 10)
	if sourceNo := workflowSourceNoValue(current); sourceNo != "" {
		if payableType == "outsource" {
			documents = append(documents, "加工合同："+sourceNo)
		} else {
			documents = append(documents, "采购单："+sourceNo)
		}
		if strings.TrimSpace(current.SourceType) == workflowInboundModuleKey {
			documents = append(documents, "入库记录："+sourceNo)
		}
	}
	if sourceNo := workflowPayloadString(current.Payload, "source_no"); sourceNo != "" {
		documents = append(documents, "来源单号："+sourceNo)
	}
	if iqcResult := workflowPayloadString(current.Payload, "iqc_result"); iqcResult != "" {
		documents = append(documents, "IQC 结果："+iqcResult)
	}
	if qcResult := workflowPayloadString(current.Payload, "qc_result"); qcResult != "" {
		documents = append(documents, "检验结果："+qcResult)
	}
	if supplierName := workflowPayloadString(current.Payload, "supplier_name"); supplierName != "" {
		documents = append(documents, "供应商 / 加工厂："+supplierName)
	}
	if materialName := workflowPayloadString(current.Payload, "material_name"); materialName != "" {
		documents = append(documents, "物料："+materialName)
	}
	if productName := workflowPayloadString(current.Payload, "product_name"); productName != "" {
		documents = append(documents, "产品："+productName)
	}
	if quantity := workflowPayloadString(current.Payload, "quantity"); quantity != "" {
		documents = append(documents, "数量："+quantity+workflowPayloadString(current.Payload, "unit"))
	}
	if amount := workflowPayloadString(current.Payload, "amount"); amount != "" {
		documents = append(documents, "金额："+amount)
	}
	if reason != "" {
		documents = append(documents, "异常原因："+reason)
	}
	return documents
}

func workflowPayableType(current *WorkflowTask) string {
	if current == nil {
		return "purchase"
	}
	if strings.TrimSpace(current.TaskGroup) == workflowOutsourcePayableRegistrationGroup ||
		strings.TrimSpace(current.TaskGroup) == workflowOutsourceReconciliationGroup {
		return "outsource"
	}
	if value := workflowPayloadString(current.Payload, "payable_type"); value == "outsource" || value == "purchase" {
		return value
	}
	if strings.TrimSpace(current.SourceType) == workflowProcessingContractsModuleKey {
		return "outsource"
	}
	return "purchase"
}
