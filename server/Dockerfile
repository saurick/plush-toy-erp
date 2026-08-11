# server/Dockerfile

# 默认保持 linux/amd64 运行时；若后续需要其他架构，统一覆盖平台与 Go 目标参数。
ARG BUILDPLATFORM=linux/amd64
ARG RUNTIMEPLATFORM=linux/amd64
ARG GO_TARGETOS=linux
ARG GO_TARGETARCH=amd64
ARG NODE_BUILDER_IMAGE=node:24.14.0
ARG GO_BUILDER_IMAGE=golang:1.26.5
ARG WEB_RUNTIME_BASE_IMAGE=node:24.14.0-slim
ARG RUNTIME_BASE_IMAGE=debian:bookworm-slim
# Debian 12 的 Chromium 150.0.7871.46 在部分宿主运行时会 SIGTRAP。
# 版本升级必须显式修改本参数，并重新通过容器启动与真实 PDF 发布烟测。
ARG CHROMIUM_VERSION=150.0.7871.100-1~deb12u1

# ======================
# 1) 构建前端静态文件
# ======================
# 与根目录 .n-node-version 对齐，避免容器与本地 Node 小版本漂移；同时保留 build arg，便于在受限网络下切换镜像源。
FROM --platform=$BUILDPLATFORM ${NODE_BUILDER_IMAGE} AS web-builder

WORKDIR /web

COPY web/package.json web/pnpm-lock.yaml ./
RUN --mount=type=cache,id=plush-npm,target=/root/.npm,sharing=locked \
    --mount=type=cache,id=plush-pnpm,target=/web/.pnpm-store,sharing=locked \
    npm install -g pnpm@10.13.1 && \
    pnpm config set store-dir /web/.pnpm-store && \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --frozen-lockfile

