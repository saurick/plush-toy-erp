package biz

import (
	_ "embed"
	"encoding/json"
	"strconv"
)

//go:embed workflow_task_catalog.json
var workflowTaskCatalogJSON []byte

type WorkflowTaskStage struct {
	Key, Label, Group, Module, Chain             string
	Groups, Sources, Operations, Gates, Keywords []string
}

type WorkflowTaskDiscoveryCatalog struct {
	Stages          []WorkflowTaskStage
	Chains, Modules []struct{ Key, Label string }
}

var workflowTaskDiscoveryCatalog = func() WorkflowTaskDiscoveryCatalog {
	var catalog WorkflowTaskDiscoveryCatalog
	if err := json.Unmarshal(workflowTaskCatalogJSON, &catalog); err != nil {
		panic(err)
	}
	return catalog
}()

func WorkflowTaskStages() []WorkflowTaskStage {
	return append([]WorkflowTaskStage(nil), workflowTaskDiscoveryCatalog.Stages...)
}

// Discovery filters narrow the existing visibility scope; they grant no access.
type WorkflowTaskDiscoveryFilter struct {
	ModuleKey string `json:"module_key,omitempty"`
	StageKey  string `json:"stage_key,omitempty"`
	ChainKey  string `json:"chain_key,omitempty"`
	Assignee  string `json:"assignee,omitempty"`
}

func ValidWorkflowTaskDiscoveryFilter(f WorkflowTaskDiscoveryFilter) bool {
	module, stage, chain := f.ModuleKey == "", f.StageKey == "", f.ChainKey == ""
	for _, s := range workflowTaskDiscoveryCatalog.Stages {
		module = module || s.Module == f.ModuleKey
		stage = stage || s.Key == f.StageKey
		chain = chain || s.Chain == f.ChainKey
	}
	person := f.Assignee == "" || f.Assignee == "unassigned"
	if n, err := strconv.Atoi(f.Assignee); err == nil && n > 0 && n <= 9007199254740991 && strconv.Itoa(n) == f.Assignee {
		person = true
	}
	return module && stage && chain && person
}

type WorkflowTaskDiscovery struct {
	StageKey     string `json:"stage_key"`
	ModuleKey    string `json:"module_key"`
	ChainKey     string `json:"chain_key"`
	Path         string `json:"path"`
	AssigneeName string `json:"assignee_name"`
}

func WorkflowTaskDiscoveryFor(stageKey, assigneeName string) *WorkflowTaskDiscovery {
	for _, s := range workflowTaskDiscoveryCatalog.Stages {
		if s.Key != stageKey {
			continue
		}
		chainLabel := ""
		for _, chain := range workflowTaskDiscoveryCatalog.Chains {
			if chain.Key == s.Chain {
				chainLabel = chain.Label
			}
		}
		return &WorkflowTaskDiscovery{StageKey: s.Key, ModuleKey: s.Module, ChainKey: s.Chain, Path: chainLabel + " / " + s.Group + " / " + s.Label, AssigneeName: assigneeName}
	}
	return nil
}
