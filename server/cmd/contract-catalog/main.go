package main

import (
	"encoding/json"
	"fmt"
	"os"

	"server/internal/biz"
)

func main() {
	payload := map[string]any{
		"processDefinitions": biz.CanonicalCustomerProcessContractDefinitions(),
		"branchTargets":      biz.CanonicalProcessBranchTargets(),
	}
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fmt.Fprintf(os.Stderr, "encode canonical contract catalog: %v\n", err)
		os.Exit(1)
	}
}
