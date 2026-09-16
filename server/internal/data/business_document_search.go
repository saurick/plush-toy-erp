package data

import (
	"fmt"
	"strings"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqljson"
)

type searchColumns func(string) string

// Business search follows stored document links before pagination. It never
// infers ownership from a shared supplier or from materials used by other BOMs.
type businessSearch struct {
	keyword string
	alias   int
}

func businessDocumentKeyword(kind, keyword string) func(*sql.Selector) {
	return func(s *sql.Selector) {
		b := &businessSearch{keyword: strings.TrimSpace(keyword)}
		c := searchColumns(s.C)
		var match *sql.Predicate
		switch kind {
		case "sales":
			match = b.sales(c, "")
		case "purchase":
			match = b.purchase(c, "")
		case "engineering":
			match = b.engineering(c)
		case "production":
			match = b.production(c, "")
		case "outsourcing":
			match = b.outsourcing(c, "")
		case "receipt":
			match = b.receipt(c, "")
		case "shipment":
			match = b.shipment(c, "")
		case "quality":
			match = b.quality(c)
		case "production_fact":
			match = b.productionFact(c)
		case "outsourcing_fact":
			match = b.outsourcingFact(c)
		case "finance":
			match = b.finance(c, true)
		case "payment":
			match = sql.Or(b.text(c, "payment_no", "account_ref", "evidence_ref"), b.counterparty(c), b.allocatedFinance(c, true))
		case "credit":
			match = sql.Or(b.text(c, "credit_note_no", "reason"), b.allocatedFinance(c, false))
		case "balance":
			match = sql.Or(b.subject(c), b.warehouse(c), b.lot(c("lot_id")))
		case "lot":
			match = sql.Or(b.subject(c), b.text(c, "lot_no", "supplier_lot_no", "color_no", "dye_lot_no", "production_lot_no"))
		case "inventory_txn":
			match = sql.Or(b.subject(c), b.warehouse(c), b.lot(c("lot_id")), b.sources(c, "PURCHASE_RECEIPT", "PURCHASE_RETURN", "PURCHASE_RECEIPT_ADJUSTMENT", "PRODUCTION_FACT", "OUTSOURCING_FACT", "SHIPMENT", "INVENTORY_OPERATION"))
		case "bom":
			match = sql.Or(b.text(c, "version", "source_order_no"), b.product(c, "product_id", "", ""))
		default:
			panic("unknown business search kind: " + kind)
		}
		s.Where(match)
	}
}

func (b *businessSearch) text(c searchColumns, fields ...string) *sql.Predicate {
	parts := make([]*sql.Predicate, 0, len(fields))
	for _, field := range fields {
		parts = append(parts, sql.ContainsFold(c(field), b.keyword))
	}
	return sql.Or(parts...)
}

func (b *businessSearch) related(table string, match func(searchColumns) *sql.Predicate) *sql.Predicate {
	b.alias++
	t := sql.Table(table).As(fmt.Sprintf("business_search_%d", b.alias))
	return sql.Exists(sql.Select(t.C("id")).From(t).Where(match(t.C)))
}

func (b *businessSearch) byID(table, id string, match func(searchColumns) *sql.Predicate) *sql.Predicate {
	return b.related(table, func(c searchColumns) *sql.Predicate {
		return sql.And(sql.ColumnsEQ(c("id"), id), match(c))
	})
}

func (b *businessSearch) items(table, foreignKey, parentID, lineID string, match func(searchColumns) *sql.Predicate) *sql.Predicate {
	return b.related(table, func(c searchColumns) *sql.Predicate {
		binding := sql.ColumnsEQ(c(foreignKey), parentID)
		if lineID != "" {
			binding = sql.And(binding, sql.Or(sql.IsNull(lineID), sql.ColumnsEQ(c("id"), lineID)))
		}
		return sql.And(binding, match(c))
	})
}

