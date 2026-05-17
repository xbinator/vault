# MCP 工具接入设计

## 背景

当前项目已经具备两类 AI 工具能力：

- `src/ai/tools` 下由渲染进程本地执行的内置工具
- 由主进程 AI 服务直接注册给 AI SDK 的远端工具，例如 Tavily

MCP 接入需要补齐一条完整能力链：

- 在 `src/views/settings/tools/mcp` 中管理全局 MCP server 配置
- 在 `src/components/BChatSidebar/hooks/useChatStream.ts` 中消费全局 MCP 配置
- 通过模型工具读取和修改 MCP 配置
- 在主进程完成 MCP tool discovery、过滤、注册和执行
- 用统一共享类型约束配置、请求和运行边界

用户后续明确调整了范围：

- 不做云端执行，不接入 `@vercel/sandbox`
- 不保留“默认调用配置”层
- 第一版只保留本地 `stdio` MCP server
- 本地执行先采用 `shell: false`、超时和 allowlist 作为边界，系统级本地沙箱后续再评估

## 目标

- 支持 `工具 > MCP` 设置页，用于新增、编辑、删除和刷新 MCP server
- 支持聊天侧自动读取当前全局 MCP server 配置并传给主进程
- 支持模型通过工具调用读取和修改全局 MCP 配置
- 支持主进程基于 discovery cache 暴露 MCP tools 给 AI SDK
- 支持 tool allowlist、连接超时和工具调用超时
- 保持配置声明、持久化归一化和请求类型集中在共享类型中

## 非目标

- 本次不支持 HTTP、SSE 或其他 transport，第一版只支持 `stdio`
- 本次不做云端执行、Vercel sandbox、microVM、snapshot 或网络策略配置
- 本次不做“默认调用配置”，不提供 `MCPInvocationDefaults`
- 本次不做按聊天会话或单次请求保存的 MCP 临时覆盖配置
- 本次不在 `BChatSidebar` 中新增 MCP 配置表单
- 本次不做 MCP 工具市场、模板中心或远端分享
- 本次不做完整系统级本地沙箱插件
- 本次不做工具级调用统计、token 成本统计或 server 资源监控

## 结论

采用本地 `stdio` 方案。

MCP server 配置由设置页维护，聊天侧只读取并消费全局配置。真正的 MCP discovery 和 tool execution 由主进程模块负责，渲染进程不直接启动 MCP server。

模型读写 MCP 配置通过内置工具完成：

- `get_mcp_settings`
- `add_mcp_server`
- `update_mcp_server`
- `remove_mcp_server`
- `refresh_mcp_discovery`

其中写配置和刷新 discovery 都必须走统一工具确认流程。`refresh_mcp_discovery` 会触发本地 MCP server 启动，因此按写风险处理。

## 设计原则

### 1. 单一声明源

同一类声明只能有一个源头：

- 配置声明：`src/shared/storage/tool-settings/types.ts`
- 持久化归一化：`src/shared/storage/tool-settings/sqlite.ts`
- store 动作：`src/stores/toolSettings.ts`
- 主进程 discovery / 执行：`electron/main/modules/ai/mcp-runtime.mts` 和 `electron/main/modules/ai/mcp-local-stdio.mts`
- 主进程 tool 过滤 / AI SDK 转换：`electron/main/modules/ai/mcp-tools.mts`
- 模型读写配置工具：`src/ai/tools/builtin/MCPSettingsTool/index.ts`

### 2. 配置与执行分离

前端负责声明“有哪些 MCP server 配置”，主进程负责“能不能发现工具、能不能执行工具”。前端不直接维护 MCP client，也不直接执行 MCP tools。

### 3. 设置页唯一人工入口

`settings/tools/mcp` 定义并维护全部 MCP 全局配置。聊天侧不提供第二套人工编辑入口。

如果用户希望在聊天中修改 MCP 配置，应由模型通过 MCP 设置工具发起写操作，并由用户确认后写回全局配置。

### 4. 对失败做 server 级降级

某个 MCP server 启动失败或 discovery 失败时，只影响该 server 的工具暴露，不默认打断整次 AI 请求。其他本地工具、Tavily 工具或可用 MCP server 仍可继续参与本次请求。

### 5. 本地执行边界明确

第一版本地执行边界是：

