package data

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	entsql "entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/workflowtask"
)

func workflowTaskBatchIDSQL(sourceType, sourceID string) string {
	return fmt.Sprintf(`CASE
 WHEN %[1]s='production_wip_batch' THEN %[2]s
 WHEN %[1]s='quality_inspection' THEN (SELECT COALESCE(q.production_wip_batch_id,o.source_wip_batch_id) FROM quality_inspections q LEFT JOIN outsourcing_facts f ON q.source_type='OUTSOURCING_FACT' AND f.id=q.source_id LEFT JOIN outsourcing_orders o ON f.source_type='OUTSOURCING_ORDER' AND o.id=f.source_id WHERE q.id=%[2]s)
 WHEN %[1]s IN ('production_fact','production-progress') THEN (SELECT production_wip_batch_id FROM production_facts WHERE id=%[2]s)
 WHEN %[1]s='production_exception_decision' THEN (SELECT production_wip_batch_id FROM production_exception_decisions WHERE id=%[2]s)
 WHEN %[1]s='outsourcing_order' THEN (SELECT source_wip_batch_id FROM outsourcing_orders WHERE id=%[2]s)
 WHEN %[1]s='outsourcing_fact' THEN (SELECT o.source_wip_batch_id FROM outsourcing_facts f JOIN outsourcing_orders o ON f.source_type='OUTSOURCING_ORDER' AND o.id=f.source_id WHERE f.id=%[2]s)
 END`, sourceType, sourceID)
}

func workflowTaskStageSQL(column func(string) string) string {
	source, sourceID := column("source_type"), column("source_id")
	operation := `(SELECT op.operation_code FROM production_wip_batches wb JOIN production_order_operations op ON op.id=wb.production_order_operation_id WHERE wb.id=(` + workflowTaskBatchIDSQL(source, sourceID) + `))`
	gate := `(SELECT gate_code FROM quality_inspections WHERE id=` + sourceID + `)`
	var out strings.Builder
	out.WriteString("CASE ")
	for _, stage := range biz.WorkflowTaskStages() {
		clauses := []string{}
		for _, part := range []struct {
			expression string
			values     []string
		}{{"_wd.source_type", stage.Sources}, {"_wd.task_group", stage.Groups}, {"_wd.operation_code", stage.Operations}, {"_wd.gate_code", stage.Gates}} {
			if len(part.values) == 0 {
				continue
			}
			values := make([]string, 0, len(part.values))
			for _, value := range part.values {
				values = append(values, "'"+strings.ReplaceAll(value, "'", "''")+"'")
			}
			clauses = append(clauses, part.expression+" IN ("+strings.Join(values, ",")+")")
		}
		if len(clauses) > 0 {
			out.WriteString("WHEN " + strings.Join(clauses, " AND ") + " THEN '" + stage.Key + "' ")
		}
	}
	out.WriteString("ELSE 'unclassified' END")
	// LIMIT keeps the correlated source lookup as one projection instead of
	// repeating the operation and quality subqueries for every CASE branch.
	return "(SELECT " + out.String() + " FROM (SELECT " + source + " AS source_type," + column("task_group") + " AS task_group," + operation + " AS operation_code," + gate + " AS gate_code LIMIT 1 OFFSET 0) AS _wd)"
}

// Bind with the selector dialect so PostgreSQL receives numbered placeholders.
func workflowTaskStageIn(s *entsql.Selector, keys []any) *entsql.Predicate {
	return entsql.P(func(b *entsql.Builder) {
		b.WriteString("(" + workflowTaskStageSQL(s.C) + ") IN (").Args(keys...).WriteString(")")
	})
}

