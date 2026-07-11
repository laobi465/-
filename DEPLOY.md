# Docker 部署教程

自动代理池服务 —— 拉取 `proxifly/free-proxy-list` 代理，校验纯净 IP（可访问 AI 网站与 YouTube），每 5 分钟刷新，过期自动删除，提供轮换隧道代理与实时监控页面。

---

## 一、前置要求

| 项 | 要求 |
|---|---|
| Docker | ≥ 20.10 |
| Docker Compose | ≥ 2.0（或 `docker-compose` ≥ 1.29） |
| 内存 | ≥ 512MB（推荐 1GB） |
| 网络 | 服务器需能访问外网（拉取代理列表 + 校验代理） |

> 校验代理需要服务器能直连代理的各端口（8080/3128/1080 等）。若服务器防火墙限制了出站端口，校验存活率会下降；若完全禁止直连出站，请参考 [第七节：受限网络配置](#七受限网络配置可选)。

---

## 二、快速开始（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/laobi465/-.git proxy-pool
cd proxy-pool

# 2. 一键构建并启动
docker compose up -d --build

# 3. 查看日志
docker compose logs -f
```

启动后访问：
- **监控页面**：http://你的服务器IP:7999
- **隧道代理**：`你的服务器IP:8080`

日志出现 `=== ready ===` 即表示启动成功，约 1-2 分钟后代理池开始填充。

---

## 三、使用方法

### 3.1 轮换隧道代理

每次请求自动从纯净代理池轮换上游 IP，无需手动切换：

```bash
# 通过隧道代理访问（自动轮换出口 IP）
curl -x http://你的服务器IP:8080 https://httpbin.org/ip

# 浏览器 / 爬虫配置
#   HTTP 代理:  你的服务器IP:8080
#   HTTPS 代理: 你的服务器IP:8080
```

支持 HTTP 转发与 HTTPS CONNECT 隧道，覆盖 http / https / socks4 / socks5 上游协议。

### 3.2 REST API

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/health` | GET | 健康检查 |
| `/api/stats` | GET | 代理池统计（总数、纯净、AI/YT 可访问数、国家分布） |
| `/api/proxies` | GET | 代理列表，支持 `?protocol=http&pure=true&country=US&limit=100` |
| `/api/tunnel` | GET | 隧道代理信息 |
| `/api/refresh` | POST | 手动触发刷新 |

示例：
```bash
# 查看统计
curl http://你的服务器IP:7999/api/stats

# 只看纯净代理（可访问 AI + YouTube）
curl "http://你的服务器IP:7999/api/proxies?pure=true&limit=10"
```

### 3.3 实时监控页面

浏览器访问 `http://你的服务器IP:7999`，页面通过 WebSocket 实时更新：
- 隧道代理地址（可一键复制）
- 统计卡片：代理池总数 / 纯净 IP / 可访问 AI / 可访问 YouTube / 平均延迟
- 代理明细表：IP、协议、国家、AI/YT 可访问性、出口 IP、ISP、延迟、过期倒计时
- 国家分类网格（点击筛选）
- 协议分布图

---

## 四、环境变量

通过 `docker-compose.yml` 的 `environment` 或 `docker run -e` 配置：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `HOST` | `0.0.0.0` | API 服务监听地址 |
| `API_PORT` | `7999` | API + WebSocket + 前端页面端口 |
| `TUNNEL_HOST` | `0.0.0.0` | 隧道代理监听地址 |
| `TUNNEL_PORT` | `8080` | 隧道代理端口 |
| `DATA_FILE` | `/app/server/data/proxies.json` | 代理持久化文件路径 |
| `HTTP_PROXY` | （空） | 受限网络下的 egress 网关，见第七节 |
| `HTTPS_PROXY` | （空） | 同上 |

---

## 五、Docker 单独构建运行（不用 Compose）

```bash
# 构建镜像
docker build -t proxy-pool:latest .

# 运行容器
docker run -d \
  --name proxy-pool \
  --restart unless-stopped \
  -p 7999:7999 \
  -p 8080:8080 \
  -v proxy-data:/app/server/data \
  proxy-pool:latest

# 查看日志
docker logs -f proxy-pool
```

---

## 六、常用运维命令

```bash
# 查看实时日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 更新到最新代码后重新构建
git pull
docker compose up -d --build

# 进入容器排查
docker compose exec proxy-pool sh

# 查看持久化数据
docker compose exec proxy-pool cat /app/server/data/proxies.json | head -c 500
```

---

## 七、受限网络配置（可选）

**场景**：服务器禁止直连出站 TCP，只允许经 HTTP 代理网关访问外网。

在 `docker-compose.yml` 中取消注释并填写网关地址：

```yaml
environment:
  HTTP_PROXY: "http://网关IP:端口"
  HTTPS_PROXY: "http://网关IP:端口"
```

校验时会先经网关 CONNECT 到目标代理，再让代理转发到 ip-api / AI / YouTube，使校验在受限网络下也能工作。普通 VPS 无需配置此项。

---

## 八、常见问题

### Q1：代理池一直是 0？

检查日志：
```bash
docker compose logs proxy-pool | grep scheduler
```
- 若 `fetched=0`：服务器无法访问 jsDelivr/ GitHub，检查出网
- 若 `fetched=2000+ validated=0`：服务器无法直连代理端口，检查防火墙是否放行出站 8080/3128/1080 等端口；或参考第七节配置网关

### Q2：纯净代理很少？

免费代理能同时访问 AI（chat.openai.com）和 YouTube 的比例本身就低（通常 5-15%）。这是正常现象。可在监控页面用"可访问AI"或"可访问YT"单独筛选。

### Q3：如何修改刷新间隔 / TTL？

编辑 `server/src/config.ts`：
```ts
refreshIntervalMs: 5 * MIN,   // 刷新间隔
proxyTtlMs: 10 * MIN,         // 代理过期时间
```
重新构建：`docker compose up -d --build`

### Q4：端口冲突怎么办？

修改 `docker-compose.yml` 的端口映射，例如：
```yaml
ports:
  - "18080:7999"   # 宿主机 18080 -> 容器 7999
  - "18081:8080"   # 宿主机 18081 -> 容器 8080
```

### Q5：数据会丢失吗？

不会。代理数据持久化在 Docker volume `proxy-data` 中，容器重启/重建都不丢失。执行 `docker compose down -v` 才会删除数据。

---

## 九、架构说明

```
┌─────────────────────────────────────────────┐
│                 容器 (proxy-pool)            │
│                                             │
│  ┌─────────────┐    ┌────────────────────┐  │
│  │  Vite 前端   │◄───│  后端 API (:7999)  │  │
│  │  (dist 静态) │    │  + WebSocket       │  │
│  └─────────────┘    └────────────────────┘  │
│                            │                │
│         ┌──────────────────┼────────────┐   │
│         ▼                  ▼            ▼   │
│  ┌────────────┐   ┌──────────────┐ ┌─────┐  │
│  │ 定时调度器  │   │ 隧道代理服务  │ │存储 │  │
│  │ 每5min刷新  │   │   (:8080)    │ │TTL  │  │
│  └─────┬──────┘   └──────┬───────┘ └─────┘  │
│        │                 │                   │
└────────┼─────────────────┼───────────────────┘
         ▼                 ▼
   拉取 proxifly      轮换上游代理
   校验 AI+YouTube    → 目标网站
```

**纯净 IP 判定逻辑**：代理能成功建立 HTTPS 连接到 `chat.openai.com`（AI）和 `www.youtube.com`（YouTube），且出口 IP 不泄漏服务器真实 IP → 标记为纯净。

---

## 十、项目结构

```
.
├── Dockerfile              # 多阶段构建（前端构建 + 后端运行）
├── docker-compose.yml      # 一键部署
├── .dockerignore
├── server/                 # 后端
│   ├── src/
│   │   ├── index.ts        # 入口
│   │   ├── config.ts       # 配置
│   │   ├── fetcher.ts      # 拉取 proxifly 代理列表
│   │   ├── validator.ts    # 校验（AI/YT 可达性 + egress 网关）
│   │   ├── store.ts        # 存储 + TTL + 持久化
│   │   ├── scheduler.ts    # 5min 刷新 + 过期清理
│   │   ├── tunnel.ts       # 轮换隧道代理服务器
│   │   ├── api.ts          # REST API + WebSocket
│   │   └── types.ts
│   └── package.json
├── src/                    # 前端（React + Vite + Tailwind）
│   ├── pages/Dashboard.tsx
│   ├── components/         # Header/StatCard/TunnelCard/FilterBar/ProxyTable
│   ├── hooks/useProxySocket.ts
│   └── lib/api.ts
└── ...
```
