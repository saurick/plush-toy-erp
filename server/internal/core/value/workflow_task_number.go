package value

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var workflowTaskNumberPattern = regexp.MustCompile(`^RW([0-9]{8})-([0-9]{4,19})$`)
var workflowTaskNumberZone = time.FixedZone("Asia/Shanghai", 8*3600)

func WorkflowTaskNumberDay(createdAt time.Time) string {
	return createdAt.In(workflowTaskNumberZone).Format("20060102")
}

func FormatWorkflowTaskNumber(day string, sequence int64) string {
	return fmt.Sprintf("RW%s-%04d", day, sequence)
}

func NormalizeWorkflowTaskNumber(input string) (string, bool) {
	number := strings.ToUpper(strings.TrimSpace(input))
	parts := workflowTaskNumberPattern.FindStringSubmatch(number)
	if parts == nil {
		return "", false
	}
	if _, err := time.Parse("20060102", parts[1]); err != nil {
		return "", false
	}
	sequence, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || sequence <= 0 || number != FormatWorkflowTaskNumber(parts[1], sequence) {
		return "", false
	}
	return number, true
}

func ValidateWorkflowTaskNumber(number string) error {
	if normalized, ok := NormalizeWorkflowTaskNumber(number); !ok || normalized != number {
		return fmt.Errorf("invalid workflow task number")
	}
	return nil
}
