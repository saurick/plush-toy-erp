package data

import (
	"server/internal/biz"
	corevalue "server/internal/core/value"
	"server/internal/data/model/ent/workflowtaskevent"
	"strings"
	"testing"
)

func TestEngineeringMaterialLongReviewNotesReachTaskAndEvent(t *testing.T) {
	for _, action := range []string{"BOSS_APPROVE", "REJECT"} {
		t.Run(action, func(t *testing.T) {
			ctx := t.Context()
			_, client := openSalesOrderRepoTest(t, "material_note_"+strings.ToLower(action))
			defer mustCloseEntClient(t, client)
			f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "NOTE-"+action)
			request := submitMaterialRequestFixture(t, ctx, f)
			note := strings.Repeat("注", corevalue.BusinessNoteMaxCharacters)
			result, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: action, ReviewStage: "BOSS", Note: &note})
			if err != nil {
				t.Fatal(err)
			}
			if result.ReviewNote == nil || *result.ReviewNote != note {
				t.Fatal("review text was truncated")
			}
			event := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.ReasonEQ(note)).OnlyX(ctx)
			task := client.WorkflowTask.GetX(ctx, event.TaskID)
			if action == "REJECT" && (task.BlockedReason == nil || *task.BlockedReason != note) {
				t.Fatal("rejection lost its full task reason")
			}
			if task.TaskStatusKey != map[string]string{"BOSS_APPROVE": "done", "REJECT": "rejected"}[action] {
				t.Fatal("unexpected task result")
			}
		})
	}
}
