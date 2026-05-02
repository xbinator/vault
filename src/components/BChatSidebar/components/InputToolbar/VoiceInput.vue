<!--
  @file VoiceInput.vue
  @description 语音输入组件，负责录音开关、波形展示与完成事件转发。
-->
<template>
  <div class="voice-input">
    <BButton v-if="isIdle" data-testid="voice-start" size="small" type="text" square :disabled="disabled" @click="handleStart">
      <Icon icon="lucide:mic" width="16" height="16" />
    </BButton>
    <span v-else data-testid="voice-stop" class="voice-breathing-light" :style="breathingLightStyle" @click="handleStop"></span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useVoiceSession } from '../../hooks/useVoiceSession';

/**
 * 语音输入属性。
 */
interface Props {
  /** 是否禁用交互。 */
  disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
  disabled: false
});

const emit = defineEmits<{
  (e: 'start'): void;
  (e: 'complete', payload: { text: string }): void;
}>();

/**
 * 录音状态与控制器。
 */
const nextSeparator = ref<'' | '\n'>('');
const nextSegmentIndex = ref<number>(0);

/**
 * 转写会话控制器。
 */
const session = useVoiceSession();

/**
 * 处理录音器自动产出的单段音频。
 * @param segment - 当前音频段
 */
async function handleRecorderSegment(segment: { buffer: ArrayBuffer; mimeType: string }): Promise<void> {
  const currentSeparator = nextSeparator.value;
  nextSeparator.value = '';
  nextSegmentIndex.value += 1;

  await session.enqueueSegment({
    id: `segment-${nextSegmentIndex.value}`,
    separator: currentSeparator,
    buffer: segment.buffer,
    mimeType: segment.mimeType
  });
}

/**
 * 录音状态与控制器。
 */
const recorder = useVoiceRecorder({
  onSegment: handleRecorderSegment
});

/**
 * 当前是否处于空闲状态。
 */
const isIdle = computed<boolean>(() => recorder.status.value === 'idle');

/**
 * 当前是否正在录音。
 */
const isRecording = computed<boolean>(() => recorder.status.value === 'recording');

/**
 * 归一化当前采样值（0-1 范围）。
 */
const normalizedSample = computed<number>(() => {
  const samples = recorder.waveformSamples.value;
  if (samples.length === 0) return 0;
  const latest = samples[samples.length - 1];
  return Math.min(1, Math.max(0, latest / 10));
});

/**
 * 呼吸灯动态样式。
 */
const breathingLightStyle = computed<Record<string, string>>(() => {
  const size = 8 + normalizedSample.value * 8;
  const opacity = 0.4 + normalizedSample.value * 0.6;
  return {
    '--size': `${size}px`,
    '--opacity': String(opacity)
  };
});

/**
 * 暴露给父组件的状态和方法。
 */
defineExpose({
  isRecording,
  waveformSamples: recorder.waveformSamples
});

/**
 * 启动录音。
 */
async function handleStart(): Promise<void> {
  nextSeparator.value = '';
  nextSegmentIndex.value = 0;
  session.resetSession();
  await recorder.start();
  emit('start');
}

/**
 * 停止录音并把最终文本抛给父层。
 */
async function handleStop(): Promise<void> {
  await recorder.stop();
  const payload = await session.completeSession();
  emit('complete', payload);
}
</script>

<style scoped lang="less">
.voice-input {
  display: flex;
  gap: 6px;
  align-items: center;
}

.voice-breathing-light {
  display: inline-block;
  width: var(--size, 8px);
  height: var(--size, 8px);
  cursor: pointer;
  background: var(--color-primary, #4080ff);
  border-radius: 50%;
  opacity: var(--opacity, 0.4);
  transition: width 0.1s ease-out, height 0.1s ease-out, opacity 0.1s ease-out;
}
</style>
