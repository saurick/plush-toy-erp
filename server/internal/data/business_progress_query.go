package data

import (
	"fmt"
	"strings"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent/workflowtask"
)

func progressTaskSQL(q biz.BusinessProgressQuery) (string, []any) {
	t := entsql.Dialect(dialect.Postgres).Table(workflowtask.Table)
	s := entsql.Dialect(dialect.Postgres).Select(t.C("*")).From(t)
	if q.Access.Tasks && q.TaskVisibility != nil {
		workflowTaskRevisionVisibilityPredicate(q.TaskVisibility, "")(s)
	} else {
		s.Where(entsql.False())
	}
	return s.Query()
}

// Production lines, rather than order headers, are the join key. One production
// order may contain products for different sales orders.
func progressCTE(q biz.BusinessProgressQuery) (string, []any) {
	visibleSQL, args := progressTaskSQL(q)
	boardID, workJoin := "pi.production_order_id", ""
	if q.View == "orders" {
		boardID = "si.sales_order_id"
		workJoin = "JOIN sales_order_items si ON si.id=pi.sales_order_item_id AND si.line_status<>'canceled'"
	}
	productionAllowed := "TRUE"
	if !q.Access.Production {
		productionAllowed = "FALSE"
	}
	wipAllowed := "TRUE"
	if !q.Access.WIP {
		wipAllowed = "FALSE"
	}
	return fmt.Sprintf(`WITH
visible_tasks AS (%s),
work_lines AS (
 SELECT pi.*, po.status AS production_status, %s AS board_id
 FROM production_order_items pi JOIN production_orders po ON po.id=pi.production_order_id
 %s WHERE po.status<>'CANCELLED' AND %s
),
issued AS (
 SELECT source_line_id, SUM(quantity) AS quantity FROM (
  SELECT source_line_id, quantity FROM production_facts
  WHERE source_type='PRODUCTION_ORDER' AND fact_type='MATERIAL_ISSUE' AND status='POSTED'
  UNION ALL
  SELECT a.production_order_material_requirement_id, f.quantity
  FROM outsourcing_facts f
  JOIN production_wip_outsourcing_allocations a ON a.outsourcing_order_item_id=f.source_line_id AND a.subject_type='MATERIAL'
  JOIN production_wip_batches b ON b.id=a.production_wip_batch_id AND b.flow_type='NORMAL'
  JOIN outsourcing_order_items oi ON oi.id=f.source_line_id AND oi.outsourcing_order_id=f.source_id
  WHERE f.source_type='OUTSOURCING_ORDER' AND f.fact_type='MATERIAL_ISSUE' AND f.status='POSTED'
 ) issues GROUP BY source_line_id
),
completion_rework AS (
 SELECT source_id,SUM(quantity) AS quantity FROM production_facts
 WHERE source_type='PRODUCTION_FACT' AND fact_type='REWORK' AND status='POSTED' GROUP BY source_id
),
completed AS (
 SELECT f.source_line_id,SUM(f.quantity-COALESCE(r.quantity,0)) AS quantity
 FROM production_facts f LEFT JOIN completion_rework r ON r.source_id=f.id
 WHERE f.source_type='PRODUCTION_ORDER' AND f.fact_type='FINISHED_GOODS_RECEIPT' AND f.status='POSTED' AND %s
 GROUP BY f.source_line_id
),
materials AS (
 SELECT w.board_id, COUNT(*) AS material_total,
 SUM(CASE WHEN COALESCE(i.quantity,0)<m.planned_quantity THEN 1 ELSE 0 END) AS material_pending
 FROM production_order_material_requirements m JOIN work_lines w ON w.id=m.production_order_item_id
 LEFT JOIN issued i ON i.source_line_id=m.id GROUP BY w.board_id
),
production AS (
 SELECT board_id, COUNT(DISTINCT production_order_id) AS production_orders,
 COUNT(DISTINCT CASE WHEN production_status='CLOSED' THEN production_order_id END) AS production_closed
 FROM work_lines GROUP BY board_id
),
batches AS (
 SELECT w.board_id,
 MIN(CASE WHEN b.status IN ('IN_PROGRESS','OUTSOURCED','WAITING_QUALITY') THEN o.process_name_snapshot END) AS current_operation,
 COUNT(DISTINCT CASE WHEN b.status IN ('IN_PROGRESS','OUTSOURCED','WAITING_QUALITY') THEN o.id END) AS operation_count,
 SUM(CASE WHEN b.status='IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_batches,
 SUM(CASE WHEN b.status='OUTSOURCED' THEN 1 ELSE 0 END) AS outsourced_batches,
 SUM(CASE WHEN b.status='WAITING_QUALITY' THEN 1 ELSE 0 END) AS waiting_batches,
 SUM(CASE WHEN b.status='REJECTED' THEN 1 ELSE 0 END) AS rejected_batches,
 SUM(CASE WHEN b.status='PLANNED' THEN 1 ELSE 0 END) AS planned_batches
 FROM production_wip_batches b JOIN work_lines w ON w.id=b.production_order_item_id
 JOIN production_order_operations o ON o.id=b.production_order_operation_id
 WHERE b.status NOT IN ('SPLIT','CANCELLED') AND %s GROUP BY w.board_id
),
shipped AS (
 SELECT si.sales_order_item_id, SUM(si.quantity) AS quantity
 FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id
 WHERE s.status='SHIPPED' GROUP BY si.sales_order_item_id
),
shipment_mismatch AS (
 SELECT s.sales_order_id AS order_id FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id
 LEFT JOIN sales_order_items l ON l.id=i.sales_order_item_id
 WHERE s.status='SHIPPED' AND (l.id IS NULL OR s.sales_order_id IS NULL OR l.sales_order_id<>s.sales_order_id)
 UNION
 SELECT l.sales_order_id FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id
 JOIN sales_order_items l ON l.id=i.sales_order_item_id
 WHERE s.status='SHIPPED' AND (s.sales_order_id IS NULL OR l.sales_order_id<>s.sales_order_id)
),
sales_lines AS (
 SELECT l.*, COALESCE(l.planned_delivery_date,s.planned_delivery_date) AS due_at,
 COALESCE(d.quantity,0) AS shipped_quantity,
 COALESCE(NULLIF(l.product_name_snapshot,''),NULLIF(l.requested_product_name,''),p.name,'未填写产品') AS product_label,
 u.name AS unit_name FROM sales_order_items l JOIN sales_orders s ON s.id=l.sales_order_id
 LEFT JOIN products p ON p.id=l.product_id JOIN units u ON u.id=l.unit_id
 LEFT JOIN shipped d ON d.sales_order_item_id=l.id WHERE l.line_status<>'canceled'
),
sales_summary AS (
 SELECT l.sales_order_id, COUNT(*) AS product_count, MIN(l.product_label) AS product,
 COALESCE((SELECT x.product_id FROM sales_lines x WHERE x.sales_order_id=l.sales_order_id
 ORDER BY x.product_label,x.id LIMIT 1),0) AS product_id,
 MIN(CASE WHEN line_status='open' AND shipped_quantity<ordered_quantity THEN due_at END) AS open_due,
 MIN(due_at) AS any_due, COUNT(DISTINCT unit_id) AS unit_count, MIN(unit_name) AS unit_name,
 SUM(ordered_quantity) AS ordered_quantity, SUM(shipped_quantity) AS shipped_quantity,
 SUM(CASE WHEN line_status='open' AND shipped_quantity<ordered_quantity THEN 1 ELSE 0 END) AS unfulfilled,
 SUM(CASE WHEN bom_id IS NOT NULL AND bom_fingerprint IS NOT NULL THEN 1 ELSE 0 END) AS engineering_ready
 FROM sales_lines l GROUP BY l.sales_order_id
),
%s,
task_rows AS (
 SELECT t.*, x.view_key,x.board_id,COALESCE(NULLIF(a.display_name,''),a.username,'') AS assignee_name,
 ROW_NUMBER() OVER (PARTITION BY x.view_key,x.board_id ORDER BY
 CASE WHEN t.task_status_key='blocked' THEN 0 WHEN t.task_status_key='ready' THEN 1 ELSE 2 END,
 CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,t.due_at,t.id) AS attention_rank
 FROM task_sources x JOIN visible_tasks t ON t.id=x.task_id LEFT JOIN admin_users a ON a.id=t.assignee_id
),
task_summary AS (
 SELECT view_key,board_id,
 SUM(CASE WHEN task_status_key IN ('ready','blocked') THEN 1 ELSE 0 END) AS open_tasks,
 SUM(CASE WHEN task_status_key='blocked' THEN 1 ELSE 0 END) AS blocked_tasks,
 SUM(CASE WHEN task_status_key IN ('ready','blocked') AND assignee_id IS NULL THEN 1 ELSE 0 END) AS unassigned_tasks
 FROM task_rows GROUP BY view_key,board_id
)`, visibleSQL, boardID, workJoin, productionAllowed, wipAllowed, wipAllowed, workflowTaskSourceLinksCTE), args
}

