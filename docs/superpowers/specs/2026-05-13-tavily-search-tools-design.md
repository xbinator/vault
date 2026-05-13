# Tavily 搜索工具设置设计

## 背景

当前项目已经具备完整的 AI 模型服务商配置与聊天工具链，但“联网搜索”仍然缺少正式的可配置接入层。

用户希望引入 `@tavily/ai-sdk`，并在设置中心提供独立的搜索工具配置页面，而不是把 Tavily 伪装成普通模型服务商。原因很明确：

- Tavily 的职责是搜索与内容提取，不是模型推理 provider。
- Tavily 需要单独的 API Key 和工具级默认参数。
- 后续如果继续接入其他搜索来源，也需要稳定的“工具配置”归属。

结合当前产品结构，用户已经确认以下方向：

- 新增独立设置页，路径为 `/settings/tools/search`
- 第一版只接入 `tavilySearch` 和 `tavilyExtract`
- 搜索默认配置要尽量完整，不只保留最小字段
- `country` 需要支持，并且默认值为 `china`
- 增加启用开关，只有启用后工具才能在聊天工具链中被使用

## 目标

- 在设置中心新增 `工具 > 搜索` 页面，路径为 `/settings/tools/search`
- 为 Tavily 提供独立的持久化配置，而不是复用 `providers` 存储
- 支持 `tavilySearch` 与 `tavilyExtract` 的默认参数配置
- 通过启用开关和 API Key 完整性控制 Tavily 工具是否暴露给聊天工具链
- 让工具调用参数遵循“显式调用参数优先，未传字段回退设置默认值”的合并规则
- 为 Search 与 Extract 提供基础连通性测试能力

## 非目标

- 本次不接入 `tavilyCrawl` 或 `tavilyMap`
- 本次不支持多搜索供应商并存的 UI 切换
- 本次不做按会话、按模型或按文档覆盖 Tavily 默认参数
- 本次不引入工具级用量统计、额度显示或 API Credit 预估
- 本次不为 Tavily 工具增加额外权限确认流程
- 本次不处理 Tavily API Key 的加密存储改造，先沿用当前项目既有设置持久化方式

## 方案对比

### 方案一：新增独立搜索工具设置页

在设置页新增 `工具` 分组，并在该分组下新增 `搜索` 子页，使用独立存储和独立运行时接线。

优点：

- 语义最清晰，和模型服务商边界明确
- 后续继续接入其他搜索工具时扩展最自然
- Tavily 默认参数与聊天工具启用逻辑都能集中管理

缺点：

- 需要新增一套路由、菜单、存储和设置页组件

### 方案二：挂到现有 `AI服务商` 页面

继续复用现有 provider 详情页，把 Tavily 当作“特殊 provider”处理。

优点：

- 初始 UI 改动较小
- 可复用现有 API Key 编辑与测试交互

缺点：

- 模型 provider 与搜索 tool 概念混淆
- `models`、`baseUrl`、provider type 等既有结构与 Tavily 不匹配
- 后续再扩展其他工具能力时边界会越来越差

### 方案三：只做底层接入，不做设置页

先在运行时代码中接入 Tavily，通过本地配置或硬编码完成最小集成。

优点：

- 初始开发成本最低

缺点：

- 与用户明确提出的设置页诉求不符
- 无法把默认参数交给用户管理
- 不利于后续功能扩展与测试

## 结论

采用方案一。

Tavily 以“搜索工具配置”的身份接入系统，不进入 `AI服务商` 页面，不复用 provider 存储结构。设置中心新增 `/settings/tools/search`，该页面负责 Tavily 的启用状态、API Key、Search 默认参数、Extract 默认参数与连通性测试。

## 信息架构

### 设置导航

设置导航从当前结构：

- `AI服务商`
- `服务模型`
- `编辑器`
- `语音组件`
- `运行日志`

调整为支持工具分组的结构：

