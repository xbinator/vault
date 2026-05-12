/**
 * @file 2026-05-12-header-tabs-context-close-design.md
 * @description HeaderTabs 右键关闭菜单与 tabs store 批量关闭能力设计说明。
 */

# HeaderTabs 右键关闭菜单与批量关闭设计

## 背景

当前 `src/layouts/default/components/HeaderTabs.vue` 只支持以下标签页交互：

- 点击标签切换路由
- 点击关闭按钮关闭单个标签
- 横向滚动
- 拖拽调整顺序

现有关闭逻辑只覆盖“关闭当前标签”，且直接写在组件内部：

- 组件根据当前点击的标签决定是否关闭
- 若关闭的是激活标签，则按“优先右侧、其次左侧”的方式切换到相邻标签
- 若没有剩余标签，则跳转到 `/welcome`

随着顶部标签交互扩展到右键菜单，关闭能力不再局限于单标签操作，而会扩展为：

- 关闭
- 关闭其他
- 关闭右侧
- 关闭已保存
- 全部关闭

如果仍然把这些逻辑全部堆在 `HeaderTabs.vue` 中，组件将同时承担：

- 右键菜单项生成
- 菜单项禁用判断
- 目标标签集合计算
- 脏标签确认判断
- 批量关闭执行
- 激活标签切换推导

这会让组件职责过重，也会使后续快捷键、命令面板、系统菜单等入口难以复用相同规则。

## 目标

- 为标签页关闭能力建立统一的 store 级规则模型
- 让 `HeaderTabs.vue` 只承担右键菜单展示、确认弹窗和路由跳转
- 支持五类关闭动作的统一禁用判断、目标计算和脏标签确认判断
- 保持现有激活标签回退策略：优先原激活标签右侧，其次左侧；都没有则跳转 `/welcome`
- 为后续快捷键、命令面板、系统菜单等入口复用关闭能力预留稳定接口

## 非目标

- 不在本次设计中修改标签栏视觉样式
- 不在本次设计中调整拖拽排序、滚轮滚动或普通左键切换逻辑
- 不把 `Modal.confirm` 或 `router.push` 下沉到 store 中
- 不引入新的标签分组、固定标签或批量保存能力

## 需求约束

右键菜单项规则如下：

| 菜单项 | 禁用条件 | 确认条件 |
|------|------|------|
| 关闭 | 仅 1 个标签时禁用 | 该标签为脏标签时确认 |
| 关闭其他 | 仅 1 个标签时禁用 | 其他标签中有脏标签时确认 |
| 关闭右侧 | 右键标签已是最后一个时禁用 | 右侧有脏标签时确认 |
| 关闭已保存 | 没有已保存标签时禁用 | 无需确认 |
| 全部关闭 | 无标签时禁用 | 有脏标签时确认 |

额外约束：

- 所有关闭操作中，只要目标标签集合中包含脏标签，就需要弹出确认
- `关闭已保存` 只关闭非脏标签，因此无需确认
- 当关闭动作包含当前激活标签时，需要按统一策略计算新的激活目标

## 可选方案

### 方案一：仅在 `HeaderTabs.vue` 内实现全部逻辑

由组件直接根据右键标签和当前 tab 列表，生成每个菜单项的禁用态、确认条件、关闭目标和跳转目标。

优点：

- 改动范围集中在一个组件
- 初始实现速度快

缺点：

- 业务规则分散在组件内部，后续其他入口无法复用
- 菜单状态和关闭执行逻辑容易耦合在一起
- 测试时只能通过组件行为间接覆盖，难以单独验证批量关闭规则

### 方案二：store 提供高阶关闭动作

在 `tabs store` 中直接新增多个动作，例如：

- `closeTab(tabId, activeTabId)`
- `closeOtherTabs(tabId, activeTabId)`
- `closeRightTabs(tabId, activeTabId)`
- `closeSavedTabs(activeTabId)`
- `closeAllTabs(activeTabId)`

优点：

- 关闭逻辑下沉到了 store
- UI 调用方式直观

缺点：

- 每个动作都要重复处理目标集合、脏标签判断和激活目标推导
- 菜单禁用态和确认信息仍然需要 UI 侧再做一次平行判断
- 新增动作时容易产生规则分叉

### 方案三：store 提供“关闭计划 + 执行”两阶段能力