COPY web/src ./src
COPY web/public ./public
COPY web/index.html ./
# Vite config and its committed production dependency graph move together.
# DEV-only workbench plugins are dynamically loaded only for development serve,
# so release builds do not copy their broad scripts/deploy dependency graph.
COPY web/*.mjs ./
COPY web/tailwind.config.js ./
COPY web/postcss.config.js ./
COPY config /config
# CI 已生成并校验 committed error-code projection；Node-only builder 不安装 Go。
# 生产 Vite 配置只读取端口/API 规范；客户配置叠加只需要一个构建脚本。
COPY scripts/dev-ports.mjs scripts/local-runtime-preflight-core.mjs /scripts/
COPY scripts/build/apply-customer-web-config.mjs /scripts/build/apply-customer-web-config.mjs
ARG ERP_CUSTOMER_PACKAGE=
ARG GIT_SHA=
ARG RELEASE_VERSION=
ENV VITE_GIT_SHA=${GIT_SHA}
ENV VITE_RELEASE_VERSION=${RELEASE_VERSION}
RUN pnpm run build:committed && \
    node /scripts/build/apply-customer-web-config.mjs \
      --customer "${ERP_CUSTOMER_PACKAGE}" \
      --config-root /config \
      --web-build-dir /web/build

# ======================
# 2) 独立 Web runtime；正式发布与 Server 共用上面的唯一前端构建
# ======================
FROM --platform=$RUNTIMEPLATFORM ${WEB_RUNTIME_BASE_IMAGE} AS web-runtime

ARG GIT_SHA
ARG RELEASE_VERSION

ENV NODE_ENV=production
ENV GIT_SHA=${GIT_SHA}
ENV RELEASE_VERSION=${RELEASE_VERSION}
ENV HOST=0.0.0.0
ENV APP_ID=desktop
ENV PORT=5175
ENV API_ORIGIN=
ENV PROXY_PREFIXES=/rpc,/templates
ENV PROXY_TIMEOUT_MS=30000

WORKDIR /app

COPY --from=web-builder /web/build ./build
COPY web/scripts/serveStaticApp.mjs ./scripts/serveStaticApp.mjs

USER node

EXPOSE 5175

CMD ["node", "scripts/serveStaticApp.mjs"]

# ======================
# 3) Go builder
# ======================
FROM --platform=$BUILDPLATFORM ${GO_BUILDER_IMAGE} AS go-builder

ARG GO_TARGETOS
ARG GO_TARGETARCH

WORKDIR /src

ADD server/go.mod ./go.mod
ADD server/go.sum ./go.sum

RUN go env -w GOPROXY=https://goproxy.cn\|https://proxy.golang.org\|direct

RUN --mount=type=cache,id=plush-gomod,target=/go/pkg/mod \
    --mount=type=cache,id=plush-gobuild,target=/root/.cache/go-build \
    go mod download

COPY server/ /src

ENV CGO_ENABLED=0

ARG GIT_SHA

ENV GIT_SHA=${GIT_SHA}
ENV TZ=Asia/Shanghai

# Go 二进制跟随目标参数，避免镜像架构与可执行文件不一致。
RUN --mount=type=cache,id=plush-gomod,target=/go/pkg/mod \
    --mount=type=cache,id=plush-gobuild,target=/root/.cache/go-build \
    mkdir -p bin && \
    GOOS=${GO_TARGETOS} GOARCH=${GO_TARGETARCH} go build \
      -ldflags "-X main.Version=${GIT_SHA}" \
      -o ./bin/server ./cmd/server && \
    GOOS=${GO_TARGETOS} GOARCH=${GO_TARGETARCH} go build \
      -ldflags "-X main.Version=${GIT_SHA}" \
      -o ./bin/bootstrap-manual-acceptance-core ./cmd/bootstrap-manual-acceptance-core && \
    GOOS=${GO_TARGETOS} GOARCH=${GO_TARGETARCH} go build \
      -ldflags "-X main.Version=${GIT_SHA}" \
      -o ./bin/rotate-manual-acceptance-passwords ./cmd/rotate-manual-acceptance-passwords

# ======================
# 4) Server runtime；复用同一 web-builder，不再次编译前端
# ======================
FROM --platform=$RUNTIMEPLATFORM ${RUNTIME_BASE_IMAGE} AS server-runtime

ARG CHROMIUM_VERSION

ENV TZ=Asia/Shanghai
ENV ERP_PDF_CHROME_PATH=/usr/bin/chromium

RUN --mount=type=cache,id=plush-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=plush-apt-cache,target=/var/cache/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      tzdata \
      ca-certificates \
      "chromium=${CHROMIUM_VERSION}" \
      "chromium-common=${CHROMIUM_VERSION}" \
      fonts-noto-cjk && \
    installed_chromium_version="$(dpkg-query -W -f='${Version}' chromium)" && \
    installed_chromium_common_version="$(dpkg-query -W -f='${Version}' chromium-common)" && \
    test "$installed_chromium_version" = "$CHROMIUM_VERSION" && \
    test "$installed_chromium_common_version" = "$CHROMIUM_VERSION"

RUN groupadd --system --gid 10001 app && \
    useradd --system --uid 10001 --gid app --create-home --home-dir /home/app --shell /usr/sbin/nologin app

# Chromium 以非 root 用户启动时会在 HOME 下初始化 crashpad。HOME 指向
# /nonexistent 会让进程在 warmup 阶段直接退出，进而使 /readyz 永久为 503。
ENV HOME=/home/app

ARG GIT_SHA
ARG GIT_SHA_SHORT
ARG RELEASE_VERSION
ARG BUILD_TIME
ARG IMAGE_TAG

ENV GIT_SHA=${GIT_SHA}
ENV GIT_SHA_SHORT=${GIT_SHA_SHORT}
ENV RELEASE_VERSION=${RELEASE_VERSION}
ENV BUILD_TIME=${BUILD_TIME}
ENV IMAGE_TAG=${IMAGE_TAG}

WORKDIR /app

COPY --from=go-builder /src/bin/server /app/server
COPY --from=go-builder /src/bin/bootstrap-manual-acceptance-core /app/bootstrap-manual-acceptance-core
COPY --from=go-builder /src/bin/rotate-manual-acceptance-passwords /app/rotate-manual-acceptance-passwords
COPY --from=go-builder /src/configs/prod /app/configs
COPY --from=web-builder /web/build /app/public

EXPOSE 8300
EXPOSE 9300

USER app

# 默认用 /app/configs （里面只有 prod/config.yaml）
CMD ["/app/server", "-conf", "/app/configs"]