- `AI服务商`
- `服务模型`
- `工具`
- `编辑器`
- `语音组件`
- `运行日志`

其中 `工具` 下第一版只提供一个子页：

- `搜索` -> `/settings/tools/search`

这里不建议直接把菜单项命名成“Tavily”，而是保留产品视角的“搜索”。这样后续即使新增其他搜索源，页面定位也仍然成立。

### 页面分区

`/settings/tools/search` 页面拆为四个区块：

1. `基础配置`
2. `Tavily Search 默认配置`
3. `Tavily Extract 默认配置`
4. `连通性测试`

交互规则：

- `enabled = false` 时，页面继续允许编辑默认配置，但要明确提示“当前未启用，聊天中不会暴露 Tavily 工具”
- `enabled = true` 且 `apiKey` 为空时，页面提示配置不完整，并且聊天侧仍然不注册 Tavily 工具
- 设置变更沿用现有设置页的自动持久化体验，不要求额外点击“保存”

## 数据设计

### 新增存储模块

建议新增独立存储目录：

- `src/shared/storage/tool-settings/`

建议沿用和 `providers`、`service-models` 相同的本地存储组织方式，避免把 Tavily 混入 `src/shared/storage/providers/`。

### 持久化结构

建议持久化键使用独立命名，例如：

- `tool_settings`

建议新增以下类型：

```ts
export type TavilySearchDepth = 'basic' | 'advanced';
export type TavilySearchTopic = 'general' | 'news' | 'finance';
export type TavilyTimeRange = 'day' | 'week' | 'month' | 'year' | null;
export type TavilyExtractDepth = 'basic' | 'advanced';
export type TavilyExtractFormat = 'markdown' | 'text';
export type TavilyCountry =
  | 'afghanistan'
  | 'albania'
  | 'algeria'
  | 'andorra'
  | 'angola'
  | 'argentina'
  | 'armenia'
  | 'australia'
  | 'austria'
  | 'azerbaijan'
  | 'bahamas'
  | 'bahrain'
  | 'bangladesh'
  | 'barbados'
  | 'belarus'
  | 'belgium'
  | 'belize'
  | 'benin'
  | 'bhutan'
  | 'bolivia'
  | 'bosnia and herzegovina'
  | 'botswana'
  | 'brazil'
  | 'brunei'
  | 'bulgaria'
  | 'burkina faso'
  | 'burundi'
  | 'cambodia'
  | 'cameroon'
  | 'canada'
  | 'cape verde'
  | 'central african republic'
  | 'chad'
  | 'chile'
  | 'china'
  | 'colombia'
  | 'comoros'
  | 'congo'
  | string;

export interface TavilySearchDefaults {
  searchDepth: TavilySearchDepth;
  topic: TavilySearchTopic;
  timeRange: TavilyTimeRange;
  country: TavilyCountry | null;
  maxResults: number;
  includeAnswer: boolean;
  includeImages: boolean;
  includeDomains: string[];
  excludeDomains: string[];
}

export interface TavilyExtractDefaults {
  extractDepth: TavilyExtractDepth;
  format: TavilyExtractFormat;
  includeImages: boolean;
}

export interface TavilyToolSettings {
  enabled: boolean;
  apiKey: string;
  searchDefaults: TavilySearchDefaults;
  extractDefaults: TavilyExtractDefaults;
}

export interface ToolSettingsState {
  tavily: TavilyToolSettings;
}
```

`country` 的值域采用 Tavily Search API 的国家名称枚举，而不是 ISO 3166-1 alpha-2 代码。当前默认值 `china` 与官方文档一致。

考虑到 Tavily 的国家列表较长且后续可能扩展，代码实现不建议在前端硬编码完整联合类型；更稳妥的做法是：

- 常量层提供一份当前产品支持的国家选项列表
- 归一化函数至少保证值为小写字符串或 `null`
- 若值不在当前选项列表中，则回退为默认值 `china`

