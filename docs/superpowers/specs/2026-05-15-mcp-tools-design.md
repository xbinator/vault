# MCP 工具接入设计

## 背景

当前项目已经具备两类 AI 工具能力：

- `src/ai/tools` 下由渲染进程本地执行的内置工具
- 由主进程 AI 服务直接注册给 AI SDK 的远端工具，例如 Tavily

用户希望新增 MCP 工具支持，并且同时满足两类配置入口：

- 在 `src/views/settings/tools` 中完成 MCP server 的全局配置
- 在 `src/components/BChatSidebar` 的聊天调用链中消费全局 MCP 配置

同时，用户明确提出一个额外约束：

- 所有“声明”的地方必须统一，避免类型、默认值、字段名、工具名和执行映射散落在多个模块中

结合当前架构，这意味着 MCP 不仅是“再加一个工具”，而是要补齐一条完整能力链：

- 配置声明
- 持久化与归一化
- 聊天侧全局配置消费
- 模型驱动的设置修改
- AI 请求体扩展
- 主进程工具发现、过滤、注册与执行

## 目标

- 支持在设置中心新增 `工具 > MCP` 页面，用于管理 MCP server
- 支持聊天侧读取 `settings/tools` 中的全局 MCP 配置
- 支持模型通过工具调用读取和修改全局 MCP 配置
- 让 MCP 工具以“主进程托管远端工具”的方式接入，而不是混入渲染进程本地 executor
- 让设置页、聊天侧请求体和主进程执行都基于同一套共享声明
- 保持与 Tavily 已有接入方式风格一致，但进一步收敛“单一声明源”

## 非目标

- 本次不支持 HTTP、SSE 或其他 transport，第一版只支持 `stdio`
- 本次不做 MCP 工具市场、模板中心或远端分享
- 本次不把 MCP 工具接入 `src/ai/tools/builtin/*`
- 本次不做按聊天会话或单次请求保存的 MCP 临时覆盖配置
- 本次不做工具级调用统计、token 成本统计或 server 资源监控
- 本次不在 `BChatSidebar` 中新增 MCP 配置表单
- 本次不自建本地进程沙箱，统一采用 `@vercel/sandbox` 作为执行沙箱

## 方案对比

### 方案一：设置页唯一人工配置入口，聊天侧只读消费，模型通过工具修改全局配置

把 MCP 工具视为与 Tavily 同类的“主进程可直接注册给 AI SDK 的远端工具”。

第一版的实际执行环境不是宿主机本地子进程，而是由 `@vercel/sandbox` 创建的 Linux microVM。

设置页负责：

- server 启用状态
- 启动命令
- 参数
- 环境变量
- 默认允许暴露的 tools

聊天侧负责：

- 读取并消费当前全局生效的 MCP 配置
- 将全局生效配置传入 AI 请求

模型负责：

- 通过只读工具读取当前 MCP 配置
- 通过写工具请求修改 MCP 配置，并走用户确认流程

优点：

- 和 `electron/main/modules/ai/service.mts` 当前 Tavily 链路最一致
- 权限边界清晰，适合 Electron + MCP 的进程模型
- 配置与执行职责分离，后续扩展最稳
- 人工配置入口唯一，不会在聊天侧长出第二套表单
- 可直接复用 `@vercel/sandbox` 的 `networkPolicy`、timeout、snapshot 和 microVM 生命周期能力

缺点：

- 需要新增主进程 MCP client / registry 层

### 方案二：把 MCP 工具做成 `src/ai/tools` 的动态 executor

把每个 MCP tool 映射成前端本地 `AIToolExecutor`，继续走 `stream.ts` 和本地 tool-call 循环。

优点：

- 能复用现有本地工具结果结构和确认链路

缺点：

- MCP 连接、发现与执行全部落在渲染进程，不符合当前 Electron 能力边界
- secret、stdio 进程和生命周期管理会变复杂
- 与 Tavily 这类远端工具形成两套实现模型

### 方案三：设置页配 MCP，前端本地做“代理工具”，再通过 IPC 转发

前端保留 `AIToolExecutor` 形态，但 executor 实际上只是代理，真正执行仍在主进程。

优点：

- 表面上更接近现有本地工具体系

缺点：

- 会同时维护“本地工具协议”和“MCP 远端协议”两层映射
- 架构更绕，排错和扩展成本最高

## 结论

采用方案一。

