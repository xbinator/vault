# 会话历史分页加载设计文档

## 概述

将 SessionHistory 组件从虚拟滚动改为基于时间戳游标的分页加载，提升性能和用户体验。

## 背景

当前实现使用 `useVirtualList` 进行虚拟滚动，一次性加载所有会话数据。随着会话数量增长，存在以下问题：

1. 初始加载性能下降
2. 虚拟滚动实现复杂度高
3. 不符合实际使用场景（用户通常只需要查看最近的会话）

## 目标

- 实现基于时间戳游标的分页加载
- 每次加载 20-30 条会话
- 支持滚动到底部自动加载更多
- 删除会话时保持当前分页状态
- 使用时间戳作为游标，避免 OFFSET 性能问题

## 技术方案

### 1. 数据层改动

#### 1.1 类型定义

在 `types/chat.ts` 中添加：

```typescript
/**
 * 分页游标参数
 */
export interface SessionCursor {
  /** 最后一条消息时间戳 */
  lastMessageAt?: string;
  /** 创建时间戳（用于相同 lastMessageAt 时的二级排序） */
  createdAt?: string;
}

/**
 * 分页参数
 */
export interface SessionPaginationParams {
  /** 每页数量 */
  limit: number;
  /** 游标（可选，用于加载下一页） */
  cursor?: SessionCursor;
}

/**
 * 分页结果
 */
export interface PaginatedSessionsResult {
  /** 会话列表 */
  items: ChatSession[];
  /** 是否还有更多数据 */
  hasMore: boolean;
  /** 下一页游标 */
  nextCursor?: SessionCursor;
}
```

#### 1.2 SQL 查询

**第一页查询**：
```sql
SELECT id, type, title, created_at, updated_at, last_message_at, usage_json
FROM chat_sessions
WHERE type = ?
ORDER BY last_message_at DESC, updated_at DESC, created_at DESC
LIMIT ?
```

**后续页查询（使用游标）**：
```sql
SELECT id, type, title, created_at, updated_at, last_message_at, usage_json
FROM chat_sessions
WHERE type = ?
  AND (last_message_at < ? OR (last_message_at = ? AND created_at < ?))
ORDER BY last_message_at DESC, updated_at DESC, created_at DESC
LIMIT ?
```

#### 1.3 Storage 层实现

修改 `src/shared/storage/chats/sqlite.ts` 中的 `getSessionsByType` 方法：

```typescript
async getSessionsByType(
  type: ChatSessionType,
  pagination: SessionPaginationParams
): Promise<PaginatedSessionsResult> {
  const { limit, cursor } = pagination;
  
  let sql: string;
  let params: any[];
  
  if (!cursor) {
    sql = SELECT_SESSIONS_BY_TYPE_SQL;
    params = [type, limit];
  } else {
    sql = SELECT_SESSIONS_BY_CURSOR_SQL;
    params = [
      type,
      cursor.lastMessageAt,
      cursor.lastMessageAt,
      cursor.createdAt,
      limit
    ];
  }
  
  const rows = await dbSelect<ChatSessionRow>(sql, params);
  const items = rows.map(mapSessionRow).filter((item): item is ChatSession => item !== null);
  
  let nextCursor: SessionCursor | undefined;
  let hasMore = items.length === limit;
  
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = {
      lastMessageAt: lastItem.lastMessageAt,
      createdAt: lastItem.createdAt
    };
  }
  
  return { items, hasMore, nextCursor };
}
```

### 2. Store 层改动

修改 `src/stores/chat.ts` 中的 `getSessions` 方法：

```typescript
getSessions(
  type: ChatSessionType,
  pagination?: SessionPaginationParams
): Promise<PaginatedSessionsResult> {
  const defaultPagination: SessionPaginationParams = {
    limit: 20,
    ...pagination
  };
  return chatStorage.getSessionsByType(type, defaultPagination);
}
```

### 3. 组件层改动

#### 3.1 移除虚拟滚动

- 移除 `useVirtualList` 相关代码
- 移除 `flatItems` 计算属性
- 使用普通的 `v-for` 渲染列表

#### 3.2 状态管理

```typescript
/** 已加载的会话列表 */
const displayedSessions = ref<ChatSession[]>([]);

/** 下一页游标 */
const nextCursor = ref<SessionCursor>();

/** 是否还有更多数据 */
const hasMore = ref(true);

/** 加载状态 */
const loading = ref(false);

/** 每页数量 */
const PAGE_SIZE = 20;
```

#### 3.3 加载逻辑

```typescript
async function loadSessions(isRefresh = false): Promise<void> {
  if (loading.value) return;
  if (!isRefresh && !hasMore.value) return;
  
  loading.value = true;
  
  try {
    const pagination: SessionPaginationParams = {
      limit: PAGE_SIZE,
      cursor: isRefresh ? undefined : nextCursor.value
    };
    
    const result = await chatStore.getSessions(CHAT_SESSION_TYPE, pagination);
    
    if (isRefresh) {
      displayedSessions.value = result.items;
    } else {
      displayedSessions.value.push(...result.items);
    }
    
    nextCursor.value = result.nextCursor;
    hasMore.value = result.hasMore;
  } catch (error) {
    message.error('加载会话失败');
    console.error('Load sessions error:', error);
  } finally {
    loading.value = false;
  }
}
```