另外需要补充一个 Tavily 约束：`country` 仅在 `topic = 'general'` 时生效。实现上不强制清空该字段，但 UI 应给出提示，运行时透传 Tavily 让其按官方规则处理。

### 默认值

建议默认值如下：

```ts
const DEFAULT_TOOL_SETTINGS: ToolSettingsState = {
  tavily: {
    enabled: false,
    apiKey: '',
    searchDefaults: {
      searchDepth: 'basic',
      topic: 'general',
      timeRange: null,
      country: 'china',
      maxResults: 5,
      includeAnswer: true,
      includeImages: false,
      includeDomains: [],
      excludeDomains: []
    },
    extractDefaults: {
      extractDepth: 'basic',
      format: 'markdown',
      includeImages: false
    }
  }
};
```

说明：

- `enabled` 默认关闭，避免未配置 API Key 时误暴露工具
- `country` 默认 `china`，符合当前用户要求
- `timeRange` 默认 `null`，表示不额外限制时间范围
- `includeDomains` 与 `excludeDomains` 默认空数组
- `format` 默认 `markdown`，更适合当前聊天与富文本展示链路

### 合法值归一化

建议在新存储模块或新 store 内实现归一化函数，例如：

- `normalizeToolSettings(value: unknown): ToolSettingsState`

职责：

- 校验布尔字段是否合法
- 校验枚举字段是否合法
- 约束 `maxResults` 在可接受范围内
- 保证 `includeDomains` / `excludeDomains` 始终是字符串数组
- 显式处理 `timeRange` 字段存在且值为 `null` 的情况，并将其视为合法“未设置”状态
- 处理非法或空对象时回退默认值

`maxResults` 的建议约束：

- 最小值 `1`
- 最大值 `20`

虽然 Tavily Search API 允许 `0`，但在本产品交互中没有实际意义，保留 `1..20` 更符合用户预期。

## 运行时行为设计

### 工具注册门禁

Tavily 工具是否加入聊天工具链，由以下条件共同决定：

- `tavily.enabled === true`
- `tavily.apiKey.trim()` 非空

只有同时满足这两个条件时，才注册：

- `tavily_search`
- `tavily_extract`

否则：

- 不把 Tavily 工具暴露给模型
- 模型在一次聊天中根本看不到这些工具

这样比“注册后执行时报错”更干净，也更符合用户对“启用/关闭”的理解。

### 参数合并规则

Tavily 工具调用的参数合并规则固定为：

1. 本次工具调用显式传入的参数优先
2. 本次未传入的字段回退到设置页默认值
3. 仍未配置的可选字段保持 `undefined` 或工具 SDK 默认行为

具体规则：

- `tavilySearch` 使用 `searchDefaults`
- `tavilyExtract` 使用 `extractDefaults`
- `country` 仅作用于 `tavilySearch`
- `extract` 不共享 `search` 的默认参数
- `includeDomains` / `excludeDomains` 在未显式传入时直接使用设置默认值

参数合并的唯一落点定义在主进程 AI service 层，也就是真正创建 Tavily SDK 工具实例之前。

原因：

- 前端 `src/ai/tools` 应专注于工具定义、参数 schema 与是否暴露
- 主进程层同时掌握 Tavily 持久化设置和最终 SDK 调用参数
- 把合并逻辑集中在主进程，更容易测试“默认值 + 显式覆盖”的最终行为

因此测试中提到的“运行时参数能正确合并默认值与显式调用值”，默认指向主进程 Tavily 工具组装层。

### 聊天工具执行路径

建议保持现有工具架构分层：

1. 前端 `src/ai/tools` 定义 Tavily 工具的元数据、参数 schema 和执行入口
2. 聊天流将工具调用交给现有 transport tool 机制
3. 主进程 AI service 读取 Tavily 设置，并在这一层完成“调用参数覆盖默认参数”的合并
4. 主进程 AI service 组装 Tavily SDK 工具实例
5. Tavily SDK 工具实例使用合并后的最终参数执行请求