func (b *businessSearch) snapshot(column, master string) *sql.Predicate {
	if column == "" {
		return sql.ContainsFold(master, b.keyword)
	}
	return sql.Or(sql.ContainsFold(column, b.keyword), sql.And(sql.Or(sql.IsNull(column), sql.EQ(column, "")), sql.ContainsFold(master, b.keyword)))
}

func optionalSearchColumn(c searchColumns, name string) string {
	if name == "" {
		return ""
	}
	return c(name)
}

func (b *businessSearch) product(c searchColumns, id, name, code string) *sql.Predicate {
	// Frozen names/codes remain authoritative; style numbers live on the linked product.
	return b.related("products", func(p searchColumns) *sql.Predicate {
		return sql.And(sql.ColumnsEQ(p("id"), c(id)), sql.Or(
			b.snapshot(optionalSearchColumn(c, name), p("name")), b.snapshot(optionalSearchColumn(c, code), p("code")),
			b.text(p, "style_no", "customer_style_no")))
	})
}

func (b *businessSearch) material(c searchColumns, id, name, code string) *sql.Predicate {
	return b.related("materials", func(m searchColumns) *sql.Predicate {
		return sql.And(sql.ColumnsEQ(m("id"), c(id)), sql.Or(
			b.snapshot(optionalSearchColumn(c, name), m("name")), b.snapshot(optionalSearchColumn(c, code), m("code")), b.text(m, "supplier_item_no")))
	})
}

func (b *businessSearch) party(table, id string) *sql.Predicate {
	return b.byID(table, id, func(c searchColumns) *sql.Predicate { return b.text(c, "name", "code", "short_name") })
}

func (b *businessSearch) jsonText(column string, fields ...string) *sql.Predicate {
	parts := make([]*sql.Predicate, 0, len(fields))
	for _, field := range fields {
		field := field
		parts = append(parts, sql.P(func(builder *sql.Builder) {
			builder.WriteString("LOWER(").Join(sqljson.ValuePath(column, sqljson.Path(field), sqljson.Unquote(true))).WriteString(")")
			builder.Join(sql.Contains("", strings.ToLower(b.keyword)))
		}))
	}
	return sql.Or(parts...)
}

func (b *businessSearch) salesHeader(c searchColumns) *sql.Predicate {
	return sql.Or(b.text(c, "order_no", "customer_order_no", "sales_owner", "payment_method"),
		b.jsonText(c("customer_snapshot"), "name", "code", "short_name"), b.party("customers", c("customer_id")))
}

func (b *businessSearch) salesItem(c searchColumns) *sql.Predicate {
	return sql.Or(b.text(c, "requested_product_name", "customer_product_no", "product_name_snapshot", "product_code_snapshot"), b.product(c, "product_id", "product_name_snapshot", "product_code_snapshot"))
}

func (b *businessSearch) sales(c searchColumns, line string) *sql.Predicate {
	return sql.Or(b.salesHeader(c), b.items("sales_order_items", "sales_order_id", c("id"), line, b.salesItem))
}

func (b *businessSearch) salesLine(id string) *sql.Predicate {
	return b.byID("sales_order_items", id, func(i searchColumns) *sql.Predicate {
		return sql.Or(b.salesItem(i), b.byID("sales_orders", i("sales_order_id"), b.salesHeader))
	})
}

