package data

import (
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"

	entsql "entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

type workflowIdentitySearchSource struct {
	kind                                                  string
	types                                                 []any
	table, sourceColumn, productColumn, materialColumn    string
	productName, productCode, materialName, materialCode  string
	headerTable, headerNo, subjectColumn, salesItemColumn string
	additional                                            []string
}

var workflowIdentitySearchSources = []workflowIdentitySearchSource{
	{kind: "sales_order", types: []any{"sales_order", "sales-orders", "project-orders"}, table: "sales_order_items", sourceColumn: "sales_order_id", productColumn: "product_id", productName: "product_name_snapshot", productCode: "product_code_snapshot", headerTable: "sales_orders", headerNo: "order_no"},
	{kind: "purchase_order", types: []any{"purchase_order", "purchase-order", "accessories-purchase"}, table: "purchase_order_items", sourceColumn: "purchase_order_id", materialColumn: "material_id", materialName: "material_name_snapshot", materialCode: "material_code_snapshot", additional: []string{"product_name_snapshot", "product_no_snapshot", "product_order_no_snapshot"}, headerTable: "purchase_orders", headerNo: "purchase_order_no"},
	{kind: "outsourcing_order", types: []any{"outsourcing_order", "outsourcing-order", "processing-contracts"}, table: "outsourcing_order_items", sourceColumn: "outsourcing_order_id", productColumn: "product_id", materialColumn: "material_id", productName: "product_name_snapshot", productCode: "product_no_snapshot", materialName: "material_name_snapshot", materialCode: "material_code_snapshot", additional: []string{"product_order_no_snapshot"}, headerTable: "outsourcing_orders", headerNo: "outsourcing_order_no"},
	{kind: "production_order", types: []any{"production_order", "production-order", "production-orders"}, table: "production_order_items", sourceColumn: "production_order_id", productColumn: "product_id", productName: "product_name_snapshot", productCode: "product_code_snapshot", salesItemColumn: "sales_order_item_id", headerTable: "production_orders", headerNo: "order_no"},
	{kind: "purchase_receipt", types: []any{"purchase_receipt", "purchase-receipt", "inbound"}, table: "purchase_receipt_items", sourceColumn: "receipt_id", materialColumn: "material_id", headerTable: "purchase_receipts", headerNo: "receipt_no"},
	{kind: "shipment", types: []any{"shipment", "shipments"}, table: "shipment_items", sourceColumn: "shipment_id", productColumn: "product_id", salesItemColumn: "sales_order_item_id", headerTable: "shipments", headerNo: "shipment_no"},
	{kind: "bom_header", types: []any{"bom_header", "material-bom"}, table: "bom_headers", sourceColumn: "id", productColumn: "product_id", additional: []string{"source_order_no"}},
	{kind: "quality_inspection", types: []any{"quality_inspection", "quality-inspection", "quality-inspections"}, table: "quality_inspections", sourceColumn: "id", productColumn: "subject_id", materialColumn: "subject_id", subjectColumn: "subject_type", additional: []string{"inspection_no"}},
	{kind: "production_fact", types: []any{"production_fact", "production-fact", "production-progress"}, table: "production_facts", sourceColumn: "id", productColumn: "subject_id", materialColumn: "subject_id", subjectColumn: "subject_type", additional: []string{"fact_no"}},
	{kind: "inventory_operation", types: []any{"inventory_operation"}, table: "inventory_operation_items", sourceColumn: "operation_id", productColumn: "subject_id", materialColumn: "subject_id", subjectColumn: "subject_type", headerTable: "inventory_operations", headerNo: "operation_no"},
	{kind: "production_exception_decision", types: []any{"production_exception_decision"}, table: "production_order_items", sourceColumn: "id", productColumn: "product_id", productName: "product_name_snapshot", productCode: "product_code_snapshot", salesItemColumn: "sales_order_item_id"},
}

func workflowIdentitySnapshotSearch(item *entsql.SelectTable, snapshot string, master string, keyword string) *entsql.Predicate {
	if snapshot == "" {
		return entsql.ContainsFold(master, keyword)
	}
	column := item.C(snapshot)
	return entsql.Or(entsql.ContainsFold(column, keyword), entsql.And(
		entsql.Or(entsql.IsNull(column), entsql.EQ(column, "")), entsql.ContainsFold(master, keyword),
	))
}

func workflowIdentitySourceBinding(selector *entsql.Selector, source workflowIdentitySearchSource) *entsql.Predicate {
	instance := entsql.Table("process_instances").As("identity_process")
	bound := entsql.Exists(entsql.Select(instance.C("id")).From(instance).Where(entsql.And(
		entsql.ColumnsEQ(instance.C("id"), selector.C(workflowtask.FieldProcessInstanceID)),
		entsql.ColumnsEQ(instance.C("business_ref_id"), selector.C(workflowtask.FieldSourceID)),
		entsql.In(instance.C("business_ref_type"), source.types...),
	)))
	var group, producer, sourceType string
	switch source.kind {
	case "production_order":
		group, producer, sourceType = biz.WorkflowSourceTaskProductionSchedulingGroup, biz.WorkflowSourceTaskProductionOrderReleaseProducer, biz.WorkflowSourceTaskProductionOrderSourceType
	case "production_fact":
		group, producer, sourceType = biz.WorkflowSourceTaskProductionExceptionGroup, biz.WorkflowSourceTaskProductionReworkPostProducer, biz.WorkflowSourceTaskProductionFactSourceType
	case "shipment":
		group, producer, sourceType = biz.WorkflowSourceTaskShipmentReleaseGroup, biz.WorkflowSourceTaskShipmentSubmitReleaseProducer, biz.WorkflowSourceTaskShipmentSourceType
	}
	if group != "" {
		// Match the existing source-producer contract, including the source ID in
		// its canonical task code. A supplied source_id alone is never a binding.
		code := entsql.P(func(b *entsql.Builder) {
			b.Ident(selector.C(workflowtask.FieldTaskCode)).WriteString(" = ").Arg(strings.TrimSuffix(biz.WorkflowSourceTaskCode(group, 0), "0"))
			b.WriteString(" || CAST(").Ident(selector.C(workflowtask.FieldSourceID)).WriteString(" AS TEXT)")
		})
		bound = entsql.Or(bound, entsql.And(
			entsql.IsNull(selector.C(workflowtask.FieldProcessInstanceID)),
			entsql.EQ(selector.C(workflowtask.FieldTaskGroup), group),
			entsql.EQ(selector.C(workflowtask.FieldSourceType), sourceType), code,
			sqljson.ValueEQ(selector.C(workflowtask.FieldPayload), biz.WorkflowSourceTaskContractV1, sqljson.Path("source_task_contract")),
			sqljson.ValueEQ(selector.C(workflowtask.FieldPayload), producer, sqljson.Path("source_task_producer")),
		))
	}
	return entsql.And(entsql.In(selector.C(workflowtask.FieldSourceType), source.types...), bound)
}

func workflowTaskHasIdentitySourceBinding() predicate.WorkflowTask {
	return func(selector *entsql.Selector) {
		bindings := make([]*entsql.Predicate, 0, len(workflowIdentitySearchSources))
		for _, source := range workflowIdentitySearchSources {
			bindings = append(bindings, workflowIdentitySourceBinding(selector, source))
		}
		selector.Where(entsql.Or(bindings...))
	}
}

// Search the same source identities as the read projection before count and
// pagination. The caller still applies task visibility and permission filters.
func workflowTaskSourceIdentityKeywordPredicate(keyword string) predicate.WorkflowTask {
	return func(selector *entsql.Selector) {
		matches := []*entsql.Predicate{}
		for _, source := range workflowIdentitySearchSources {
			item := entsql.Table(source.table).As("identity_item")
			query := entsql.Select(item.C(source.sourceColumn)).From(item)
			fields := []*entsql.Predicate{}
			for _, identity := range []struct{ kind, column, name, code, table string }{
				{"product", source.productColumn, source.productName, source.productCode, "products"},
				{"material", source.materialColumn, source.materialName, source.materialCode, "materials"},
			} {
				if identity.column == "" {
					continue
				}
				master := entsql.Table(identity.table).As("identity_" + identity.kind)
				join := entsql.ColumnsEQ(item.C(identity.column), master.C("id"))
				if source.subjectColumn != "" {
					join = entsql.And(join, entsql.EQ(item.C(source.subjectColumn), strings.ToUpper(identity.kind)))
					if source.kind == "quality_inspection" && identity.kind == "material" {
						join = entsql.Or(join, entsql.And(entsql.IsNull(item.C("subject_id")), entsql.ColumnsEQ(item.C("material_id"), master.C("id"))))
					}
				}
				if source.kind == "quality_inspection" && identity.kind == "product" {
					batch, orderItem := entsql.Table("production_wip_batches").As("identity_wip"), entsql.Table("production_order_items").As("identity_wip_item")
					query.LeftJoin(batch).OnP(entsql.And(entsql.EQ(item.C("subject_type"), "WIP"), entsql.ColumnsEQ(item.C("subject_id"), batch.C("id"))))
					query.LeftJoin(orderItem).On(batch.C("production_order_item_id"), orderItem.C("id"))
					join = entsql.Or(join, entsql.ColumnsEQ(orderItem.C("product_id"), master.C("id")))
				}
				query.LeftJoin(master).OnP(join)
				fields = append(fields, workflowIdentitySnapshotSearch(item, identity.name, master.C("name"), keyword), workflowIdentitySnapshotSearch(item, identity.code, master.C("code"), keyword))
				if identity.kind == "product" {
					fields = append(fields, entsql.ContainsFold(master.C("style_no"), keyword))
				} else {
					fields = append(fields, entsql.ContainsFold(master.C("supplier_item_no"), keyword))
				}
			}
			for _, field := range source.additional {
				fields = append(fields, entsql.ContainsFold(item.C(field), keyword))
			}
			if source.headerTable != "" {
				header := entsql.Table(source.headerTable).As("identity_header")
				query.Join(header).On(item.C(source.sourceColumn), header.C("id"))
				fields = append(fields, entsql.ContainsFold(header.C(source.headerNo), keyword))
			}
			if source.salesItemColumn != "" {
				orderItem, order := entsql.Table("sales_order_items").As("identity_order_item"), entsql.Table("sales_orders").As("identity_order")
				query.LeftJoin(orderItem).On(item.C(source.salesItemColumn), orderItem.C("id")).LeftJoin(order).On(orderItem.C("sales_order_id"), order.C("id"))
				fields = append(fields, entsql.ContainsFold(order.C("order_no"), keyword))
			}
			if source.kind == "production_exception_decision" {
				decision := entsql.Table("production_exception_decisions").As("identity_decision")
				query.Join(decision).On(item.C("id"), decision.C("production_order_item_id")).Select(decision.C("id"))
				fields = append(fields, entsql.ContainsFold(decision.C("decision_no"), keyword))
			}
			query.Where(entsql.Or(fields...))
			matches = append(matches, entsql.And(workflowIdentitySourceBinding(selector, source), entsql.In(selector.C(workflowtask.FieldSourceID), query)))
		}
		selector.Where(entsql.Or(matches...))
	}
}
