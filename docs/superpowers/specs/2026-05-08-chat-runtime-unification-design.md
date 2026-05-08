<!--
  @file 2026-05-08-chat-runtime-unification-design.md
  @description 聊天侧边栏任务运行时统一化与压缩链路收敛设计说明。
-->

# 2026-05-08 Chat Runtime Unification Design

## 背景

当前 `BChatSidebar` 的聊天与压缩链路存在多处职责交叉：

- `useChatStream.ts` 既负责聊天流、工具续轮、重新生成，又负责发送前自动压缩
- `/compact` 通过 `useCompactContext -> useCompression -> compression coordinator` 走另一条半独立任务链
- 压缩模型来源同时支持 `summarize` 与 `chat` 两种配置语义
- 上下文边界既有可见 `compression` 消息，也有内部 `system summary` 注入路径

这些分叉会导致：

- `loading` 与任务并发语义不统一
- 普通发送与 `/compact` 可能互相穿透
- 用户可见边界与模型实际使用边界不完全一致
- 后续新增命令时容易继续把判断堆进 `index.vue`

本次重构目标是做一次“大收敛”，降低结构分叉和心智负担。

## 目标

- 删除“发送前自动压缩”链路
- 移除“会话历史压缩助理”的独立模型语义，统一使用当前聊天模型
- 引入统一任务运行时，作为聊天与压缩的唯一任务入口
- 建立全局发送锁：存在活跃任务时，不允许再次发送或发起压缩
- 保留可见的 `compression` 消息，并让它成为唯一真实的上下文边界
- 为未来新增 slash commands 提供稳定扩展点

## 非目标

- 不在本次重构中改变消息气泡视觉设计
- 不引入新的压缩消息角色或新的数据库表结构
- 不在本次重构中处理与本任务无关的类型历史问题

## 方案对比

### 方案 A：继续以 `useChatStream` 为中心，局部补丁式统一

做法：

- 保留 `useChatStream` 中的自动压缩
- 把 `/compact` 尽量接进现有 `loading` 和 `abort`
- 对发送入口继续增加防重复判断

优点：

- 改动面最小

缺点：

- 分叉仍然存在
- `useChatStream` 会继续承担过多职责
- 后续扩展命令时仍容易继续膨胀

### 方案 B：引入统一任务运行时，删除发送前自动压缩

做法：

- 新增统一 runtime 管理任务状态
- 聊天与压缩都通过 runtime 启动
- 删除 `prepareMessagesBeforeSend()` 在发送前触发自动压缩的路径
- 压缩统一使用当前 chat 模型

优点：

- 任务并发语义最清晰
- 结构收敛明显
- 最符合“完全禁止 loading 中再次发送”的需求

缺点：

- 改动面中等偏大

### 方案 C：把聊天、压缩、持久化全塞进单一大 coordinator

做法：

- 统一到一个巨型协调器

优点：

- 入口最少

缺点：

- 容易形成新的巨型文件
- 不利于后续维护与测试拆分

## 结论

采用方案 B。

这是当前最平衡的收敛方式：能显著减少分叉，同时不会把所有能力集中成新的超级对象。

## 设计

### 1. 统一任务运行时

新增统一任务运行时 hook，作为聊天侧边栏唯一的异步任务入口。

建议职责：

- 持有当前活跃任务状态
- 控制任务并发
- 为聊天和压缩提供统一的开始/取消能力
- 暴露统一的 `loading` 语义给 UI
- 在异常与销毁场景下负责状态自愈和资源清理

建议状态：

- `activeTask: 'idle' | 'chat' | 'compact'`
- `loading`
- `abort`
- `canStartTask(kind)`

建议能力：

- `startChat(...)`
- `startCompact(...)`
- `abortActiveTask()`
- `resetToIdle(reason?)`
- `dispose()`

规则：

- `activeTask !== 'idle'` 时，任何新的发送型任务都不能启动
- `abort` 是唯一允许在任务执行中触发的主动动作
- 任何任务启动失败、回调抛错、状态不一致等 runtime 自身异常，最终都必须落到 `resetToIdle()`
- 组件卸载时必须调用 `dispose()`，中止活跃任务并回收所有挂起引用

### 1.1 runtime 自愈与清理语义

runtime 不只要处理业务失败，还要处理自身异常。

需要显式覆盖两类场景：

- 启动任务时内部状态不一致
- 组件销毁时仍有任务在进行

恢复规则：

- `startChat` / `startCompact` 在进入任务前，先校验当前状态是否允许启动
- 若发现 `activeTask`、控制器、回调句柄之间不一致，runtime 先执行一次 `resetToIdle('state_inconsistent')`
- 若校验后仍无法进入稳定状态，则拒绝启动新任务，并返回明确失败结果
- 任何启动阶段异常、收尾阶段异常、abort 回调异常，都不得把 runtime 留在非 `idle`

销毁规则：

- `BChatSidebar` 在 `onUnmounted` 中必须调用 runtime 的 `dispose()`
- `dispose()` 会：
  - 中止当前活跃任务
  - 清空 abort controller / handler / 挂起回调
  - 将 `activeTask` 和 `loading` 复位到 `idle/false`
- 对于 `compact` 任务，若销毁时仍在执行，当前 pending compression message 应更新为 `cancelled`
- 对于 `chat` 任务，销毁时沿用现有 abort 收尾策略，确保不会留下永远 loading 的 assistant placeholder