先由 store 根据动作类型和上下文计算一个“关闭计划”，再由 UI 根据计划决定是否确认、是否执行、是否跳转。

优点：

- 规则集中，禁用判断、确认判断和关闭目标计算只维护一份
- UI 很薄，只需要读取计划并执行确认/跳转
- 便于复用到右键菜单、快捷键、命令面板、系统菜单
- 便于单元测试纯规则逻辑

缺点：

- 初次设计比单纯写几个 action 稍复杂
- 需要定义额外的数据结构承载“关闭计划”

## 推荐方案

推荐使用方案三：`tabs store` 提供“关闭计划 + 执行”能力，`HeaderTabs.vue` 作为 UI 调用方。

原因如下：

- 这套需求的核心复杂度不在“删除 tab”本身，而在“根据动作计算目标集合并判断是否确认”
- 右键菜单只是第一个调用入口，后续很可能还会有快捷键、窗口菜单等复用需求
- `Modal.confirm` 和 `router.push` 都属于界面层副作用，不适合进入 store

因此，本次设计将分为两层：

- `tabs store`：负责纯数据规则，包括禁用、目标列表、脏标签集合、关闭后激活目标推导、批量删除
- `HeaderTabs.vue`：负责右键菜单、确认弹窗和路由跳转

## 设计总览

### 新增关闭动作类型

在 `src/stores/tabs.ts` 中新增关闭动作类型定义：

```typescript
/**
 * 标签页关闭动作类型。
 */
export type TabCloseAction = 'close' | 'closeOthers' | 'closeRight' | 'closeSaved' | 'closeAll';
```

### 新增关闭计划结构

在 `src/stores/tabs.ts` 中新增统一的关闭计划结构，用于向 UI 暴露某次关闭动作的完整判断结果。

本文统一约定：

- `activeTabId`：调用方感知到的“当前激活标签 ID”
- “当前激活标签”：指 `activeTabId` 在当前 `tabs` 列表中命中的那个标签
- 若 `activeTabId` 不在当前 `tabs` 列表中，则视为“当前无激活标签”

建议结构如下：

```typescript
/**
 * 单次标签页关闭动作的执行计划。
 */
export interface TabClosePlan {
  /** 关闭动作类型 */
  action: TabCloseAction;
  /** 本次动作的锚点标签 ID；关闭已保存和全部关闭时可为空 */
  anchorTabId: string | null;
  /** 当前激活标签 ID */
  activeTabId: string | null;
  /** 是否允许关闭最后一个剩余标签 */
  allowCloseLastTab: boolean;
  /** 当前动作是否禁用 */
  disabled: boolean;
  /** 命中的目标标签 ID 列表 */
  targetTabIds: string[];
  /** 目标中处于脏状态的标签 ID 列表 */
  dirtyTabIds: string[];
  /** 是否需要二次确认 */
  requiresConfirm: boolean;
  /** 执行后是否需要导航 */
  requiresNavigation: boolean;
  /** 执行关闭后建议激活的标签路径；仅在 requiresNavigation 为 true 时读取，null 表示跳转 `/welcome` */
  nextActivePath: string | null;
}
```

这个结构的意义是把“能不能关”“会关谁”“要不要确认”“关完是否需要导航”一次算清楚，避免 UI 为了禁用态和点击执行分别维护两套判断。

## store 职责设计

### 计划生成接口

在 `tabs store` 中新增计划生成接口：

```typescript
/**
 * 计算指定关闭动作的执行计划。
 * @param action - 关闭动作类型
 * @param options - 关闭动作上下文
 * @returns 关闭计划
 */
getClosePlan(
  action: TabCloseAction,
  options?: { anchorTabId?: string | null; activeTabId?: string | null; allowCloseLastTab?: boolean }
): TabClosePlan
```

输入上下文说明：

- `anchorTabId`：右键命中的标签 ID；`close`、`closeOthers`、`closeRight` 依赖它
- `activeTabId`：当前激活标签 ID，用于判断关闭后是否需要切换目标
- `allowCloseLastTab`：是否允许 `close` 动作关闭最后一个剩余标签，默认 `false`

`activeTabId` 不建议依赖 store 内部状态推断，因为当前 `tabs store` 并未维护可靠的 `activeId`，而 `HeaderTabs.vue` 已能从当前路由推导当前激活标签。

若调用方传入的 `activeTabId` 已不在当前 `tabs` 列表中，则 `getClosePlan(...)` 应将其视为“当前无激活标签”：

