# ===== Stage 1: 构建前端 =====
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 先复制依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 复制源码并构建前端到 /app/dist
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# ===== Stage 2: 安装后端依赖 =====
FROM node:20-alpine AS backend-deps

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# ===== Stage 3: 运行时镜像 =====
FROM node:20-alpine AS runtime

# 安装 tsx 用于直接运行 TypeScript（含开发依赖）
RUN npm install -g tsx@^4.19.2

WORKDIR /app

# 复制后端源码与依赖
COPY --from=backend-deps /app/server ./server
COPY server/src/ ./server/src/
COPY server/tsconfig.json ./server/tsconfig.json

# 复制前端构建产物（后端 api.ts 会托管 dist/）
COPY --from=frontend-builder /app/dist ./dist

# 运行时数据目录（代理持久化）
RUN mkdir -p /app/server/data
VOLUME ["/app/server/data"]

# 环境变量默认值
ENV HOST=0.0.0.0
ENV API_PORT=7999
ENV TUNNEL_HOST=0.0.0.0
ENV TUNNEL_PORT=8080
ENV DATA_FILE=/app/server/data/proxies.json

# 暴露端口：API/WebSocket + 隧道代理
EXPOSE 7999 8080

# 健康检查（API 服务）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7999/api/health >/dev/null 2>&1 || exit 1

# 启动后端（它会托管前端 + 启动隧道 + 启动定时刷新）
CMD ["tsx", "server/src/index.ts"]