func (b *businessSearch) frozenProducts(request searchColumns, material, unit string) *sql.Predicate {
	// Match the exact material/unit contributing to this supplier's PO, rather
	// than every product in the same approved request. Both supported DB dialects
	// use the same JSON fields and literal (escaped) substring matching.
	b.alias++
	alias := fmt.Sprintf("business_source_%d", b.alias)
	productAlias := alias + "_product"
	product := sql.Table("products").As(productAlias)
	return sql.P(func(builder *sql.Builder) {
		builder.WriteString("EXISTS (SELECT 1 FROM ")
		if builder.Dialect() == dialect.Postgres {
			builder.WriteString("jsonb_array_elements(CAST(").Ident(request("source_snapshot")).WriteString(" AS jsonb)) AS ").Ident(alias).WriteString("(value)")
		} else {
			builder.WriteString("json_each(").Ident(request("source_snapshot")).WriteString(") AS ").Ident(alias)
		}
		value := sql.Table(alias).C("value")
		builder.WriteString(" LEFT JOIN ").Ident("products").WriteString(" AS ").Ident(productAlias).
			WriteString(" ON CAST(").Ident(product.C("id")).WriteString(" AS TEXT) = CAST(").
			Join(sqljson.ValuePath(value, sqljson.Path("product_id"), sqljson.Unquote(true))).WriteString(" AS TEXT) WHERE ")
		if material != "" {
			for idx, pair := range [][2]string{{"material_id", material}, {"unit_id", unit}} {
				if idx > 0 {
					builder.WriteString(" AND ")
				}
				builder.WriteString("CAST(").Join(sqljson.ValuePath(value, sqljson.Path(pair[0]), sqljson.Unquote(true))).WriteString(" AS TEXT) = CAST(").Ident(pair[1]).WriteString(" AS TEXT)")
			}
			builder.WriteString(" AND ")
		}
		builder.Wrap(func(inner *sql.Builder) {
			inner.Join(sql.Or(b.jsonText(value, "product_name", "product_code", "customer_product_no"), b.text(product.C, "style_no", "customer_style_no")))
		}).WriteString(")")
	})
}

func (b *businessSearch) engineering(c searchColumns) *sql.Predicate {
	return sql.Or(b.text(c, "order_no_snapshot"), b.frozenProducts(c, "", ""),
		b.byID("sales_orders", c("sales_order_id"), b.salesHeader),
		b.items("engineering_material_request_items", "request_id", c("id"), "", func(i searchColumns) *sql.Predicate {
			return sql.Or(b.text(i, "material_name", "material_code", "supplier_name"), b.material(i, "material_id", "material_name", "material_code"), b.party("suppliers", i("supplier_id")))
		}))
}

func (b *businessSearch) table(name string) *sql.SelectTable {
	b.alias++
	return sql.Table(name).As(fmt.Sprintf("business_search_%d", b.alias))
}

func (b *businessSearch) purchaseHeader(c searchColumns) *sql.Predicate {
	return sql.Or(b.text(c, "purchase_order_no", "supplier_purchase_order_no"), b.jsonText(c("supplier_snapshot"), "name", "code", "short_name"), b.party("suppliers", c("supplier_id")))
}

func (b *businessSearch) purchaseItem(i, request searchColumns) *sql.Predicate {
	return sql.Or(b.text(i, "material_name_snapshot", "material_code_snapshot", "product_name_snapshot", "product_no_snapshot", "product_order_no_snapshot"),
		b.material(i, "material_id", "material_name_snapshot", "material_code_snapshot"), b.text(request, "order_no_snapshot"),
		b.frozenProducts(request, i("material_id"), i("unit_id")), b.byID("sales_orders", request("sales_order_id"), b.salesHeader))
}

func searchLineBinding(id, line string) *sql.Predicate {
	if line == "" {
		return sql.NotNull(id)
	}
	return sql.Or(sql.IsNull(line), sql.ColumnsEQ(id, line))
}

func (b *businessSearch) purchase(c searchColumns, line string) *sql.Predicate {
	i, request := b.table("purchase_order_items"), b.table("engineering_material_requests")
	lines := sql.Select(i.C("id")).From(i).LeftJoin(request).On(c("engineering_material_request_id"), request.C("id")).
		Where(sql.And(sql.ColumnsEQ(i.C("purchase_order_id"), c("id")), searchLineBinding(i.C("id"), line), b.purchaseItem(i.C, request.C)))
	return sql.Or(b.purchaseHeader(c), sql.Exists(lines))
}