- `spawn(..., { shell: false })`，避免 shell 字符串解释
- `connectTimeoutMs` 约束连接和握手时间
- `toolCallTimeoutMs` 约束单次 MCP tool 调用时间
- `toolAllowlist` 约束每个 server 默认允许暴露的工具
- discovery cache 只作为工具元数据缓存，不作为权限源

这不是完整系统级沙箱。后续如果要更强隔离，应作为单独设计评估。

## 信息架构

### 设置导航

保留当前 `工具` 分组，并在其下新增 MCP 子页：

- `搜索` -> `/settings/tools/search`
- `MCP` -> `/settings/tools/mcp`

### 页面分区

`/settings/tools/mcp` 第一版包含两个核心区块：

- `MCP Servers`
- `连通性与发现状态`

#### MCP Servers

用于管理一个或多个 server：

- 新增 server
- 编辑 `name`
- 编辑 `command`
- 编辑 `args`
- 编辑 `env`
- 启用 / 禁用
- 配置默认允许暴露的 tools
- 配置连接超时和工具调用超时

#### 连通性与发现状态

展示运行态信息：

- 最近一次连接是否成功
- 最近一次 tool discovery 是否成功
- 错误消息
- 发现到的 tool 列表快照

discovery cache 只用于 UI 展示和后续工具注册的候选来源。真正的运行权限仍以当前 server 配置、本次请求启用状态和 allowlist 过滤结果为准。

## 数据设计

### 统一声明位置

以下声明统一收敛到 `src/shared/storage/tool-settings/types.ts`：

- `MCPTransportType`
- `MCPServerConfig`
- `MCPToolSelector`
- `MCPToolSettings`
- `AIMCPRequestConfig`
- `MCPDiscoveredToolSnapshot`
- `MCPServerDiscoveryCache`
- `ToolSettingsState`
- `DEFAULT_TOOL_SETTINGS`
- MCP 相关默认常量和字段级注释

不再保留：

- `MCPInvocationDefaults`
- `DEFAULT_MCP_SANDBOX_TIMEOUT_MS`
- `runtime`
- `sandboxTimeoutMs`
- `networkPolicy`
- `baseSnapshotId`

### 持久化结构

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
  /** 默认允许暴露的 tool 名称 */
  toolAllowlist: string[];
  /** 连接与握手超时 */
  connectTimeoutMs: number;
  /** 单次工具调用超时 */
  toolCallTimeoutMs: number;
}

/**
 * MCP 设置总结构。
 */
export interface MCPToolSettings {
  /** server 列表 */
  servers: MCPServerConfig[];
}

/**
 * 发往主进程 AI 服务的 MCP 请求配置。
 */
export interface AIMCPRequestConfig {
  /** 当前请求携带的 MCP server 配置快照 */
  servers: MCPServerConfig[];
  /** 当前请求启用的 server ID */
  enabledServerIds: string[];
  /** 当前请求允许的 tool 标识 */
  enabledTools: MCPToolSelector[];
  /** 当前请求附加的 MCP 工具说明词 */
  toolInstructions: string;
}
```

`AIMCPRequestConfig` 仍保留 `enabledTools` 和 `toolInstructions` 字段，是为了保持主进程过滤和提示词注入结构稳定。第一版聊天侧默认传空数组和空字符串，不提供用户配置入口。

### 默认值

```ts
export const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 20000;
export const DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS = 30000;

