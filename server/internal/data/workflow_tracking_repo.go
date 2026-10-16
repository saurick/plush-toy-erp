package data

import (
	"context"
	stdsql "database/sql"
	"sort"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/processnodeinstance"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
)

// A snapshot keeps a handoff, its nodes, and its people consistent during reads.
func (r *workflowRepo) readTracking(ctx context.Context, read func(*ent.Client) error) error {
	if r.data.sqldb != nil {
		d := r.data.sqlDialect
		if d == "" {
			d = dialect.Postgres
		}
		options := &stdsql.TxOptions{}
		if d == dialect.Postgres {
			options.Isolation, options.ReadOnly = stdsql.LevelRepeatableRead, true
		}
		tx, err := r.data.sqldb.BeginTx(ctx, options)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		client := newBusinessEntClient(ent.Driver(entsql.NewDriver(d, entsql.Conn{ExecQuerier: tx})))
		if err := read(client); err != nil {
			return err
		}
		return tx.Commit()
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := read(tx.Client()); err != nil {
		return err
	}
	return tx.Commit()
}

func trackingTaskParticipation(actorID int) predicate.WorkflowTask {
	return workflowtask.HasEventsWith(workflowtaskevent.ActorID(actorID), workflowtaskevent.EventTypeNotIn("created", "payload_refreshed"))
}

func trackingProcesses(client *ent.Client, q biz.WorkflowTrackingQuery) *ent.ProcessInstanceQuery {
	return client.ProcessInstance.Query().Where(trackingProcessPredicates(q)...)
}

func trackingProcessPredicates(q biz.WorkflowTrackingQuery) []predicate.ProcessInstance {
	started := processinstance.CreatedBy(q.ActorID)
	participated := processinstance.Or(
		processinstance.HasWorkflowTasksWith(trackingTaskParticipation(q.ActorID)),
		processinstance.HasNodesWith(processnodeinstance.Or(
			processnodeinstance.RoutingCompletedBy(q.ActorID),
			processnodeinstance.DomainCommandResultRecordedBy(q.ActorID),
			processnodeinstance.ResumedBy(q.ActorID),
		)),
	)
	visible := workflowTaskRevisionVisibilityPredicate(q.VisibilityScope, "")
	if visible == nil {
		visible = workflowtask.ID(0)
	}
	p := processinstance.Or(started, participated, processinstance.HasWorkflowTasksWith(visible))
	// Supervision also covers exempt processes which never produced a task,
	// but remains bound to the revisions authorized by the existing read scope.
	for _, revision := range q.VisibilityScope.RevisionRoleScopes {
		if revision.AllowAllOwnerRoles {
			p = processinstance.Or(p, processinstance.ConfigRevision(revision.ConfigRevision))
		}
	}
	if q.Scope == "started" {
		p = started
	}
	if q.Scope == "participated" {
		p = participated
	}
	filters := []predicate.ProcessInstance{p}
	if q.SourceType != "" {
		filters = append(filters, processinstance.BusinessRefTypeIn(trackingSourceTypes(q)...))
	}
	if q.SourceID > 0 {
		filters = append(filters, processinstance.BusinessRefID(q.SourceID))
	}
	if q.Keyword != "" {
		filters = append(filters, processinstance.Or(processinstance.BusinessRefNoContainsFold(q.Keyword), workflowProcessSourceIdentityKeywordPredicate(q.Keyword), processinstance.HasWorkflowTasksWith(workflowtask.TaskNameContainsFold(q.Keyword))))
	}
	switch q.Status {
	case "active":
		filters = append(filters, processinstance.StatusIn(biz.ProcessStatusActive, biz.ProcessStatusBlocked))
	case "completed":
		filters = append(filters, processinstance.StatusEQ(biz.ProcessStatusCompleted))
	}
	if q.OwnerRoleKey != "" || q.Attention != "" {
		current := processinstance.HasWorkflowTasksWith(workflowtask.And(trackingCurrentTaskFilter(q)...), workflowtask.HasProcessNodeInstanceWith(processnodeinstance.StatusIn(biz.ProcessNodeStatusActive, biz.ProcessNodeStatusBlocked)))
		if q.Attention == "blocked" && q.OwnerRoleKey == "" {
			current = processinstance.Or(current, processinstance.StatusEQ(biz.ProcessStatusBlocked))
		}
		filters = append(filters, processinstance.StatusNEQ(biz.ProcessStatusCompleted), current)
	}
	if q.DateFrom != nil {
		filters = append(filters, processinstance.StartedAtGTE(*q.DateFrom))
	}
	if q.DateTo != nil {
		filters = append(filters, processinstance.StartedAtLTE(endOfDateFilter(*q.DateTo)))
	}
	return filters
}

func trackingStandaloneTasks(client *ent.Client, q biz.WorkflowTrackingQuery) *ent.WorkflowTaskQuery {
	return client.WorkflowTask.Query().Where(trackingStandaloneTaskPredicates(q)...)
}

func trackingStandaloneTaskPredicates(q biz.WorkflowTrackingQuery) []predicate.WorkflowTask {
	started, participated := workflowtask.CreatedBy(q.ActorID), trackingTaskParticipation(q.ActorID)
	visible := workflowTaskRevisionVisibilityPredicate(q.VisibilityScope, "")
	if visible == nil {
		visible = workflowtask.ID(0)
	}
	p := workflowtask.Or(started, participated, visible)
	if q.Scope == "started" {
		p = started
	}
	if q.Scope == "participated" {
		p = participated
	}
	filters := []predicate.WorkflowTask{p, workflowtask.ConfigRevisionIsNil(), workflowtask.ProcessInstanceIDIsNil(), workflowtask.ProcessNodeInstanceIDIsNil()}
	if q.SourceType != "" {
		filters = append(filters, workflowtask.SourceTypeIn(trackingSourceTypes(q)...))
	}
	if q.SourceID > 0 {
		filters = append(filters, workflowtask.SourceID(q.SourceID))
	}
	if q.Keyword != "" {
		filters = append(filters, workflowTaskKeywordPredicate(q.Keyword))
	}
	switch q.Status {
	case "active":
		filters = append(filters, workflowtask.TaskStatusKeyIn("ready", "blocked"))
	case "completed":
		filters = append(filters, workflowtask.TaskStatusKeyIn("done", "rejected", "withdrawn"))
	}
	if q.OwnerRoleKey != "" || q.Attention != "" {
		filters = append(filters, trackingCurrentTaskFilter(q)...)
	}
	if q.DateFrom != nil {
		filters = append(filters, workflowtask.CreatedAtGTE(*q.DateFrom))
	}
	if q.DateTo != nil {
		filters = append(filters, workflowtask.CreatedAtLTE(endOfDateFilter(*q.DateTo)))
	}
	return filters
}

func trackingSourceTypes(q biz.WorkflowTrackingQuery) []string {
	// Type filters share the source identities used for display and search.
	// A specific document link retains its exact type and ID binding.
	if q.SourceID == 0 {
		for _, source := range workflowIdentitySearchSources {
			if source.kind == q.SourceType {
				values := make([]string, 0, len(source.types))
				for _, value := range source.types {
					values = append(values, value.(string))
				}
				return values
			}
		}
	}
	return []string{q.SourceType}
}

func trackingCurrentTaskFilter(q biz.WorkflowTrackingQuery) []predicate.WorkflowTask {
	filters := []predicate.WorkflowTask{workflowtask.TaskStatusKeyIn("ready", "blocked")}
	if q.OwnerRoleKey != "" {
		filters = append(filters, workflowtask.OwnerRoleKey(q.OwnerRoleKey))
	}
	switch q.Attention {
	case "blocked":
		filters = append(filters, workflowtask.TaskStatusKeyEQ("blocked"))
	case "overdue":
		filters = append(filters, workflowtask.DueAtLT(q.SnapshotAt))
	}
	return filters
}

// Page both record kinds together before hydrating entities and their relations.
// The same predicates own list, count, detail access and the page subqueries.
func trackingPageIDs(d string, q biz.WorkflowTrackingQuery, kind string) *entsql.Selector {
	builder := entsql.Dialect(d)
	p, t := builder.Table(processinstance.Table), builder.Table(workflowtask.Table)
	processes := builder.Select(p.C(processinstance.FieldID), p.C(processinstance.FieldStartedAt)).
		AppendSelectExprAs(entsql.Expr("'process'"), "kind").From(p)
	for _, filter := range trackingProcessPredicates(q) {
		filter(processes)
	}
	tasks := builder.Select(t.C(workflowtask.FieldID), entsql.As(t.C(workflowtask.FieldCreatedAt), "started_at")).
		AppendSelectExprAs(entsql.Expr("'task'"), "kind").From(t)
	for _, filter := range trackingStandaloneTaskPredicates(q) {
		filter(tasks)
	}
	merged := processes.UnionAll(tasks).As("tracking")
	page := builder.Select("id", "kind").From(merged).
		OrderBy(entsql.Desc("started_at"), entsql.Desc("kind"), entsql.Desc("id")).
		Limit(q.Limit).Offset(q.Offset).As("tracking_page")
	return builder.Select(page.C("id")).From(page).Where(entsql.EQ(page.C("kind"), kind))
}

func (r *workflowRepo) ListWorkflowTracking(ctx context.Context, q biz.WorkflowTrackingQuery) (*biz.WorkflowTrackingPage, error) {
	page := &biz.WorkflowTrackingPage{Items: []*biz.WorkflowTrackingEntry{}}
	err := r.readTracking(ctx, func(client *ent.Client) error {
		processes, tasks := trackingProcesses(client, q), trackingStandaloneTasks(client, q)
		processCount, err := processes.Clone().Count(ctx)
		if err != nil {
			return err
		}
		taskCount, err := tasks.Clone().Count(ctx)
		if err != nil {
			return err
		}
		page.Total = processCount + taskCount
		if q.Offset >= page.Total {
			return nil
		}
		processes.Where(func(s *entsql.Selector) {
			s.Where(entsql.In(s.C(processinstance.FieldID), trackingPageIDs(s.Dialect(), q, "process")))
		})
		tasks.Where(func(s *entsql.Selector) {
			s.Where(entsql.In(s.C(workflowtask.FieldID), trackingPageIDs(s.Dialect(), q, "task")))
		})
		ps, err := processes.All(ctx)
		if err != nil {
			return err
		}
		ts, err := tasks.All(ctx)
		if err != nil {
			return err
		}
		for _, p := range ps {
			page.Items = append(page.Items, &biz.WorkflowTrackingEntry{Ref: biz.WorkflowTrackingRef{Kind: "process", ID: p.ID}, Instance: entProcessInstanceToBiz(p)})
		}
		for _, t := range ts {
			page.Items = append(page.Items, &biz.WorkflowTrackingEntry{Ref: biz.WorkflowTrackingRef{Kind: "task", ID: t.ID}, Task: entWorkflowTaskToBiz(t)})
		}
		sort.Slice(page.Items, func(i, j int) bool {
			a, b := page.Items[i], page.Items[j]
			if !a.StartedAt().Equal(b.StartedAt()) {
				return a.StartedAt().After(b.StartedAt())
			}
			if a.Ref.Kind != b.Ref.Kind {
				return a.Ref.Kind > b.Ref.Kind
			}
			return a.Ref.ID > b.Ref.ID
		})
		return loadTrackingRelations(ctx, client, page.Items)
	})
	return page, err
}

func (r *workflowRepo) GetWorkflowTracking(ctx context.Context, q biz.WorkflowTrackingQuery, ref biz.WorkflowTrackingRef, beforeEventID int) (*biz.WorkflowTrackingEntry, error) {
	entry := &biz.WorkflowTrackingEntry{Ref: ref}
	err := r.readTracking(ctx, func(client *ent.Client) error {
		if ref.Kind == "process" {
			row, err := trackingProcesses(client, q).Where(processinstance.ID(ref.ID)).Only(ctx)
			if ent.IsNotFound(err) {
				return biz.ErrForbidden
			}
			if err != nil {
				return err
			}
			entry.Instance = entProcessInstanceToBiz(row)
		} else {
			row, err := trackingStandaloneTasks(client, q).Where(workflowtask.ID(ref.ID)).Only(ctx)
			if ent.IsNotFound(err) {
				return biz.ErrForbidden
			}
			if err != nil {
				return err
			}
			entry.Task = entWorkflowTaskToBiz(row)
		}
		if err := loadTrackingRelations(ctx, client, []*biz.WorkflowTrackingEntry{entry}); err != nil {
			return err
		}
		ids := []int{}
		for _, t := range entry.Tasks {
			ids = append(ids, t.ID)
		}
		if len(ids) == 0 {
			return nil
		}
		query := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskIDIn(ids...))
		if beforeEventID > 0 {
			query.Where(workflowtaskevent.IDLT(beforeEventID))
		}
		events, err := query.Order(ent.Desc(workflowtaskevent.FieldID)).Limit(biz.WorkflowTaskEventPageMaxLimit + 1).All(ctx)
		if err != nil {
			return err
		}
		entry.EventsTruncated = len(events) > biz.WorkflowTaskEventPageMaxLimit
		if entry.EventsTruncated {
			events = events[:biz.WorkflowTaskEventPageMaxLimit]
		}
		for _, event := range events {
			// Receipt payloads can contain full task snapshots. The tracking view
			// receives only the actual action, actor, timestamp, and reason.
			entry.Events = append(entry.Events, &biz.WorkflowTaskEvent{ID: event.ID, TaskID: event.TaskID, TaskVersion: event.TaskVersion, EventType: event.EventType, FromStatusKey: event.FromStatusKey, ToStatusKey: event.ToStatusKey, ActorRoleKey: event.ActorRoleKey, ActorID: event.ActorID, Reason: event.Reason, CreatedAt: event.CreatedAt})
		}
		return loadTrackingPeople(ctx, client, []*biz.WorkflowTrackingEntry{entry})
	})
	return entry, err
}