func workflowTaskDiscoveryPredicate(filter biz.WorkflowTaskDiscoveryFilter) predicate.WorkflowTask {
	return func(s *entsql.Selector) {
		if filter.Assignee == "unassigned" {
			s.Where(entsql.IsNull(s.C(workflowtask.FieldAssigneeID)))
		} else if filter.Assignee != "" {
			id, _ := strconv.Atoi(filter.Assignee)
			s.Where(entsql.EQ(s.C(workflowtask.FieldAssigneeID), id))
		}
		if filter.StageKey == "" && filter.ModuleKey == "" && filter.ChainKey == "" {
			return
		}
		keys := []any{}
		for _, stage := range biz.WorkflowTaskStages() {
			if (filter.StageKey == "" || stage.Key == filter.StageKey) && (filter.ModuleKey == "" || stage.Module == filter.ModuleKey) && (filter.ChainKey == "" || stage.Chain == filter.ChainKey) {
				keys = append(keys, stage.Key)
			}
		}
		if len(keys) == 0 {
			s.Where(entsql.EQ(s.C(workflowtask.FieldID), 0))
			return
		}
		s.Where(workflowTaskStageIn(s, keys))
	}
}

func hydrateWorkflowTaskDiscovery(ctx context.Context, client *ent.Client, tasks []*biz.WorkflowTask) error {
	ids := []int{}
	for _, task := range tasks {
		if task != nil && task.ID > 0 {
			ids = append(ids, task.ID)
			task.Discovery = nil
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var rows []struct {
		ID           int    `json:"id"`
		StageKey     string `json:"stage_key"`
		AssigneeName string `json:"assignee_name"`
	}
	err := client.WorkflowTask.Query().Where(workflowtask.IDIn(ids...)).Select(workflowtask.FieldID).Aggregate(
		func(s *entsql.Selector) string { return workflowTaskStageSQL(s.C) + " AS stage_key" },
		func(s *entsql.Selector) string {
			return "COALESCE((SELECT COALESCE(NULLIF(display_name,''),username) FROM admin_users WHERE id=" + s.C(workflowtask.FieldAssigneeID) + "),'') AS assignee_name"
		},
	).Scan(ctx, &rows)
	if err != nil {
		return err
	}
	byID := map[int]*biz.WorkflowTaskDiscovery{}
	for _, row := range rows {
		byID[row.ID] = biz.WorkflowTaskDiscoveryFor(row.StageKey, row.AssigneeName)
	}
	for _, task := range tasks {
		if task != nil {
			task.Discovery = byID[task.ID]
		}
	}
	return nil
}

func workflowTaskDiscoveryKeywordPredicate(keyword string) predicate.WorkflowTask {
	return func(s *entsql.Selector) {
		keys := []any{}
		for _, stage := range biz.WorkflowTaskStages() {
			discovery := biz.WorkflowTaskDiscoveryFor(stage.Key, "")
			if strings.Contains(strings.ToLower(strings.ReplaceAll(discovery.Path, " / ", "")+strings.Join(stage.Keywords, " ")), strings.ToLower(strings.ReplaceAll(keyword, " ", ""))) {
				keys = append(keys, stage.Key)
			}
		}
		pattern := "%" + strings.ToLower(keyword) + "%"
		person := entsql.P(func(b *entsql.Builder) {
			b.WriteString("EXISTS(SELECT 1 FROM admin_users WHERE id=" + s.C(workflowtask.FieldAssigneeID) + " AND (LOWER(COALESCE(display_name,'')) LIKE ").Arg(pattern).
				WriteString(" OR LOWER(username) LIKE ").Arg(pattern).WriteString("))")
		})
		if len(keys) == 0 {
			s.Where(person)
			return
		}
		s.Where(entsql.Or(person, workflowTaskStageIn(s, keys)))
	}
}

func workflowTaskVisiblePeople(ctx context.Context, query *ent.WorkflowTaskQuery) ([]biz.WorkflowTaskPerson, error) {
	var rows []struct {
		AssigneeID int    `json:"assignee_id"`
		Name       string `json:"name"`
	}
	err := query.Where(workflowtask.AssigneeIDNotNil()).Unique(true).Select(workflowtask.FieldAssigneeID).Aggregate(func(s *entsql.Selector) string {
		return "COALESCE((SELECT COALESCE(NULLIF(display_name,''),username) FROM admin_users WHERE id=" + s.C(workflowtask.FieldAssigneeID) + "),'已指定办理人') AS name"
	}).Scan(ctx, &rows)
	people := make([]biz.WorkflowTaskPerson, 0, len(rows))
	for _, row := range rows {
		people = append(people, biz.WorkflowTaskPerson{ID: row.AssigneeID, Name: row.Name})
	}
	return people, err
}
