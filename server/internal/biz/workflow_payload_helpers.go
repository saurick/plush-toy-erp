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
