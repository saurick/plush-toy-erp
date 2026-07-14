package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"gopkg.in/yaml.v3"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: go run ../scripts/qa/ci-workflow-yaml-check.go ../.github/workflows/ci.yml")
		os.Exit(2)
	}

	source, err := os.ReadFile(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "[qa:ci-yaml] read workflow: %v\n", err)
		os.Exit(1)
	}

	decoder := yaml.NewDecoder(bytes.NewReader(source))
	var document any
	if err := decoder.Decode(&document); err != nil {
		fmt.Fprintf(os.Stderr, "[qa:ci-yaml] parse workflow: %v\n", err)
		os.Exit(1)
	}

	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			fmt.Fprintln(os.Stderr, "[qa:ci-yaml] workflow must contain exactly one YAML document")
		} else {
			fmt.Fprintf(os.Stderr, "[qa:ci-yaml] parse trailing document: %v\n", err)
		}
		os.Exit(1)
	}

	if err := json.NewEncoder(os.Stdout).Encode(document); err != nil {
		fmt.Fprintf(os.Stderr, "[qa:ci-yaml] encode workflow: %v\n", err)
		os.Exit(1)
	}
}
