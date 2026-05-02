# 语音录音呼吸灯实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将语音录音时的波形显示改为呼吸灯效果，呼吸灯的大小和亮度跟随声音强度实时变化。

**Architecture:** 删除 VoiceWaveform.vue 组件，在 VoiceInput.vue 中添加呼吸灯元素，通过 CSS 变量动态控制大小和亮度，复用现有的 waveformSamples 数据。

**Tech Stack:** Vue 3 Composition API, CSS Variables, Less

---

### Task 1: 更新 VoiceInput.vue 组件

**Files:**
- Modify: `src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue`

- [ ] **Step 1: 修改模板，添加呼吸灯元素**

将模板部分修改为：

```vue
<template>
  <div class="voice-input">
    <BButton v-if="isIdle" data-testid="voice-start" size="small" type="text" square :disabled="disabled" @click="handleStart">
      <Icon icon="lucide:mic" width="16" height="16" />
    </BButton>
    <span
      v-else
      data-testid="voice-stop"
      class="voice-breathing-light"
      :style="breathingLightStyle"
      @click="handleStop"
    ></span>
  </div>
</template>
```

- [ ] **Step 2: 添加呼吸灯样式计算**

在 script setup 部分添加：

```typescript
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
```

- [ ] **Step 3: 添加呼吸灯 CSS 样式**

在 style 部分添加：

```less
.voice-breathing-light {
  display: inline-block;
  width: var(--size, 8px);
  height: var(--size, 8px);
  background: var(--color-primary, #4080ff);
  border-radius: 50%;
  opacity: var(--opacity, 0.4);
  cursor: pointer;
  transition: width 0.1s ease-out, height 0.1s ease-out, opacity 0.1s ease-out;
}
```

- [ ] **Step 4: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

- [ ] **Step 5: 提交更改**

```bash
git add src/components/BChatSidebar/components/InputToolbar/VoiceInput.vue
git commit -m "feat(voice): replace waveform with breathing light effect"
```

---

### Task 2: 更新 InputToolbar.vue 父组件

**Files:**
- Modify: `src/components/BChatSidebar/components/InputToolbar.vue`

- [ ] **Step 1: 移除 VoiceWaveform 导入和使用**

删除导入语句：

```typescript
import VoiceWaveform from './InputToolbar/VoiceWaveform.vue';
```

删除模板中的波形显示部分：

```vue
<template v-if="isVoiceRecording">
  <VoiceWaveform :samples="voiceWaveformSamples" />
</template>
<template v-else>
```

改为：

```vue
<template v-if="!isVoiceRecording">
```

- [ ] **Step 2: 移除不再需要的计算属性**

删除以下计算属性：

```typescript
const isVoiceRecording = computed<boolean>(() => {
  const input = voiceInputRef.value;
  return input?.isRecording ?? false;
});

const voiceWaveformSamples = computed<number[]>(() => {
  const input = voiceInputRef.value;
  return input?.waveformSamples ?? [];
});
```

添加新的计算属性：

```typescript
const isVoiceRecording = computed<boolean>(() => {
  const input = voiceInputRef.value;
  return input?.isRecording ?? false;
});
```

- [ ] **Step 3: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

- [ ] **Step 4: 提交更改**

```bash
git add src/components/BChatSidebar/components/InputToolbar.vue
git commit -m "refactor(voice): remove VoiceWaveform from InputToolbar"
```

---

### Task 3: 删除 VoiceWaveform.vue 组件

**Files:**
- Delete: `src/components/BChatSidebar/components/InputToolbar/VoiceWaveform.vue`

- [ ] **Step 1: 删除文件**

```bash
rm src/components/BChatSidebar/components/InputToolbar/VoiceWaveform.vue
```

- [ ] **Step 2: 提交更改**

```bash
git add -A
git commit -m "refactor(voice): remove VoiceWaveform component"
```

---

### Task 4: 更新测试文件

**Files:**
- Modify: `test/components/BChatSidebar/components/VoiceInput.test.ts`

- [ ] **Step 1: 更新测试选择器**

测试文件中的 `[data-testid="voice-stop"]` 选择器仍然有效，因为呼吸灯元素已添加该属性。无需修改测试代码。

运行测试验证：

Run: `npm run test -- test/components/BChatSidebar/components/VoiceInput.test.ts`
Expected: 所有测试通过

- [ ] **Step 2: 提交更改（如有修改）**

如果测试文件有修改：

```bash
git add test/components/BChatSidebar/components/VoiceInput.test.ts
git commit -m "test(voice): update VoiceInput tests for breathing light"
```

---

### Task 5: 更新 Changelog

**Files:**
- Modify: `changelog/2026-05-03.md`

- [ ] **Step 1: 添加变更记录**

检查是否存在当天的 changelog 文件，如果存在则追加，不存在则创建：

```markdown
# 2026-05-03

## Changed
- 将语音录音波形显示改为呼吸灯效果，大小和亮度跟随声音强度变化
```

- [ ] **Step 2: 提交更改**

```bash
git add changelog/2026-05-03.md
git commit -m "docs: update changelog for breathing light feature"
```

---

### Task 6: 最终验证

- [ ] **Step 1: 运行完整测试套件**

Run: `npm run test`
Expected: 所有测试通过

- [ ] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

- [ ] **Step 3: 运行 lint**

Run: `npm run lint`
Expected: 无 lint 错误
