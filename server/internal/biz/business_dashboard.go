package biz

type BusinessDashboardModuleStats struct {
	ModuleKey    string
	TotalRecords int
	StatusCounts map[string]int
}
