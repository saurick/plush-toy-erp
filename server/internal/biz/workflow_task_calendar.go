package biz

import "time"

// Calendar is a read projection of active tasks, grouped by their processing
// deadline in the business timezone. It does not schedule or create tasks.
type WorkflowTaskCalendarQuery struct {
	Month     string
	Selection string
	Offset    int
}

type WorkflowTaskCalendar struct {
	Month      string
	Selection  string
	Days       map[string]int
	Overdue    int
	Undated    int
	Total      int
	Offset     int
	Limit      int
	SnapshotAt time.Time
	Tasks      []*WorkflowTask
}

var workflowCalendarZone = time.FixedZone("Asia/Shanghai", 8*3600)

func (q *WorkflowTaskCalendarQuery) Bounds() (time.Time, time.Time, error) {
	if q == nil || q.Offset < 0 || q.Offset > 2_147_483_647 {
		return time.Time{}, time.Time{}, ErrBadParam
	}
	month, err := time.ParseInLocation("2006-01", q.Month, workflowCalendarZone)
	if err != nil || month.Year() < 1900 || month.Year() > 9998 || month.Format("2006-01") != q.Month {
		return time.Time{}, time.Time{}, ErrBadParam
	}
	if q.Selection != "overdue" && q.Selection != "undated" {
		day, err := time.ParseInLocation("2006-01-02", q.Selection, workflowCalendarZone)
		if err != nil || day.Format("2006-01-02") != q.Selection || day.Format("2006-01") != q.Month {
			return time.Time{}, time.Time{}, ErrBadParam
		}
	}
	return month, month.AddDate(0, 1, 0), nil
}
