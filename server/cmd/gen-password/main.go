package main

import (
	"bytes"
	"fmt"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
	"io"
	"os"
)

func main() {
	if len(os.Args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: gen-password (read password from terminal or stdin)")
		os.Exit(1)
	}
	var password []byte
	var err error
	if term.IsTerminal(int(os.Stdin.Fd())) {
		fmt.Fprint(os.Stderr, "Password: ")
		password, err = term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
	} else {
		password, err = io.ReadAll(io.LimitReader(os.Stdin, 75))
		password = bytes.TrimSuffix(password, []byte("\n"))
		password = bytes.TrimSuffix(password, []byte("\r"))
	}
	if err != nil || len(password) == 0 || len(password) > 72 {
		fmt.Fprintln(os.Stderr, "password input must contain 1 to 72 bytes")
		os.Exit(1)
	}
	hash, err := bcrypt.GenerateFromPassword(password, bcrypt.DefaultCost)
	clear(password)
	if err != nil {
		fmt.Fprintln(os.Stderr, "password hashing failed")
		os.Exit(1)
	}
	fmt.Println(string(hash))
}
