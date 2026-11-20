package data

import (
	"context"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/processnodeinstance"
	"server/internal/data/model/ent/workflowtask"
)

// resolveLinkedProcessForSourceCancellationWithClient closes an active,
// blocked, or already-completed process after its authoritative source is cancelled. The
// caller must compensate every conflicting domain effect first, in the same
// transaction.
func resolveLinkedProcessForSourceCancellationWithClient(
	ctx context.Context,
	client *ent.Client,
	processKey string,
	refType string,
	refID int,
	reason string,
	actorID int,
) error {
	if client == nil || processKey == "" || refType == "" || refID <= 0 || reason == "" || actorID <= 0 {
		return biz.ErrBadParam
	}
	instance, err := client.ProcessInstance.Query().Where(
		processinstance.ProcessKey(processKey),
		processinstance.BusinessRefType(refType),
		processinstance.BusinessRefID(refID),
	).Only(ctx)
	if ent.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	hasAppliedEffect, err := client.ProcessNodeInstance.Query().Where(
		processnodeinstance.ProcessInstanceID(instance.ID),
		processnodeinstance.DomainCommandEffectState(biz.ProcessDomainCommandEffectStateApplied),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasAppliedEffect {
		return biz.ErrProcessDomainCommandRecoveryRequired
	}
	now := time.Now()
	nodes, err := client.ProcessNodeInstance.Query().Where(
		processnodeinstance.ProcessInstanceID(instance.ID),
		processnodeinstance.StatusIn(
			biz.ProcessNodeStatusWaiting,
			biz.ProcessNodeStatusActive,
			biz.ProcessNodeStatusBlocked,
		),
	).All(ctx)
	if err != nil {
		return err
	}
	for _, node := range nodes {
		tasks, taskErr := client.WorkflowTask.Query().Where(
			workflowtask.ProcessNodeInstanceID(node.ID),
			workflowtask.TaskStatusKeyIn("ready", "blocked"),
		).All(ctx)
		if taskErr != nil {
			return taskErr
		}
		for _, task := range tasks {
			updated, updateErr := client.WorkflowTask.Update().Where(
				workflowtask.ID(task.ID),
				workflowtask.Version(task.Version),
				workflowtask.TaskStatusKey(task.TaskStatusKey),
			).SetTaskStatusKey("withdrawn").SetBlockedReason(reason).SetCompletedAt(now).
				SetUpdatedBy(actorID).SetVersion(task.Version + 1).Save(ctx)
			if updateErr != nil {
				return updateErr
			}
			if updated != 1 {
				return biz.ErrProcessNodeInstanceConflict
			}
			if _, eventErr := client.WorkflowTaskEvent.Create().SetTaskID(task.ID).SetTaskVersion(task.Version + 1).
				SetEventType("source_cancelled_withdrawal").SetFromStatusKey(task.TaskStatusKey).SetToStatusKey("withdrawn").
				SetActorID(actorID).SetReason(reason).Save(ctx); eventErr != nil {
				return eventErr
			}
		}
		updated, updateErr := client.ProcessNodeInstance.Update().Where(
			processnodeinstance.ID(node.ID),
			processnodeinstance.Version(node.Version),
			processnodeinstance.Status(node.Status),
		).SetStatus(biz.ProcessNodeStatusWithdrawn).
			SetOutcome("source.cancelled_withdrawal").
			SetCompletedAt(now).
			SetUpdatedBy(actorID).
			SetVersion(node.Version + 1).
			ClearBlockKind().ClearBlockedReasonCode().ClearBlockedReason().ClearBlockedAt().ClearBlockedBy().
			Save(ctx)
		if updateErr != nil {
			return updateErr
		}
		if updated != 1 {
			return biz.ErrProcessNodeInstanceConflict
		}
	}
	update := client.ProcessInstance.Update().Where(
		processinstance.ID(instance.ID),
		processinstance.StatusIn(biz.ProcessStatusActive, biz.ProcessStatusBlocked, biz.ProcessStatusCompleted),
	).SetStatus(biz.ProcessStatusCompleted).
		ClearTerminalNodeInstanceID().
		SetResolutionKind(biz.ProcessResolutionCancelled).
		SetResolutionReason(reason).
		SetResolvedAt(now).
		SetResolvedBy(actorID).
		SetUpdatedBy(actorID).
		ClearBlockKind().ClearBlockedReasonCode().ClearBlockedReason().ClearBlockedAt().ClearBlockedBy()
	if instance.CompletedAt == nil {
		update.SetCompletedAt(now)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrProcessInstanceSettled
	}
	return nil
}
