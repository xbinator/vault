<template>
  <div class="provider-sidebar">
    <div class="sidebar-section">
      <div class="section-title">分类</div>
      <div
        v-for="category in categories"
        :key="category.key"
        class="sidebar-item"
        :class="{ active: activeCategory === category.key && activeProvider === 'all' }"
        @click="handleCategoryClick(category.key)"
      >
        <Icon :icon="category.icon" />
        <span>{{ category.label }}</span>
        <span class="count">{{ categoryCountMap[category.key] }}</span>
      </div>
    </div>

    <!-- 自定义服务商 -->
    <div class="sidebar-section">
      <div class="section-header">
        <div class="section-title">自定义服务商</div>
        <div class="section-actions" @click="handleAddProvider">
          <Icon icon="lucide:plus" width="14" height="14" />
        </div>
      </div>
      <div v-if="customProviders.length === 0" class="empty-state">
        <Icon icon="lucide:inbox" width="24" height="24" />
        <span>暂无自定义服务商</span>
      </div>
      <div
        v-for="provider in customProviders"
        :key="provider.value"
        class="sidebar-item"
        :class="{ active: activeProvider === provider.value && activeCategory === 'all' }"
        @click="handleProviderClick(provider.value)"
      >
        <img v-if="getProviderLogo(provider.value)" class="provider-logo" :src="getProviderLogo(provider.value)" :alt="provider.label" />
        <Icon v-else icon="lucide:bot" width="16" height="16" />
        <span>{{ provider.label }}</span>

        <BDropdown>
          <button type="button" class="edit-btn" title="更多">
            <Icon icon="lucide:more-vertical" width="12" height="12" />
          </button>
          <template #overlay>
            <BDropdownMenu :options="getProviderDropdownOptions(provider.value)">
              <template #menu="{ record }">
                <div class="dropdown-menu-item" :class="{ danger: record.danger }">
                  <Icon :icon="record.icon" />
                  <span>{{ record.label }}</span>
                </div>
              </template>
            </BDropdownMenu>
          </template>
        </BDropdown>
      </div>
    </div>

    <!-- 默认服务商 -->
    <div class="sidebar-section">
      <div class="section-header">
        <div class="section-title">服务商</div>
      </div>
      <div
        v-for="provider in defaultProviders"
        :key="provider.value"
        class="sidebar-item"
        :class="{ active: activeProvider === provider.value && activeCategory === 'all' }"
        @click="handleProviderClick(provider.value)"
      >
        <img v-if="getProviderLogo(provider.value)" class="provider-logo" :src="getProviderLogo(provider.value)" :alt="provider.label" />
        <BModelIcon v-else :provider="provider.value" :size="16" />
        <span>{{ provider.label }}</span>
      </div>
    </div>
  </div>

  <ProviderModal v-model:open="modalVisible" :provider="editingProvider" />
</template>

<script setup lang="ts">
import type { Provider } from '../types';
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import BDropdown from '@/components/BDropdown/index.vue';
import BDropdownMenu from '@/components/BDropdown/Menu.vue';
import type { DropdownOptionItem } from '@/components/BDropdown/type';
import BModelIcon from '@/components/BModelIcon/index.vue';
import { Modal } from '@/utils/modal';
import { useProviders } from '../hooks/useProviders';
import ProviderModal from './ProviderModal.vue';

interface Category {
  key: string;
  label: string;
  icon: string;
}

const router = useRouter();
const route = useRoute();
const { providers, deleteCustomProvider } = useProviders();

const customProviders = computed(() => {
  return providers.value.filter((provider: Provider) => provider.isCustom).map((provider: Provider) => ({ label: provider.name, value: provider.id }));
});

const defaultProviders = computed(() => {
  return providers.value.filter((provider: Provider) => !provider.isCustom).map((provider: Provider) => ({ label: provider.name, value: provider.id }));
});

const categories: Category[] = [
  { key: 'all', label: '全部', icon: 'lucide:layout-grid' },
  { key: 'enabled', label: '已启用', icon: 'lucide:check-circle' }
];

const modalVisible = ref<boolean>(false);
const editingProvider = ref<Provider | null>(null);

const activeCategory = computed(() => {
  const category = route.query.category as string;
  return category || 'all';
});

const activeProvider = computed(() => {
  const { path } = route;
  if (path.includes('/settings/provider/') && path !== '/settings/provider') {
    const parts = path.split('/');
    return parts[parts.length - 1];
  }
  return 'all';
});

const providerMap = computed<Record<string, Provider>>(() => {
  return providers.value.reduce<Record<string, Provider>>((acc, provider) => {
    acc[provider.id] = provider;
    return acc;
  }, {});
});

const categoryCountMap = computed<Record<string, number>>(() => ({
  all: providers.value.length,
  enabled: providers.value.filter((provider: Provider) => provider.isEnabled).length,
  disabled: providers.value.filter((provider: Provider) => !provider.isEnabled).length
}));

function handleCategoryClick(value: string): void {
  if (value === 'all') {
    router.push('/settings/provider');
  } else {
    router.push({ path: '/settings/provider', query: { category: value } });
  }
}

function handleProviderClick(value: string): void {
  if (value === 'all') {
    router.push('/settings/provider');
  } else {
    router.push(`/settings/provider/${value}`);
  }
}

function getProviderLogo(providerId: string): string {
  return providerMap.value[providerId]?.logo || '';
}

function handleAddProvider(): void {
  editingProvider.value = null;
  modalVisible.value = true;
}

function handleEditProvider(providerId: string): void {
  const provider = providerMap.value[providerId];
  if (!provider || !provider.isCustom) {
    return;
  }
  editingProvider.value = provider;
  modalVisible.value = true;
}

async function handleDeleteProvider(providerId: string): Promise<void> {
  const provider = providerMap.value[providerId];
  if (!provider || !provider.isCustom) {
    return;
  }

  const [, confirmed] = await Modal.delete(`确定要删除服务商 "${provider.name}" 吗？`);
  if (!confirmed) return;

  const success = await deleteCustomProvider(providerId);
  if (success) {
    // 如果当前正在查看的是被删除的服务商，跳转到服务商列表页
    if (activeProvider.value === providerId) {
      router.push('/settings/provider');
    }
  }
}

function getProviderDropdownOptions(providerId: string): DropdownOptionItem[] {
  return [
    {
      type: 'item',
      value: 'edit',
      label: '编辑',
      icon: 'lucide:pencil',
      onClick: () => handleEditProvider(providerId)
    },
    {
      type: 'item',
      value: 'delete',
      label: '删除',
      icon: 'lucide:trash-2',
      danger: true,
      onClick: () => handleDeleteProvider(providerId)
    }
  ];
}
</script>

<style scoped lang="less">
.provider-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 20px;
  width: 220px;
  overflow: auto;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  margin-bottom: 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--text-tertiary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.sidebar-item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);

    .edit-btn {
      opacity: 1;
    }
  }

  &.active {
    font-weight: 500;
    color: var(--text-primary);
    background: var(--color-primary-bg);

    .edit-btn {
      opacity: 1;
    }
  }
}

.provider-logo {
  width: 16px;
  height: 16px;
  object-fit: cover;
  border-radius: 4px;
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: auto;
  color: var(--text-tertiary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-secondary);
  }
}

.count {
  padding: 1px 6px;
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-secondary);
  border-radius: 8px;
}

.dropdown-menu-item {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 120px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 20px 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
