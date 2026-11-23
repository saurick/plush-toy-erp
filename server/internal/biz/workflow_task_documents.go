package biz

import "strings"

// 同一来源对象的现有存储标识共用分类；分类只约束读取，不改写任务来源。
type WorkflowDocumentType struct {
	Key        string   `json:"key"`
	Label      string   `json:"label"`
	Sources    []string `json:"sources"`
	SectionKey string   `json:"section_key"`
}

func WorkflowDocumentTypes() []WorkflowDocumentType {
	return append([]WorkflowDocumentType(nil), workflowTaskDiscoveryCatalog.Documents...)
}

func WorkflowDocumentTypeFor(source string) (WorkflowDocumentType, bool) {
	for _, document := range workflowTaskDiscoveryCatalog.Documents {
		for _, member := range document.Sources {
			if source == member {
				return document, true
			}
		}
	}
	return WorkflowDocumentType{}, false
}

func WorkflowDocumentTypeKey(source string) string {
	source = strings.TrimSpace(source)
	if document, ok := WorkflowDocumentTypeFor(source); ok {
		return document.Key
	}
	return source
}

func WorkflowDocumentSourceTypes(source string) []string {
	if document, ok := WorkflowDocumentTypeFor(source); ok {
		return append([]string(nil), document.Sources...)
	}
	return []string{source}
}

func WorkflowDocumentSectionSourceTypes(section string) []string {
	var sources []string
	for _, document := range workflowTaskDiscoveryCatalog.Documents {
		if document.SectionKey == section {
			sources = append(sources, document.Sources...)
		}
	}
	return sources
}

func validWorkflowDocumentSectionFilter(section, source string) bool {
	if section == "" {
		return true
	}
	if source != "" {
		document, ok := WorkflowDocumentTypeFor(source)
		return ok && document.SectionKey == section
	}
	return len(WorkflowDocumentSectionSourceTypes(section)) > 0
}