- `requiresNavigation = false`
- `nextActivePath = null`
- 激活回退算法不参与本次计划计算

推荐约定：

- 右键菜单“关闭”使用默认值 `false`，符合“仅 1 个标签时禁用”的产品规则
- 顶部关闭按钮若要保持当前行为，可传入 `allowCloseLastTab: true`

这样既能复用同一套 store 规则，也不会因为右键菜单需求而意外改变关闭按钮的既有行为。

### 计划执行接口

在 `tabs store` 中新增统一执行接口：

```typescript
/**
 * 按关闭计划批量删除标签页。
 * @param plan - 已确认可执行的关闭计划
 */
applyClosePlan(plan: TabClosePlan): void
```

执行接口只负责：

- 按 `targetTabIds` 批量移除标签页
- 同步清理 `dirtyById`、`missingById`、`cachedKeys`
- 持久化新的标签页状态
- 对过期计划做安全降级执行

它不负责：

- 弹确认框
- 选择是否执行
- 页面跳转

关于过期计划，统一约定如下：

- `applyClosePlan(plan)` 可以过滤掉执行时已不存在的标签 ID，然后继续执行剩余目标
- `applyClosePlan(plan)` 不重新计算 `requiresConfirm`，也不重新弹确认框
- 一旦 UI 已基于某个 plan 完成确认，执行阶段只做“安全降级”，不做“语义回滚”

这样可以避免确认弹窗和执行阶段分别维护两套脏标签判断逻辑。

### 内部辅助计算

为了保持代码清晰，建议将 store 内部规则拆为几类纯辅助函数：

- `findTabIndex(tabId)`：根据 ID 找到标签位置
- `collectTargetTabs(action, anchorTabId)`：根据动作计算目标标签集合
- `collectDirtyTabIds(tabIds)`：收集脏标签 ID
- `resolveNextActivePath(activeTabId, targetTabIds)`：当激活标签被关闭时推导回退路径
- `removeTabsByIds(tabIds)`：统一执行批量删除

这些辅助函数保持纯规则职责，便于测试和后续扩展。

## 规则细化

### 1. 关闭 `close`

目标：

- 关闭锚点标签本身

禁用条件：

- 当前标签总数为 1
- 或锚点标签不存在

补充说明：

- 当 `allowCloseLastTab === true` 时，“当前标签总数为 1”不再构成禁用条件
- 该差异只用于兼容顶部关闭按钮，右键菜单仍按表格规则禁用

确认条件：

- 目标标签是脏标签

关闭后激活规则：

- 若锚点标签不是当前激活标签，则 `requiresNavigation = false`
- 若锚点标签是当前激活标签，则 `requiresNavigation = true`，并按统一算法计算 `nextActivePath`

### 2. 关闭其他 `closeOthers`

目标：

- 关闭除锚点标签之外的所有标签

禁用条件：

- 当前标签总数为 1
- 或锚点标签不存在

确认条件：

- 目标集合中存在脏标签

关闭后激活规则：

- 如果当前激活标签属于被关闭集合，则 `requiresNavigation = true`，并使用统一的“优先右侧、其次左侧”算法
- 在 `closeOthers` 场景下，由于锚点标签是明确保留的标签，算法结果通常会落在锚点标签本身
- 如果当前激活标签不属于被关闭集合，则 `requiresNavigation = false`

### 3. 关闭右侧 `closeRight`

目标：

- 关闭锚点标签右侧的所有标签

禁用条件：

- 锚点标签不存在
- 或锚点标签已经是最后一个标签

确认条件：

- 右侧目标集合中存在脏标签

关闭后激活规则：

- 仅当当前激活标签位于右侧目标集合中时，`requiresNavigation = true`
- 回退规则仍以“原激活标签”为参照：优先原位置右侧剩余标签，其次左侧剩余标签
- 在 `closeRight` 场景下，原激活标签若位于右侧被关闭区间，最终通常会回退到左侧剩余标签，其中最常见的是锚点标签本身或其左邻近标签

### 4. 关闭已保存 `closeSaved`

目标：

- 关闭所有非脏标签

禁用条件：

- 没有任何非脏标签可关闭

确认条件：

- 永不确认，因为它不会关闭脏标签

关闭后激活规则：

