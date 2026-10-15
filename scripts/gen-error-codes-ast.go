package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strconv"
)

type definition struct {
	Ident string `json:"ident"`
	Name  string `json:"name"`
	Code  int64  `json:"code"`
}

func definitionLiteral(expr ast.Expr) (*ast.CompositeLit, bool) {
	literal, ok := expr.(*ast.CompositeLit)
	if !ok {
		return nil, false
	}
	ident, ok := literal.Type.(*ast.Ident)
	return literal, ok && ident.Name == "Definition"
}

func stringField(expr ast.Expr, field string) (string, error) {
	literal, ok := expr.(*ast.BasicLit)
	if !ok || literal.Kind != token.STRING {
		return "", fmt.Errorf("Definition.%s must be a string literal", field)
	}
	value, err := strconv.Unquote(literal.Value)
	if err != nil {
		return "", fmt.Errorf("Definition.%s: %w", field, err)
	}
	return value, nil
}

func parseDefinition(ident string, literal *ast.CompositeLit) (definition, error) {
	values := map[string]ast.Expr{}
	for _, element := range literal.Elts {
		item, ok := element.(*ast.KeyValueExpr)
		if !ok {
			return definition{}, fmt.Errorf("%s Definition must use keyed fields", ident)
		}
		key, ok := item.Key.(*ast.Ident)
		if !ok {
			return definition{}, fmt.Errorf("%s Definition has an invalid field", ident)
		}
		if _, exists := values[key.Name]; exists {
			return definition{}, fmt.Errorf("%s Definition repeats field %s", ident, key.Name)
		}
		values[key.Name] = item.Value
	}
	if len(values) != 3 || values["Name"] == nil || values["Code"] == nil || values["Message"] == nil {
		return definition{}, fmt.Errorf("%s Definition must contain exactly Name, Code, and Message", ident)
	}
	name, err := stringField(values["Name"], "Name")
	if err != nil {
		return definition{}, fmt.Errorf("%s: %w", ident, err)
	}
	if name != ident {
		return definition{}, fmt.Errorf("%s Definition.Name must match its identifier", ident)
	}
	if _, err := stringField(values["Message"], "Message"); err != nil {
		return definition{}, fmt.Errorf("%s: %w", ident, err)
	}
	codeLiteral, ok := values["Code"].(*ast.BasicLit)
	if !ok || codeLiteral.Kind != token.INT {
		return definition{}, fmt.Errorf("%s Definition.Code must be an integer literal", ident)
	}
	code, err := strconv.ParseInt(codeLiteral.Value, 0, 32)
	if err != nil {
		return definition{}, fmt.Errorf("%s Definition.Code: %w", ident, err)
	}
	return definition{Ident: ident, Name: name, Code: code}, nil
}

func main() {
	if len(os.Args) != 3 || os.Args[1] != "--catalog" {
		fmt.Fprintln(os.Stderr, "usage: gen-error-codes-ast --catalog <catalog.go>")
		os.Exit(2)
	}
	parsed, err := parser.ParseFile(token.NewFileSet(), os.Args[2], nil, parser.AllErrors)
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse catalog: %v\n", err)
		os.Exit(1)
	}

	byIdent := map[string]definition{}
	var registry []string
	for _, declaration := range parsed.Decls {
		gen, ok := declaration.(*ast.GenDecl)
		if !ok || gen.Tok != token.VAR {
			continue
		}
		for _, spec := range gen.Specs {
			valueSpec, ok := spec.(*ast.ValueSpec)
			if !ok {
				fmt.Fprintln(os.Stderr, "var declaration contains an unsupported specification")
				os.Exit(1)
			}
			for index, value := range valueSpec.Values {
				literal, ok := definitionLiteral(value)
				if !ok {
					continue
				}
				if len(valueSpec.Names) != len(valueSpec.Values) {
					fmt.Fprintln(os.Stderr, "Definition declarations must bind one value per identifier")
					os.Exit(1)
				}
				ident := valueSpec.Names[index].Name
				item, err := parseDefinition(ident, literal)
				if err != nil {
					fmt.Fprintln(os.Stderr, err)
					os.Exit(1)
				}
				if _, exists := byIdent[ident]; exists {
					fmt.Fprintf(os.Stderr, "duplicate Definition identifier: %s\n", ident)
					os.Exit(1)
				}
				byIdent[ident] = item
			}
			if len(valueSpec.Names) == 1 && valueSpec.Names[0].Name == "definitions" && len(valueSpec.Values) == 1 {
				literal, ok := valueSpec.Values[0].(*ast.CompositeLit)
				if !ok {
					fmt.Fprintln(os.Stderr, "definitions registry must be a []Definition composite literal")
					os.Exit(1)
				}
				array, arrayOK := literal.Type.(*ast.ArrayType)
				if !arrayOK || array.Len != nil {
					fmt.Fprintln(os.Stderr, "definitions registry must be a []Definition composite literal")
					os.Exit(1)
				}
				element, elementOK := array.Elt.(*ast.Ident)
				if !elementOK || element.Name != "Definition" {
					fmt.Fprintln(os.Stderr, "definitions registry must be a []Definition composite literal")
					os.Exit(1)
				}
				for _, entry := range literal.Elts {
					ident, ok := entry.(*ast.Ident)
					if !ok {
						fmt.Fprintln(os.Stderr, "definitions registry entries must be identifiers")
						os.Exit(1)
					}
					registry = append(registry, ident.Name)
				}
			}
		}
	}
	if len(registry) == 0 {
		fmt.Fprintln(os.Stderr, "definitions registry is missing or empty")
		os.Exit(1)
	}
	if len(registry) != len(byIdent) {
		fmt.Fprintln(os.Stderr, "definitions registry and Definition declarations differ")
		os.Exit(1)
	}
	ordered := make([]definition, 0, len(registry))
	seen := map[string]bool{}
	for _, ident := range registry {
		if seen[ident] {
			fmt.Fprintf(os.Stderr, "definitions registry repeats identifier: %s\n", ident)
			os.Exit(1)
		}
		seen[ident] = true
		item, ok := byIdent[ident]
		if !ok {
			fmt.Fprintf(os.Stderr, "definitions registry references non-literal Definition: %s\n", ident)
			os.Exit(1)
		}
		ordered = append(ordered, item)
	}
	if err := json.NewEncoder(os.Stdout).Encode(ordered); err != nil {
		fmt.Fprintf(os.Stderr, "encode definitions: %v\n", err)
		os.Exit(1)
	}
}
