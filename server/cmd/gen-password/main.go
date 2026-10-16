// server/cmd/gen-password/main.go
package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Println("usage: gen-password <plain_password>")
		os.Exit(1)
	}

	// 生成 bcrypt 哈希密码
	// 示例：需要更新默认管理员密码时，可先运行：
	//   go run ./cmd/gen-password 'change-this-prod-admin-password'
	hash, err := bcrypt.GenerateFromPassword(
		[]byte(os.Args[1]),
		bcrypt.DefaultCost,
	)
	if err != nil {
		panic(err)
	}

	fmt.Println(string(hash))
}
