package data

import (
	"context"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/businessrecord"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
)

type debugSeedRepo struct {
	data *Data
	log  *log.Helper
}

func NewDebugSeedRepo(d *Data, logger log.Logger) *debugSeedRepo {
	return &debugSeedRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.debug_seed_repo")),
	}
}

var _ biz.DebugRepo = (*debugSeedRepo)(nil)

func (r *debugSeedRepo) SeedBusinessChainDebugData(ctx context.Context, plan biz.DebugSeedPlan, actorID int) (*biz.DebugBusinessChainSeedResult, error) {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	recordsByRef := make(map[string]*ent.BusinessRecord, len(plan.Records))
	createdRecords := make([]biz.DebugCreatedRecord, 0, len(plan.Records))
	for _, recordPlan := range plan.Records {
		if !biz.IsDebugPayloadForRun(recordPlan.Payload, plan.DebugRunID, plan.ScenarioKey) {
			return nil, biz.ErrDebugPayloadMarkerMissing
		}
		row, err := createDebugBusinessRecord(ctx, tx, recordPlan, actorID)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, biz.ErrBusinessRecordExists
			}
			return nil, err
		}
		recordsByRef[recordPlan.Ref] = row
		createdRecords = append(createdRecords, biz.DebugCreatedRecord{
			ID:                row.ID,
			ModuleKey:         row.ModuleKey,
			DocumentNo:        valueString(row.DocumentNo),
			Title:             row.Title,
			BusinessStatusKey: row.BusinessStatusKey,
			OwnerRoleKey:      row.OwnerRoleKey,
		})
	}

	for _, statePlan := range plan.BusinessStates {
		record := recordsByRef[statePlan.RecordRef]
		if record == nil {
			return nil, biz.ErrBadParam
		}
		if !biz.IsDebugPayloadForRun(statePlan.Payload, plan.DebugRunID, plan.ScenarioKey) {
			return nil, biz.ErrDebugPayloadMarkerMissing
		}
		builder := tx.WorkflowBusinessState.Create().
			SetSourceType(record.ModuleKey).
			SetSourceID(record.ID).
			SetNillableSourceNo(record.DocumentNo).
			SetBusinessStatusKey(statePlan.BusinessStatusKey).
			SetOwnerRoleKey(statePlan.OwnerRoleKey).
			SetStatusChangedAt(time.Now()).
			SetPayload(statePlan.Payload)
		if statePlan.BlockedReason != nil {
			builder.SetBlockedReason(*statePlan.BlockedReason)
		}
		if _, err := builder.Save(ctx); err != nil {
			return nil, err
		}
	}

	createdTasks := make([]biz.DebugCreatedTask, 0, len(plan.Tasks))
	for _, taskPlan := range plan.Tasks {
		record := recordsByRef[taskPlan.RecordRef]
		if record == nil {
			return nil, biz.ErrBadParam
		}
		if !biz.IsDebugPayloadForRun(taskPlan.Payload, plan.DebugRunID, plan.ScenarioKey) {
			return nil, biz.ErrDebugPayloadMarkerMissing
		}
		task, err := createDebugWorkflowTask(ctx, tx, taskPlan, record, actorID)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, biz.ErrWorkflowTaskExists
			}
			return nil, err
		}
		createdTasks = append(createdTasks, biz.DebugCreatedTask{
			ID:                task.ID,
			TaskCode:          task.TaskCode,
			TaskGroup:         task.TaskGroup,
			TaskName:          task.TaskName,
			SourceType:        task.SourceType,
			SourceID:          task.SourceID,
			SourceNo:          valueString(task.SourceNo),
			BusinessStatusKey: valueString(task.BusinessStatusKey),
			TaskStatusKey:     task.TaskStatusKey,
			OwnerRoleKey:      task.OwnerRoleKey,
		})
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	r.log.WithContext(ctx).Infow(
		"msg", "debug seed completed",
		"scenario_key", plan.ScenarioKey,
		"debug_run_id", plan.DebugRunID,
		"actor_id", actorID,
		"records", len(createdRecords),
		"tasks", len(createdTasks),
	)
	return &biz.DebugBusinessChainSeedResult{
		ScenarioKey:     plan.ScenarioKey,
		DebugRunID:      plan.DebugRunID,
		CoverageStatus:  plan.CoverageStatus,
		Partial:         plan.Partial,
		CreatedRecords:  createdRecords,
		CreatedTasks:    createdTasks,
		NextCheckpoints: plan.NextCheckpoints,
		CleanupToken:    plan.CleanupToken,
		Warnings:        append([]string(nil), plan.Warnings...),
	}, nil
}

