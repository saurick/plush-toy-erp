package data

import (
	"context"
	"encoding/json"
	"strconv"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/runtimeauditevent"
	"server/internal/data/model/ent/workflowtaskevent"
)

const processInitiationAuditEventType = "process_instance_created"

func processInitiationAuditKey(id int) string {
	return biz.ProcessInitiationAuditEventPrefix + strconv.Itoa(id)
}

func recordProcessInitiatorInTx(ctx context.Context, tx *ent.Tx, process *ent.ProcessInstance, actorID int) error {
	if actorID <= 0 {
		return nil
	}
	return createRuntimeAuditEventInTx(ctx, tx, &biz.RuntimeAuditEventCreate{
		EventType: processInitiationAuditEventType,
		EventKey:  processInitiationAuditKey(process.ID),
		Source:    "workflow",
		Payload: map[string]any{
			"action": "process_instance.create",
			"actor": map[string]any{
				"id": actorID, "role_key": biz.WorkflowInitiatorRoleKey(ctx, actorID),
			},
			"target": map[string]any{
				"type": "process_instance", "id": process.ID, "key": strconv.Itoa(process.ID),
			},
		},
	})
}

// Load creation evidence independently of the paginated handling history. A
// later task creator or participant must never become the process initiator.
func loadTrackingInitiators(ctx context.Context, client *ent.Client, entries []*biz.WorkflowTrackingEntry) error {
	processes := map[string]*biz.WorkflowTrackingEntry{}
	tasks := map[int]*biz.WorkflowTrackingEntry{}
	keys, ids := []string{}, []int{}
	for _, entry := range entries {
		entry.InitiatorRoleKey = ""
		if p := entry.Instance; p != nil && p.CreatedBy != nil {
			key := processInitiationAuditKey(p.ID)
			processes[key] = entry
			keys = append(keys, key)
		} else if entry.Task != nil && entry.Task.CreatedBy != nil {
			tasks[entry.Task.ID] = entry
			ids = append(ids, entry.Task.ID)
		}
	}
	if len(keys) > 0 {
		events, err := client.RuntimeAuditEvent.Query().Where(
			runtimeauditevent.EventType(processInitiationAuditEventType),
			runtimeauditevent.Source("workflow"),
			runtimeauditevent.EventKeyIn(keys...),
		).Order(ent.Asc(runtimeauditevent.FieldID)).All(ctx)
		if err != nil {
			return err
		}
		for _, event := range events {
			entry := processes[event.EventKey]
			if entry == nil {
				continue
			}
			delete(processes, event.EventKey)
			var snapshot struct {
				Actor struct {
					ID      int    `json:"id"`
					RoleKey string `json:"role_key"`
				} `json:"actor"`
				Target struct {
					Type string `json:"type"`
					ID   int    `json:"id"`
				} `json:"target"`
			}
			if json.Unmarshal([]byte(event.Payload), &snapshot) == nil &&
				snapshot.Actor.ID == *entry.Instance.CreatedBy && snapshot.Actor.ID > 0 &&
				snapshot.Target.Type == "process_instance" && snapshot.Target.ID == entry.Instance.ID {
				entry.InitiatorRoleKey = biz.NormalizeRoleKey(snapshot.Actor.RoleKey)
			}
		}
	}
	if len(ids) > 0 {
		events, err := client.WorkflowTaskEvent.Query().Where(
			workflowtaskevent.TaskIDIn(ids...), workflowtaskevent.EventType("created"),
		).Select(workflowtaskevent.FieldID, workflowtaskevent.FieldTaskID, workflowtaskevent.FieldActorID, workflowtaskevent.FieldActorRoleKey).
			Order(ent.Asc(workflowtaskevent.FieldID)).All(ctx)
		if err != nil {
			return err
		}
		for _, event := range events {
			entry := tasks[event.TaskID]
			if entry == nil {
				continue
			}
			delete(tasks, event.TaskID)
			if event.ActorID != nil && *event.ActorID > 0 && *event.ActorID == *entry.Task.CreatedBy {
				entry.InitiatorRoleKey = biz.NormalizeRoleKey(stringValue(event.ActorRoleKey))
			}
		}
	}
	return nil
}
