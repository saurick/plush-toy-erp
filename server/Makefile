GOHOSTOS:=$(shell go env GOHOSTOS)
# ⚠️ 注意：数据库迁移必须使用 `make data` 生成，严禁手动修改 SQL 文件！详见 internal/data/AI_DB_WORKFLOW.md
GOPATH:=$(shell go env GOPATH)

# ========================
# Git 信息（兼容在子目录执行 & 没有提交的情况）
# ========================
GIT_ROOT := $(shell git rev-parse --show-toplevel 2>/dev/null)

ifeq ($(GIT_ROOT),)
  VERSION       := local
  GIT_SHA       := local
  GIT_SHA_SHORT := local
  GIT_DIRTY     :=
else
  # 工作区是否有未提交改动（包含 staged/unstaged/未跟踪）
  GIT_DIRTY     := $(shell cd "$(GIT_ROOT)" 2>/dev/null && test -n "$$(git status --porcelain)" && echo "-local" || echo "")

  VERSION       := $(shell git -C "$(GIT_ROOT)" describe --tags --always 2>/dev/null || echo local)

  # 有 commit 就取 sha；如果仓库还没 commit（或异常）就 local
  GIT_SHA       := $(shell sh -c 'cd "$(GIT_ROOT)" && git rev-parse --verify HEAD >/dev/null 2>&1 && git rev-parse HEAD || echo local')$(GIT_DIRTY)
  GIT_SHA_SHORT := $(shell sh -c 'cd "$(GIT_ROOT)" && git rev-parse --verify HEAD >/dev/null 2>&1 && git rev-parse --short=8 HEAD || echo local')$(GIT_DIRTY)
endif

BUILD_TIME ?= $(shell date +"%Y%m%dT%H%M%S")
IMAGE_TAG  := $(BUILD_TIME)-$(GIT_SHA_SHORT)
# 镜像仓库地址先留空，export DOCKER_HOST=xxx，xxx为镜像仓库地址，后再执行 make build_server 即可
DOCKER_HOST ?=
IMAGE_NAME = $(if $(DOCKER_HOST),$(DOCKER_HOST)/plush-toy-erp-server,$(NULL)plush-toy-erp-server)

ifeq ($(GOHOSTOS), windows)
	Git_Bash=$(subst \,/,$(subst cmd\,bin\bash.exe,$(dir $(shell where git))))
	INTERNAL_PROTO_FILES=$(shell $(Git_Bash) -c "find internal -name *.proto")
	API_PROTO_FILES=$(shell $(Git_Bash) -c "find api -name *.proto")
else
	INTERNAL_PROTO_FILES=$(shell find internal -name *.proto)
	API_PROTO_FILES=$(shell find api -name *.proto)
endif

.PHONY: init
# init env
init:
	go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
	go install github.com/go-kratos/kratos/cmd/kratos/v2@latest
	go install github.com/go-kratos/kratos/cmd/protoc-gen-go-http/v2@latest
	go install github.com/google/gnostic/cmd/protoc-gen-openapi@latest
	go install github.com/google/wire/cmd/wire@latest

.PHONY: config
# generate internal proto
config:
	protoc --proto_path=./internal \
	       --proto_path=./third_party \
 	       --go_out=paths=source_relative:./internal \
	       $(INTERNAL_PROTO_FILES)

# 自动收集 api 目录下所有 .proto 文件
API_PROTO_FILES := $(shell find api -name '*.proto')

# api：使用 protoc 一次性生成
#   - Go 结构体 (*.pb.go)
#   - gRPC 接口代码 (*_grpc.pb.go)
#   - gRPC-Gateway 反向代理 (*_gw.go)，rest -> grpc
#   - Kratos HTTP Handler (*_http.pb.go)
#   - OpenAPI / Swagger 文档 (swagger.json)
.PHONY: api
api:
	@echo ">>> Generating proto files..."
	protoc --proto_path=. \
	       --proto_path=./third_party \
	       --go_out=paths=source_relative:. \
	       --go-grpc_out=paths=source_relative:. \
	       --grpc-gateway_out=paths=source_relative:. \
	       --go-http_out=paths=source_relative:. \
	       --openapiv2_out . \
	       $(API_PROTO_FILES)

