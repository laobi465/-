# ===== Stage 1: 克隆仓库 + 构建前端 + 安装后端依赖 =====
FROM node:20-alpine AS builder

# git 用于克隆仓库；运行时镜像也会装 git 以支持容器内 git pull 自更新
RUN apk add --no-cache git

WORKDIR /app

# 克隆完整仓库（含 .git 目录），这样容器内能执行 git fetch/pull 自更新。
# 不用 --depth 1：自动更新时 git fetch 需要能获取到新的 commit 对象，
# 浅克隆在 reset --hard origin/main 时可能因对象缺失而失败。
RUN git clone https://github.com/laobi465/-.git .

# 安装前端依赖并构建
RUN npm ci --no-audit --no-fund
RUN npm run build

# 安装后端运行时依赖
RUN cd server && (npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund)

# ===== Stage 2: 运行时镜像 =====
FROM node:20-alpine AS runtime

# 安装 git（运行时 git pull 自更新需要）和 tsx（运行 TypeScript 源码）
RUN apk add --no-cache git && npm install -g tsx@^4.19.2

WORKDIR /app

# 复制完整仓库（含 .git 目录）——容器内能执行 git fetch/reset/pull。
# node_modules 与 dist 在 .gitignore 中，git reset 不会删除它们。
COPY --from=builder /app ./

# 运行时数据目录（代理持久化）
RUN mkdir -p /app/server/data
VOLUME ["/app/server/data"]

# 环境变量默认值
ENV HOST=0.0.0.0
ENV API_PORT=7999
ENV TUNNEL_HOST=0.0.0.0
ENV TUNNEL_PORT=8080
ENV TUNNEL_USERNAME=proxy
ENV TUNNEL_PASSWORD=proxy
ENV DATA_FILE=/app/server/data/proxies.json

# 暴露端口：API/WebSocket + 隧道代理
EXPOSE 7999 8080

# 健康检查（API 服务）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7999/api/health >/dev/null 2>&1 || exit 1

# 启动后端（它会托管前端 + 启动隧道 + 启动定时刷新）
CMD ["tsx", "server/src/index.ts"]