func createDebugBusinessRecord(ctx context.Context, tx *ent.Tx, plan biz.DebugRecordPlan, actorID int) (*ent.BusinessRecord, error) {
	builder := tx.BusinessRecord.Create().
		SetModuleKey(plan.ModuleKey).
		SetDocumentNo(plan.DocumentNo).
		SetTitle(plan.Title).
		SetBusinessStatusKey(plan.BusinessStatusKey).
		SetOwnerRoleKey(plan.OwnerRoleKey).
		SetNillableSourceNo(plan.SourceNo).
		SetNillableCustomerName(plan.CustomerName).
		SetNillableSupplierName(plan.SupplierName).
		SetNillableStyleNo(plan.StyleNo).
		SetNillableProductNo(plan.ProductNo).
		SetNillableProductName(plan.ProductName).
		SetNillableMaterialName(plan.MaterialName).
		SetNillableWarehouseLocation(plan.WarehouseLocation).
		SetNillableQuantity(plan.Quantity).
		SetNillableUnit(plan.Unit).
		SetNillableAmount(plan.Amount).
		SetNillableDocumentDate(plan.DocumentDate).
		SetNillableDueDate(plan.DueDate).
		SetPayload(plan.Payload)
	if actorID > 0 {
		builder.SetCreatedBy(actorID).SetUpdatedBy(actorID)
	}

	row, err := builder.Save(ctx)
	if err != nil {
		return nil, err
	}
	if err := replaceBusinessRecordItems(ctx, tx, row.ID, row.ModuleKey, plan.Items); err != nil {
		return nil, err
	}
	eventBuilder := tx.BusinessRecordEvent.Create().
		SetRecordID(row.ID).
		SetModuleKey(row.ModuleKey).
		SetActionKey("debug_seeded").
		SetToStatusKey(row.BusinessStatusKey).
		SetNote("debug seed").
		SetPayload(plan.Payload)
	if actorID > 0 {
		eventBuilder.SetActorID(actorID).SetActorRoleKey("admin")
	}
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, err
	}
	return row, nil
}

func createDebugWorkflowTask(ctx context.Context, tx *ent.Tx, plan biz.DebugTaskPlan, record *ent.BusinessRecord, actorID int) (*ent.WorkflowTask, error) {
	builder := tx.WorkflowTask.Create().
		SetTaskCode(plan.TaskCode).
		SetTaskGroup(plan.TaskGroup).
		SetTaskName(plan.TaskName).
		SetSourceType(record.ModuleKey).
		SetSourceID(record.ID).
		SetNillableSourceNo(record.DocumentNo).
		SetBusinessStatusKey(plan.BusinessStatusKey).
		SetTaskStatusKey(plan.TaskStatusKey).
		SetOwnerRoleKey(plan.OwnerRoleKey).
		SetPriority(plan.Priority).
		SetNillableDueAt(plan.DueAt).
		SetNillableBlockedReason(plan.BlockedReason).
		SetPayload(plan.Payload)
	if actorID > 0 {
		builder.SetCreatedBy(actorID).SetUpdatedBy(actorID)
	}
	task, err := builder.Save(ctx)
	if err != nil {
		return nil, err
	}
	eventBuilder := tx.WorkflowTaskEvent.Create().
		SetTaskID(task.ID).
		SetEventType("debug_seeded").
		SetToStatusKey(plan.TaskStatusKey).
		SetActorRoleKey("admin").
		SetPayload(plan.Payload)
	if actorID > 0 {
		eventBuilder.SetActorID(actorID)
	}
	if _, err := eventBuilder.Save(ctx); err != nil {
		return nil, err
	}
	return task, nil
}

