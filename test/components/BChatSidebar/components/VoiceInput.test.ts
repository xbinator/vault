/* @vitest-environment jsdom */
/**
 * @file VoiceInput.test.ts
 * @description 验证语音输入组件的开始、停止与完成事件转发行为。
 */
import { nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 通用按钮桩模板。
 */
const buttonStubTemplate =
  '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><span v-if="loading">loading</span><slot /></button>';

/**
 * 录音状态引用。
 */
const recorderStatus = ref<'idle' | 'recording' | 'stopping'>('idle');

/**
 * 最终文本引用。
 */
const finalText = ref('第一段');

/**
 * 开始录音桩。
 */
const startMock = vi.fn(async () => {
  recorderStatus.value = 'recording';
});

/**
 * 停止录音桩。
 */
const stopMock = vi.fn(async () => {
  recorderStatus.value = 'idle';
});

/**
 * 当前测试使用的会话完成桩。
 */
const completeSessionMock = vi.fn(async () => ({ text: finalText.value, failedSegmentIds: [] }));

/**
 * 语音运行时状态查询桩。
 */
const getSpeechRuntimeStatusMock = vi.fn(async () => ({ state: 'ready' as const }));
const getSpeechRuntimeSnapshotMock = vi.fn(async () => ({
  binaryState: 'ready' as const,
  activeState: 'ready' as const,
  hasUsableModel: true,
  platform: 'darwin' as const,
  arch: 'arm64' as const,
  managedModels: [],
  externalModels: []
}));
const messageErrorMock = vi.fn();

vi.mock('@/shared/platform/electron-api', () => ({
  hasElectronAPI: () => true,
  getElectronAPI: () => ({
    getSpeechRuntimeStatus: getSpeechRuntimeStatusMock,
    getSpeechRuntimeSnapshot: getSpeechRuntimeSnapshotMock
  })
}));

vi.mock('ant-design-vue', () => ({
  message: {
    loading: vi.fn(),
    success: vi.fn(),
    error: messageErrorMock
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn(async () => [false])
  }
}));

/**
 * 录音 hook 模拟。
 */
vi.mock('@/components/BChatSidebar/hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    status: recorderStatus,
    waveformSamples: ref([0, 2, 1]),
    start: startMock,
    stop: stopMock
  })
}));

/**
 * 会话 hook 模拟。
 */
vi.mock('@/components/BChatSidebar/hooks/useVoiceSession', () => ({
  useVoiceSession: () => ({
    finalText,
    enqueueSegment: vi.fn(),
    resetSession: vi.fn(),
    completeSession: completeSessionMock
  })
}));

describe('VoiceInput', () => {
  beforeEach(() => {
    recorderStatus.value = 'idle';
    finalText.value = '第一段';
    startMock.mockClear();
    stopMock.mockClear();
    completeSessionMock.mockReset();
    completeSessionMock.mockImplementation(async () => ({ text: finalText.value, failedSegmentIds: [] }));
    getSpeechRuntimeStatusMock.mockClear();
    getSpeechRuntimeSnapshotMock.mockClear();
    getSpeechRuntimeSnapshotMock.mockResolvedValue({
      binaryState: 'ready',
      activeState: 'ready',
      hasUsableModel: true,
      platform: 'darwin',
      arch: 'arm64',
      managedModels: [],
      externalModels: []
    });
    messageErrorMock.mockReset();
  });

  it('emits complete with the final transcript after stopping a recording session', async () => {
    const { default: VoiceInput } = await import('@/components/BChatSidebar/components/InputToolbar/VoiceInput.vue');
    const wrapper = mount(VoiceInput, {
      props: {
        disabled: false
      },
      global: {
        stubs: {
          BButton: {
            props: ['disabled', 'loading'],
            emits: ['click'],
            template: buttonStubTemplate
          }
        }
      }
    });

    await wrapper.get('[data-testid="voice-start"]').trigger('click');
    await wrapper.get('[data-testid="voice-stop"]').trigger('click');

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('complete')?.[0]?.[0].text).toBe('第一段');
  });

  it('shows a loading button after stopping until transcription completes', async () => {
    let resolveCompleteSession: ((value: { text: string; failedSegmentIds: string[] }) => void) | null = null;
    completeSessionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCompleteSession = resolve;
        })
    );

    const { default: VoiceInput } = await import('@/components/BChatSidebar/components/InputToolbar/VoiceInput.vue');
    const wrapper = mount(VoiceInput, {
      props: {
        disabled: false
      },
      global: {
        stubs: {
          BButton: {
            props: ['disabled', 'loading'],
            emits: ['click'],
            template: buttonStubTemplate
          }
        }
      }
    });

    await wrapper.get('[data-testid="voice-start"]').trigger('click');
    const stopPromise = wrapper.get('[data-testid="voice-stop"]').trigger('click');
    await Promise.resolve();
    await nextTick();

    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="voice-transcribing"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('loading');
    expect(wrapper.emitted('complete')).toBeUndefined();

    resolveCompleteSession?.({ text: finalText.value, failedSegmentIds: [] });
    await stopPromise;
    await nextTick();

    expect(wrapper.find('[data-testid="voice-transcribing"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="voice-start"]').exists()).toBe(true);
    expect(wrapper.emitted('complete')?.[0]?.[0].text).toBe('第一段');
  });

  it('blocks recording when no usable speech model is available', async () => {
    getSpeechRuntimeSnapshotMock.mockResolvedValue({
      binaryState: 'ready',
      activeState: 'missing-model',
      hasUsableModel: false,
      platform: 'darwin',
      arch: 'arm64',
      managedModels: [],
      externalModels: []
    });

    const { default: VoiceInput } = await import('@/components/BChatSidebar/components/InputToolbar/VoiceInput.vue');
    const wrapper = mount(VoiceInput, {
      props: {
        disabled: false
      },
      global: {
        stubs: {
          BButton: {
            props: ['disabled', 'loading'],
            emits: ['click'],
            template: buttonStubTemplate
          }
        }
      }
    });

    await wrapper.get('[data-testid="voice-start"]').trigger('click');

    expect(startMock).not.toHaveBeenCalled();
    expect(messageErrorMock).toHaveBeenCalledWith('请先前往语音设置页下载或添加语音模型');
  });

  it('blocks recording when the selected external speech model is invalid', async () => {
    getSpeechRuntimeSnapshotMock.mockResolvedValue({
      binaryState: 'ready',
      activeState: 'invalid-selection',
      hasUsableModel: false,
      errorMessage: '当前语音模型文件不可用，请前往设置页重新选择',
      platform: 'darwin',
      arch: 'arm64',
      managedModels: [],
      externalModels: []
    });

    const { default: VoiceInput } = await import('@/components/BChatSidebar/components/InputToolbar/VoiceInput.vue');
    const wrapper = mount(VoiceInput, {
      props: {
        disabled: false
      },
      global: {
        stubs: {
          BButton: {
            props: ['disabled', 'loading'],
            emits: ['click'],
            template: buttonStubTemplate
          }
        }
      }
    });

    await wrapper.get('[data-testid="voice-start"]').trigger('click');

    expect(startMock).not.toHaveBeenCalled();
    expect(messageErrorMock).toHaveBeenCalledWith('当前语音模型文件不可用，请前往设置页重新选择');
  });
});