.PHONY: build
# build
build:
	mkdir -p bin/ && go build -ldflags "-X main.Version=$(VERSION)" -o ./bin/ ./...

.PHONY: production_preflight
production_preflight:
	@cd "$(GIT_ROOT)" && bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env

.PHONY: build_linux
build_linux:
	mkdir -p bin/ && GOOS=linux GOARCH=amd64 go build -ldflags "-X main.Version=$(VERSION)" -o ./bin/ ./...

.PHONY: generate
# generate
generate:
	go mod tidy
	go get github.com/google/wire/cmd/wire@latest
	go generate ./...

.PHONY: validate
# generate validate proto
validate:
	protoc --proto_path=. \
           --proto_path=./third_party \
           --go_out=paths=source_relative:. \
           --validate_out=paths=source_relative,lang=go:. \
           $(API_PROTO_FILES)

.PHONY: all
# generate all
all:
	make api;
	make config;
	make generate;

.PHONY: ent_migrate
# 生成 migration（仅生成，不执行）
ent_migrate:
	@if ! command -v atlas >/dev/null 2>&1; then \
		echo "Installing Atlas..."; \
		curl -sSf https://atlasgo.sh | sh; \
	fi
	atlas migrate diff migrate \
		--dir "file://internal/data/model/migrate" \
		--to "ent://internal/data/model/schema" \
		--dev-url "docker://postgres/18/dev?search_path=public"

# 重新计算迁移目录校验，如果改了 migration 的 sql 文件，必须重新计算校验，否则migrate_apply会报错，提示Error: checksum mismatch
.PHONY: migrate_hash
migrate_hash:
	atlas migrate hash --dir "file://internal/data/model/migrate"

ENV_FILE := .env

ifneq ("$(wildcard $(ENV_FILE))","")
  include $(ENV_FILE)
  export
endif	

.PHONY: migrate_apply
# 将 migration 执行到数据库（需要你确认）
migrate_apply:
	@URL=$$(go run ./cmd/dburl -conf ./configs/dev/config.yaml); \
	if [ "$$USE_ENV_DB_URL" = "1" ] && [ -n "$$DB_URL" ]; then \
		URL="$$DB_URL"; \
		echo "USE_ENV_DB_URL=1, use DB_URL from environment"; \
	elif [ -n "$$DB_URL" ]; then \
		echo "DB_URL is set but ignored by default. Set USE_ENV_DB_URL=1 to use it."; \
	fi; \
	echo "using DB_URL=$$URL"; \
	atlas migrate apply \
		--dir "file://internal/data/model/migrate" \
		--url "$$URL"

.PHONY: print_db_url
print_db_url:
	@go run ./cmd/dburl -conf ./configs/dev/config.yaml && echo

.PHONY: seed_role_demo_admins
# 显式生成开发/验收角色演示账号；密码请通过 ERP_ROLE_DEMO_PASSWORD 或命令参数传入。
seed_role_demo_admins:
	go run ./cmd/seed-role-demo-admins -conf ./configs/dev/config.yaml

.PHONY: migrate_status
migrate_status:
	@URL=$$(go run ./cmd/dburl -conf ./configs/dev/config.yaml); \
	if [ "$$USE_ENV_DB_URL" = "1" ] && [ -n "$$DB_URL" ]; then \
		URL="$$DB_URL"; \
		echo "USE_ENV_DB_URL=1, use DB_URL from environment"; \
	elif [ -n "$$DB_URL" ]; then \
		echo "DB_URL is set but ignored by default. Set USE_ENV_DB_URL=1 to use it."; \
	fi; \
	echo "using DB_URL=$$URL"; \
	atlas migrate status --dir "file://internal/data/model/migrate" --url "$$URL"

