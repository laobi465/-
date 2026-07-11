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

隧道代理启用 Basic 认证，监控页面显示的地址格式为 `用户名:密码@IP:端口`，点击复制按钮可得到完整可用的 `http://用户名:密码@IP:端口`。每次请求自动从纯净代理池轮换上游 IP，无需手动切换：

```bash
# 通过隧道代理访问（自动轮换出口 IP）
# 用户名/密码默认为 proxy/proxy，可在 docker-compose.yml 修改
curl -x http://proxy:proxy@你的服务器IP:8080 https://httpbin.org/ip

# 浏览器 / 爬虫配置（在代理 URL 中携带账号密码）
#   HTTP 代理:  proxy:proxy@你的服务器IP:8080
#   或直接填:  http://proxy:proxy@你的服务器IP:8080
```

支持 HTTP 转发与 HTTPS CONNECT 隧道，覆盖 http / https / socks4 / socks5 上游协议。未携带正确账号密码的请求会被拒绝（返回 `407 Proxy Authentication Required`）。

> **关于监控页面显示的隧道地址**
> 监控页面"隧道代理地址"栏显示的是客户端实际应访问的地址（含账号密码），其 host 部分按以下优先级解析：
> 1. 环境变量 `TUNNEL_PUBLIC_HOST`（显式指定的域名或公网 IP，优先级最高，适合 NAT / 域名场景）
> 2. 后端自动检测的服务器公网 IP（通过 ip-api.com 查询，绝大多数 VPS 自动生效）
> 3. `TUNNEL_HOST`（仅当它不是 `0.0.0.0` 时，即绑定了具体网卡 IP）
> 4. `127.0.0.1`（本地开发回退，仅当以上都不可用时）
>
> 如果页面 host 部分仍为 `127.0.0.1`，通常是因为后端检测公网 IP 失败（服务器无法访问 ip-api.com），此时请显式设置 `TUNNEL_PUBLIC_HOST` 为你的服务器公网 IP 或域名。

### 3.2 REST API

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/health` | GET | 健康检查 |
| `/api/stats` | GET | 代理池统计（总数、纯净、AI/YT 可访问数、国家分布） |
| `/api/proxies` | GET | 代理列表，支持 `?protocol=http&pure=true&country=US&limit=100` |
| `/api/tunnel` | GET | 隧道代理信息（含对外访问地址、公网 IP、代理池大小） |
| `/api/tunnel/test` | POST | 测试隧道代理：通过它访问 httpbin.org/ip，返回出口 IP、延迟、是否成功 |
| `/api/refresh` | POST | 手动触发刷新 |
| `/api/version` | GET | 当前版本号（git commit）与是否有可用更新（读取缓存） |
| `/api/version/check` | POST | 强制向 GitHub 重新检查更新，返回最新版本信息并广播给所有监控页 |
| `/api/update` | POST | 拉取 GitHub 最新代码、重新构建并重启服务 |

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
| `TUNNEL_USERNAME` | `proxy` | 隧道代理 Basic 认证用户名（客户端必须在代理 URL 中携带） |
| `TUNNEL_PASSWORD` | `proxy` | 隧道代理 Basic 认证密码，**生产环境务必修改为强密码** |
| `TUNNEL_PUBLIC_HOST` | （空） | 对外公布的隧道代理地址（域名或公网 IP）。留空时后端自动检测公网 IP；若自动检测失败或使用 NAT/域名，请显式设置此项 |
| `DATA_FILE` | `/app/server/data/proxies.json` | 代理持久化文件路径 |
| `HTTP_PROXY` | （空） | 受限网络下的 egress 网关，见第七节 |
| `HTTPS_PROXY` | （空） | 同上 |

> **隧道地址优先级**：`TUNNEL_PUBLIC_HOST` > 自动检测的公网 IP > `TUNNEL_HOST`（非 `0.0.0.0` 时）> `127.0.0.1`。详见 [3.1 节](#31-轮换隧道代理)。

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

### Q6：监控页面显示的隧道地址还是 `127.0.0.1:8080`？

监控页面显示的地址是客户端应访问的对外地址，按优先级解析（详见 [3.1 节](#31-轮换隧道代理)）。显示 `127.0.0.1` 通常有两种原因：

1. **后端无法访问 ip-api.com**：自动检测公网 IP 失败（部分云厂商限制出站）。解决方法：在 `docker-compose.yml` 显式设置：
   ```yaml
   environment:
     TUNNEL_PUBLIC_HOST: "你的服务器公网IP或域名"
   ```
   然后 `docker compose up -d --build` 重启。

2. **容器未重启加载新代码**：若是从旧版本升级，确认已 `git pull` 并 `docker compose up -d --build` 重新构建镜像。

验证当前生效地址：
```bash
curl http://你的服务器IP:7999/api/tunnel
# 关注返回 JSON 的 host / address 字段
```

### Q7：如何使用自动更新功能？

监控页面右上角显示当前版本号，右侧箭头可展开查看更新状态：
- **页面刷新即自动检查**：每次打开或刷新监控页时，前端会自动调用 `/api/version/check` 向 GitHub 拉取最新提交状态，版本徽标立即反映是否有更新
- **定时巡检**：后端每 **10 秒**自动检查 GitHub 仓库是否有新 commit，即便不刷新页面也能实时发现更新并更新徽标
- 检测到更新时，展开面板会显示"立即更新并重启"按钮
- 点击后后端会执行 `git fetch origin && git reset --hard origin/main` → 重装依赖 → 重启进程，无需 SSH 登录服务器
- **移动端适配**：展开面板在手机上以居中浮层形式展示（带半透明遮罩，点击外部收起），不会溢出屏幕；桌面端保持右上角下拉样式

> **Docker 部署的容器内更新机制**
> Dockerfile 在构建阶段会 `git clone` 完整仓库（含 `.git` 目录）到镜像内，并在运行时镜像安装 git。因此容器内能直接执行 `git fetch` / `git reset --hard origin/main` 完成自更新，**点击"立即更新并重启"即可生效**，无需重新构建镜像。`node_modules` 与 `dist` 在 `.gitignore` 中，`git reset` 不会删除它们；更新后 `performUpdate` 会重新 `npm install` 安装依赖变更，最后进程退出触发 Docker `restart: unless-stopped` 自动重启。

也可通过 API 手动触发：
```bash
# 读取缓存版本（立即返回，不请求 GitHub）
curl http://你的服务器IP:7999/api/version

# 强制重新检查 GitHub（页面刷新时前端自动调用此接口）
curl -X POST http://你的服务器IP:7999/api/version/check

# 拉取最新代码并重启
curl -X POST http://你的服务器IP:7999/api/update
```

> 注意：自动更新依赖容器内的 git 仓库可正常 `pull`（公网仓库无需鉴权）。定时巡检每 10 秒请求一次 GitHub API，匿名接口限流为每小时 60 次——**默认 10 秒间隔会在约 10 分钟内耗尽配额**，限流期间 `remoteCommit` 返回 null，徽标会显示"已是最新版本"（实为检测失败）；如需降低频率，修改 `server/src/config.ts` 的 `update.checkIntervalMs` 后重新构建。

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