这意味着 Tavily 仍然是“模型可调用工具”，只是底层实际实现不再是仓库内置读写工具，而是对 `@tavily/ai-sdk` 的受控封装。

## 工具设计

### 工具范围

第一版只新增两个 Tavily 工具：

- `tavily_search`
- `tavily_extract`

两者都应显式设置：

- `requiresActiveDocument: false`

因为它们不依赖当前编辑器文档上下文。

### 风险级别

建议两个工具都归类为只读工具：

- `riskLevel: 'read'`

理由：

- 它们不会写本地文件或修改编辑器内容
- 它们的主要行为是网络搜索与内容提取

### 参数边界

`tavily_search` 建议暴露的可调用参数应与设置默认值保持一致，至少包括：

- `query`
- `searchDepth`
- `topic`
- `timeRange`
- `country`
- `maxResults`
- `includeAnswer`
- `includeImages`
- `includeDomains`
- `excludeDomains`

`tavily_extract` 建议至少支持：

- `url`
- `extractDepth`
- `format`
- `includeImages`

第一版明确只支持单 URL 输入，不同时支持 `url` 和 `urls` 两套 schema。这样可以避免首版工具定义出现分支复杂度。

与 Tavily Extract API 的适配方式固定为：

- 工具层暴露 `url: string`
- 主进程 Tavily 适配层在最终调用 SDK 前把它转换成 `urls: [url]`

这样既保留了 UI 和工具层的简单性，也和 Tavily SDK 的底层参数结构兼容。

另外，工具层的参数命名、SDK 层的参数命名和设置层字段命名最好尽量保持一致；本次 `url -> urls` 是唯一允许的显式适配。

## UI 设计

### 基础配置区

字段：

- `启用 Tavily 工具`
- `API Key`

行为：

- 开启开关后，如果 API Key 为空，显示显式错误提示
- API Key 输入使用密码框
- 提供简短说明，告知该开关控制聊天中是否暴露 Tavily 工具

### Search 默认配置区

字段：

- `搜索深度`
- `主题`
- `时间范围`
- `国家`
- `最大结果数`
- `包含 AI 摘要`
- `包含图片`
- `限定域名`
- `排除域名`

建议交互：

- `时间范围` 提供“未设置”选项，对应 `null`
- `国家` 使用可搜索下拉框
- `限定域名` / `排除域名` 使用多值输入
- `最大结果数` 使用数字输入，并带范围提示

### Extract 默认配置区

字段：

- `提取深度`
- `输出格式`
- `包含图片`

这部分保持精简，不提前暴露超出第一版范围的提取参数。

### 连通性测试区

建议提供两个独立按钮：

- `测试 Search`
- `测试 Extract`

其中 `测试 Extract` 需要在同一区块提供一个独立的 URL 输入框，不复用页面其他字段。这个输入框只服务于连通性测试，不写回持久化设置。

测试策略：

- Search 使用内置示例 query，例如“今日 AI 行业动态”
- Extract 使用测试区 URL 输入框中的用户输入值，避免硬编码外部站点不稳定影响判断

返回结果：

- 成功时展示简短成功反馈
- 失败时展示标准错误消息

连通性测试的目标是验证：

- API Key 是否可用
- Tavily 工具端到端链路是否畅通

而不是展示完整搜索结果或提取结果。

Search 测试示例 query 不应散落在组件内，建议抽到搜索设置页常量文件或同目录 `constants.ts` 中统一维护。

## 路由与组件拆分

建议新增或调整以下路径：

- `src/router/routes/modules/settings.ts`
- `src/views/settings/index.vue`
- `src/views/settings/constants.ts`
- `src/views/settings/tools/search/index.vue`

如测试交互较多，也可以拆出：

- `src/views/settings/tools/search/components/SearchConnectionTest.vue`
- `src/views/settings/tools/search/components/TavilyBaseConfig.vue`