func progressBase(q biz.BusinessProgressQuery) string {
	if q.View == "orders" {
		return `SELECT s.id,s.order_no,s.lifecycle_status AS status,
 COALESCE(NULLIF(s.customer_snapshot->>'name',''),c.name,'') AS customer,
 COALESCE(a.product,'未填写产品') AS product,COALESCE(a.product_count,0) AS product_count,
 COALESCE(a.product_id,0) AS product_id,
 COALESCE(s.sales_owner,'') AS sales_owner,COALESCE(a.open_due,a.any_due,s.planned_delivery_date) AS due_at,s.updated_at,
 CASE WHEN s.lifecycle_status IN ('draft','submitted','active') AND
 (COALESCE(a.unfulfilled,0)>0 OR a.product_count IS NULL OR EXISTS(SELECT 1 FROM shipment_mismatch x WHERE x.order_id=s.id))
 THEN 1 ELSE 0 END AS active,0 AS unlinked,
 CASE WHEN a.unit_count=1 THEN a.unit_name ELSE '' END AS unit_name,
 CASE WHEN a.unit_count=1 THEN a.ordered_quantity END AS ordered_quantity,
 CASE WHEN a.unit_count=1 AND NOT EXISTS(SELECT 1 FROM shipment_mismatch x WHERE x.order_id=s.id) THEN a.shipped_quantity END AS shipped_quantity,
 CASE WHEN a.product_count>0 AND NOT EXISTS(SELECT 1 FROM shipment_mismatch x WHERE x.order_id=s.id) THEN 1 ELSE 0 END AS delivery_known,
 NULL AS completed_quantity,COALESCE(a.product_count,0) AS engineering_total,COALESCE(a.engineering_ready,0) AS engineering_ready
 FROM sales_orders s JOIN customers c ON c.id=s.customer_id LEFT JOIN sales_summary a ON a.sales_order_id=s.id`
	}
	customer, owner := "''", "''"
	completionAllowed := "TRUE"
	if !q.Access.WIP {
		completionAllowed = "FALSE"
	}
	if q.Access.Sales {
		customer = "(SELECT CASE WHEN COUNT(DISTINCT s.customer_id)>1 THEN '多客户 · 查看明细' ELSE MIN(COALESCE(NULLIF(s.customer_snapshot->>'name',''),c.name,'')) END FROM production_order_items i JOIN sales_order_items si ON si.id=i.sales_order_item_id JOIN sales_orders s ON s.id=si.sales_order_id JOIN customers c ON c.id=s.customer_id WHERE i.production_order_id=p.id)"
		owner = "(SELECT CASE WHEN COUNT(DISTINCT NULLIF(s.sales_owner,''))>1 THEN '多位业务负责人' ELSE MIN(NULLIF(s.sales_owner,'')) END FROM production_order_items i JOIN sales_order_items si ON si.id=i.sales_order_item_id JOIN sales_orders s ON s.id=si.sales_order_id WHERE i.production_order_id=p.id)"
	}
	return fmt.Sprintf(`SELECT p.id,p.order_no,p.status,COALESCE(%s,'') AS customer,
 COALESCE(MIN(COALESCE(NULLIF(i.product_name_snapshot,''),pr.name)),'未填写产品') AS product,
 COUNT(i.id) AS product_count,
 COALESCE((SELECT i2.product_id FROM production_order_items i2 LEFT JOIN products pr2 ON pr2.id=i2.product_id
 WHERE i2.production_order_id=p.id
 ORDER BY CASE WHEN COALESCE(NULLIF(i2.product_name_snapshot,''),pr2.name) IS NULL THEN 1 ELSE 0 END,
 COALESCE(NULLIF(i2.product_name_snapshot,''),pr2.name),i2.id LIMIT 1),0) AS product_id,
 COALESCE(%s,'') AS sales_owner,p.planned_end_at AS due_at,p.updated_at,
 CASE WHEN p.status IN ('DRAFT','RELEASED') THEN 1 ELSE 0 END AS active,
 CASE WHEN COUNT(i.sales_order_item_id)<COUNT(i.id) OR COUNT(i.id)=0 THEN 1 ELSE 0 END AS unlinked,
 CASE WHEN COUNT(DISTINCT i.unit_id)=1 THEN MIN(COALESCE(NULLIF(i.unit_name_snapshot,''),u.name)) ELSE '' END AS unit_name,
 CASE WHEN COUNT(DISTINCT i.unit_id)=1 THEN SUM(i.planned_quantity) END AS ordered_quantity,
 CASE WHEN %s AND COUNT(DISTINCT i.unit_id)=1 AND MIN(COALESCE(done.quantity,0))>=0 THEN SUM(COALESCE(done.quantity,0)) END AS completed_quantity,
 NULL AS shipped_quantity,0 AS delivery_known,0 AS engineering_total,0 AS engineering_ready
 FROM production_orders p LEFT JOIN production_order_items i ON i.production_order_id=p.id
 LEFT JOIN products pr ON pr.id=i.product_id LEFT JOIN units u ON u.id=i.unit_id
 LEFT JOIN completed done ON done.source_line_id=i.id
 GROUP BY p.id,p.order_no,p.status,p.planned_end_at,p.updated_at`, customer, owner, completionAllowed)
}