func (b *businessSearch) production(c searchColumns, line string) *sql.Predicate {
	return sql.Or(b.text(c, "order_no", "note"), b.items("production_order_items", "production_order_id", c("id"), line, b.productionItem))
}

func (b *businessSearch) productionItem(i searchColumns) *sql.Predicate {
	return sql.Or(b.text(i, "product_name_snapshot", "product_code_snapshot"), b.product(i, "product_id", "product_name_snapshot", "product_code_snapshot"), b.salesLine(i("sales_order_item_id")))
}

func (b *businessSearch) wip(id string) *sql.Predicate {
	w, i, p, si, so := b.table("production_wip_batches"), b.table("production_order_items"), b.table("production_orders"), b.table("sales_order_items"), b.table("sales_orders")
	q := sql.Select(w.C("id")).From(w).
		LeftJoin(i).On(w.C("production_order_item_id"), i.C("id")).
		LeftJoin(p).On(w.C("production_order_id"), p.C("id")).
		LeftJoin(si).On(i.C("sales_order_item_id"), si.C("id")).
		LeftJoin(so).On(si.C("sales_order_id"), so.C("id")).
		Where(sql.And(sql.ColumnsEQ(w.C("id"), id), sql.Or(b.text(w.C, "batch_no"), b.text(p.C, "order_no"), b.text(i.C, "product_name_snapshot", "product_code_snapshot"), b.product(i.C, "product_id", "product_name_snapshot", "product_code_snapshot"), b.salesItem(si.C), b.salesHeader(so.C))))
	return sql.Exists(q)
}

func (b *businessSearch) outsourcing(c searchColumns, line string) *sql.Predicate {
	return sql.Or(b.text(c, "outsourcing_order_no", "source_order_no"), b.jsonText(c("supplier_snapshot"), "name", "code", "short_name"), b.party("suppliers", c("supplier_id")), b.wip(c("source_wip_batch_id")),
		b.items("outsourcing_order_items", "outsourcing_order_id", c("id"), line, func(i searchColumns) *sql.Predicate {
			return sql.Or(b.text(i, "product_name_snapshot", "product_no_snapshot", "material_name_snapshot", "material_code_snapshot", "product_order_no_snapshot", "process_name_snapshot", "processing_item"), b.product(i, "product_id", "product_name_snapshot", "product_no_snapshot"), b.material(i, "material_id", "material_name_snapshot", "material_code_snapshot"))
		}))
}

func (b *businessSearch) receipt(c searchColumns, line string) *sql.Predicate {
	i, pi, po, request := b.table("purchase_receipt_items"), b.table("purchase_order_items"), b.table("purchase_orders"), b.table("engineering_material_requests")
	lines := sql.Select(i.C("id")).From(i).
		LeftJoin(pi).On(i.C("purchase_order_item_id"), pi.C("id")).
		LeftJoin(po).On(pi.C("purchase_order_id"), po.C("id")).
		LeftJoin(request).On(po.C("engineering_material_request_id"), request.C("id")).
		Where(sql.And(sql.ColumnsEQ(i.C("receipt_id"), c("id")), searchLineBinding(i.C("id"), line), sql.Or(b.material(i.C, "material_id", "", ""), b.text(i.C, "lot_no"), b.purchaseHeader(po.C), b.purchaseItem(pi.C, request.C))))
	return sql.Or(b.text(c, "receipt_no", "supplier_name"), b.party("suppliers", c("supplier_id")), sql.Exists(lines))
}

func (b *businessSearch) shipment(c searchColumns, line string) *sql.Predicate {
	return sql.Or(b.text(c, "shipment_no", "customer_snapshot", "transport_method", "carrier_name", "tracking_no", "shipping_mark"), b.party("customers", c("customer_id")), b.byID("sales_orders", c("sales_order_id"), b.salesHeader),
		b.items("shipment_items", "shipment_id", c("id"), line, func(i searchColumns) *sql.Predicate {
			return sql.Or(b.product(i, "product_id", "", ""), b.salesLine(i("sales_order_item_id")))
		}))
}

