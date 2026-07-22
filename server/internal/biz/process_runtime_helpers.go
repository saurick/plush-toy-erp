package biz

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"
)

func normalizeProcessLinkedWorkflowTaskCreate(in ProcessLinkedWorkflowTaskCreate) (ProcessLinkedWorkflowTaskCreate, error) {
	in.TaskCode = strings.TrimSpace(in.TaskCode)
	in.TaskGroup = strings.TrimSpace(in.TaskGroup)
	in.TaskName = strings.TrimSpace(in.TaskName)
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.OwnerRoleKey = NormalizeRoleKey(in.OwnerRoleKey)
	if err := ValidateWorkflowSourceTaskReservedNamespace(in.TaskGroup, in.TaskCode); err != nil {
		return ProcessLinkedWorkflowTaskCreate{}, err
	}
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return ProcessLinkedWorkflowTaskCreate{}, ErrBadParam
	}
	if in.TaskStatusKey != "" && !IsCreatableWorkflowTaskState(in.TaskStatusKey) {
		return ProcessLinkedWorkflowTaskCreate{}, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return in, nil
}

func normalizeProcessDomainCommandExecution(in ProcessDomainCommandExecution) (ProcessDomainCommandExecution, error) {
	in.CommandKey = strings.TrimSpace(in.CommandKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 || in.IdempotencyKey == "" {
		return ProcessDomainCommandExecution{}, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return in, nil
}

func validateProcessDomainCommandPayloadKeys(payload map[string]any, allowedKeys ...string) error {
	allowed := make(map[string]struct{}, len(allowedKeys))
	for _, key := range allowedKeys {
		allowed[strings.TrimSpace(key)] = struct{}{}
	}
	for key := range payload {
		if _, ok := allowed[strings.TrimSpace(key)]; !ok {
			return ErrBadParam
		}
	}
	return nil
}

func processDomainCommandFingerprint(commandKey string, idempotencyKey string, payload map[string]any) (string, error) {
	canonical, err := json.Marshal(struct {
		CommandKey     string         `json:"command_key"`
		IdempotencyKey string         `json:"idempotency_key"`
		Payload        map[string]any `json:"payload"`
	}{
		CommandKey:     strings.TrimSpace(commandKey),
		IdempotencyKey: strings.TrimSpace(idempotencyKey),
		Payload:        payload,
	})
	if err != nil {
		return "", ErrBadParam
	}
	sum := sha256.Sum256(canonical)
	return fmt.Sprintf("%x", sum), nil
}

func normalizeProcessWaitEventWakeup(in ProcessWaitEventWakeup) (ProcessWaitEventWakeup, error) {
	in.EventKey = strings.TrimSpace(in.EventKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 || in.EventKey == "" || in.IdempotencyKey == "" {
		return ProcessWaitEventWakeup{}, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return in, nil
}

func normalizeProcessBusinessRef(in ProcessBusinessRef) (ProcessBusinessRef, error) {
	in.RefType = strings.TrimSpace(in.RefType)
	if in.RefNo != nil {
		trimmed := strings.TrimSpace(*in.RefNo)
		if trimmed == "" {
			in.RefNo = nil
		} else {
			in.RefNo = &trimmed
		}
	}
	if in.RefType == "" || in.RefID <= 0 {
		return ProcessBusinessRef{}, ErrBadParam
	}
	return in, nil
}

func processPositiveIntFromAny(value any) (int, error) {
	switch typed := value.(type) {
	case int:
		if typed <= 0 {
			return 0, ErrBadParam
		}
		return typed, nil
	case int64:
		if typed <= 0 || typed > int64(maxProcessCommandInt()) {
			return 0, ErrBadParam
		}
		return int(typed), nil
	case float64:
		if typed <= 0 || math.Trunc(typed) != typed || typed > float64(maxProcessCommandInt()) {
			return 0, ErrBadParam
		}
		return int(typed), nil
	default:
		return 0, ErrBadParam
	}
}

func ProcessInstanceHasBusinessRef(instance *ProcessInstance, refType string, refID int) bool {
	refType = strings.TrimSpace(refType)
	if instance == nil || refType == "" || refID <= 0 {
		return false
	}
	if instance.BusinessRefType == refType && instance.BusinessRefID == refID {
		return true
	}
	for _, ref := range ProcessInstanceLinkedBusinessRefs(instance) {
		if ref.RefType == refType && ref.RefID == refID {
			return true
		}
	}
	return false
}

func ProcessInstanceLinkedBusinessRefs(instance *ProcessInstance) []ProcessBusinessRef {
	if instance == nil || instance.ModuleContractSnapshot == nil {
		return []ProcessBusinessRef{}
	}
	rawItems, ok := instance.ModuleContractSnapshot["linked_business_refs"].([]any)
	if !ok {
		return []ProcessBusinessRef{}
	}
	refs := make([]ProcessBusinessRef, 0, len(rawItems))
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		refID, err := processPositiveIntFromAny(item["ref_id"])
		if err != nil {
			continue
		}
		refType, _ := item["ref_type"].(string)
		refNo, _ := item["ref_no"].(string)
		ref := ProcessBusinessRef{
			RefType: strings.TrimSpace(refType),
			RefID:   refID,
		}
		if strings.TrimSpace(refNo) != "" {
			trimmed := strings.TrimSpace(refNo)
			ref.RefNo = &trimmed
		}
		if normalized, err := normalizeProcessBusinessRef(ref); err == nil {
			refs = append(refs, normalized)
		}
	}
	return refs
}

func ApplyProcessLinkedBusinessRefToSnapshot(snapshot map[string]any, in *ProcessInstanceLinkedBusinessRefRecord) (map[string]any, error) {
	normalized, err := normalizeProcessInstanceLinkedBusinessRefRecord(in)
	if err != nil {
		return nil, err
	}
	out := cloneProcessPolicySnapshot(snapshot)
	rawItems, _ := out["linked_business_refs"].([]any)
	items := make([]any, 0, len(rawItems)+1)
	exists := false
	for _, raw := range rawItems {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		refID, err := processPositiveIntFromAny(item["ref_id"])
		if err != nil {
			continue
		}
		refType, _ := item["ref_type"].(string)
		if strings.TrimSpace(refType) == normalized.RefType && refID == normalized.RefID {
			existingRefNo, _ := item["ref_no"].(string)
			existingSourceNodeKey, _ := item["source_node_key"].(string)
			existingSourceCommandKey, _ := item["source_command_key"].(string)
			normalizedRefNo := ""
			if normalized.RefNo != nil {
				normalizedRefNo = *normalized.RefNo
			}
			if strings.TrimSpace(existingRefNo) != normalizedRefNo ||
				strings.TrimSpace(existingSourceNodeKey) != normalized.SourceNodeKey ||
				strings.TrimSpace(existingSourceCommandKey) != normalized.SourceCommandKey {
				return nil, ErrIdempotencyConflict
			}
			exists = true
		}
		items = append(items, item)
	}
	if exists {
		out["linked_business_refs"] = items
		return out, nil
	}
	next := map[string]any{
		"ref_type":           normalized.RefType,
		"ref_id":             normalized.RefID,
		"source_node_key":    normalized.SourceNodeKey,
		"source_command_key": normalized.SourceCommandKey,
	}
	if normalized.RefNo != nil {
		next["ref_no"] = *normalized.RefNo
	}
	items = append(items, next)
	out["linked_business_refs"] = items
	return out, nil
}

func normalizeProcessInstanceLinkedBusinessRefRecord(in *ProcessInstanceLinkedBusinessRefRecord) (ProcessInstanceLinkedBusinessRefRecord, error) {
	if in == nil {
		return ProcessInstanceLinkedBusinessRefRecord{}, ErrBadParam
	}
	out := *in
	out.RefType = strings.TrimSpace(out.RefType)
	out.SourceNodeKey = strings.TrimSpace(out.SourceNodeKey)
	out.SourceCommandKey = strings.TrimSpace(out.SourceCommandKey)
	if out.RefNo != nil {
		trimmed := strings.TrimSpace(*out.RefNo)
		if trimmed == "" {
			out.RefNo = nil
		} else {
			out.RefNo = &trimmed
		}
	}
	if out.ProcessInstanceID <= 0 || out.RefType == "" || out.RefID <= 0 || out.SourceNodeKey == "" || out.SourceCommandKey == "" {
		return ProcessInstanceLinkedBusinessRefRecord{}, ErrBadParam
	}
	return out, nil
}

func normalizeProcessNodeInstanceBlock(in ProcessNodeInstanceBlock) (ProcessNodeInstanceBlock, error) {
	in.Reason = strings.TrimSpace(in.Reason)
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 || in.Reason == "" {
		return ProcessNodeInstanceBlock{}, ErrBadParam
	}
	if in.Outcome == "" {
		in.Outcome = "blocked"
	}
	return in, nil
}

func normalizeProcessNodeDueAtEscalation(in ProcessNodeDueAtEscalation) (ProcessNodeDueAtEscalation, error) {
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.ProcessInstanceID <= 0 || in.ProcessNodeInstanceID <= 0 || in.ExpectedVersion <= 0 {
		return ProcessNodeDueAtEscalation{}, ErrBadParam
	}
	return in, nil
}

func normalizeProcessLinkedWorkflowTaskCompletion(in ProcessLinkedWorkflowTaskCompletion) (ProcessLinkedWorkflowTaskCompletion, error) {
	in.Outcome = strings.TrimSpace(in.Outcome)
	if in.WorkflowTaskID <= 0 {
		return ProcessLinkedWorkflowTaskCompletion{}, ErrBadParam
	}
	return in, nil
}

func workflowTaskPayloadOutcome(task *WorkflowTask) string {
	if task == nil || task.Payload == nil {
		return ""
	}
	for _, key := range []string{"outcome", "decision", "transition_status"} {
		if value, ok := task.Payload[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func workflowTaskRejectionReason(task *WorkflowTask) string {
	if task == nil {
		return ""
	}
	if task.BlockedReason != nil {
		if reason := strings.TrimSpace(*task.BlockedReason); reason != "" {
			return reason
		}
	}
	if task.Payload == nil {
		return ""
	}
	for _, key := range []string{"rejected_reason", "reason"} {
		if value, ok := task.Payload[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func processDomainCommandKeyFromNode(node *ProcessNodeInstance) string {
	if node == nil || node.PolicySnapshot == nil {
		return ""
	}
	if value, ok := node.PolicySnapshot["command_key"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func processWaitEventKeyFromNode(node *ProcessNodeInstance) string {
	if node == nil || node.PolicySnapshot == nil {
		return ""
	}
	if value, ok := node.PolicySnapshot["event_key"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func processBranchPolicyKeyFromNode(node *ProcessNodeInstance) string {
	if node == nil || node.PolicySnapshot == nil {
		return ""
	}
	if value, ok := node.PolicySnapshot["branch_policy_key"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

type processJoinRoute struct {
	NodeKey        string
	Policy         string
	SourceNodeKeys []string
}

type processReturnRoute struct {
	NodeKey     string
	Outcomes    []string
	MaxAttempts int
}

func (route *processReturnRoute) matchesOutcome(outcome *string) bool {
	if route == nil || len(route.Outcomes) == 0 || outcome == nil {
		return false
	}
	normalizedOutcome := strings.ToLower(strings.TrimSpace(*outcome))
	if normalizedOutcome == "" {
		return false
	}
	for _, candidate := range route.Outcomes {
		if normalizedOutcome == strings.ToLower(strings.TrimSpace(candidate)) {
			return true
		}
	}
	return false
}

func processFanOutNodeKeysFromNode(node *ProcessNodeInstance) ([]string, error) {
	if node == nil || node.PolicySnapshot == nil {
		return nil, nil
	}
	value, ok := node.PolicySnapshot["fan_out_node_keys"]
	if !ok {
		return nil, nil
	}
	return normalizeProcessNodeKeyList(value)
}

func processJoinRouteFromNode(node *ProcessNodeInstance) (*processJoinRoute, error) {
	if node == nil || node.PolicySnapshot == nil {
		return nil, nil
	}
	targetValue, ok := node.PolicySnapshot["join_node_key"]
	if !ok {
		return nil, nil
	}
	targetNodeKey, ok := targetValue.(string)
	if !ok {
		return nil, ErrBadParam
	}
	targetNodeKey = strings.TrimSpace(targetNodeKey)
	if targetNodeKey == "" {
		return nil, ErrBadParam
	}
	policy := "all"
	if value, ok := node.PolicySnapshot["join_policy"]; ok {
		policyValue, ok := value.(string)
		if !ok {
			return nil, ErrBadParam
		}
		policy = strings.ToLower(strings.TrimSpace(policyValue))
	}
	if policy != "all" && policy != "any" {
		return nil, ErrBadParam
	}
	sourceValue, ok := node.PolicySnapshot["join_source_node_keys"]
	if !ok {
		return nil, ErrBadParam
	}
	sourceNodeKeys, err := normalizeProcessNodeKeyList(sourceValue)
	if err != nil {
		return nil, err
	}
	return &processJoinRoute{
		NodeKey:        targetNodeKey,
		Policy:         policy,
		SourceNodeKeys: sourceNodeKeys,
	}, nil
}

func processReturnRouteFromNode(node *ProcessNodeInstance) (*processReturnRoute, error) {
	if node == nil || node.PolicySnapshot == nil {
		return nil, nil
	}
	targetValue, ok := node.PolicySnapshot["return_to_node_key"]
	if !ok {
		return nil, nil
	}
	targetNodeKey, ok := targetValue.(string)
	if !ok {
		return nil, ErrBadParam
	}
	targetNodeKey = strings.TrimSpace(targetNodeKey)
	if targetNodeKey == "" {
		return nil, ErrBadParam
	}
	maxAttemptsValue, ok := node.PolicySnapshot["return_max_attempts"]
	if !ok {
		return nil, ErrBadParam
	}
	maxAttempts, err := normalizeProcessPositiveInt(maxAttemptsValue)
	if err != nil {
		return nil, err
	}
	outcomes := []string{"return"}
	if value, ok := node.PolicySnapshot["return_outcomes"]; ok {
		outcomes, err = normalizeProcessStringList(value)
		if err != nil {
			return nil, err
		}
	}
	return &processReturnRoute{
		NodeKey:     targetNodeKey,
		Outcomes:    outcomes,
		MaxAttempts: maxAttempts,
	}, nil
}

func normalizeProcessNodeKeyList(value any) ([]string, error) {
	return normalizeProcessStringList(value)
}

func normalizeProcessStringList(value any) ([]string, error) {
	rawValues, ok := value.([]any)
	if !ok {
		if stringValues, ok := value.([]string); ok {
			rawValues = make([]any, 0, len(stringValues))
			for _, stringValue := range stringValues {
				rawValues = append(rawValues, stringValue)
			}
		} else {
			return nil, ErrBadParam
		}
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(rawValues))
	for _, rawValue := range rawValues {
		nodeKey, ok := rawValue.(string)
		if !ok {
			return nil, ErrBadParam
		}
		nodeKey = strings.TrimSpace(nodeKey)
		if nodeKey == "" || seen[nodeKey] {
			return nil, ErrBadParam
		}
		seen[nodeKey] = true
		out = append(out, nodeKey)
	}
	if len(out) == 0 {
		return nil, ErrBadParam
	}
	return out, nil
}

func normalizeProcessPositiveInt(value any) (int, error) {
	switch typed := value.(type) {
	case int:
		if typed <= 0 {
			return 0, ErrBadParam
		}
		return typed, nil
	case int64:
		if typed <= 0 {
			return 0, ErrBadParam
		}
		return int(typed), nil
	case float64:
		integer := int(typed)
		if typed <= 0 || float64(integer) != typed {
			return 0, ErrBadParam
		}
		return integer, nil
	default:
		return 0, ErrBadParam
	}
}

func cloneProcessPolicySnapshot(in map[string]any) map[string]any {
	if in == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

func collectJoinRouteNodes(nodes []*ProcessNodeInstance, processInstanceID int, route *processJoinRoute) (map[string]string, *ProcessNodeInstance, error) {
	sourceKeySet := map[string]bool{}
	for _, nodeKey := range route.SourceNodeKeys {
		sourceKeySet[nodeKey] = true
	}
	sourceStatuses := map[string]string{}
	var targetNode *ProcessNodeInstance
	for _, node := range nodes {
		if node == nil || node.ProcessInstanceID != processInstanceID {
			continue
		}
		if sourceKeySet[node.NodeKey] {
			if _, exists := sourceStatuses[node.NodeKey]; exists {
				return nil, nil, ErrProcessNodeInstanceConflict
			}
			sourceStatuses[node.NodeKey] = node.Status
		}
		if node.NodeKey == route.NodeKey {
			if targetNode != nil {
				return nil, nil, ErrProcessNodeInstanceConflict
			}
			targetNode = node
		}
	}
	if len(sourceStatuses) != len(sourceKeySet) {
		return nil, nil, ErrProcessNodeInstanceNotFound
	}
	if targetNode == nil {
		return nil, nil, ErrProcessNodeInstanceNotFound
	}
	return sourceStatuses, targetNode, nil
}

func workflowTaskMatchesProcessNode(task *WorkflowTask, expected *WorkflowTaskCreate) bool {
	return task != nil && expected != nil &&
		task.TaskCode == expected.TaskCode &&
		task.TaskGroup == expected.TaskGroup &&
		task.TaskName == expected.TaskName &&
		task.SourceType == expected.SourceType &&
		task.SourceID == expected.SourceID &&
		processOptionalStringPointerMatches(task.SourceNo, expected.SourceNo) &&
		task.OwnerRoleKey == expected.OwnerRoleKey &&
		processOptionalStringPointerMatches(task.OwnerPoolKey, expected.OwnerPoolKey) &&
		processOptionalStringPointerMatches(task.RequiredCapabilityKey, expected.RequiredCapabilityKey) &&
		processOptionalStringPointerMatches(task.ConfigRevision, expected.ConfigRevision) &&
		processOptionalIntPointerMatches(task.ProcessInstanceID, expected.ProcessInstanceID) &&
		processOptionalIntPointerMatches(task.ProcessNodeInstanceID, expected.ProcessNodeInstanceID) &&
		task.Priority == expected.Priority &&
		task.CriticalPath == expected.CriticalPath &&
		processOptionalTimePointerMatches(task.DueAt, expected.DueAt) &&
		workflowTaskPayloadContainsExpectedIntent(task.Payload, expected.Payload)
}

func workflowTaskPayloadContainsExpectedIntent(actual map[string]any, expected map[string]any) bool {
	projected := make(map[string]any, len(expected))
	for key := range expected {
		value, ok := actual[key]
		if !ok {
			return false
		}
		projected[key] = value
	}
	actualHash, actualErr := processCanonicalSHA256(projected)
	expectedHash, expectedErr := processCanonicalSHA256(expected)
	return actualErr == nil && expectedErr == nil && actualHash == expectedHash
}

func processOptionalStringPointerMatches(actual *string, expected *string) bool {
	return actual == nil && expected == nil ||
		actual != nil && expected != nil && *actual == *expected
}

func processOptionalIntPointerMatches(actual *int, expected *int) bool {
	return actual == nil && expected == nil ||
		actual != nil && expected != nil && *actual == *expected
}

func processOptionalTimePointerMatches(actual *time.Time, expected *time.Time) bool {
	return actual == nil && expected == nil ||
		actual != nil && expected != nil && actual.Equal(*expected)
}

func normalizeProcessInstanceCreate(in ProcessInstanceCreate) (ProcessInstanceCreate, error) {
	in.ProcessKey = strings.TrimSpace(in.ProcessKey)
	in.ProcessVersion = strings.TrimSpace(in.ProcessVersion)
	in.ConfigRevision = strings.TrimSpace(in.ConfigRevision)
	in.DefinitionHash = strings.TrimSpace(in.DefinitionHash)
	in.BusinessRefType = strings.TrimSpace(in.BusinessRefType)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Status = normalizeProcessStatus(in.Status)
	if in.ProcessKey == "" ||
		in.ProcessVersion == "" ||
		in.ConfigRevision == "" ||
		in.DefinitionHash == "" ||
		in.BusinessRefType == "" ||
		in.BusinessRefID <= 0 ||
		in.IdempotencyKey == "" ||
		!IsCreatableProcessStatus(in.Status) {
		return ProcessInstanceCreate{}, ErrBadParam
	}
	if in.ModuleContractSnapshot == nil {
		in.ModuleContractSnapshot = map[string]any{}
	}
	for i := range in.Nodes {
		node, err := normalizeProcessNodeInstanceCreate(in.Nodes[i])
		if err != nil {
			return ProcessInstanceCreate{}, err
		}
		in.Nodes[i] = node
	}
	return in, nil
}

func normalizeProcessNodeInstanceCreate(in ProcessNodeInstanceCreate) (ProcessNodeInstanceCreate, error) {
	in.NodeKey = strings.TrimSpace(in.NodeKey)
	in.NodeType = strings.TrimSpace(in.NodeType)
	in.Status = normalizeProcessNodeStatus(in.Status)
	if in.Attempt <= 0 {
		in.Attempt = 1
	}
	if in.NodeKey == "" ||
		!isValidProcessNodeType(in.NodeType) ||
		!IsCreatableProcessNodeStatus(in.Status) {
		return ProcessNodeInstanceCreate{}, ErrBadParam
	}
	if in.RequiredCapabilityKey != nil {
		capability := strings.TrimSpace(*in.RequiredCapabilityKey)
		if capability == "" {
			in.RequiredCapabilityKey = nil
		} else {
			in.RequiredCapabilityKey = &capability
		}
	}
	if in.NodeType == ProcessNodeTypeApproval &&
		(in.RequiredCapabilityKey == nil || *in.RequiredCapabilityKey != PermissionWorkflowTaskApprove) {
		return ProcessNodeInstanceCreate{}, ErrBadParam
	}
	if in.PolicySnapshot == nil {
		in.PolicySnapshot = map[string]any{}
	}
	if in.DueAt != nil {
		dueAt := in.DueAt.UTC().Truncate(time.Microsecond)
		in.DueAt = &dueAt
	}
	return in, nil
}

func NormalizeProcessNodeInstanceCreateForRepo(in ProcessNodeInstanceCreate) (ProcessNodeInstanceCreate, error) {
	return normalizeProcessNodeInstanceCreate(in)
}

func normalizeProcessStatus(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return ProcessStatusActive
	}
	return status
}

func IsKnownProcessStatus(status string) bool {
	switch status {
	case ProcessStatusActive, ProcessStatusCompleted, ProcessStatusBlocked:
		return true
	default:
		return false
	}
}

func IsCreatableProcessStatus(status string) bool {
	return strings.TrimSpace(status) == ProcessStatusActive
}

func normalizeProcessNodeStatus(status string) string {
	status = strings.TrimSpace(status)
	if status == "" {
		return ProcessNodeStatusWaiting
	}
	return status
}

func IsKnownProcessNodeStatus(status string) bool {
	switch status {
	case ProcessNodeStatusWaiting, ProcessNodeStatusActive, ProcessNodeStatusCompleted, ProcessNodeStatusBlocked:
		return true
	default:
		return false
	}
}

func IsCreatableProcessNodeStatus(status string) bool {
	return strings.TrimSpace(status) == ProcessNodeStatusWaiting
}

func isSettledProcessNodeStatus(status string) bool {
	switch status {
	case ProcessNodeStatusCompleted:
		return true
	default:
		return false
	}
}

func isValidProcessNodeType(nodeType string) bool {
	switch nodeType {
	case ProcessNodeTypeHumanTask, ProcessNodeTypeApproval, ProcessNodeTypeDomainCommand, ProcessNodeTypeWaitEvent, ProcessNodeTypeEnd:
		return true
	default:
		return false
	}
}