.PHONY: migrate_set
# 标记某个 migration 已应用（用于修复已手动执行但迁移状态未记录的情况）
migrate_set:
	@if [ -z "$$DB_URL" ]; then \
		echo "ERROR: DB_URL is not set. Example: export DB_URL=postgres://test_user:change-this-shared-postgres-password@192.168.0.106:5432/plush_erp?sslmode=disable"; \
		exit 1; \
	fi
	@if [ -z "$$MIGRATE_VERSION" ]; then \
		echo "ERROR: MIGRATE_VERSION is not set. Example: MIGRATE_VERSION=20260115080747"; \
		exit 1; \
	fi
	atlas migrate set \
		--dir "file://internal/data/model/migrate" \
		--url "$$DB_URL" \
		"$$MIGRATE_VERSION"

.PHONY: ent_generate
# 用 ent generate 生成 ent 代码
ent_generate:
	go run -mod=mod entgo.io/ent/cmd/ent generate --target ./internal/data/model/ent ./internal/data/model/schema

.PHONY: data
# 最推荐流程：只生成 diff，不自动 apply
data: ent_migrate ent_generate

.PHONY: db_create
db_create:
	@if [ -z "$$DB_URL" ]; then \
		echo "ERROR: DB_URL is not set"; exit 1; \
	fi
	@python3 -c 'import sys, urllib.parse; u = urllib.parse.urlparse(sys.argv[1]); db = (u.path or "").lstrip("/"); admin = u._replace(path="/postgres"); print(db); print(urllib.parse.urlunparse(admin))' "$$DB_URL" | { \
		read DBNAME; \
		read ADMIN_URL; \
		echo "Creating database $$DBNAME ..."; \
		psql "$$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$$DBNAME\"" 2>/dev/null || psql "$$ADMIN_URL" -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = '$$DBNAME'" >/dev/null; \
	}

INVENTORY_PG_DB_URL ?= postgres://postgres:inventory-local-password@127.0.0.1:55432/plush_erp_inventory_test?sslmode=disable
BOM_LOT_PG_DB_URL ?= postgres://postgres:bom-lot-local-password@127.0.0.1:55432/plush_erp_bom_lot_test?sslmode=disable
PURCHASE_RECEIPT_PG_DB_URL ?= postgres://postgres:purchase-receipt-local-password@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable
PURCHASE_RETURN_PG_DB_URL ?= postgres://postgres:purchase-return-local-password@127.0.0.1:55432/plush_erp_purchase_return_test?sslmode=disable

.PHONY: inventory_pg_createdb inventory_migrate_status inventory_migrate_apply inventory_pg_test inventory_pg_dropdb
inventory_pg_createdb:
	@INVENTORY_PG_DB_URL="$(INVENTORY_PG_DB_URL)" bash ../scripts/inventory-pg.sh createdb
inventory_migrate_status:
	@INVENTORY_PG_DB_URL="$(INVENTORY_PG_DB_URL)" bash ../scripts/inventory-pg.sh status
inventory_migrate_apply:
	@INVENTORY_PG_DB_URL="$(INVENTORY_PG_DB_URL)" bash ../scripts/inventory-pg.sh apply
inventory_pg_test:
	@INVENTORY_PG_DB_URL="$(INVENTORY_PG_DB_URL)" bash ../scripts/inventory-pg.sh test
inventory_pg_dropdb:
	@INVENTORY_PG_DB_URL="$(INVENTORY_PG_DB_URL)" bash ../scripts/inventory-pg.sh dropdb

.PHONY: bom_lot_pg_createdb bom_lot_migrate_status bom_lot_migrate_apply bom_lot_pg_test bom_lot_pg_dropdb
bom_lot_pg_createdb:
	@BOM_LOT_PG_DB_URL="$(BOM_LOT_PG_DB_URL)" bash ../scripts/bom-lot-pg.sh createdb
bom_lot_migrate_status:
	@BOM_LOT_PG_DB_URL="$(BOM_LOT_PG_DB_URL)" bash ../scripts/bom-lot-pg.sh status
bom_lot_migrate_apply:
	@BOM_LOT_PG_DB_URL="$(BOM_LOT_PG_DB_URL)" bash ../scripts/bom-lot-pg.sh apply
bom_lot_pg_test:
	@BOM_LOT_PG_DB_URL="$(BOM_LOT_PG_DB_URL)" bash ../scripts/bom-lot-pg.sh test
bom_lot_pg_dropdb:
	@BOM_LOT_PG_DB_URL="$(BOM_LOT_PG_DB_URL)" bash ../scripts/bom-lot-pg.sh dropdb

.PHONY: purchase_receipt_pg_createdb purchase_receipt_migrate_status purchase_receipt_migrate_apply purchase_receipt_pg_test purchase_receipt_pg_dropdb
purchase_receipt_pg_createdb:
	@PURCHASE_RECEIPT_PG_DB_URL="$(PURCHASE_RECEIPT_PG_DB_URL)" bash ../scripts/purchase-receipt-pg.sh createdb
purchase_receipt_migrate_status:
	@PURCHASE_RECEIPT_PG_DB_URL="$(PURCHASE_RECEIPT_PG_DB_URL)" bash ../scripts/purchase-receipt-pg.sh status
purchase_receipt_migrate_apply:
	@PURCHASE_RECEIPT_PG_DB_URL="$(PURCHASE_RECEIPT_PG_DB_URL)" bash ../scripts/purchase-receipt-pg.sh apply
purchase_receipt_pg_test:
	@PURCHASE_RECEIPT_PG_DB_URL="$(PURCHASE_RECEIPT_PG_DB_URL)" bash ../scripts/purchase-receipt-pg.sh test
purchase_receipt_pg_dropdb:
	@PURCHASE_RECEIPT_PG_DB_URL="$(PURCHASE_RECEIPT_PG_DB_URL)" bash ../scripts/purchase-receipt-pg.sh dropdb

.PHONY: purchase_return_pg_createdb purchase_return_migrate_status purchase_return_migrate_apply purchase_return_pg_test purchase_return_pg_dropdb
purchase_return_pg_createdb:
	@PURCHASE_RETURN_PG_DB_URL="$(PURCHASE_RETURN_PG_DB_URL)" bash ../scripts/purchase-return-pg.sh createdb
purchase_return_migrate_status:
	@PURCHASE_RETURN_PG_DB_URL="$(PURCHASE_RETURN_PG_DB_URL)" bash ../scripts/purchase-return-pg.sh status
purchase_return_migrate_apply:
	@PURCHASE_RETURN_PG_DB_URL="$(PURCHASE_RETURN_PG_DB_URL)" bash ../scripts/purchase-return-pg.sh apply
purchase_return_pg_test:
	@PURCHASE_RETURN_PG_DB_URL="$(PURCHASE_RETURN_PG_DB_URL)" bash ../scripts/purchase-return-pg.sh test
purchase_return_pg_dropdb:
	@PURCHASE_RETURN_PG_DB_URL="$(PURCHASE_RETURN_PG_DB_URL)" bash ../scripts/purchase-return-pg.sh dropdb

# show help
help:
	@echo ''
	@echo 'Usage:'
	@echo ' make [target]'
	@echo ''
	@echo 'Targets:'
	@awk '/^[a-zA-Z\-\_0-9]+:/ { \
	helpMessage = match(lastLine, /^# (.*)/); \
		if (helpMessage) { \
			helpCommand = substr($$1, 0, index($$1, ":")); \
			helpMessage = substr(lastLine, RSTART + 2, RLENGTH); \
			printf "\033[36m%-22s\033[0m %s\n", helpCommand,helpMessage; \
		} \
	} \
	{ lastLine = $$0 }' $(MAKEFILE_LIST)

.DEFAULT_GOAL := help


# ========================
# Local Dev Run (替代 kratos run，避免 LuLu 每次弹窗)
# ========================

MAIN_PKG ?= ./cmd/server
DEV_BIN ?= ./bin/server-dev
ARGS ?=

# 当前项目本地 dev 会占用的端口；dev_stop/dev_restart 只清理这些端口，避免误杀别的项目。
DEV_PORTS ?= 8300 9300

.PHONY: dev_build
# build dev binary (stable path)
dev_build:
	@mkdir -p $(dir $(DEV_BIN))
	@echo ">>> building $(DEV_BIN) from $(MAIN_PKG)"
	@go build -ldflags "-X main.Version=$(VERSION)" -o $(DEV_BIN) $(MAIN_PKG)

.PHONY: run
# run dev binary (stable path)
run: dev_build
	@echo ">>> running: $(DEV_BIN) $(ARGS)"
	@$(DEV_BIN) $(ARGS)

.PHONY: dev
# alias of run
dev: run

.PHONY: dev_stop
# stop local dev process by known ports (兼容 macOS / Ubuntu)
dev_stop:
	@echo ">>> stopping dev listeners on: $(DEV_PORTS)"
	@for p in $(DEV_PORTS); do \
		if command -v lsof >/dev/null 2>&1; then \
			pids="$$(lsof -tiTCP:$$p -sTCP:LISTEN 2>/dev/null || true)"; \
			if [ -n "$$pids" ]; then \
				echo ">>> kill port $$p via lsof: $$pids"; \
				kill $$pids 2>/dev/null || true; \
			fi; \
		elif command -v fuser >/dev/null 2>&1; then \
			echo ">>> kill port $$p via fuser"; \
			fuser -k $$p/tcp >/dev/null 2>&1 || true; \
		else \
			echo "ERROR: neither lsof nor fuser is available; cannot stop port $$p"; \
			exit 1; \
		fi; \
	done
	@sleep 1
	@for p in $(DEV_PORTS); do \
		if command -v lsof >/dev/null 2>&1; then \
			pids="$$(lsof -tiTCP:$$p -sTCP:LISTEN 2>/dev/null || true)"; \
			if [ -n "$$pids" ]; then \
				echo ">>> force kill port $$p: $$pids"; \
				kill -9 $$pids 2>/dev/null || true; \
			fi; \
		fi; \
	done

.PHONY: dev_restart
# restart local dev binary after clearing stale listeners
dev_restart: dev_stop dev

.PHONY: clean_dev
# clean dev binary
clean_dev:
	@rm -f $(DEV_BIN)

# 清理 dangling / builder 缓存
.PHONY: docker_prune
docker_prune:
	@echo ">>> Pruning build cache and dangling images..."
	@docker builder prune -f
	@docker image prune -f

# ========================
# Docker 构建 / 推送
# ========================

# 保留本地最新 N 个镜像（同一个 repo:tag 列表里按创建时间）
KEEP_IMAGES ?= 4

.PHONY: image_gc
image_gc:
	@echo ">>> Keeping latest $(KEEP_IMAGES) images for $(IMAGE_NAME), removing older ones..."
	@docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' '$(IMAGE_NAME)' \
		| sort -rk2 \
		| awk 'NR>$(KEEP_IMAGES){print $$1}' \
		| xargs -r docker rmi -f || true

.PHONY: build_server push_server

# 本地/开发环境额外打一个固定tag，可以是dev或者latest
# 部署时就可以一直写 plush-toy-erp-server:dev（或 :latest）
FIXED_TAG ?= dev
NODE_BUILDER_IMAGE ?= node:24.14.0
GO_BUILDER_IMAGE ?= golang:1.26.2
RUNTIME_BASE_IMAGE ?= debian:bookworm-slim

# 构建服务器镜像（在 server/ 目录执行）
build_server:
	docker build \
		--build-arg NODE_BUILDER_IMAGE="$(NODE_BUILDER_IMAGE)" \
		--build-arg GO_BUILDER_IMAGE="$(GO_BUILDER_IMAGE)" \
		--build-arg RUNTIME_BASE_IMAGE="$(RUNTIME_BASE_IMAGE)" \
		--build-arg GIT_SHA="$(GIT_SHA)" \
		--build-arg GIT_SHA_SHORT="$(GIT_SHA_SHORT)" \
		--build-arg BUILD_TIME="$(BUILD_TIME)" \
		--build-arg IMAGE_TAG="$(IMAGE_TAG)" \
		-f Dockerfile \
		-t $(IMAGE_NAME):$(IMAGE_TAG) \
		-t $(IMAGE_NAME):$(FIXED_TAG) ..
	@$(MAKE) image_gc

# 推送服务器镜像
push_server:
	@if [ -z "$(DOCKER_HOST)" ]; then echo "ERROR: DOCKER_HOST is empty"; exit 1; fi
	docker push $(IMAGE_NAME):$(IMAGE_TAG)
	docker push $(IMAGE_NAME):$(FIXED_TAG)