func (b *businessSearch) subject(c searchColumns) *sql.Predicate {
	return sql.Or(sql.And(sql.EQ(c("subject_type"), "PRODUCT"), b.product(c, "subject_id", "", "")), sql.And(sql.EQ(c("subject_type"), "MATERIAL"), b.material(c, "subject_id", "", "")), sql.And(sql.EQ(c("subject_type"), "WIP"), b.wip(c("subject_id"))))
}

func (b *businessSearch) warehouse(c searchColumns) *sql.Predicate {
	return b.byID("warehouses", c("warehouse_id"), func(w searchColumns) *sql.Predicate { return b.text(w, "code", "name") })
}

func (b *businessSearch) lot(id string) *sql.Predicate {
	return b.byID("inventory_lots", id, func(l searchColumns) *sql.Predicate {
		return b.text(l, "lot_no", "supplier_lot_no", "color_no", "dye_lot_no", "production_lot_no")
	})
}

func (b *businessSearch) quality(c searchColumns) *sql.Predicate {
	return sql.Or(b.subject(c), b.material(c, "material_id", "", ""), b.lot(c("inventory_lot_id")), b.wip(c("production_wip_batch_id")), b.byID("purchase_receipts", c("purchase_receipt_id"), func(h searchColumns) *sql.Predicate { return b.receipt(h, c("purchase_receipt_item_id")) }), b.sources(c, "OUTSOURCING_FACT", "PRODUCTION_WIP"), sql.And(sql.EQ(c("source_type"), "SHIPMENT"), b.byID("shipments", c("source_id"), func(h searchColumns) *sql.Predicate {
		return sql.Or(b.text(h, "shipment_no"), b.byID("sales_orders", h("sales_order_id"), b.salesHeader))
	})))
}

func (b *businessSearch) productionFact(c searchColumns) *sql.Predicate {
	return sql.Or(b.text(c, "fact_no", "note"), b.subject(c), b.warehouse(c), b.lot(c("lot_id")), b.wip(c("production_wip_batch_id")), b.productionFactSource(c),
		sql.And(sql.EQ(c("source_type"), "PRODUCTION_FACT"), b.byID("production_facts", c("source_id"), func(f searchColumns) *sql.Predicate { return b.text(f, "fact_no") })))
}

func (b *businessSearch) productionFactSource(c searchColumns) *sql.Predicate {
	order, item, requirement := b.table("production_orders"), b.table("production_order_items"), b.table("production_order_material_requirements")
	// A material issue points to a requirement; a completion points to an order item.
	q := sql.Select(item.C("id")).From(item).
		Join(order).On(item.C("production_order_id"), order.C("id")).
		LeftJoin(requirement).OnP(sql.And(sql.ColumnsEQ(requirement.C("production_order_item_id"), item.C("id")), sql.ColumnsEQ(requirement.C("id"), c("source_line_id")))).
		Where(sql.And(sql.ColumnsEQ(order.C("id"), c("source_id")), sql.Or(
			sql.And(sql.EQ(c("fact_type"), "MATERIAL_ISSUE"), sql.NotNull(requirement.C("id"))),
			sql.And(sql.NEQ(c("fact_type"), "MATERIAL_ISSUE"), sql.ColumnsEQ(item.C("id"), c("source_line_id")))),
			sql.Or(b.text(order.C, "order_no"), b.productionItem(item.C))))
	return sql.And(sql.EQ(c("source_type"), "PRODUCTION_ORDER"), sql.Exists(q))
}

func (b *businessSearch) outsourcingFact(c searchColumns) *sql.Predicate {
	return sql.Or(b.text(c, "fact_no", "supplier_name", "note"), b.subject(c), b.party("suppliers", c("supplier_id")), b.lot(c("lot_id")), b.sources(c, "OUTSOURCING_ORDER"))
}