export const DEFAULT_MCP_TOOL_SETTINGS: MCPToolSettings = {
  servers: []
};
```

第一版没有预置 server，避免未配置时误暴露工具。

### 归一化规则

`src/shared/storage/tool-settings/sqlite.ts` 负责以下归一化：

- `id` 为空时丢弃该 server
- `name` 为空时回退为 `command` 或通用占位名
- `enabled` 归一化为布尔值
- `transport` 固定为 `stdio`
- `command` 为空时视为不可运行配置，但允许保留以供用户继续编辑
- `args` 保证为字符串数组
- `env` 保证为字符串字典，过滤空 key
- `toolAllowlist` 保证为去重后的字符串数组
- `connectTimeoutMs` 与 `toolCallTimeoutMs` 分别约束在合理范围
- 对已有用户缺失的 `mcp` 字段，归一化时自动回填 `DEFAULT_MCP_TOOL_SETTINGS`
- 旧数据里的云端字段会被丢弃，不再参与持久化或执行

需要注意：

- “可持久化”不等于“可运行”
- 配置合法性检查和运行时连通性检查是两层不同逻辑

## 请求模型设计

### AI 请求体扩展

`AIRequestOptions` 增加：

```ts
export interface AIRequestOptions {
  // ...
  tavily?: TavilyToolSettings;
  mcp?: AIMCPRequestConfig;
}
```

### 请求生成规则

聊天侧请求发起前按以下规则生成 MCP 请求配置：

1. 读取 `toolSettingsStore.mcp.servers`
2. 选择 `enabled = true` 且 `command` 非空的 server
3. 将这些 server 的配置快照写入 `mcp.servers`
4. 将这些 server 的 ID 写入 `mcp.enabledServerIds`
5. 第一版 `mcp.enabledTools` 固定为空数组
6. 第一版 `mcp.toolInstructions` 固定为空字符串

主进程收到请求后：

1. 从 `request.mcp.servers` 获取本次请求配置快照
2. 读取 discovery cache 或按需刷新 discovery
3. 按 server 启用状态、command、allowlist 和 `enabledTools` 过滤工具
4. 将可用 MCP tools 转换为 AI SDK `ToolSet`
5. 执行 MCP tool call 时通过本地 stdio runtime 调用对应 server

## IPC 接口设计

MCP 专用 IPC 通道：

- `tools:mcp:refresh-discovery`
  触发指定 server 的本地 stdio discovery，返回结构化成功或失败结果
- `tools:mcp:get-status`
  查询一个或多个 server 的运行态状态
- `tools:mcp:get-discovery-cache`
  读取最近一次 discovery cache

设计约束：

- 全部采用异步 `invoke` / `handle` 风格
- 错误统一按结构化结果返回
- 状态查询类 IPC 不隐式启动 MCP server
- `refresh-discovery` 会启动本地命令，因此 UI 和模型工具都需要明确确认入口

## 执行架构

### 主进程 MCP 模块

第一版主进程模块：

- `electron/main/modules/ai/mcp-local-stdio.mts`
- `electron/main/modules/ai/mcp-runtime.mts`
- `electron/main/modules/ai/mcp-tools.mts`
- `electron/main/modules/ai/mcp-ipc.mts`

职责包括：

- 使用本地 `stdio` 启动 MCP server
- 完成 JSON-RPC initialize、`tools/list` 和 `tools/call`
- 维护 discovery cache 和运行态状态
- 将 discovery tool 转换为 AI SDK 兼容工具
- 按 allowlist 和请求级 selector 过滤暴露范围
- 在执行失败时返回可记录的标准化错误

### 本地 stdio runner

本地 runner 必须遵守：

- 使用 `spawn(command, args, { shell: false })`
- 不拼接 shell 命令字符串
- 使用配置里的 `env` 作为子进程环境补充
- 连接和握手受 `connectTimeoutMs` 约束
- 单次工具调用受 `toolCallTimeoutMs` 约束
- 进程退出、超时、JSON-RPC 错误都返回结构化失败

### 生命周期策略

第一版策略：

- `stdio` server 采用按需启动
- discovery 通过设置页手动刷新或主进程按需触发
- discovery cache 可复用，但不是权限源
- 不做后台无限重连
- 不做长期运行的云端/microVM 生命周期管理
- 应用退出时主进程统一清理活跃本地进程

### tool discovery 与缓存策略

discovery 触发场景：

- 设置页点击刷新 discovery
- 模型调用 `refresh_mcp_discovery`
- AI 请求需要某个 server 的 MCP tools 且当前无可用 cache

缓存失效条件：

- `command` 变化
- `args` 变化
- `env` 变化
- 手动刷新 discovery
- 本地 server 运行失败后重新发现

以下字段变化不要求强制失效 discovery cache：

- `name`
- `toolAllowlist`
- `connectTimeoutMs`
- `toolCallTimeoutMs`

理由：

- 前一组字段直接影响 server 行为
- 后一组字段只影响展示、过滤或超时策略

discovery cache 中保存结构化 tool 标识，避免不同 server 存在同名 tool 时混淆。

## MCP tool 过滤规则

对某个 server 暴露 tool 时，按以下顺序过滤：

1. server 必须 `enabled = true`
2. 当前请求中该 server 必须出现在 `enabledServerIds`
3. `command` 必须非空
4. discovery cache 中必须存在该 server 的工具快照，或 discovery 成功
5. 若 `toolAllowlist` 非空，则只保留白名单内 tools
6. 若当前请求 `enabledTools` 非空，则继续只保留被当前请求允许的结构化 tool 标识

这里的“当前请求允许的 tool”必须是 server-scoped 的，不允许只按裸 `toolName` 过滤。

```ts
interface MCPToolSelector {
  serverId: string;
  toolName: string;
}
```

过滤关系是顺序相与：

| `toolAllowlist` | `enabledTools` | 最终暴露结果 |
|---|---|---|
| 空 | 空 | 该 server 的全部 discovered tools |
| 非空 `['a', 'b']` | 空 | 仅 `a`、`b` |
| 空 | `[{ serverId, toolName: 'a' }]` | 仅 `a` |
| 非空 `['a', 'b']` | `[{ serverId, toolName: 'b' }]` | 仅 `b` |
| 非空 `['a']` | `[{ serverId, toolName: 'c' }]` | 空集合 |

## 前端接线

### 设置页

`src/views/settings/tools/mcp/index.vue` 负责：

- 展示 server 列表
- 编辑 server 配置
- 展示 discovery 状态
- 手动刷新 discovery

它只消费 `useToolSettingsStore()` 暴露的动作和共享类型，不自行定义 server 结构。

### Store

`src/stores/toolSettings.ts` 扩展：

- `mcp: MCPToolSettings`
- `hasEnabledMcpServers`
- `getMcpServerById`
- `addMcpServer`
- `updateMcpServer`
- `removeMcpServer`

store action 只处理状态与持久化，不直接处理运行态连接。

### 聊天侧消费

`src/components/BChatSidebar/hooks/useChatStream.ts` 负责：

- 从 `toolSettingsStore.mcp.servers` 读取当前全局 server 配置
- 生成最终的 `AIMCPRequestConfig`
- 随 AI 请求发往主进程

`src/components/BChatSidebar/index.vue` 与 `InputToolbar` 不承载 MCP 配置表单。

### 模型驱动设置修改

聊天侧如果需要让模型修改 MCP 配置，不通过本地组件状态完成，而是通过工具调用完成：

- 模型先调用 `get_mcp_settings`
- 如需新增 server，调用 `add_mcp_server`
- 如需修改 server，调用 `update_mcp_server`
- 如需删除 server，调用 `remove_mcp_server`
- 如需刷新工具发现，调用 `refresh_mcp_discovery`

写操作必须经过确认。确认通过后：

- 更新 `toolSettingsStore`
- 更新本地持久化
- 设置页通过 store 响应式刷新
- 后续聊天请求读取最新全局配置

## 错误处理

### 配置层错误

例如：

- `command` 为空
- `connectTimeoutMs` 非法
- `toolCallTimeoutMs` 非法
- `env` 含空 key

这类错误在设置页内提示，但不阻止用户暂存草稿配置。`command` 为空的 server 不进入主进程运行候选集，AI 请求和手动 discovery 都不会尝试启动这类 server。

### 运行层错误

例如：

- 本地命令不存在
- server 启动失败
- 握手失败
- tool discovery 失败
- tool execute 失败
- 调用超时
- MCP server 返回 JSON-RPC 错误

处理策略：

- 记录到日志模块
- 只屏蔽对应 server 的工具
- 在设置页状态区展示最近错误
- 返回结构化错误结果，避免渲染层解析裸异常字符串

### 模型配置工具错误

如果模型发起 MCP 设置修改工具调用：

- 输入 schema 非法时返回 `INVALID_INPUT`
- 用户拒绝时返回 cancelled 结果
- 持久化失败或 refresh 执行失败时返回结构化 failure 结果
- 不污染当前聊天请求的 MCP 运行态配置

## 安全设计

第一版安全边界：

- 本地执行只使用 `shell: false`
- 不使用 shell 字符串拼接
- `env` 只作为指定 MCP server 的子进程环境补充
- `toolAllowlist` 是 server 级默认暴露上界
- `enabledTools` 是请求级再裁剪边界
- discovery cache 只缓存工具元数据，不缓存 secret
- 写配置和 refresh discovery 都走用户确认流程

已知限制：

- 当前不是完整系统级沙箱
- 本地 MCP server 仍以用户本机权限运行
- 对文件系统、网络访问的强隔离需要后续单独设计

## 数据库迁移

`ToolSettingsState` 新增 `mcp` 字段后，已有用户的持久化数据中不会自动存在该字段。第一版迁移策略：

- 继续通过 `sqlite.ts` 的归一化逻辑做惰性迁移
- 读取旧数据时，若缺失 `mcp` 字段，则自动回填 `DEFAULT_MCP_TOOL_SETTINGS`
- 回填后的新结构在下一次保存时写回本地持久化
- 旧版本遗留的云端字段在归一化时丢弃

## 测试策略

### 1. 共享配置测试

覆盖：

- `tool-settings/sqlite.ts` 归一化行为
- `toolAllowlist` 去重
- `connectTimeoutMs` 与 `toolCallTimeoutMs` 约束
- 空 command / 空 env key 处理
- 老用户缺失 `mcp` 字段时的默认值回填
- 旧云端字段被丢弃

### 2. 主进程 MCP 测试

覆盖：

- 无 MCP 配置时不注册工具
- 配置存在但 server 未启用时不注册工具
- `command` 为空时不启动也不注册工具
- allowlist 为空时保留全部 discovered tools
- allowlist 非空时只保留白名单内 tools
- `enabledTools` 为空时不做额外裁剪
- `enabledTools` 非空时继续裁剪到当前调用范围
- 不同 server 同名 tool 时，按 `{ serverId, toolName }` 精确过滤
- discovery 失败时的 server 级降级行为
- 本地 stdio initialize、`tools/list`、`tools/call`、超时和错误处理
- IPC 状态、cache、refresh discovery 通道

### 3. 前端和模型工具测试

覆盖：

- 设置页编辑后自动持久化
- 设置页可展示最近一次 discovery cache 状态
- discovery 进行中时的 loading 状态
- 状态异常时的错误展示
- `useChatStream.ts` 正确读取全局 enabled server
- AI 请求会带上当前全局生效的 `AIMCPRequestConfig`
- MCP 设置工具的 schema、确认和持久化写入链路
- 模型通过 MCP 设置工具修改配置后，聊天侧下一次请求会读取到最新全局值

## 模块改动范围

涉及文件：

- `src/shared/storage/tool-settings/types.ts`
- `src/shared/storage/tool-settings/sqlite.ts`
- `src/stores/toolSettings.ts`
- `src/views/settings/constants.ts`
- `src/views/settings/tools/mcp/index.vue`
- `src/components/BChatSidebar/hooks/useChatStream.ts`
- `src/ai/tools/builtin/MCPSettingsTool/index.ts`
- `src/ai/tools/builtin/index.ts`
- `types/ai.d.ts`
- `types/electron-api.d.ts`
- `electron/preload/index.mts`
- `electron/main/modules/index.mts`
- `electron/main/modules/ai/service.mts`
- `electron/main/modules/ai/mcp-local-stdio.mts`
- `electron/main/modules/ai/mcp-runtime.mts`
- `electron/main/modules/ai/mcp-tools.mts`
- `electron/main/modules/ai/mcp-ipc.mts`

## 开放问题与取舍

### 1. server ID 是否允许用户编辑

不允许。

`id` 是稳定内部标识，在新增 server 时生成，后续只允许编辑 `name`。这样可以避免 allowlist、discovery cache 和请求 selector 因用户改名而失效。

### 2. 是否允许在聊天侧直接编辑 server 级配置

不允许。

聊天侧只负责消费全局配置，否则会在设置页之外形成第二套人工配置入口。

### 3. 是否保留默认调用配置

不保留。

第一版直接按“已启用且 command 非空的 server”生成请求配置，`enabledTools` 和 `toolInstructions` 保留在请求结构中但不提供配置入口。

### 4. 是否使用云端 sandbox

不使用。

用户明确要求移除云端执行，第一版只保留本地 stdio 执行。

### 5. 是否需要更强本地沙箱

本次不做。

后续如果要加入系统级本地沙箱，应单独设计可执行范围、文件系统边界、网络边界、命令 allowlist 和跨平台策略。

## 最终结论

第一版 MCP 接入采用“统一声明 + 主进程托管 + 本地 stdio 执行 + 设置页唯一人工入口 + 聊天侧只读消费 + 模型驱动设置修改”的方案：

- `settings/tools/mcp` 管全局 MCP server 配置
- `BChatSidebar` 只读取并消费全局配置
- MCP 设置工具负责模型驱动的全局配置读写
- 主进程 MCP 模块负责 discovery、过滤、注册和执行
- `service.mts` 只做工具装配
- 云端 sandbox、默认调用配置和完整本地系统沙箱都不在第一版范围内

整个方案的核心不是“把 MCP 加进去”，而是先把声明源统一，保证后续继续扩展 transport、server 模板、tool 过滤和更强沙箱时，不会形成第二套、第三套平行结构。
