# web/Dockerfile
#
# Build from the repository root:
# docker build -f web/Dockerfile -t plush-toy-erp-web:dev .

ARG NODE_BUILDER_IMAGE=node:24.14.0
ARG RUNTIME_BASE_IMAGE=node:24.14.0-slim

FROM ${NODE_BUILDER_IMAGE} AS builder

WORKDIR /app

COPY web/package.json web/pnpm-lock.yaml ./web/

RUN npm install -g pnpm@10.13.1 && \
    pnpm config set store-dir /app/.pnpm-store && \
    pnpm config set registry https://registry.npmmirror.com && \
    cd web && \
    pnpm install --frozen-lockfile

COPY web ./web
COPY config ./config
COPY scripts ./scripts
COPY server/internal/errcode ./server/internal/errcode

WORKDIR /app/web

ARG ERP_CUSTOMER_KEY=

RUN pnpm build:all && \
    node ../scripts/build/apply-customer-web-config.mjs \
      --customer "${ERP_CUSTOMER_KEY}" \
      --config-root /app/config \
      --web-build-dir /app/web/build

FROM ${RUNTIME_BASE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV APP_ID=desktop
ENV PORT=5175
ENV API_ORIGIN=
ENV PROXY_PREFIXES=/rpc,/templates
ENV PROXY_TIMEOUT_MS=30000

WORKDIR /app

COPY --from=builder /app/web/build ./build
COPY --from=builder /app/web/scripts/serveStaticApp.mjs ./scripts/serveStaticApp.mjs

USER node

EXPOSE 5175

CMD ["node", "scripts/serveStaticApp.mjs"]