func (r *debugSeedRepo) CleanupBusinessChainDebugData(ctx context.Context, in biz.DebugBusinessChainCleanupInput) (*biz.DebugBusinessChainCleanupResult, error) {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return nil, biz.ErrBadParam
	}
	prefix, err := biz.DebugDocumentPrefix(in.DebugRunID, in.ScenarioKey)
	if err != nil {
		return nil, err
	}

	matches, err := r.loadDebugCleanupMatches(ctx, prefix, in.DebugRunID, in.ScenarioKey)
	if err != nil {
		return nil, err
	}
	result := matches.toResult(in)
	if in.DryRun {
		result.Warnings = append(result.Warnings, "dryRun=true，仅预览清理范围，没有修改数据。")
		r.log.WithContext(ctx).Infow(
			"msg", "debug cleanup dry run completed",
			"scenario_key", in.ScenarioKey,
			"debug_run_id", in.DebugRunID,
			"matched_records", len(result.MatchedRecords),
			"matched_tasks", len(result.MatchedTasks),
			"dry_run", true,
		)
		return result, nil
	}

	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	recordIDs := make([]int, 0, len(matches.records))
	for _, row := range matches.records {
		recordIDs = append(recordIDs, row.ID)
	}
	if len(recordIDs) > 0 {
		now := time.Now()
		affected, err := tx.BusinessRecord.Update().
			Where(
				businessrecord.IDIn(recordIDs...),
				businessrecord.DeletedAtIsNil(),
			).
			SetDeletedAt(now).
			SetDeleteReason(fmt.Sprintf("debug cleanup run=%s scenario=%s", in.DebugRunID, in.ScenarioKey)).
			AddRowVersion(1).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		_ = affected
		for _, row := range matches.records {
			payload := copyMap(row.Payload)
			payload["debug_cleanup_at"] = now.UTC().Format(time.RFC3339)
			eventBuilder := tx.BusinessRecordEvent.Create().
				SetRecordID(row.ID).
				SetModuleKey(row.ModuleKey).
				SetActionKey("debug_cleanup").
				SetFromStatusKey(row.BusinessStatusKey).
				SetToStatusKey(row.BusinessStatusKey).
				SetNote("debug cleanup").
				SetPayload(payload)
			if _, err := eventBuilder.Save(ctx); err != nil {
				return nil, err
			}
		}
		result.ArchivedRecords = append([]biz.DebugMatchedRecord(nil), result.MatchedRecords...)
	}

	taskIDs := make([]int, 0, len(matches.tasks))
	for _, row := range matches.tasks {
		taskIDs = append(taskIDs, row.ID)
	}
	if len(taskIDs) > 0 {
		deletedEvents, err := tx.WorkflowTaskEvent.Delete().
			Where(workflowtaskevent.TaskIDIn(taskIDs...)).
			Exec(ctx)
		if err != nil {
			return nil, err
		}
		if _, err := tx.WorkflowTask.Delete().
			Where(workflowtask.IDIn(taskIDs...)).
			Exec(ctx); err != nil {
			return nil, err
		}
		result.DeletedTaskEvents = deletedEvents
		result.DeletedTasks = append([]biz.DebugMatchedTask(nil), result.MatchedTasks...)
	}

	stateIDs := make([]int, 0, len(matches.businessStates))
	for _, row := range matches.businessStates {
		stateIDs = append(stateIDs, row.ID)
	}
	if len(stateIDs) > 0 {
		deletedStates, err := tx.WorkflowBusinessState.Delete().
			Where(workflowbusinessstate.IDIn(stateIDs...)).
			Exec(ctx)
		if err != nil {
			return nil, err
		}
		result.DeletedBusinessStates = deletedStates
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil

	r.log.WithContext(ctx).Infow(
		"msg", "debug cleanup completed",
		"scenario_key", in.ScenarioKey,
		"debug_run_id", in.DebugRunID,
		"matched_records", len(result.MatchedRecords),
		"archived_records", len(result.ArchivedRecords),
		"matched_tasks", len(result.MatchedTasks),
		"deleted_tasks", len(result.DeletedTasks),
		"deleted_business_states", result.DeletedBusinessStates,
		"deleted_task_events", result.DeletedTaskEvents,
		"dry_run", false,
	)
	return result, nil
}

type debugCleanupMatches struct {
	records        []*ent.BusinessRecord
	tasks          []*ent.WorkflowTask
	businessStates []*ent.WorkflowBusinessState
	skippedItems   []biz.DebugCleanupSkippedItem
}