MCP 工具按“主进程托管远端工具”接入，不进入 `src/ai/tools/builtin/*`，不由渲染进程本地执行。`src/views/settings/tools/mcp` 是唯一人工配置入口，`src/components/BChatSidebar` 只读取并消费全局配置；如果模型需要变更 MCP 配置，则通过专门的 MCP 设置工具调用完成，并走统一确认流程。主进程负责基于 `@vercel/sandbox` 的 microVM 生命周期、tool discovery、过滤和 AI SDK 注册。

## 设计原则

### 1. 单一声明源

同一类声明只能有一个源头：

- 配置声明：只在 `src/shared/storage/tool-settings/types.ts`
- 请求声明：只在共享请求类型中定义，不在组件内手写结构
- 执行声明：只在主进程 MCP 模块中定义，不在 `service.mts` 和页面中重复推导

### 2. 配置与执行分离

前端负责声明“想用什么”和“默认怎么用”，主进程负责“能不能用”和“怎么注册执行”。前端不直接维护 MCP client，也不直接执行 MCP tools。

### 3. 设置页唯一人工入口

`settings/tools/mcp` 定义并维护全部 MCP 全局配置。聊天侧不再维护临时 MCP 配置状态，也不提供第二套人工编辑入口。

如果用户希望在聊天中修改 MCP 配置，应由模型通过 MCP 设置工具发起写操作，并由用户确认后写回全局配置。

### 4. 对失败做 server 级降级

某个 MCP server 启动失败或发现失败时，只影响该 server 的工具暴露，不默认打断整次 AI 请求。只有在“本次调用显式要求且唯一依赖该 server”时，才升级为整次请求失败。

### 5. 最小首版范围

第一版只实现：

- `stdio` server
- 全局配置
- 聊天侧全局消费
- 模型驱动的配置读写
- 主进程托管注册

其他 transport 和高级调试能力后续再扩展。

## 信息架构

### 设置导航

保留当前 `工具` 分组，并在其下新增 MCP 子页：

- `搜索` -> `/settings/tools/search`
- `MCP` -> `/settings/tools/mcp`

这里不建议把页面直接命名为某个具体 server 名称，而是保留平台能力视角的 `MCP`，因为一页会管理多个 server。

### 页面分区

`/settings/tools/mcp` 建议拆成三个区块：

1. `MCP Servers`
2. `默认调用配置`
3. `连通性与发现状态`

#### `MCP Servers`

用于管理一个或多个 server：

- 新增 server
- 编辑 `name`
- 编辑 `command`
- 编辑 `args`
- 编辑 `env`
- 启用 / 禁用
- 配置默认允许暴露的 tools
- 配置超时

#### `默认调用配置`

用于定义聊天侧默认行为：

- 默认启用哪些 server
- 默认允许哪些 tools
- 默认附加工具说明词

#### `连通性与发现状态`

展示非持久化运行态信息：

- 最近一次连接是否成功
- 最近一次 tool discovery 是否成功
- 错误消息
- 发现到的 tool 列表快照

其中“最近一次发现状态”和“tool 列表快照”不应只存在于主进程内存。第一版建议将最近一次成功 discovery 的 snapshot 持久化为 cache，供设置页重启后继续展示，但必须明确：

- 它只是 UI cache，不是真实权限源
- 真正的运行权限仍以当前 server 配置和本次请求过滤结果为准
- 手动刷新或进程重建后，cache 可以被新的 discovery 结果覆盖

### 聊天侧输入约束

`src/components/BChatSidebar` 不承载 MCP 配置表单。聊天输入区域只消费当前全局 MCP 配置，不提供“本次调用覆盖”的 UI。

如需修改配置，有两种路径：

- 用户手动进入 `src/views/settings/tools/mcp`
- 模型通过 MCP 设置工具发起全局配置修改请求

## 数据设计

### 统一声明位置

以下声明统一收敛到 `src/shared/storage/tool-settings/types.ts`：

- `MCPTransportType`
- `MCPServerConfig`
- `MCPToolSettings`
- `MCPInvocationDefaults`
- `AIMCPRequestConfig`
- `ToolSettingsState`
- `DEFAULT_TOOL_SETTINGS`
- 相关默认常量和字段级注释

不允许在设置页、store、编辑器组件或主进程 AI service 中再次手写这些结构。

但为了避免 `tool-settings/types.ts` 退化成“万能声明文件”，文档约束上应继续分区导出：

- `storage config types`：持久化配置、默认值、discovery cache
- `request-facing types`：发往 AI service 的最终请求结构

允许它们物理上同文件共存，但导出分区必须清晰，后续如果体量继续增长，可以再拆成 `storage-types.ts` 与 `request-types.ts`。