func (b *businessSearch) counterparty(c searchColumns) *sql.Predicate {
	return sql.Or(sql.And(sql.EQ(c("counterparty_type"), "CUSTOMER"), b.party("customers", c("counterparty_id"))), sql.And(sql.EQ(c("counterparty_type"), "SUPPLIER"), b.party("suppliers", c("counterparty_id"))))
}

func (b *businessSearch) finance(c searchColumns, reversal bool) *sql.Predicate {
	match := sql.Or(b.text(c, "fact_no", "note"), b.counterparty(c), b.sources(c, "SHIPMENT", "PURCHASE_RECEIPT", "OUTSOURCING_FACT"))
	if reversal {
		match = sql.Or(match, sql.And(sql.EQ(c("source_type"), "FINANCE_FACT"), b.byID("finance_facts", c("source_id"), func(f searchColumns) *sql.Predicate { return b.finance(f, false) })))
	}
	return match
}

// Allocation and reversal links are joined at the same level so finance search
// remains bounded even when it follows a receipt back to its frozen products.
func (b *businessSearch) allocatedFinance(c searchColumns, payment bool) *sql.Predicate {
	f, original := b.table("finance_facts"), b.table("finance_facts")
	q := sql.Select(f.C("id")).From(f).
		LeftJoin(original).OnP(sql.And(sql.EQ(f.C("source_type"), "FINANCE_FACT"), sql.ColumnsEQ(f.C("source_id"), original.C("id"))))
	binding := sql.ColumnsEQ(f.C("id"), c("finance_fact_id"))
	if payment {
		allocation := b.table("finance_allocations")
		q.Join(allocation).On(allocation.C("finance_fact_id"), f.C("id"))
		binding = sql.ColumnsEQ(allocation.C("payment_id"), c("id"))
	}
	return sql.Exists(q.Where(sql.And(binding, sql.Or(b.finance(f.C, false), b.finance(original.C, false)))))
}

func (b *businessSearch) sources(c searchColumns, kinds ...string) *sql.Predicate {
	parts := make([]*sql.Predicate, 0, len(kinds))
	for _, kind := range kinds {
		var table string
		var match func(searchColumns) *sql.Predicate
		switch kind {
		case "OUTSOURCING_ORDER":
			table, match = "outsourcing_orders", func(h searchColumns) *sql.Predicate { return b.outsourcing(h, c("source_line_id")) }
		case "PURCHASE_RECEIPT":
			table, match = "purchase_receipts", func(h searchColumns) *sql.Predicate { return b.receipt(h, c("source_line_id")) }
		case "SHIPMENT":
			table, match = "shipments", func(h searchColumns) *sql.Predicate { return b.shipment(h, c("source_line_id")) }
		case "PRODUCTION_FACT":
			table, match = "production_facts", b.productionFact
		case "OUTSOURCING_FACT":
			table, match = "outsourcing_facts", b.outsourcingFact
		case "PRODUCTION_WIP":
			parts = append(parts, sql.And(sql.EQ(c("source_type"), kind), b.wip(c("source_id"))))
			continue
		case "INVENTORY_OPERATION":
			table, match = "inventory_operations", func(h searchColumns) *sql.Predicate { return b.text(h, "operation_no") }
		case "PURCHASE_RETURN":
			table, match = "purchase_returns", func(h searchColumns) *sql.Predicate { return b.text(h, "return_no", "supplier_name") }
		case "PURCHASE_RECEIPT_ADJUSTMENT":
			table, match = "purchase_receipt_adjustments", func(h searchColumns) *sql.Predicate { return b.text(h, "adjustment_no") }
		}
		parts = append(parts, sql.And(sql.EQ(c("source_type"), kind), b.byID(table, c("source_id"), match)))
	}
	return sql.Or(parts...)
}