func (r *debugSeedRepo) loadDebugCleanupMatches(ctx context.Context, prefix string, debugRunID string, scenarioKey string) (*debugCleanupMatches, error) {
	out := &debugCleanupMatches{}

	recordRows, err := r.data.postgres.BusinessRecord.Query().
		Where(
			businessrecord.DeletedAtIsNil(),
			businessrecord.Or(
				businessrecord.DocumentNoHasPrefix(prefix),
				businessrecord.SourceNoHasPrefix(prefix),
			),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range recordRows {
		if biz.IsDebugPayloadForRun(row.Payload, debugRunID, scenarioKey) {
			out.records = append(out.records, row)
			continue
		}
		out.skippedItems = append(out.skippedItems, biz.DebugCleanupSkippedItem{
			Type:   "business_record",
			ID:     row.ID,
			Reason: "匹配 DBG 前缀但缺少本次 debug_run_id / scenario_key 标记，已跳过",
		})
	}

	taskRows, err := r.data.postgres.WorkflowTask.Query().
		Where(
			workflowtask.Or(
				workflowtask.TaskCodeHasPrefix(prefix),
				workflowtask.SourceNoHasPrefix(prefix),
			),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range taskRows {
		if biz.IsDebugPayloadForRun(row.Payload, debugRunID, scenarioKey) {
			out.tasks = append(out.tasks, row)
			continue
		}
		out.skippedItems = append(out.skippedItems, biz.DebugCleanupSkippedItem{
			Type:   "workflow_task",
			ID:     row.ID,
			Reason: "匹配 DBG 前缀但缺少本次 debug_run_id / scenario_key 标记，已跳过",
		})
	}

	stateRows, err := r.data.postgres.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceNoHasPrefix(prefix)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range stateRows {
		if biz.IsDebugPayloadForRun(row.Payload, debugRunID, scenarioKey) {
			out.businessStates = append(out.businessStates, row)
			continue
		}
		out.skippedItems = append(out.skippedItems, biz.DebugCleanupSkippedItem{
			Type:   "workflow_business_state",
			ID:     row.ID,
			Reason: "匹配 DBG 前缀但缺少本次 debug_run_id / scenario_key 标记，已跳过",
		})
	}
	return out, nil
}

func (m *debugCleanupMatches) toResult(in biz.DebugBusinessChainCleanupInput) *biz.DebugBusinessChainCleanupResult {
	result := &biz.DebugBusinessChainCleanupResult{
		DebugRunID:            in.DebugRunID,
		ScenarioKey:           in.ScenarioKey,
		DryRun:                in.DryRun,
		MatchedRecords:        make([]biz.DebugMatchedRecord, 0, len(m.records)),
		MatchedTasks:          make([]biz.DebugMatchedTask, 0, len(m.tasks)),
		MatchedBusinessStates: make([]biz.DebugMatchedBusinessState, 0, len(m.businessStates)),
		SkippedItems:          append([]biz.DebugCleanupSkippedItem(nil), m.skippedItems...),
	}
	for _, row := range m.records {
		result.MatchedRecords = append(result.MatchedRecords, biz.DebugMatchedRecord{
			ID:         row.ID,
			ModuleKey:  row.ModuleKey,
			DocumentNo: valueString(row.DocumentNo),
			Title:      row.Title,
		})
	}
	for _, row := range m.tasks {
		result.MatchedTasks = append(result.MatchedTasks, biz.DebugMatchedTask{
			ID:        row.ID,
			TaskCode:  row.TaskCode,
			TaskGroup: row.TaskGroup,
			TaskName:  row.TaskName,
			SourceNo:  valueString(row.SourceNo),
		})
	}
	for _, row := range m.businessStates {
		result.MatchedBusinessStates = append(result.MatchedBusinessStates, biz.DebugMatchedBusinessState{
			ID:                row.ID,
			SourceType:        row.SourceType,
			SourceID:          row.SourceID,
			SourceNo:          valueString(row.SourceNo),
			BusinessStatusKey: row.BusinessStatusKey,
		})
	}
	if in.ScenarioKey == "" {
		result.Warnings = append(result.Warnings, "未指定 scenarioKey，将清理该 debugRunId 下所有调试场景。")
	}
	return result
}

func valueString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func copyMap(input map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range input {
		out[key] = value
	}
	return out
}
