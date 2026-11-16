# syntax=docker/dockerfile:1
# Ba tầng: (1) build web, (2) chỉ phụ thuộc chạy thật, (3) ảnh cuối nhỏ, chạy bằng người dùng không phải root.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY shared ./shared
COPY public ./public
# BUILD_ID: mã bản build (ví dụ mã commit) để client biết "có bản mới"; SITE_URL: địa chỉ công khai cho thẻ SEO/OG.
ARG BUILD_ID=""
ARG SITE_URL=""
ENV BUILD_ID=${BUILD_ID} SITE_URL=${SITE_URL}
RUN npm run build

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    STATIC_DIR=/app/dist \
    DATA_DIR=/data \
    LOG_LEVEL=info
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8787
VOLUME ["/data"]
# /healthz chỉ cần tiến trình còn sống; /readyz trả 503 khi đang tắt êm (dùng cho bộ cân bằng tải).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Node là PID 1 và tự xử lý SIGTERM (tắt êm tối đa SHUTDOWN_MS giây), nên không cần tini.
CMD ["node", "server/hangmu-server.mjs"]