### 持久化结构

建议新增如下共享类型：

```ts
/**
 * MCP transport 类型。
 */
export type MCPTransportType = 'stdio';

/**
 * MCP server 配置。
 */
export interface MCPServerConfig {
  /** 稳定 ID */
  id: string;
  /** 展示名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** transport 类型 */
  transport: MCPTransportType;
  /** 启动命令 */
  command: string;
  /** 启动参数 */
  args: string[];
  /** 环境变量 */
  env: Record<string, string>;
  /** Vercel Sandbox 运行时字符串 */
  runtime: string;
  /** Sandbox 生命周期超时 */
  sandboxTimeoutMs: number;
  /** Sandbox 网络策略 */
  networkPolicy: 'allow-all' | 'deny-all' | { allow: string[] };
  /** 可选的基础快照 ID */
  baseSnapshotId?: string | null;
  /** 默认允许暴露的 tool 名称 */
  toolAllowlist: string[];
  /** 连接与握手超时 */
  connectTimeoutMs: number;
  /** 单次工具调用超时 */
  toolCallTimeoutMs: number;
}

/**
 * MCP 默认调用配置。
 */
export interface MCPInvocationDefaults {
  /** 默认启用的 server ID */
  enabledServerIds: string[];
  /** 默认允许的 tool 标识 */
  enabledTools: MCPToolSelector[];
  /** 默认附加说明词 */
  toolInstructions: string;
}

/**
 * MCP tool 的结构化选择器。
 */
export interface MCPToolSelector {
  /** 所属 server ID */
  serverId: string;
  /** 原始 tool 名称 */
  toolName: string;
}

/**
 * MCP 设置总结构。
 */
export interface MCPToolSettings {
  /** server 列表 */
  servers: MCPServerConfig[];
  /** 默认调用配置 */
  invocationDefaults: MCPInvocationDefaults;
}

/**
 * MCP 请求配置。
 */
export interface AIMCPRequestConfig {
  /** 当前全局生效的 server ID */
  enabledServerIds: string[];
  /** 当前全局生效的 tool 标识 */
  enabledTools: MCPToolSelector[];
  /** 当前全局生效的工具说明词 */
  toolInstructions: string;
}
```

并将 `ToolSettingsState` 扩展为：

```ts
export interface ToolSettingsState {
  tavily: TavilyToolSettings;
  mcp: MCPToolSettings;
}
```

### 默认值

建议默认值如下：

```ts
export const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 20000;
export const DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS = 30000;
export const DEFAULT_MCP_SANDBOX_TIMEOUT_MS = 300000;

export const DEFAULT_MCP_TOOL_SETTINGS: MCPToolSettings = {
  servers: [],
  invocationDefaults: {
    enabledServerIds: [],
    enabledTools: [],
    toolInstructions: ''
  }
};
```

这样第一版没有预置 server，也避免在未配置时误暴露工具。

### 归一化规则

`src/shared/storage/tool-settings/sqlite.ts` 负责以下归一化：

- `id` 为空时丢弃该 server
- `id` 通过 `UUID v4` 生成，新增后不允许用户编辑
- `name` 为空时回退为 `command` 或通用占位名
- `command` 为空时视为不可用配置，但允许保留以供用户继续编辑
- `args` 保证为字符串数组
- `env` 保证为字符串字典，过滤空 key
- `runtime` 使用字符串存储，但在归一化与运行前校验时必须限制为 `@vercel/sandbox` 当前支持的运行时之一
- `sandboxTimeoutMs` 约束在合理范围，例如 `60000 ~ 3600000`
- `networkPolicy` 归一化为 `allow-all`、`deny-all` 或有限 allowlist 结构
- `networkPolicy` 在 JSON 序列化/反序列化时按“字符串模式”与“对象模式”分流处理，避免把对象误当作任意 JSON blob
- `baseSnapshotId` 允许为空，表示每次冷启动创建 sandbox
- `toolAllowlist` 保证为去重后的字符串数组
- `connectTimeoutMs` 与 `toolCallTimeoutMs` 分别约束在合理范围，例如 `1000 ~ 120000`
- discovery snapshot 作为 cache 单独归一化，允许缺失，不参与真实权限判断
- 对已有用户缺失的 `mcp` 字段，归一化时自动回填 `DEFAULT_MCP_TOOL_SETTINGS`

需要注意：

- “可持久化”不等于“可运行”
- 配置合法性检查和运行时连通性检查是两层不同逻辑

## 请求模型设计

### AI 请求体扩展

