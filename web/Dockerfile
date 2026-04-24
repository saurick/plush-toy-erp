# web/Dockerfile
#
# Build from the repository root:
# docker build -f web/Dockerfile -t plush-toy-erp-web:dev .

ARG NODE_BUILDER_IMAGE=node:24.14.0
ARG RUNTIME_BASE_IMAGE=node:24.14.0-slim

FROM ${NODE_BUILDER_IMAGE} AS builder

WORKDIR /app

COPY web/package.json web/pnpm-lock.yaml ./web/

RUN npm install -g pnpm && \
    pnpm config set store-dir /app/.pnpm-store && \
    pnpm config set registry https://registry.npmmirror.com && \
    cd web && \
    pnpm install --frozen-lockfile

COPY web ./web
COPY scripts ./scripts
COPY server/internal/errcode ./server/internal/errcode

WORKDIR /app/web

RUN pnpm build:all

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
EXPOSE 5186
EXPOSE 5187
EXPOSE 5188
EXPOSE 5189
EXPOSE 5190
EXPOSE 5191
EXPOSE 5192
EXPOSE 5193

CMD ["node", "scripts/serveStaticApp.mjs"]
