## 1. 架构设计

纯前端单页应用,无后端服务,游戏数据通过浏览器 localStorage 持久化。

```mermaid
flowchart TD
    "A[浏览器前端 React SPA" --> "B[游戏状态管理 Zustand"
    "B --> C[游戏逻辑层 翻牌/配对/计时/计步"
    "C --> D[UI 渲染层 卡片网格/状态栏/弹窗"
    "D --> E[音效模块 Web Audio API chiptune"
    "B --> F[持久化层 localStorage 最佳记录存取"
    "A --> G[视觉特效层 CRT 滤镜/扫描线/粒子"
```

## 2. 技术说明
- **前端框架**: React@18 + tailwindcss@3 + vite
- **初始化工具**: vite-init (react-ts 模板)
- **状态管理**: Zustand (轻量状态管理,适合游戏状态)
- **音效**: Web Audio API 原生实现 8-bit chiptune 音效(无外部音频文件)
- **字体**: Google Fonts - "Press Start 2P" + "VT323"
- **后端**: 无
- **数据库**: 无,使用 localStorage 存储最佳记录

## 3. 路由定义

| 路由 | 用途 |
|-------|---------|
| / | 主游戏页(包含难度选择、游戏面板、结算弹窗,通过状态切换不同视图) |

## 4. API 定义
无后端 API。

## 5. 服务端架构
无服务端。

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    "GAME_STATE ||--o{ CARD : contains"
    "GAME_STATE {
        string difficulty
        number moves
        number elapsedTime
        number matchedPairs
        boolean isPaused
        boolean isPlaying
    }
    "CARD {
        number id
        string pattern
        boolean isFlipped
        boolean isMatched
    }
    "BEST_RECORD {
        string difficulty
        number bestTime
        number bestMoves
        string date
    }
```

### 6.2 数据定义语言

localStorage 键值结构(JSON):

```typescript
// 最佳记录存储键: "pixel-memory:best-records"
interface BestRecords {
  easy: { bestTime: number; bestMoves: number; date: string } | null;
  medium: { bestTime: number; bestMoves: number; date: string } | null;
  hard: { bestTime: number; bestMoves: number; date: string } | null;
}

// 音效设置键: "pixel-memory:settings"
interface GameSettings {
  soundEnabled: boolean;
}
```

### 6.3 关键组件结构

```
src/
├── components/
│   ├── GameBoard.tsx        # 游戏面板(卡片网格容器)
│   ├── Card.tsx             # 单张卡片(翻转动画)
│   ├── StatusBar.tsx        # 状态栏(步数/时间/配对)
│   ├── DifficultySelector.tsx # 难度选择
│   ├── ResultModal.tsx      # 胜利结算弹窗
│   ├── ControlButtons.tsx   # 控制按钮(重启/暂停/音效)
│   └── CRTOverlay.tsx       # CRT 滤镜特效层
├── hooks/
│   ├── useGame.ts           # 游戏核心逻辑 hook
│   ├── useTimer.ts          # 计时器 hook
│   └── useSound.ts          # 8-bit 音效 hook
├── store/
│   └── gameStore.ts         # Zustand 游戏状态
├── data/
│   └── patterns.ts          # 像素图案数据(CSS/SVG 像素图)
├── types/
│   └── index.ts             # TypeScript 类型定义
└── App.tsx                  # 主应用
```