当前 `useChatStream.ts` 已经会把 `toolSettingsStore.tavily` 注入到 AI 请求中。MCP 第一版也采用同类模式，但不再支持聊天侧临时覆盖。

建议在共享 AI 请求类型中直接复用上面的 `AIMCPRequestConfig`，并扩展 `AIRequestOptions`：

```ts
export interface AIRequestOptions {
  // ...
  tavily?: TavilyToolSettings;
  mcp?: AIMCPRequestConfig;
}
```

### 请求生成规则

请求发起前按以下规则生成：

1. 读取 `toolSettingsStore.mcp`
2. 从 `invocationDefaults` 解析当前全局生效的 `enabledServerIds`
3. 从 `invocationDefaults` 解析当前全局生效的 `enabledTools`
4. 从 `invocationDefaults` 解析当前全局生效的 `toolInstructions`
5. 把这三个最终结果传给主进程

主进程收到请求后：

1. 根据 `enabledServerIds` 读取本地持久化的 `MCPServerConfig`
2. 根据 `enabledTools` 做 server-scoped 过滤
3. 根据 `toolInstructions` 做统一 prompt 注入
4. 在主进程内完成完整配置装配、生命周期管理和 tool 过滤

这样做的原因是：

- 避免每次 AI 请求都携带 `command`、`args`、`env` 等完整配置
- 避免把敏感 `env` 内容扩大到每次请求链路
- 让主进程成为 MCP 配置的唯一执行读取方
- 避免聊天侧生成第二套临时配置语义

## IPC 接口设计

除了 AI 请求主链路外，MCP 还需要专门的渲染进程 ↔ 主进程 IPC 通道。

第一版建议至少定义：

- `tools:mcp:refresh-discovery`
  异步触发指定 `serverId` 的 sandbox 启动与 discovery，返回最新 snapshot 或错误
- `tools:mcp:get-status`
  异步查询一个或多个 `serverId` 当前的 sandbox / discovery 状态
- `tools:mcp:get-discovery-cache`
  异步读取最近一次持久化的 discovery cache

设计约束：

- 全部采用异步 `invoke` / `handle` 风格，不使用同步 IPC
- 错误统一按结构化结果返回，不通过裸异常字符串让渲染层猜测
- 状态查询类 IPC 不应隐式触发 sandbox 创建，避免页面打开即产生成本

建议返回结构示意：

```ts
interface MCPStatusResponse {
  serverId: string;
  sandboxStatus: 'idle' | 'starting' | 'running' | 'failed';
  discoveryStatus: 'idle' | 'refreshing' | 'ready' | 'failed';
  message?: string;
}
```

## 执行架构

### 主进程新增 MCP 模块

建议新增：

- `electron/main/modules/ai/mcp-tools.mts`
- `electron/main/modules/ai/mcp-runtime.mts`
- `electron/main/modules/ai/mcp-sandbox.mts`

职责包括：

- 创建和复用 MCP client
- 维护 server 生命周期
- 拉取 tools 列表
- 将 MCP tools 转换为 AI SDK 兼容的 `ToolSet`
- 根据 allowlist 和全局请求结果过滤暴露范围
- 在执行失败时返回可记录的标准化错误

此外，第一版需要补一组 MCP 设置工具，由模型用来读写全局配置。建议最少包含：

- `get_mcp_settings`
- `add_mcp_server`
- `update_mcp_server`
- `remove_mcp_server`
- `refresh_mcp_discovery`

不建议只暴露一个超大的 `update_mcp_settings`，因为：

- schema 会过大
- 风险边界不清晰
- 确认文案不容易精确描述
- 测试矩阵会变得很重

### `@vercel/sandbox` 集成原则

第一版明确采用 `@vercel/sandbox` 作为 MCP server 的执行沙箱，而不是直接在宿主机主进程里拉起本地 `stdio` 子进程。

对应职责建议如下：

- `mcp-sandbox.mts`
  将 `MCPServerConfig` 映射为 `Sandbox.create(...)` 参数，包括 `runtime`、`timeout`、`networkPolicy`、`env` 和可选 `baseSnapshotId`
- `mcp-runtime.mts`
  管理 `sandboxId`、sandbox 存活状态、已启动 MCP server 进程句柄与 discovery cache
- `mcp-tools.mts`
  基于已运行的 sandbox 内 MCP server 进行 tool discovery、过滤和 AI SDK 注册

这样做的原因是：

- sandbox 生命周期和 tool 注册关注点不同
- `@vercel/sandbox` 提供的 microVM、网络隔离和 snapshot 能力应集中封装
- 后续如果 sandbox 初始化、快照策略或网络策略变化，不会污染 tool 装配层