func progressQuery(q biz.BusinessProgressQuery, sqlDialect string) (string, []any) {
	cte, args := progressCTE(q)
	bind := func(v any) string { args = append(args, v); return fmt.Sprintf("$%d", len(args)) }
	local := q.SnapshotAt.In(time.FixedZone("Asia/Shanghai", 8*3600))
	dayArg, soonArg := bind(local.Format("2006-01-02")), bind(local.AddDate(0, 0, 6).Format("2006-01-02"))
	dueDate := progressDateSQL("b.due_at", sqlDialect)
	dateConditions := []string{"1=1"}
	if q.DateFrom != "" {
		dateConditions = append(dateConditions, dueDate+">="+bind(q.DateFrom))
	}
	if q.DateTo != "" {
		dateConditions = append(dateConditions, dueDate+"<="+bind(q.DateTo))
	}
	cte += ", base AS (" + progressBase(q) + `), joined AS (
 SELECT b.*,` + dueDate + ` AS due_date,
 CASE WHEN ` + strings.Join(dateConditions, " AND ") + ` THEN 1 ELSE 0 END AS in_date_range,
 CASE WHEN b.active=1 AND ` + dueDate + `<` + dayArg + ` THEN 1 ELSE 0 END AS overdue,
 CASE WHEN b.active=1 AND ` + dueDate + `>=` + dayArg + ` AND ` + dueDate + `<=` + soonArg + ` THEN 1 ELSE 0 END AS due_soon,
 CASE WHEN b.active=1 AND COALESCE(t.blocked_tasks,0)>0 THEN 1 ELSE 0 END AS blocked,
 COALESCE(p.production_orders,0) AS production_orders,COALESCE(p.production_closed,0) AS production_closed,
 COALESCE(m.material_total,0) AS material_total,COALESCE(m.material_pending,0) AS material_pending,
 COALESCE(w.current_operation,'') AS current_operation,COALESCE(w.operation_count,0) AS operation_count,
 COALESCE(w.in_progress_batches,0) AS in_progress_batches,COALESCE(w.outsourced_batches,0) AS outsourced_batches,
 COALESCE(w.waiting_batches,0) AS waiting_batches,COALESCE(w.rejected_batches,0) AS rejected_batches,COALESCE(w.planned_batches,0) AS planned_batches,
 COALESCE(t.open_tasks,0) AS open_tasks,COALESCE(t.blocked_tasks,0) AS blocked_tasks,COALESCE(t.unassigned_tasks,0) AS unassigned_tasks,
 CASE WHEN a.task_status_key IN ('ready','blocked') THEN a.id ELSE 0 END AS attention_task_id,
 CASE WHEN a.task_status_key IN ('ready','blocked') THEN a.task_name ELSE '' END AS attention_task,
 CASE WHEN a.task_status_key='blocked' THEN COALESCE(a.blocked_reason,'') ELSE '' END AS attention_reason,
 CASE WHEN a.task_status_key IN ('ready','blocked') THEN a.assignee_name ELSE '' END AS attention_owner,
 CASE WHEN a.task_status_key IN ('ready','blocked') THEN a.owner_role_key ELSE '' END AS attention_role
 FROM base b LEFT JOIN production p ON p.board_id=b.id LEFT JOIN materials m ON m.board_id=b.id
 LEFT JOIN batches w ON w.board_id=b.id LEFT JOIN task_summary t ON t.board_id=b.id AND t.view_key='` + q.View + `'
 LEFT JOIN task_rows a ON a.board_id=b.id AND a.view_key='` + q.View + `' AND a.attention_rank=1
), filtered AS (SELECT * FROM joined j WHERE 1=1`
	if q.ID > 0 {
		cte += " AND j.id=" + bind(q.ID)
	}
	if q.Scope == "active" {
		cte += " AND j.active=1"
	}
	if q.Scope == "ended" {
		cte += " AND j.active=0"
	}
	like := func(value string) string {
		return bind("%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.ToLower(value)) + "%")
	}
	ownerSearch := func(key string) string {
		linkedOwnerSearch := ""
		if q.View == "production" && q.Access.Sales {
			linkedOwnerSearch = " OR EXISTS(SELECT 1 FROM production_order_items i JOIN sales_order_items l ON l.id=i.sales_order_item_id JOIN sales_orders s ON s.id=l.sales_order_id WHERE i.production_order_id=j.id AND lower(s.sales_owner) LIKE " + key + " ESCAPE '\\')"
		}
		return "(lower(j.sales_owner) LIKE " + key + " ESCAPE '\\'" + linkedOwnerSearch + " OR EXISTS(SELECT 1 FROM task_rows tr WHERE tr.board_id=j.id AND tr.view_key='" + q.View + "' AND tr.task_status_key IN ('ready','blocked') AND (lower(tr.assignee_name) LIKE " + key + " ESCAPE '\\' OR lower(tr.owner_role_key) LIKE " + key + " ESCAPE '\\')))"
	}
	if q.Keyword != "" {
		key := like(q.Keyword)
		match := func(field string) string { return "lower(COALESCE(" + field + ",'')) LIKE " + key + " ESCAPE '\\'" }
		table, parent, _ := progressIdentitySource(q.View)
		sourceSearch := "SELECT 1 FROM " + table + " z LEFT JOIN products p ON p.id=z.product_id WHERE z." + parent + "=j.id AND " + progressIdentityMatch(q.View, key)
		if q.View == "orders" {
			sourceSearch += " AND z.line_status<>'canceled'"
		}
		linkedSalesSearch := ""
		if q.View == "production" && q.Access.Sales {
			linkedSalesSearch = " OR EXISTS(SELECT 1 FROM production_order_items i JOIN sales_order_items l ON l.id=i.sales_order_item_id JOIN sales_orders s ON s.id=l.sales_order_id JOIN customers c ON c.id=s.customer_id WHERE i.production_order_id=j.id AND (" + match("s.order_no") + " OR " + match("COALESCE(NULLIF(s.customer_snapshot->>'name',''),c.name)") + "))"
		}
		cte += " AND (lower(j.order_no) LIKE " + key + " ESCAPE '\\' OR lower(j.customer) LIKE " + key + " ESCAPE '\\' OR lower(j.product) LIKE " + key + " ESCAPE '\\' OR EXISTS(" + sourceSearch + ")" + linkedSalesSearch + " OR " + ownerSearch(key) + ")"
	}
	if q.Owner != "" {
		cte += " AND " + ownerSearch(like(q.Owner))
	}
	return cte + ")", args
}

// Each facet count is the result of selecting that option while retaining the
// other dimensions. Undated selection clears the date range in both clients.
func progressFilterCondition(q biz.BusinessProgressQuery) string {
	conditions := []string{"1=1"}
	if q.DueStatus != "undated" {
		conditions = append(conditions, "in_date_range=1")
	}
	switch q.DueStatus {
	case "overdue", "due_soon":
		conditions = append(conditions, q.DueStatus+"=1")
	case "undated":
		conditions = append(conditions, "due_at IS NULL")
	}
	if q.BlockedOnly {
		conditions = append(conditions, "blocked=1")
	}
	if q.UnlinkedOnly {
		conditions = append(conditions, "unlinked=1")
	}
	return strings.Join(conditions, " AND ")
}

func progressCountsSQL(q biz.BusinessProgressQuery) string {
	columns := []string{}
	for _, due := range []string{"all", "overdue", "due_soon", "undated", "blocked", "unlinked"} {
		candidate := q
		switch due {
		case "blocked":
			candidate.BlockedOnly = true
		case "unlinked":
			candidate.UnlinkedOnly = true
		default:
			candidate.DueStatus = due
		}
		columns = append(columns, "COALESCE(SUM(CASE WHEN "+progressFilterCondition(candidate)+" THEN 1 ELSE 0 END),0)")
	}
	return " SELECT " + strings.Join(columns, ",") + " FROM filtered"
}

// Dates entered by business users follow the deployment's China civil day;
// database session timezone must not change overdue classification.
func progressDateSQL(field, sqlDialect string) string {
	if sqlDialect == dialect.SQLite {
		return "DATE(" + field + ", '+8 hours')"
	}
	return "DATE(" + field + " AT TIME ZONE 'Asia/Shanghai')"
}