#### 3.4 删除会话处理

```typescript
async function handleDeleteSession(sessionId: string): Promise<void> {
  if (props.disabled) return;
  if (loading.value) return;
  
  const wasActive = sessionId === props.activeSessionId;
  
  loading.value = true;
  const [error] = await asyncTo(chatStore.deleteSession(sessionId));
  loading.value = false;
  
  if (!error) {
    // 从列表中移除被删除的会话
    displayedSessions.value = displayedSessions.value.filter(s => s.id !== sessionId);
    
    // 更新游标
    if (displayedSessions.value.length > 0) {
      const lastItem = displayedSessions.value[displayedSessions.value.length - 1];
      nextCursor.value = {
        lastMessageAt: lastItem.lastMessageAt,
        createdAt: lastItem.createdAt
      };
    }
    
    // 如果当前页已空且还有更多数据，加载下一页
    if (displayedSessions.value.length === 0 && hasMore.value) {
      await loadSessions();
    }
    
    if (wasActive) {
      settingStore.setChatSidebarActiveSessionId(null);
    }
  } else {
    message.error(error.message || '删除会话失败，请重试');
  }
}
```

#### 3.5 滚动监听

使用 `@vueuse/core` 的 `useInfiniteScroll`：

```typescript
const scrollContainer = ref<HTMLElement>();

useInfiniteScroll(
  scrollContainer,
  () => loadSessions(),
  { distance: 50 }
);
```

#### 3.6 数据分组

```typescript
const groupedSessions = computed<SessionGroup[]>(() => {
  const groups = groupBy(
    displayedSessions.value,
    (session) => toDateKey(session.lastMessageAt || session.updatedAt || session.createdAt || '')
  );
  
  return map(groups, (_sessions, key) => ({
    key,
    label: formatSessionDay(_sessions[0].lastMessageAt),
    sessions: _sessions
  }));
});
```

#### 3.7 初始化和刷新

```typescript
onMounted(async () => {
  await loadSessions(true);
});

watch(
  () => props.activeSessionId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      if (!displayedSessions.value.find(s => s.id === newId)) {
        await loadSessions(true);
      }
    }
    emit('update:currentSession', currentSession.value);
  }
);
```

### 4. 模板改动

```vue
<div class="session-history__list" ref="scrollContainer">
  <div v-if="displayedSessions.length" class="session-history__list-inner">
    <template v-for="group in groupedSessions" :key="group.key">
      <div class="session-history__group-title">
        {{ group.label }}
      </div>
      <div
        v-for="session in group.sessions"
        :key="session.id"
        class="session-history__item"
        :class="{ 'is-active': session.id === props.activeSessionId }"
        @click="handleSwitchSession(session.id)"
      >
        <span class="session-history__content">
          <span class="session-history__item-title">{{ session.title }}</span>
        </span>
        <span class="session-history__actions">
          <BButton type="text" square danger size="small" @click.stop="handleDeleteSession(session.id)">
            <Icon icon="lucide:trash-2" width="14" height="14" />
          </BButton>
        </span>
      </div>
    </template>
    
    <div v-if="loading" class="session-history__loading">
      加载中...
    </div>
    
    <div v-if="!hasMore && displayedSessions.length > 0" class="session-history__no-more">
      没有更多会话了
    </div>
  </div>

  <div v-else class="session-history__empty">暂无历史会话</div>
</div>
```

## 实现步骤

1. 添加分页相关类型定义到 `types/chat.ts`
2. 修改 Storage 层实现，添加 SQL 查询和方法
3. 修改 Store 层方法签名
4. 修改组件层实现：
   - 移除虚拟滚动相关代码
   - 实现时间戳游标分页
   - 实现滚动加载
   - 处理删除逻辑
   - 调整分组逻辑
   - 更新模板

## 边界情况处理

- **首次加载**：组件挂载时加载第一页数据
- **会话删除**：保持当前分页状态，只移除被删除的会话
- **会话切换**：如果切换的会话不在当前列表中，刷新列表
- **空列表**：显示"暂无历史会话"
- **加载失败**：显示错误提示
- **重复加载**：通过 loading 状态防止重复加载

## 性能优势

1. **初始加载快**：只加载 20 条数据
2. **按需加载**：滚动到底部才加载更多
3. **时间戳游标**：避免 OFFSET 性能问题
4. **无重复数据**：新会话插入不会导致重复

## 向后兼容性

- 保持 `getSessions` 方法签名兼容（pagination 参数可选）
- 降级存储（localStorage）需要同步修改
- 不影响其他使用 `getSessions` 的地方