### Sandbox 依赖容错

执行层强依赖 `@vercel/sandbox`，因此第一版必须定义依赖容错边界：

- 如果 npm 包加载失败、初始化失败或认证配置缺失，则对应 MCP server 标记为 `failed`
- 不允许静默回退到宿主机本地 `spawn`
- 若 microVM 创建因配额、成本或上游限制失败，则返回结构化错误，并在设置页显示“sandbox unavailable”
- sandbox 相关凭证或认证信息由主进程统一管理，不从渲染进程传入

建议错误类别至少包含：

- `SANDBOX_UNAVAILABLE`
- `SANDBOX_AUTH_FAILED`
- `SANDBOX_QUOTA_EXCEEDED`
- `SANDBOX_INIT_FAILED`

这样可以让设置页、聊天侧和日志系统准确区分“server 自身坏了”与“sandbox 依赖不可用”。

### 生命周期策略

第一版必须明确以下策略：

- `stdio` server 采用懒启动：首次被 AI 请求使用，或在设置页触发“连接 / 刷新工具”时启动
- 同一个 `server.id` 在主进程内只维护一个运行中的 sandbox + MCP server 实例
- 多个并发 AI 请求共享同一个 sandbox，不为同一个 server 重复创建 microVM
- 对同一个 `server.id` 的首次启动过程增加启动锁，保证并发首请求只会真正创建一次 sandbox 并拉起一次 MCP server
- 若存在有效 `sandboxId`，优先复用；若 sandbox 已停止或失效，则重建
- 若配置了 `baseSnapshotId`，则优先从 snapshot 创建 sandbox；否则执行冷启动
- MCP server 进程异常退出或 sandbox 失效后，将该实例标记为失效；下一次请求或手动刷新时按需重建
- 第一版不做后台无限重连；只做“按次请求触发重建”
- 应用退出时，主进程统一停止所有活跃 sandbox

这套策略的目标是：

- 避免空闲时长期持有无用进程
- 避免并发请求下重复启动相同 server
- 避免异常退出后状态悬挂或 sandbox 泄漏
- 为耗时 setup 的 MCP server 预留 snapshot 加速空间

### Sandbox 内启动流程

对某个 MCP server 的首轮启动，建议固定为以下步骤：

1. 使用 `Sandbox.create(...)` 创建或恢复 sandbox
2. 使用 `writeFiles()` 写入启动脚本、配置文件或运行时所需资源
3. 使用 `runCommand({ detached: true, ... })` 在 sandbox 内拉起 MCP `stdio` server
4. 完成握手、记录 `sandboxId` 与运行态元数据
5. 在同一 sandbox 中执行 tool discovery

这样可以保证：

- discovery 与 execute 运行在同一权限边界下
- 不会出现“发现阶段高权限、执行阶段低权限”的不一致
- MCP server 的文件系统和网络上下文在同一个 microVM 中保持一致

### tool discovery 与缓存策略

第一版 discovery 不采用“每次请求前都重新发现”的策略，而是引入显式缓存：

- 设置页手动点击“连接 / 刷新工具”时，触发一次 discovery
- 某个 server 首次被 AI 请求使用且当前没有缓存时，触发 discovery
- 若已有可用缓存，AI 请求优先使用缓存的 tool 列表，不额外重复 discovery

缓存失效条件定义为：

- 以下运行相关字段发生变化：
  - `command`
  - `args`
  - `env`
  - `runtime`
  - `baseSnapshotId`
  - `networkPolicy`
- 手动点击“刷新工具”
- sandbox 重建后首次使用

以下字段变化不要求强制失效 discovery cache：

- `name`
- `toolAllowlist`
- `connectTimeoutMs`
- `toolCallTimeoutMs`

理由：

- 前一组字段直接影响 sandbox 启动环境或 server 行为
- 后一组字段只影响展示或过滤，不改变 discovered tools 本身

设置页中的 `toolAllowlist` 候选项来自最近一次成功 discovery 的缓存结果。若尚未发现过工具，则 UI 明确提示“先连接并发现工具”，而不是展示空白候选列表并让用户猜测 tool 名称。

discovery cache 中建议保存结构化 tool 标识，而不只保存裸 `toolName`，以避免不同 server 存在同名 tool 时 UI 和请求层混淆。推荐结构为：

```ts
interface MCPDiscoveredToolSnapshot {
  serverId: string;
  toolName: string;
  description?: string;
}
```

