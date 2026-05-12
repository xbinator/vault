# HeaderTabs Context Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `HeaderTabs` 增加右键关闭菜单，并把五类关闭动作的规则下沉到 `tabs store` 的“关闭计划 + 执行”接口中。

**Architecture:** 先在 `src/stores/tabs.ts` 中补齐 `TabCloseAction`、`TabClosePlan`、`getClosePlan()` 和 `applyClosePlan()`，让关闭规则、脏标签确认判断和导航回退语义都在 store 层统一计算。再在 `src/layouts/default/components/HeaderTabs.vue` 中接入右键菜单，复用同一套关闭计划接口处理右键菜单和顶部关闭按钮，仅由组件负责 `Modal.confirm` 与 `router.push(...)`。

**Tech Stack:** Vue 3 Composition API, Pinia, Ant Design Vue Dropdown, Vitest, Vue Test Utils

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/stores/tabs.ts` | 改：新增关闭动作类型、关闭计划类型、批量删除辅助函数、关闭计划生成与执行逻辑 |
| `test/stores/tabs.test.ts` | 改：补充 `getClosePlan()` / `applyClosePlan()` 的规则测试 |
| `src/layouts/default/components/HeaderTabs.vue` | 改：接入右键菜单、统一关闭入口、确认弹窗与导航处理 |
| `test/layouts/default/HeaderTabs.test.ts` | 改：补充右键菜单、确认弹窗、关闭按钮复用规则的组件测试 |
| `changelog/2026-05-12.md` | 改：记录“HeaderTabs 右键关闭菜单与批量关闭”实现计划与代码落地 |

## Scope Notes

- 不新增独立的 tabs close helper 文件，先把规则集中在 `src/stores/tabs.ts` 中，避免过早拆分。
- 不在本次计划中实现快捷键、系统菜单或命令面板入口，只保证 store 接口可复用。
- 右键菜单优先复用 `ant-design-vue` 的 `Dropdown` 组件和现有 `BDropdownMenu` 视觉样式，不额外创建新的上下文菜单组件。

---

### Task 1: 为 tabs store 编写关闭计划测试

**Files:**
- Modify: `test/stores/tabs.test.ts`

- [ ] **Step 1: 在现有 store 测试文件中追加关闭计划测试**

把下面这些用例追加到 `test/stores/tabs.test.ts` 现有 `describe('useTabsStore', ...)` 中，保持当前 mock 风格不变：

```typescript
  it('builds a disabled close plan for the last tab when allowCloseLastTab is false', async () => {
    const { useTabsStore } = await import('@/stores/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'solo', path: '/solo', title: 'Solo', cacheKey: 'cache:solo' });

    const plan = tabsStore.getClosePlan('close', {
      anchorTabId: 'solo',
      activeTabId: 'solo'
    });

    expect(plan.disabled).toBe(true);
    expect(plan.targetTabIds).toEqual([]);
    expect(plan.requiresConfirm).toBe(false);
    expect(plan.requiresNavigation).toBe(false);
  });

  it('allows the close button path to close the last tab when allowCloseLastTab is true', async () => {
    const { useTabsStore } = await import('@/stores/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'solo', path: '/solo', title: 'Solo', cacheKey: 'cache:solo' });

    const plan = tabsStore.getClosePlan('close', {
      anchorTabId: 'solo',
      activeTabId: 'solo',
      allowCloseLastTab: true
    });

    expect(plan.disabled).toBe(false);
    expect(plan.targetTabIds).toEqual(['solo']);
    expect(plan.requiresConfirm).toBe(false);
    expect(plan.requiresNavigation).toBe(true);
    expect(plan.nextActivePath).toBeNull();
  });

  it('marks closeOthers as requiring confirmation when another tab is dirty', async () => {
    const { useTabsStore } = await import('@/stores/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'left', path: '/left', title: 'Left', cacheKey: 'cache:left' });
    tabsStore.addTab({ id: 'current', path: '/current', title: 'Current', cacheKey: 'cache:current' });
    tabsStore.addTab({ id: 'right', path: '/right', title: 'Right', cacheKey: 'cache:right' });
    tabsStore.setDirty('right');

    const plan = tabsStore.getClosePlan('closeOthers', {
      anchorTabId: 'current',
      activeTabId: 'current'
    });

    expect(plan.disabled).toBe(false);
    expect(plan.targetTabIds).toEqual(['left', 'right']);
    expect(plan.dirtyTabIds).toEqual(['right']);
    expect(plan.requiresConfirm).toBe(true);
    expect(plan.requiresNavigation).toBe(false);
  });

  it('routes to the nearest surviving tab when closeSaved removes the active saved tab', async () => {
    const { useTabsStore } = await import('@/stores/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'left', path: '/left', title: 'Left', cacheKey: 'cache:left' });
    tabsStore.addTab({ id: 'active', path: '/active', title: 'Active', cacheKey: 'cache:active' });
    tabsStore.addTab({ id: 'right', path: '/right', title: 'Right', cacheKey: 'cache:right' });
    tabsStore.setDirty('right');

    const plan = tabsStore.getClosePlan('closeSaved', {
      activeTabId: 'active'
    });

    expect(plan.disabled).toBe(false);
    expect(plan.targetTabIds).toEqual(['left', 'active']);
    expect(plan.requiresConfirm).toBe(false);
    expect(plan.requiresNavigation).toBe(true);
    expect(plan.nextActivePath).toBe('/right');
  });

  it('safely applies a stale close plan without recomputing confirmation state', async () => {
    const { useTabsStore } = await import('@/stores/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha', cacheKey: 'cache:alpha' });
    tabsStore.addTab({ id: 'beta', path: '/beta', title: 'Beta', cacheKey: 'cache:beta' });
    tabsStore.setDirty('beta');

    const plan = tabsStore.getClosePlan('closeAll', {
      activeTabId: 'alpha'
    });

    tabsStore.removeTab('beta');
    setItemMock.mockClear();

    tabsStore.applyClosePlan(plan);

    expect(tabsStore.tabs).toEqual([]);
    expect(setItemMock).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: 运行 store 测试，确认新增用例失败**

Run:

```bash
pnpm test -- test/stores/tabs.test.ts
```

Expected: FAIL，报错应集中在 `tabsStore.getClosePlan is not a function` 或 `tabsStore.applyClosePlan is not a function`。

- [ ] **Step 3: Commit**

```bash
git add test/stores/tabs.test.ts
git commit -m "test: cover tab close plans in tabs store"
```

---

### Task 2: 在 tabs store 中实现关闭计划与批量关闭

**Files:**
- Modify: `src/stores/tabs.ts`

- [ ] **Step 1: 在 store 文件顶部新增关闭动作与关闭计划类型**

把下面这段类型定义插入到 `TabMovePosition` 和 `Tab` 之间，保持文件注释风格一致：

```typescript
/**
 * 标签页关闭动作类型。
 */
export type TabCloseAction = 'close' | 'closeOthers' | 'closeRight' | 'closeSaved' | 'closeAll';

/**
 * 关闭计划生成时的输入参数。
 */
export interface TabClosePlanOptions {
  /** 右键命中的锚点标签 ID */
  anchorTabId?: string | null;
  /** 调用方感知到的当前激活标签 ID */
  activeTabId?: string | null;
  /** 是否允许关闭最后一个剩余标签 */
  allowCloseLastTab?: boolean;
}

/**
 * 单次标签页关闭动作的执行计划。
 */
export interface TabClosePlan {
  /** 关闭动作类型 */
  action: TabCloseAction;
  /** 本次动作的锚点标签 ID */
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
  /** 导航目标路径；当 requiresNavigation 为 true 且为 null 时表示跳转 /welcome */
  nextActivePath: string | null;
}
```

- [ ] **Step 2: 新增纯辅助函数，统一目标集合和导航回退算法**

在 `persistData()` 下方插入以下辅助函数，避免把计划生成逻辑全部塞进 action 体内：

```typescript
/**
 * 判断一个标签 ID 是否存在于当前列表。
 * @param tabs - 当前标签列表
 * @param tabId - 待检查的标签 ID
 * @returns 标签索引，不存在时返回 -1
 */
function findTabIndex(tabs: Tab[], tabId: string | null | undefined): number {
  if (!tabId) {
    return -1;
  }
  return tabs.findIndex((tab) => tab.id === tabId);
}

/**
 * 过滤出当前动作命中的目标标签。
 * @param tabs - 当前标签列表
 * @param action - 关闭动作类型
 * @param anchorIndex - 锚点索引
 * @param dirtyById - 脏状态映射
 * @returns 命中的目标标签列表
 */
function collectTargetTabs(tabs: Tab[], action: TabCloseAction, anchorIndex: number, dirtyById: Record<string, boolean>): Tab[] {
  if (action === 'close') {
    return anchorIndex === -1 ? [] : [tabs[anchorIndex]];
  }
  if (action === 'closeOthers') {
    return anchorIndex === -1 ? [] : tabs.filter((tab, index) => index !== anchorIndex);
  }
  if (action === 'closeRight') {
    return anchorIndex === -1 ? [] : tabs.slice(anchorIndex + 1);
  }
  if (action === 'closeSaved') {
    return tabs.filter((tab) => dirtyById[tab.id] !== true);
  }
  return tabs.slice();
}

/**
 * 计算关闭后需要回退到的标签路径。
 * @param tabs - 关闭前的标签顺序
 * @param activeTabId - 当前激活标签 ID
 * @param targetTabIds - 本次将关闭的标签 ID 列表
 * @returns 导航目标路径；null 表示应跳转 /welcome
 */
function resolveNextActivePath(tabs: Tab[], activeTabId: string | null, targetTabIds: string[]): string | null {
  const activeIndex = findTabIndex(tabs, activeTabId);
  if (activeIndex === -1) {
    return null;
  }

  const closingIds = new Set(targetTabIds);
  const survivingTabs = tabs.filter((tab) => !closingIds.has(tab.id));
  if (survivingTabs.length === 0) {
    return null;
  }

  for (let index = activeIndex + 1; index < tabs.length; index += 1) {
    const candidate = tabs[index];
    if (candidate && !closingIds.has(candidate.id)) {
      return candidate.path;
    }
  }

  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const candidate = tabs[index];
    if (candidate && !closingIds.has(candidate.id)) {
      return candidate.path;
    }
  }

  return null;
}
```

- [ ] **Step 3: 在 `actions` 中实现 `getClosePlan()` 与 `applyClosePlan()`**

把下面这两个 action 加到 `moveTab()` 和 `removeTab()` 之间，并把 `removeTab()` 改为复用 `removeTabsByIds()`：

```typescript
    /**
     * 根据关闭动作生成统一关闭计划。
     * @param action - 关闭动作类型
     * @param options - 关闭动作上下文
     * @returns 关闭计划
     */
    getClosePlan(action: TabCloseAction, options: TabClosePlanOptions = {}): TabClosePlan {
      const anchorTabId = options.anchorTabId ?? null;
      const activeTabId = options.activeTabId ?? null;
      const allowCloseLastTab = options.allowCloseLastTab === true;
      const anchorIndex = findTabIndex(this.tabs, anchorTabId);
      const activeIndex = findTabIndex(this.tabs, activeTabId);
      const targetTabs = collectTargetTabs(this.tabs, action, anchorIndex, this.dirtyById);
      const targetTabIds = targetTabs.map((tab) => tab.id);
      const dirtyTabIds = targetTabIds.filter((tabId) => this.dirtyById[tabId] === true);

      let disabled = false;
      if (action === 'close') {
        disabled = anchorIndex === -1 || (!allowCloseLastTab && this.tabs.length === 1);
      } else if (action === 'closeOthers') {
        disabled = anchorIndex === -1 || this.tabs.length === 1;
      } else if (action === 'closeRight') {
        disabled = anchorIndex === -1 || anchorIndex === this.tabs.length - 1;
      } else if (action === 'closeSaved') {
        disabled = targetTabIds.length === 0;
      } else if (action === 'closeAll') {
        disabled = this.tabs.length === 0;
      }

      if (disabled || targetTabIds.length === 0) {
        return {
          action,
          anchorTabId,
          activeTabId,
          allowCloseLastTab,
          disabled: true,
          targetTabIds: [],
          dirtyTabIds: [],
          requiresConfirm: false,
          requiresNavigation: false,
          nextActivePath: null
        };
      }

      const closesActiveTab = activeIndex !== -1 && targetTabIds.includes(activeTabId as string);
      return {
        action,
        anchorTabId,
        activeTabId,
        allowCloseLastTab,
        disabled: false,
        targetTabIds,
        dirtyTabIds,
        requiresConfirm: action !== 'closeSaved' && dirtyTabIds.length > 0,
        requiresNavigation: closesActiveTab,
        nextActivePath: closesActiveTab ? resolveNextActivePath(this.tabs, activeTabId, targetTabIds) : null
      };
    },

    /**
     * 按关闭计划批量删除标签页。
     * @param plan - 已确认的关闭计划
     */
    applyClosePlan(plan: TabClosePlan): void {
      if (plan.disabled || plan.targetTabIds.length === 0) {
        return;
      }

      const existingIds = new Set(this.tabs.map((tab) => tab.id));
      const validIds = plan.targetTabIds.filter((tabId) => existingIds.has(tabId));
      if (validIds.length === 0) {
        return;
      }

      this.removeTabsByIds(validIds);
    },
```

同时把底层删除收敛成一个内部 action：

```typescript
    /**
     * 批量删除标签页并清理关联状态。
     * @param ids - 待删除的标签页 ID 列表
     */
    removeTabsByIds(ids: string[]): void {
      if (ids.length === 0) {
        return;
      }

      const idSet = new Set(ids);
      const removedCacheKeys = this.tabs
        .filter((tab) => idSet.has(tab.id))
        .map((tab) => tab.cacheKey || tab.id)
        .filter(Boolean);

      this.tabs = this.tabs.filter((tab) => !idSet.has(tab.id));
      this.cachedKeys = this.cachedKeys.filter((cacheKey) => !removedCacheKeys.includes(cacheKey));

      ids.forEach((id) => {
        delete this.dirtyById[id];
        delete this.missingById[id];
      });

      persistData(this.$state);
    },
```

并把原来的 `removeTab(id)` 改成：

```typescript
    removeTab(id: string): void {
      this.removeTabsByIds([id]);
    },
```

- [ ] **Step 4: 运行 store 测试，确认全部通过**

Run:

```bash
pnpm test -- test/stores/tabs.test.ts
```

Expected: PASS，新增 close plan 用例与原有拖拽/缓存用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/stores/tabs.ts test/stores/tabs.test.ts
git commit -m "feat: add tab close plans to tabs store"
```

---

### Task 3: 为 HeaderTabs 编写右键菜单与确认弹窗测试

**Files:**
- Modify: `test/layouts/default/HeaderTabs.test.ts`

- [ ] **Step 1: 扩展 HeaderTabs 测试 mock，加入 Dropdown 和 Modal**

在现有测试文件顶部追加 `Modal` mock，并把 `ant-design-vue` 的 `Dropdown` mock 成“始终渲染 trigger + overlay”的简单容器，便于 jsdom 环境下点击菜单项：

```typescript
const routerPushMock = vi.fn(async () => undefined);
const confirmMock = vi.fn(async () => [false, false] as [boolean, boolean]);

vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/a'
  }),
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('ant-design-vue', async () => {
  const vue = await import('vue');
  return {
    Dropdown: vue.defineComponent({
      name: 'DropdownStub',
      setup(_, { slots }) {
        return () =>
          vue.h('div', { class: 'dropdown-stub' }, [
            vue.h('div', { class: 'dropdown-stub__trigger' }, slots.default?.()),
            vue.h('div', { class: 'dropdown-stub__overlay' }, slots.overlay?.())
          ]);
      }
    })
  };
});

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: confirmMock
  }
}));
```

- [ ] **Step 2: 追加组件行为测试**

在现有两个拖拽指示线测试后面追加以下用例：

```typescript
  it('uses the close button path to close the last tab without disabling the action', async () => {
    const wrapper = await mountHeaderTabs();
    const tabsStore = useTabsStore();
    tabsStore.tabs = [{ id: 'tab-1', path: '/a', title: 'A', cacheKey: 'cache:a' }];
    await wrapper.vm.$nextTick();

    await wrapper.find('.header-tab__close').trigger('click');

    expect(tabsStore.tabs).toEqual([]);
    expect(routerPushMock).toHaveBeenCalledWith('/welcome');
    wrapper.unmount();
  });

  it('confirms before context close when the target tab is dirty', async () => {
    const wrapper = await mountHeaderTabs();
    const tabsStore = useTabsStore();
    tabsStore.setDirty('tab-2');
    await wrapper.vm.$nextTick();

    const menuItems = wrapper.findAll('.b-dropdown-menu-item');
    const closeItem = menuItems.find((item) => item.text().trim() === '关闭');
    expect(closeItem).toBeTruthy();

    await closeItem!.trigger('click');

    expect(confirmMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('closes saved tabs from the context menu without asking for confirmation', async () => {
    const wrapper = await mountHeaderTabs();
    const tabsStore = useTabsStore();
    tabsStore.setDirty('tab-2');
    await wrapper.vm.$nextTick();

    const closeSavedItem = wrapper.findAll('.b-dropdown-menu-item').find((item) => item.text().trim() === '关闭已保存');
    expect(closeSavedItem).toBeTruthy();

    await closeSavedItem!.trigger('click');

    expect(confirmMock).not.toHaveBeenCalled();
    expect(tabsStore.tabs.map((tab) => tab.id)).toEqual(['tab-2']);
    wrapper.unmount();
  });
```

- [ ] **Step 3: 运行组件测试，确认新增用例失败**

Run:

```bash
pnpm test -- test/layouts/default/HeaderTabs.test.ts
```

Expected: FAIL，现阶段可能表现为找不到菜单项、`Modal.confirm` 未被调用，或最后一个标签的关闭行为未复用新规则。

- [ ] **Step 4: Commit**

```bash
git add test/layouts/default/HeaderTabs.test.ts
git commit -m "test: cover HeaderTabs context close actions"
```

---

### Task 4: 在 HeaderTabs.vue 中接入右键菜单并复用关闭计划

**Files:**
- Modify: `src/layouts/default/components/HeaderTabs.vue`

- [ ] **Step 1: 为每个 tab 接入 Dropdown 包裹和右键菜单 overlay**

将现有 `v-for="tab in tabsStore.tabs"` 的 tab 渲染块改为 `Dropdown` 包裹形式，并在 overlay 中复用 `BDropdownMenu`：

```vue
<Dropdown
  v-for="tab in tabsStore.tabs"
  :key="tab.id"
  :trigger="['contextmenu']"
  placement="bottomLeft"
>
  <div
    :ref="setTabRef(tab.id)"
    :data-tab-id="tab.id"
    class="header-tab"
    :class="getTabClassName(tab)"
    @click="handleClickTab(tab.path)"
  >
    <div class="header-tab__title">
      <span v-if="tabsStore.isDirty(tab.id)" class="header-tab__dirty-mark">*</span>
      <span class="header-tab__title-text">{{ tab.title }}</span>
    </div>

    <button class="header-tab__close" @click.stop="handleCloseButton(tab)">
      <Icon icon="ic:round-close" width="12" height="12" />
    </button>
  </div>

  <template #overlay>
    <BDropdownMenu :value="''" :options="getContextMenuOptions(tab)" row-class="header-tab__menu-item" />
  </template>
</Dropdown>
```

同时在 `<script setup>` 中手动引入：

```typescript
import { Dropdown } from 'ant-design-vue';
import { Modal } from '@/utils/modal';
import type { DropdownOption } from '@/components/BDropdown/type';
import type { TabCloseAction, TabClosePlan } from '@/stores/tabs';
```

- [ ] **Step 2: 在组件中集中实现 plan 读取、确认与导航**

在 `handleCloseTab` 原位置替换为统一关闭入口，核心代码按下面这个结构写：

```typescript
/**
 * 根据当前路由推导激活标签 ID。
 * @returns 当前激活标签 ID，不存在时返回 null
 */
function getActiveTabId(): string | null {
  return tabsStore.tabs.find((tab) => tab.path === route.fullPath)?.id ?? null;
}

/**
 * 执行关闭计划，按需确认并处理导航。
 * @param plan - 待执行的关闭计划
 */
async function executeClosePlan(plan: TabClosePlan): Promise<void> {
  if (plan.disabled) {
    return;
  }

  if (plan.requiresConfirm) {
    const [cancelled] = await Modal.confirm(
      plan.action === 'close'
        ? '关闭标签'
        : '批量关闭标签',
      plan.action === 'close'
        ? '当前标签有未保存更改，确认关闭吗？'
        : `即将关闭 ${plan.targetTabIds.length} 个标签，其中包含未保存更改，确认继续吗？`
    );
    if (cancelled) {
      return;
    }
  }

  tabsStore.applyClosePlan(plan);

  if (!plan.requiresNavigation) {
    return;
  }

  await router.push(plan.nextActivePath ?? '/welcome');
}

/**
 * 构建某个标签的右键菜单项。
 * @param tab - 当前标签页
 * @returns 下拉菜单选项
 */
function getContextMenuOptions(tab: Tab): DropdownOption[] {
  const activeTabId = getActiveTabId();
  const closePlan = tabsStore.getClosePlan('close', { anchorTabId: tab.id, activeTabId });
  const closeOthersPlan = tabsStore.getClosePlan('closeOthers', { anchorTabId: tab.id, activeTabId });
  const closeRightPlan = tabsStore.getClosePlan('closeRight', { anchorTabId: tab.id, activeTabId });
  const closeSavedPlan = tabsStore.getClosePlan('closeSaved', { activeTabId });
  const closeAllPlan = tabsStore.getClosePlan('closeAll', { activeTabId });

  return [
    { value: 'close', label: '关闭', disabled: closePlan.disabled, onClick: () => executeClosePlan(closePlan) },
    { value: 'closeOthers', label: '关闭其他', disabled: closeOthersPlan.disabled, onClick: () => executeClosePlan(closeOthersPlan) },
    { value: 'closeRight', label: '关闭右侧', disabled: closeRightPlan.disabled, onClick: () => executeClosePlan(closeRightPlan) },
    { type: 'divider' },
    { value: 'closeSaved', label: '关闭已保存', disabled: closeSavedPlan.disabled, onClick: () => executeClosePlan(closeSavedPlan) },
    { value: 'closeAll', label: '全部关闭', disabled: closeAllPlan.disabled, onClick: () => executeClosePlan(closeAllPlan) }
  ];
}

/**
 * 顶部关闭按钮：允许关闭最后一个标签。
 * @param tab - 待关闭标签
 */
async function handleCloseButton(tab: Tab): Promise<void> {
  const plan = tabsStore.getClosePlan('close', {
    anchorTabId: tab.id,
    activeTabId: getActiveTabId(),
    allowCloseLastTab: true
  });
  await executeClosePlan(plan);
}
```

- [ ] **Step 3: 为右键菜单项补一条轻量缓存，避免一次渲染重复遍历**

不要在模板里直接内联调用五次 `getClosePlan(...)`。用一个 helper 把同一个 tab 的五个 plan 收敛一次，并在单次 `getContextMenuOptions(tab)` 调用内复用：

```typescript
/**
 * 为某个锚点标签批量生成右键菜单所需的关闭计划。
 * @param tabId - 锚点标签 ID
 * @returns 各动作对应的关闭计划
 */
function getContextClosePlans(tabId: string): Record<TabCloseAction, TabClosePlan> {
  const activeTabId = getActiveTabId();
  return {
    close: tabsStore.getClosePlan('close', { anchorTabId: tabId, activeTabId }),
    closeOthers: tabsStore.getClosePlan('closeOthers', { anchorTabId: tabId, activeTabId }),
    closeRight: tabsStore.getClosePlan('closeRight', { anchorTabId: tabId, activeTabId }),
    closeSaved: tabsStore.getClosePlan('closeSaved', { activeTabId }),
    closeAll: tabsStore.getClosePlan('closeAll', { activeTabId })
  };
}
```

然后在 `getContextMenuOptions(tab)` 中只取一次：

```typescript
  const plans = getContextClosePlans(tab.id);
```

- [ ] **Step 4: 运行 HeaderTabs 组件测试**

Run:

```bash
pnpm test -- test/layouts/default/HeaderTabs.test.ts
```

Expected: PASS，原有拖拽指示线测试和新增右键关闭测试全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/layouts/default/components/HeaderTabs.vue test/layouts/default/HeaderTabs.test.ts
git commit -m "feat: add HeaderTabs context close menu"
```

---

### Task 5: 回归验证并补全 changelog

**Files:**
- Modify: `changelog/2026-05-12.md`

- [ ] **Step 1: 在今日 changelog 的 `## Changed` 下追加实现记录**

在 `changelog/2026-05-12.md` 末尾追加这一条：

```markdown
- 新增 HeaderTabs 右键关闭菜单，并把关闭、关闭其他、关闭右侧、关闭已保存、全部关闭统一收敛到 tabs store 的关闭计划/执行接口。
```

- [ ] **Step 2: 运行最终回归测试**

Run:

```bash
pnpm test -- test/stores/tabs.test.ts test/layouts/default/HeaderTabs.test.ts
```

Expected: PASS，store 规则测试与 HeaderTabs 组件测试全部通过。

- [ ] **Step 3: 运行定向 ESLint**

Run:

```bash
pnpm exec eslint src/stores/tabs.ts src/layouts/default/components/HeaderTabs.vue test/stores/tabs.test.ts test/layouts/default/HeaderTabs.test.ts
```

Expected: PASS，无 `any`、未注释函数或未使用变量等 lint 报错。

- [ ] **Step 4: Commit**

```bash
git add changelog/2026-05-12.md
git commit -m "docs: record HeaderTabs context close changes"
```

---

## Self-Review

### Spec coverage

- `tabs store` 两阶段设计：Task 2 覆盖
- 五类关闭动作禁用/确认规则：Task 1 + Task 2 覆盖
- `requiresNavigation + nextActivePath` 语义：Task 1 + Task 2 覆盖
- 关闭按钮允许关闭最后一个标签：Task 1 + Task 4 覆盖
- 右键菜单 UI、确认弹窗、导航：Task 3 + Task 4 覆盖
- 过期计划安全降级执行：Task 1 + Task 2 覆盖
- changelog 记录：Task 5 覆盖

### Placeholder scan

- 没有使用 `TODO` / `TBD` / “自行实现” 类占位语句
- 每个代码步骤都给了明确的目标代码或调用结构
- 每个验证步骤都给了具体命令和预期结果

### Type consistency

- 计划统一使用 `TabCloseAction`、`TabClosePlan`、`TabClosePlanOptions`
- 组件统一调用 `getClosePlan()` / `applyClosePlan()`
- 导航语义统一使用 `requiresNavigation` + `nextActivePath`