- 若当前激活标签是已保存标签并被关闭，则 `requiresNavigation = true`，并按统一回退规则选择剩余脏标签中的最近邻居
- 若当前激活标签本身是脏标签，则 `requiresNavigation = false`

### 5. 全部关闭 `closeAll`

目标：

- 关闭所有标签

禁用条件：

- 当前没有任何标签

确认条件：

- 目标集合中存在脏标签

关闭后激活规则：

- 永远返回 `requiresNavigation = true` 且 `nextActivePath = null`

## 激活回退算法

关闭动作执行后，只有在“当前激活标签属于目标关闭集合”时，才需要推导导航目标。

统一算法如下：

1. 在关闭前的 `tabs` 顺序中找到 `activeTabId` 对应索引
2. 基于关闭目标集合过滤出“仍会保留的标签”
3. 在关闭前顺序中，从原激活索引右侧开始向后扫描，找到第一个仍保留的标签
4. 如果右侧没有，再从原激活索引左侧向前扫描，找到第一个仍保留的标签
5. 若两侧都找不到，则返回 `nextActivePath = null`

这个规则必须统一适用于：

- 单标签关闭
- 关闭右侧时激活标签落在右侧区间
- 关闭已保存时激活标签恰好是非脏标签
- 关闭其他时当前激活标签不是锚点

这样可以保证所有入口使用一致的导航回退语义。

若当前无激活标签，则：

- `requiresNavigation = false`
- `nextActivePath = null`

## `HeaderTabs.vue` 职责设计

`HeaderTabs.vue` 只作为 UI 调用方，新增职责如下：

- 监听标签右键事件，记录当前右键命中的 `anchorTabId`
- 基于 `tabsStore.getClosePlan(...)` 生成右键菜单配置
- 把 `plan.disabled` 映射为菜单项禁用状态
- 点击菜单项时，根据 `plan.requiresConfirm` 决定是否调用 `Modal.confirm`
- 确认通过后调用 `tabsStore.applyClosePlan(plan)`
- 当 `plan.requiresNavigation === true` 时，根据 `plan.nextActivePath` 进行 `router.push(...)`

建议流程如下：

1. 用户在某个标签上触发右键菜单
2. 组件记录该标签 ID 为 `anchorTabId`
3. 组件根据当前激活标签 ID，为五个关闭动作分别生成 plan
4. 菜单项展示时直接使用 plan 的 `disabled`
5. 用户点击菜单项后：
   - 若 `plan.disabled === true`，直接返回
   - 若 `plan.requiresConfirm === true`，弹确认框
   - 确认弹窗打开期间，不要求实时响应 tabs 变化；用户点击确认后直接进入执行阶段
   - 用户确认后执行 `applyClosePlan(plan)`
   - 若 `plan.requiresNavigation === true` 且 `plan.nextActivePath` 为字符串，则跳转到该路径
   - 若 `plan.requiresNavigation === true` 且 `plan.nextActivePath === null`，跳转到 `/welcome`

### 确认文案建议

本次设计不强制统一确认文案模板，但建议至少区分单标签和批量关闭的语义，避免用户无法判断影响范围。

建议规则：

- 关闭：提示“当前标签有未保存更改，确认关闭吗？”
- 批量关闭：提示“即将关闭 N 个标签，其中包含未保存更改，确认继续吗？”

如果需要进一步增强可理解性，可以在后续实现中补充目标标签标题摘要，但这不是本次设计的必需项。

## 与现有实现的兼容性

### 与当前 `removeTab` 的关系

当前 `tabs store` 已有 `removeTab(id)`，其内部已经负责：

- 从 `tabs` 中移除记录
- 清理 `cachedKeys`
- 清理 `dirtyById`
- 清理 `missingById`
- 持久化状态

本次可以保留 `removeTab(id)` 作为基础能力，并在 `applyClosePlan(plan)` 中复用；也可以抽出更底层的 `removeTabsByIds(tabIds)` 供 `removeTab(id)` 和 `applyClosePlan(plan)` 共用。

推荐做法是新增 `removeTabsByIds(tabIds)`，避免批量关闭时多次持久化和重复遍历，提高一致性和性能。

### 与当前 `handleCloseTab` 的关系

`HeaderTabs.vue` 当前已有单标签关闭逻辑 `handleCloseTab(tab)`。实现右键菜单后，建议不要继续维持一套独立的单标签关闭分支，而是把左键关闭按钮也改为复用 `getClosePlan('close', ...) + applyClosePlan(plan)`，同时显式传入行为策略。