当 sandbox 使用 snapshot 启动时，discovery cache 仍然不能被视作真实运行态事实。是否可用仍以当前 sandbox 中实际可握手、可执行的 MCP server 为准。

### `service.mts` 的职责

`electron/main/modules/ai/service.mts` 不直接承载 MCP 细节，只负责：

- 读取 `request.tools`
- 读取 `request.tavily`
- 读取 `request.mcp`
- 合并三类工具为统一 `ToolSet`

建议把当前：

- `createTavilySdkTools()`
- `hasTavilySdkTools()`

这种模式扩展成更一般的装配方式，例如：

- `createRendererSdkTools()`
- `createTavilySdkTools()`
- `createMcpSdkTools()`

但 `createMcpSdkTools()` 的具体逻辑应放在 `mcp-tools.mts` 中，由 `service.mts` 调用。

### MCP tool 过滤规则

对某个 server 暴露 tool 时，按以下顺序过滤：

1. server 必须 `enabled = true`
2. 当前调用中该 server 必须被启用
3. `command` 必须非空，且该 server 不是“未完成草稿配置”
4. sandbox 必须已成功创建，且当前 `networkPolicy` 满足该 server 的最小运行要求
5. 若 `toolAllowlist` 非空，则只保留白名单内 tools
6. 若当前调用 `enabledTools` 非空，则继续只保留被当前调用允许的结构化 tool 标识

这里的“当前调用允许的 tool”必须是 server-scoped 的，不允许只按裸 `toolName` 过滤。第一版统一使用结构化标识：

```ts
interface MCPToolSelector {
  serverId: string;
  toolName: string;
}
```

这样可以同时表达：

- 全局安全边界
- server 默认暴露范围
- 当前调用最小权限集

### 过滤规则示例

为了避免 `toolAllowlist` 与 `enabledTools` 的关系过于抽象，第一版明确它们是顺序相与关系：

| `toolAllowlist` | `enabledTools` | 最终暴露结果 |
|---|---|---|
| 空 | 空 | 该 server 的全部 discovered tools |
| 非空 `['a', 'b']` | 空 | 仅 `a`、`b` |
| 空 | `[{ serverId, toolName: 'a' }]` | 仅 `a` |
| 非空 `['a', 'b']` | `[{ serverId, toolName: 'b' }]` | 仅 `b` |
| 非空 `['a']` | `[{ serverId, toolName: 'c' }]` | 空集合 |

也就是说：

- `toolAllowlist` 是 server 级静态上界
- `enabledTools` 是请求级动态再裁剪
- 两者没有任一方能“放宽”另一方已经收紧的范围

### 工具说明词处理

`toolInstructions` 不建议简单丢进 tool 名称或 description 字段中污染发现结果。第一版采用固定规则：

- 聊天侧先读取全局生效的 `toolInstructions`
- `service.mts` 作为唯一入口负责把它追加到系统提示末尾
- 不修改 discovered tool 的原始元数据

理由：

- 避免 tool declaration 在不同调用里发生结构变化
- 保持“工具声明”和“调用策略”分离

建议模板类似：

```txt
MCP tool usage instructions:
{resolvedToolInstructions}
```

如果最终为空字符串，则不注入该段。

这里必须避免多个入口各自拼接 prompt。无论请求来自聊天侧的不同触发路径，MCP 说明词注入都在 `service.mts` 的统一装配层处理。

注入顺序建议明确为：

1. 通用系统提示
2. 其他工具或产品级补充提示（例如 Tavily 相关说明）
3. MCP tool instructions 段落

各段之间以空行分隔，避免字符串直接拼接导致语义粘连。

## 前端接线

### 设置页

`src/views/settings/tools/mcp/index.vue` 负责：

- 展示 server 列表
- 编辑 server 配置
- 编辑默认调用配置
- 展示发现状态

它只消费 `useToolSettingsStore()` 暴露的动作和共享类型，不自行定义 server 结构。

### Store

`src/stores/toolSettings.ts` 需要扩展：

- `mcp: MCPToolSettings`
- `hasEnabledMcpServers`
- `getMcpServerById`
- `addMcpServer`
- `updateMcpServer`
- `removeMcpServer`
- `updateMcpInvocationDefaults`

这里所有 action 都只处理 store 与持久化，不处理运行态连接。

### 聊天侧消费

`src/components/BChatSidebar/hooks/useChatStream.ts` 负责：

- 从 `toolSettingsStore.mcp.invocationDefaults` 读取全局生效配置
- 生成最终的 `AIMCPRequestConfig`
- 随 AI 请求发往主进程

