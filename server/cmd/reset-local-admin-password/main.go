package main

import (
	"context"
	"fmt"
	"os"

	"server/internal/admincredential"
)

func main() {
	if err := admincredential.Run(context.Background(), os.Args[1:], os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