func loadTrackingRelations(ctx context.Context, client *ent.Client, entries []*biz.WorkflowTrackingEntry) error {
	byProcess := map[int]*biz.WorkflowTrackingEntry{}
	ids := []int{}
	for _, e := range entries {
		if e.Instance != nil {
			byProcess[e.Instance.ID] = e
			ids = append(ids, e.Instance.ID)
		} else {
			e.Tasks = []*biz.WorkflowTask{e.Task}
		}
	}
	if len(ids) > 0 {
		nodes, err := client.ProcessNodeInstance.Query().Where(processnodeinstance.ProcessInstanceIDIn(ids...)).Order(ent.Asc(processnodeinstance.FieldID)).All(ctx)
		if err != nil {
			return err
		}
		nodeMap := map[int]*ent.ProcessNodeInstance{}
		for _, n := range nodes {
			nodeMap[n.ID] = n
			e := byProcess[n.ProcessInstanceID]
			e.Nodes = append(e.Nodes, entProcessNodeInstanceToBiz(n))
		}
		tasks, err := client.WorkflowTask.Query().Where(workflowtask.ProcessInstanceIDIn(ids...)).Order(ent.Asc(workflowtask.FieldID)).All(ctx)
		if err != nil {
			return err
		}
		for _, t := range tasks {
			e := byProcess[*t.ProcessInstanceID]
			if t.ProcessNodeInstanceID == nil || t.ConfigRevision == nil {
				return biz.ErrBadParam
			}
			n := nodeMap[*t.ProcessNodeInstanceID]
			if n == nil || n.ProcessInstanceID != e.Instance.ID || *t.ConfigRevision != e.Instance.ConfigRevision || t.SourceType != e.Instance.BusinessRefType || t.SourceID != e.Instance.BusinessRefID {
				return biz.ErrBadParam
			}
			e.Tasks = append(e.Tasks, entWorkflowTaskToBiz(t))
		}
	}
	// Resolve one source binding per visible entry, including exempt processes
	// without tasks. The shared projection excludes prices and document payloads.
	bindings := make([]*biz.WorkflowTask, 0, len(entries))
	for _, entry := range entries {
		binding := entry.Task
		if p := entry.Instance; p != nil {
			binding = &biz.WorkflowTask{SourceType: p.BusinessRefType, SourceID: p.BusinessRefID, ProcessInstanceID: &p.ID}
		}
		bindings = append(bindings, binding)
	}
	if err := hydrateWorkflowTaskDisplayContexts(ctx, client, bindings); err != nil {
		return err
	}
	for i, entry := range entries {
		entry.DisplayContext = bindings[i].DisplayContext
	}
	if err := loadTrackingInitiators(ctx, client, entries); err != nil {
		return err
	}
	return loadTrackingPeople(ctx, client, entries)
}