### 2. `useChatStream` 收缩为纯聊天流执行器

`useChatStream.ts` 只保留聊天本身的职责：

- 流式文本/思考片段接收
- 工具调用与续轮
- 用户选择题续跑
- 重新生成
- 聊天流中止

删除内容：

- 发送前自动压缩决策
- 自动压缩成功/失败事件分支
- 将压缩作为发送前隐藏步骤的逻辑

发送前处理只保留：

- 文件引用展开
- 基于最后一条成功压缩消息切出上下文边界
- 模型消息转换
- 发给当前 chat 模型

### 3. 删除“发送前自动压缩”

普通聊天发送时：

- 不再调用 `compressionCoordinator.prepareMessagesBeforeSend()`
- 不再隐式生成摘要
- 不再在发送阶段改变上下文边界

压缩变成纯显式动作：

- 用户执行 `/compact`
- runtime 启动 `compact` 任务
- 会话中插入一条 pending 的压缩消息
- 压缩完成后更新同一条消息

### 4. 压缩统一使用当前聊天模型

`summaryGenerator.ts` 中不再优先读取 `summarize` 服务配置。

新的模型来源规则：

- 压缩摘要生成直接使用当前 chat 配置
- 不再区分“聊天助手”和“摘要助手”

收益：

- 模型来源统一
- 配置心智模型简化
- 后续更容易维护和解释

### 5. 压缩消息成为唯一上下文边界

后续上下文组装只认最后一条成功的 `compression` 消息。

规则：

- 压缩消息之前的普通历史消息不再原文直传
- 压缩消息之后的普通聊天消息继续按原规则发送
- `failed` 与 `cancelled` 的压缩消息都不是边界

模型侧转换规则：

- UI 中 `compression` 仍是独立消息角色
- 发给模型时，将成功压缩消息映射为固定格式的 `assistant` 边界消息

不再保留：

- 以 `system summary` 形式额外注入的旧路径

这样可以保证：

- 用户看到的边界，和模型使用的边界是一回事

### 6. 命令扩展机制

slash commands 不再只是 `id -> handler`。

新的命令定义建议包含：

- `id`
- `title`
- `description`
- `concurrencyPolicy`
- `run(context)`

其中 `concurrencyPolicy` 用于声明命令能否在活跃任务期间执行。

本次设计先不引入 `kind`。

原因：

- 当前 runtime 与命令派发器真正需要消费的是并发策略，而不是命令分类
- `kind` 目前没有明确的执行语义，提前暴露只会增加字段但不增加能力
- 未来如果确实出现“分类会影响埋点、UI 分组、权限或导航行为”的需求，再增补 `kind` 更稳妥

规则建议：

- 会发模型或改消息边界的命令：`allowWhenIdleOnly`
- 纯 UI 命令：可放宽
- 默认新命令按最保守策略处理

这样未来新增命令时：

- 注册一条定义即可
- 不再把大量条件堆到 `index.vue`

### 7. 全局发送锁

“消息在 loading 中不能再次发送”不应只靠按钮禁用。

最终规则：

- 只要 runtime 存在活跃任务，新的聊天发送不能启动
- 只要 runtime 存在活跃任务，`/compact` 不能启动
- 只保留 `abort` 可用

这条规则必须在底层任务入口生效，而不是只在 UI 层生效。

## 数据流

### 普通发送

1. 输入提交触发聊天命令
2. runtime 判断当前是否为 `idle`
3. 若允许，进入 `chat` 任务
4. 基于最后一条成功压缩消息切上下文
5. 转换为模型消息并调用 chat 模型
6. 流结束后回到 `idle`

### 手动压缩

1. `/compact` 触发压缩命令
2. runtime 判断当前是否为 `idle`
3. 若允许，进入 `compact` 任务
4. 插入 pending compression message
5. 使用当前 chat 模型生成摘要
6. 更新 compression message 为 `success | failed | cancelled`
7. 回到 `idle`

## 错误处理

- `chat` 任务失败：沿用现有聊天错误消息逻辑
- `compact` 任务失败：更新当前 compression message 为 `failed`
- `compact` 主动中止：更新当前 compression message 为 `cancelled`
- runtime 在任何失败路径下都必须回到 `idle`

## 测试策略

需要覆盖：

- loading 中再次发送被底层拒绝
- loading 中 `/compact` 被底层拒绝
- `abort` 对 `chat` 和 `compact` 都能正确收尾
- 删除自动压缩后，普通发送不再调用旧的自动压缩入口
- 压缩统一使用当前 chat 模型，而不是 `summarize`
- 成功压缩消息成为唯一上下文边界
- `failed/cancelled` 压缩消息不会推进边界
- slash command 的并发策略按声明生效

## 风险

- 删除自动压缩后，长会话将更依赖用户显式 `/compact`
- runtime 抽象不当会让职责再次模糊
- 旧测试中大量依赖 `prepareMessagesBeforeSend()` 的预期需要同步更新

## 迁移顺序

1. 引入统一 runtime，但先不大范围删旧逻辑
2. 让聊天发送与 `/compact` 都改走 runtime
3. 删除发送前自动压缩
4. 统一摘要模型来源为当前 chat 模型
5. 删除旧的 `system summary` 注入路径
6. 更新 slash command 派发与并发策略
7. 补齐回归测试