如当前设置页导航仅支持一级项，建议把“工具”作为一级入口，并在对应页面内展示二级导航；如果现有结构已允许子路由，则直接加 `tools/search` 子路由即可。实现时应优先复用现有设置页样式模式，而不是新造一套导航系统。

## Store 与存储职责

### 新增专用 store

建议新增专用 store，例如：

- `src/stores/toolSettings.ts`

职责：

- 读取和持久化 `tool_settings`
- 暴露 Tavily 配置的只读/可写状态
- 提供页面使用的 `setEnabled`、`setApiKey`、`setSearchDefaults`、`setExtractDefaults` 等 action
- 提供一个派生 getter，用于判断 Tavily 当前是否“可注册”

例如：

- `isTavilyAvailable = enabled && apiKey.trim().length > 0`

这样聊天工具链只需要读取一个明确的能力标志，而不是自己重复拼条件。

### 与现有 `settingStore` 的边界

不建议把 Tavily 配置继续塞进 `src/stores/setting.ts`。原因：

- `settingStore` 当前已经承载主题、侧边栏和工具权限等全局设置
- Tavily 配置是一个完整的领域模块，包含自己的嵌套结构和默认值归一化逻辑
- 抽成专用 store 更符合当前项目已有的 `providers` / `service-models` 模块化思路

## 错误处理

需要覆盖以下场景：

- `enabled = true` 但 `apiKey` 为空
- Tavily API Key 无效
- 网络错误或 Tavily 服务异常
- `extract` 测试 URL 非法
- 设置中的域名列表包含空字符串或非法值

处理原则：

- 设置页尽量在输入侧做基础校验
- 运行时仍然做兜底校验
- 聊天侧不注册不可用工具，减少模型误调用概率
- 连通性测试错误消息尽量直接转成用户可理解文案

域名输入规则需要在设置页和归一化逻辑中统一：

- 只接受裸域名，不接受协议前缀，如 `example.com`
- 自动去除首尾空白
- 空字符串在保存前过滤掉
- 第一版不支持通配符

这样可以避免 UI、store 和运行时各自发明不同规则。

## 测试设计

至少需要覆盖以下测试：

### 存储与 store

- 默认值加载正确
- `country` 默认值为 `china`
- 非法持久化数据能被归一化修复
- `isTavilyAvailable` 在不同状态下返回正确值

### 设置页

- 开关、API Key 和默认参数可以正确回写
- `enabled = false` 时展示未启用提示
- `enabled = true` 且无 API Key 时展示配置不完整提示
- `includeDomains` / `excludeDomains` 能正确转换为数组

### 聊天工具接线

- `enabled = false` 时不注册 Tavily 工具
- `enabled = true` 但无 API Key 时不注册 Tavily 工具
- `enabled = true` 且有 API Key 时注册 `tavily_search` 与 `tavily_extract`
- 运行时参数能正确合并默认值与显式调用值

### 连通性测试

- Search 测试成功路径
- Search 测试失败路径
- Extract 测试成功路径
- Extract 测试失败路径

## 影响文件

预计会涉及以下区域：

- `src/views/settings/constants.ts`
- `src/views/settings/index.vue`
- `src/views/settings/tools/search/index.vue`
- `src/router/routes/modules/settings.ts`
- `src/shared/storage/tool-settings/`
- `src/stores/toolSettings.ts`
- `src/ai/tools/`
- `electron/main/modules/ai/service.mts`
- `test/` 下对应设置页、store、AI 工具链测试

## 实施顺序建议

建议按以下顺序实现：

1. 先完成 `tool-settings` 存储和 `toolSettings` store
2. 再接入 `/settings/tools/search` 页面与路由
3. 再完成 Tavily 工具定义与运行时注册门禁
4. 最后补连通性测试和回归测试

这样可以先把“配置源”稳定下来，再把运行时工具接上，避免 UI 和工具链同时漂移。
