<template>
  <div class="editor-sidebar">
    <div class="sidebar-placeholder">辅助工具侧边栏</div>
  </div>
</template>

<script setup lang="ts">
// 侧边栏组件逻辑可以在这里添加
</script>

<style scoped lang="less">
.editor-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: 300px;
  margin: 0 6px 6px 0;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
}

.sidebar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}
</style>