这样可以保证：

- 关闭按钮和右键菜单“关闭”使用同一套规则
- 脏标签确认行为不会出现分叉
- 激活回退规则只维护一份

推荐调用方式：

- 右键菜单“关闭”：`getClosePlan('close', { anchorTabId, activeTabId })`
- 顶部关闭按钮：`getClosePlan('close', { anchorTabId: tab.id, activeTabId, allowCloseLastTab: true })`

这样“规则引擎”只有一套，但不同入口仍可以保留合理的产品差异。

## 错误处理

- 若 `anchorTabId` 缺失但动作依赖锚点，则返回 `disabled: true` 的空计划
- 若 `targetTabIds` 为空，则视为不可执行计划
- 若 `applyClosePlan(plan)` 收到空目标列表，则直接返回，不抛异常
- 若 UI 在执行前 tabs 状态已变化，计划可能过期；`applyClosePlan` 应再次按 ID 过滤有效标签，避免因为目标标签已不存在而报错
- 若计划过期导致实际执行目标少于原计划，执行阶段仍继续完成剩余关闭，不回退到重新确认流程
- 若确认弹窗打开期间 tabs 状态发生变化，不要求弹窗内容实时同步；用户确认后由 `applyClosePlan` 承担最终防御处理
- 若执行关闭后 `requiresNavigation === true` 且 `nextActivePath` 指向的标签已不存在，UI 应回退到 `/welcome`

## 测试策略

### store 单元测试

为 `getClosePlan(...)` 和 `applyClosePlan(...)` 补充测试，至少覆盖以下场景：

- `close` 在仅 1 个标签时禁用
- `close` 命中脏标签时要求确认
- `closeOthers` 正确排除锚点标签并识别脏标签
- `closeRight` 在锚点为最后一个标签时禁用
- `closeSaved` 只关闭非脏标签且永不确认
- `closeAll` 在存在脏标签时要求确认
- 当前激活标签未被关闭时，`requiresNavigation = false` 且 `nextActivePath = null`
- 当前激活标签被关闭时，正确执行“优先右侧、其次左侧”的回退
- `applyClosePlan(plan)` 能正确清理 `tabs`、`cachedKeys`、`dirtyById`、`missingById`

### 组件测试

- 右键某个标签时，菜单项禁用态与 plan 结果一致
- 点击“关闭”遇到脏标签时会弹出确认
- 点击“关闭已保存”不会弹确认且只关闭非脏标签
- 执行批量关闭后，若当前激活标签被移除，会跳转到预期路径
- 关闭按钮与右键菜单“关闭”行为保持一致
- 确认弹窗打开期间若 tabs 状态变化，确认后仍能安全降级执行

### 手动验证

- 多标签、混合脏/非脏状态下，五个右键菜单项状态正确
- 激活标签在关闭集合内外两种情况都能正确处理
- 最后一个剩余标签被保留时不会误跳 `/welcome`
- 全部关闭后稳定回到 `/welcome`
- 顶部关闭按钮与右键菜单在“最后一个标签”场景下保留预期的差异行为

## 实现步骤建议

1. 在 `tabs store` 中新增 `TabCloseAction`、`TabClosePlan` 和计划生成/执行接口
2. 提炼批量删除与激活回退的纯辅助函数
3. 为 store 补齐关闭计划与批量关闭测试
4. 评估 `getClosePlan(...)` 是否需要轻量缓存，或补一个批量计算接口，以避免右键菜单打开时对五类动作重复遍历
5. 在 `HeaderTabs.vue` 中接入右键菜单与统一关闭调用
6. 将现有关闭按钮逻辑切换到复用新计划接口，并单独做“最后一个标签”场景回归测试
7. 为组件补充确认弹窗和路由跳转行为测试

## 结论

本次需求的关键不在于新增一个右键菜单，而在于把标签关闭规则从单一按钮交互提升为可复用的关闭能力模型。

通过在 `tabs store` 中引入“关闭计划 + 执行”两阶段设计，可以把：

- 菜单项禁用判断
- 目标标签集合计算
- 脏标签确认判断
- 激活标签回退推导
- 批量删除执行

收敛到统一接口中，使 `HeaderTabs.vue` 只保留 UI 职责，并为后续更多关闭入口复用同一套规则提供稳定基础。