`src/components/BChatSidebar/index.vue` 与 `InputToolbar` 不承载 MCP 配置表单。若需要，可只展示“当前已启用的工具摘要”或跳转到设置页的入口，但不允许在这里直接编辑配置。

### 模型驱动设置修改

聊天侧如果需要让模型修改 MCP 配置，不通过本地组件状态完成，而是通过工具调用完成：

- 模型先调用 `get_mcp_settings`
- 如需修改，再调用 `add_mcp_server` / `update_mcp_server` / `remove_mcp_server`
- 写操作必须经过确认

确认通过后：

- 更新 `toolSettingsStore`
- 更新本地持久化
- 必要时刷新 discovery cache 或失效对应运行态实例

### 设置页状态同步

如果模型通过工具调用修改了 MCP 配置，设置页应能在当前会话中看到变化。第一版建议：

- 通过 store 层统一写入后，直接驱动设置页响应式刷新
- 若存在多 tab 或多窗口，至少保证当前窗口内的 `settings/tools/mcp` 与聊天侧状态一致

## 错误处理

### 配置层错误

例如：

- `command` 为空
- `connectTimeoutMs` 非法
- `toolCallTimeoutMs` 非法
- `env` 含空 key

这类错误在设置页内即时提示，但不阻止用户暂存草稿配置。

同时需要配套 UI 约束：

- `command` 为空的 server 在设置页标记为“未完成”或“草稿”
- 这类 server 不进入主进程运行候选集
- AI 请求和手动 discovery 都不会尝试启动这类 server

### 运行层错误

例如：

- sandbox 创建失败
- sandbox snapshot 不可用或恢复失败
- server 启动失败
- 握手失败
- tool discovery 失败
- tool execute 失败
- `networkPolicy` 拒绝所需出站访问

处理策略：

- 记录到日志模块
- 只屏蔽对应 server 的工具
- 在设置页状态区展示最近错误

如果旧 sandbox 正在服务中的 inflight 请求期间发生失效并触发重建，第一版建议：

- 已经绑定旧 sandbox 的 inflight 请求直接失败并返回结构化错误
- 不做跨 sandbox 的透明迁移
- 后续新请求再绑定到新 sandbox

这样虽然更保守，但能避免“请求在两个 sandbox 之间半迁移”的复杂一致性问题。

### 请求层错误

如果本次调用明确限定只使用某个 MCP server，而该 server 不可用，则允许主进程返回结构化失败，提示当前调用约束无法满足。

“唯一依赖该 server”在第一版需要可判定，定义为：

- 本次请求显式传入且仅传入一个 `enabledServerId`
- 且该请求没有其他可用的远端 MCP tool
- 且没有其他可用的本地 / Tavily 工具可完成同类工具调用链

只有同时满足这些条件时，才把 server 不可用升级为整次请求失败；否则按 server 级降级处理。

如果模型发起的是 MCP 设置修改工具调用，则写入失败、schema 非法或用户拒绝都应直接返回结构化工具结果，而不是污染当前聊天请求的 MCP 运行态配置。

## 测试策略

需要覆盖三层测试：

### 1. 共享配置测试

覆盖：

- `tool-settings/sqlite.ts` 归一化行为
- `toolAllowlist` 去重
- `runtime`、`sandboxTimeoutMs`、`networkPolicy`、`baseSnapshotId` 归一化
- `connectTimeoutMs` 与 `toolCallTimeoutMs` 约束
- 空 command / 空 env key 处理
- `UUID v4` 生成后不可编辑的 ID 约束
- discovery snapshot 作为 cache 持久化，但不参与真实权限判断
- 老用户缺失 `mcp` 字段时的默认值回填

### 2. 主进程 MCP 装配测试

覆盖：

- 无 MCP 配置时不注册工具
- 配置存在但 server 未启用时不注册工具
- `command` 为空时不启动也不注册工具
- sandbox 创建失败时不注册工具，并返回结构化错误
- `@vercel/sandbox` 初始化失败、认证失败、配额超限时的错误分类
- `networkPolicy` 不满足最小运行要求时阻止执行
- `baseSnapshotId` 可用时优先从 snapshot 启动
- `baseSnapshotId` 失效时回退冷启动或返回结构化错误
- allowlist 为空时保留全部 discovered tools
- allowlist 非空时只保留白名单内 tools
- `enabledTools` 为空时不做额外裁剪
- `enabledTools` 非空时继续裁剪到当前调用范围
- 不同 server 同名 tool 时，按 `{ serverId, toolName }` 精确过滤
- 某 server discovery 失败时的降级行为
- server 异常退出后下一次请求触发重建
- 并发请求共享同一个 client 实例
- 并发首请求受启动锁保护，不重复拉起 server
- 旧 sandbox 失效时 inflight 请求直接失败，新请求绑定新 sandbox
- `toolInstructions` 注入策略
- MCP 设置工具的 schema、确认和持久化写入链路