func loadTrackingPeople(ctx context.Context, client *ent.Client, entries []*biz.WorkflowTrackingEntry) error {
	ids := []int{}
	add := func(id *int) {
		if id != nil && *id > 0 {
			ids = append(ids, *id)
		}
	}
	for _, e := range entries {
		if e.Instance != nil {
			add(e.Instance.CreatedBy)
		}
		for _, node := range e.Nodes {
			add(node.DomainCommandResultRecordedBy)
		}
		for _, task := range e.Tasks {
			add(task.AssigneeID)
			add(task.CreatedBy)
		}
		for _, event := range e.Events {
			add(event.ActorID)
		}
	}
	people := map[int]string{}
	if len(ids) > 0 {
		rows, err := client.AdminUser.Query().Where(adminuser.IDIn(ids...)).Select(adminuser.FieldID, adminuser.FieldUsername, adminuser.FieldDisplayName).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			name := strings.TrimSpace(stringValue(row.DisplayName))
			if name == "" {
				name = row.Username
			}
			people[row.ID] = name
		}
	}
	for _, e := range entries {
		e.People = people
		for _, event := range e.Events {
			if event.ActorID != nil {
				event.ActorDisplayName = people[*event.ActorID]
				if event.ActorDisplayName == "" {
					event.ActorDisplayName = "人员信息未记录"
				}
			}
		}
	}
	return nil
}
