package schema

import "entgo.io/ent"

func mutationTouchesAny(m ent.Mutation, fields map[string]struct{}) bool {
	for _, name := range m.Fields() {
		if _, ok := fields[name]; ok {
			return true
		}
	}
	for _, name := range m.ClearedFields() {
		if _, ok := fields[name]; ok {
			return true
		}
	}
	for _, name := range m.AddedFields() {
		if _, ok := fields[name]; ok {
			return true
		}
	}
	return false
}

func mutationTouchesEdges(m ent.Mutation) bool {
	return len(m.AddedEdges()) > 0 || len(m.RemovedEdges()) > 0 || len(m.ClearedEdges()) > 0
}