### 3. 前端交互测试

覆盖：

- 设置页编辑后自动持久化
- 设置页在未 discovery 前提示“先连接并发现工具”
- 设置页可展示最近一次 sandbox/discovery cache 状态
- discovery 进行中时的 loading 状态
- sandbox 状态异常时的错误展示
- 模型工具调用修改配置后，设置页即时刷新
- 同窗口内设置页与聊天侧状态同步
- `useChatStream.ts` 正确读取全局默认值
- AI 请求会带上当前全局生效的 `AIMCPRequestConfig`
- 模型通过 MCP 设置工具修改配置后，聊天侧下一次请求会读取到最新全局值

## 模块改动建议

建议至少涉及以下文件：

- `src/shared/storage/tool-settings/types.ts`
- `src/shared/storage/tool-settings/sqlite.ts`
- `src/stores/toolSettings.ts`
- `src/views/settings/constants.ts`
- `src/views/settings/tools/mcp/index.vue`
- `src/components/BChatSidebar/hooks/useChatStream.ts`
- `src/ai/tools/builtin/*`
- `types/ai.d.ts`
- `electron/main/modules/ai/service.mts`
- `electron/main/modules/ai/mcp-tools.mts`

## 安全设计

第一版至少需要明确以下安全边界：

- `env` 在设置页展示时默认脱敏
- sandbox 认证信息只在主进程持有，不进入渲染进程
- `networkPolicy` 作为 microVM 出站网络的唯一约束来源
- discovery cache 只缓存工具元数据，不缓存 secret

如果后续要进一步提升安全性，优先考虑把高敏感 `env` 分层管理，而不是先扩大渲染层可见范围。

## 数据库迁移

`ToolSettingsState` 新增 `mcp` 字段后，已有用户的持久化数据中不会自动存在该字段。第一版迁移策略应明确为：

- 继续通过 `sqlite.ts` 的归一化逻辑做惰性迁移
- 读取旧数据时，若缺失 `mcp` 字段，则自动回填 `DEFAULT_MCP_TOOL_SETTINGS`
- 回填后的新结构在下一次保存时写回本地持久化

这样可以避免单独写一次性的破坏式迁移脚本。

如果需要运行态状态缓存，还可以增加：

- `electron/main/modules/ai/mcp-runtime.mts`

但第一版也可以先把 runtime 和 tools registry 合并在 `mcp-tools.mts` 中，等复杂度上来再拆。

## 开放问题与取舍

### 1. server ID 是否允许用户编辑

建议不允许。

`id` 应作为稳定内部标识，在新增 server 时使用 `UUID v4` 生成，后续只允许编辑 `name`。这样可以避免默认启用列表和覆盖配置因用户改名而失效。

### 2. 是否允许在聊天侧直接编辑 server 级配置

建议不允许。

聊天侧只负责消费全局配置，否则会在设置页之外形成第二套人工配置入口。

### 3. `toolInstructions` 是否应下沉到每个 server

第一版不建议。

它表达的是“全局 MCP 工具使用策略”，不是某个 server 的静态配置。应该属于默认调用配置层，而不是 server 声明层。

### 4. 是否需要自定义本地沙箱

第一版不建议。

既然已经采用 `@vercel/sandbox`，就应直接复用其 microVM、`networkPolicy`、timeout 和 snapshot 能力，而不是再在宿主机上叠一层自定义本地进程沙箱。这样可以减少重复安全模型和运行时复杂度。

## 最终结论

第一版 MCP 接入采用“统一声明 + 主进程托管 + 设置页唯一人工入口 + 聊天侧只读消费 + 模型驱动设置修改”的方案：

- `settings/tools/mcp` 管全局声明和默认值
- `BChatSidebar` 只读取并消费全局配置
- MCP 设置工具负责模型驱动的全局配置读写
- 主进程 MCP 模块管发现与执行
- `service.mts` 只做工具装配

整个方案的核心不是“把 MCP 加进去”，而是先把声明源统一，保证后续继续扩展 server、tool 过滤和其他 AI 入口时，不会形成第二套、第三套平行结构。
