/**
 * @file index.test.ts
 * @description BModelSelect 组件单元测试。
 */
/* @vitest-environment jsdom */

import { nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BModelSelect from '@/components/BModelSelect/index.vue';
import type { SelectedModel } from '@/stores/serviceModel';

// Mock useProviderStore
vi.mock('@/stores/provider', () => ({
  useProviderStore: () => ({
    providers: ref([
      {
        id: 'openai',
        name: 'OpenAI',
        isEnabled: true,
        models: [
          { id: 'gpt-4', name: 'GPT-4', isEnabled: true },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', isEnabled: true }
        ]
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        isEnabled: true,
        models: [{ id: 'claude-3-opus', name: 'Claude 3 Opus', isEnabled: true }]
      }
    ]),
    loadProviders: vi.fn()
  })
}));

describe('BModelSelect', () => {
  it('should render model list when opened', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    expect(wrapper.find('.model-search').exists()).toBe(true);
    expect(wrapper.find('.model-list').exists()).toBe(true);
    expect(wrapper.findAll('.model-group')).toHaveLength(2);
  });

  it('should filter models by search query', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    const input = wrapper.find('.model-search__input');
    await input.setValue('GPT');

    expect(wrapper.findAll('.model-item')).toHaveLength(2);
  });

  it('should emit update:model when model is selected', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    const firstModel = wrapper.find('.model-item');
    await firstModel.trigger('click');

    expect(wrapper.emitted('update:model')).toBeTruthy();
    expect(wrapper.emitted('update:model')![0][0]).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4'
    } as SelectedModel);
  });

  it('should close dialog after model selection', async () => {
    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    const firstModel = wrapper.find('.model-item');
    await firstModel.trigger('click');

    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0][0]).toBe(false);
  });

  it('should show empty state when no models available', async () => {
    vi.doMock('@/stores/provider', () => ({
      useProviderStore: () => ({
        providers: ref([]),
        loadProviders: vi.fn()
      })
    }));

    const wrapper = mount(BModelSelect, {
      props: {
        open: true
      }
    });

    await nextTick();

    expect(wrapper.find('.model-empty').exists()).toBe(true);
    expect(wrapper.find('.model-empty').text()).toBe('暂无可用模型');
  });

  it('should expose open method', async () => {
    const wrapper = mount(BModelSelect);

    expect(typeof wrapper.vm.open).toBe('function');

    wrapper.vm.open();
    await nextTick();

    expect(wrapper.emitted('update:open')).toBeTruthy();
    expect(wrapper.emitted('update:open')![0][0]).toBe(true);
  });
});
