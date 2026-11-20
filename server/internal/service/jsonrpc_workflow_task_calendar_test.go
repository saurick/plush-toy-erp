package service

import (
	"context"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/errcode"
)

type recordingWorkflowCalendarRPCRepo struct {
	recordingWorkflowRevisionJSONRPCRepo
}

func (r *recordingWorkflowCalendarRPCRepo) ListWorkflowRoleTaskView(_ context.Context, query biz.WorkflowRoleTaskViewQuery) (*biz.WorkflowRoleTaskViewPage, error) {
	r.roleQuery = query
	return &biz.WorkflowRoleTaskViewPage{Calendar: &biz.WorkflowTaskCalendar{
		Month: query.Calendar.Month, Selection: query.Calendar.Selection,
		Days: map[string]int{}, Limit: query.Limit, SnapshotAt: query.SnapshotAt,
	}}, nil
}

func TestWorkflowCalendarRPCMobileAccess(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	for _, name := range []string{"allowed", "missing read", "missing mobile", "other role", "disabled", "anonymous", "super admin review"} {
		t.Run(name, func(t *testing.T) {
			permissions := []string{biz.PermissionWorkflowTaskRead, biz.PermissionMobileSalesAccess}
			if name == "missing read" {
				permissions = permissions[1:]
			}
			if name == "missing mobile" {
				permissions = permissions[:1]
			}
			admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, permissions...)
			admin.Disabled = name == "disabled"
			if name == "super admin review" {
				admin = workflowJSONRPCAdmin([]string{biz.AdminRoleKey})
				admin.IsSuperAdmin = true
			}
			role := biz.SalesRoleKey
			if name == "other role" {
				role = biz.WarehouseRoleKey
			}
			ctx := workflowJSONRPCAdminContext()
			if name == "anonymous" {
				ctx = context.Background()
			}
			repo := &recordingWorkflowCalendarRPCRepo{}
			d := &jsonrpcDispatcher{
				log: log.NewHelper(log.NewStdLogger(io.Discard)), adminReader: stubAdminAccountReader{admin: admin},
				workflowUC:       biz.NewWorkflowUsecase(repo),
				customerConfigUC: biz.NewCustomerConfigUsecase(mobileReviewCustomerConfigRepo(biz.DefaultCustomerKey)),
			}
			_, res, err := d.handleWorkflow(ctx, "list_role_tasks", "calendar", mustJSONRPCStruct(t, map[string]any{
				"view_key": "todo", "role_key": role, "calendar_month": "2026-10", "calendar_selection": "undated", "limit": 30,
			}))
			if err != nil || res == nil {
				t.Fatalf("result=%+v error=%v", res, err)
			}
			if name == "allowed" || name == "super admin review" {
				if res.Code != errcode.OK.Code || repo.roleQuery.Calendar == nil || repo.roleQuery.RoleKey != role || res.Data.AsMap()["calendar"] == nil {
					t.Fatalf("calendar role projection=%+v query=%+v", res, repo.roleQuery)
				}
				if name == "super admin review" && (len(repo.roleQuery.ReviewRoleKeys) != 1 || repo.roleQuery.ReviewRoleKeys[0] != role) {
					t.Fatalf("calendar expanded administrator review: %+v", repo.roleQuery)
				}
			} else if res.Code == errcode.OK.Code || repo.roleQuery.Calendar != nil {
				t.Fatalf("calendar access bypass: %+v", res)
			}
		})
	}
}

func TestWorkflowCalendarRPCScopesAndRejectsBadInputs(t *testing.T) {
	for _, permitted := range []bool{true, false} {
		admin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey})
		if permitted {
			admin = workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead, biz.PermissionWorkflowTaskSupervise)
		}
		repo := &recordingWorkflowTaskBoardJSONRPCRepo{result: &biz.WorkflowTaskBoard{Calendar: &biz.WorkflowTaskCalendar{Month: "2026-10", Selection: "2026-10-14", Days: map[string]int{}, Limit: 30, SnapshotAt: time.Now()}}}
		d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard)), adminReader: stubAdminAccountReader{admin: admin}, workflowUC: biz.NewWorkflowUsecase(repo)}
		_, res, err := d.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_board", "calendar", mustJSONRPCStruct(t, map[string]any{"todo_only": true, "calendar_month": "2026-10", "calendar_selection": "2026-10-14", "limit": 30}))
		if err != nil {
			t.Fatal(err)
		}
		if !permitted {
			if res.Code != errcode.PermissionDenied.Code {
				t.Fatalf("read permission bypass: %+v", res)
			}
			continue
		}
		if res.Code != errcode.OK.Code || repo.query.Calendar == nil || repo.query.VisibilityScope == nil || repo.query.VisibilityScope.StandaloneAllowAllOwnerRoles {
			t.Fatalf("calendar lost responsibility scope: %+v %+v", res, repo.query)
		}
		if res.Data.AsMap()["calendar"] == nil {
			t.Fatal("missing calendar response")
		}
	}
	for _, pm := range []map[string]any{{"calendar_selection": "overdue"}, {"calendar_month": "2026-10", "calendar_selection": "2026-11-01"}, {"calendar_month": "2026-10", "calendar_selection": "undated", "calendar_offset": -1}, {"calendar_month": 10}} {
		if _, res := parseWorkflowTaskCalendar(pm); res == nil {
			t.Fatalf("accepted invalid calendar: %+v", pm)
		}
	}
	for _, view := range []string{"history", "risk", "approval"} {
		_, res := parseWorkflowRoleTaskViewRequest(map[string]any{"view_key": view, "role_key": "sales", "calendar_month": "2026-10", "calendar_selection": "overdue"}, "list_role_tasks")
		if res == nil {
			t.Fatalf("calendar accepted non-todo view: %s", view)
		}
	}
}
