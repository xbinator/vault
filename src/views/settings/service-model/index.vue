<template>
  <BSettingsPage title="模型服务">
    <ServiceConfig service-type="chat" title="智能对话助手" description="指定用于智能对话的模型" :options="CHAT_SERVICE_CONFIG_OPTIONS" :show-prompt="false" />

    <ServiceConfig
      service-type="polish"
      title="内容编辑助手"
      description="指定用于内容编辑的模型"
      :options="POLISH_SERVICE_CONFIG_OPTIONS"
      :default-prompt="POLISH_DEFAULT_PROMPT"
    />

    <ServiceConfig
      service-type="autoname"
      title="话题自动命名助理"
      description="指定用于自动生成会话标题的模型"
      :options="AUTONAME_SERVICE_CONFIG_OPTIONS"
      :default-prompt="AUTONAME_DEFAULT_PROMPT"
    />
  </BSettingsPage>
</template>

<script setup lang="ts">
import ServiceConfig from './components/ServiceConfig.vue';
import {
  AUTONAME_DEFAULT_PROMPT,
  AUTONAME_SERVICE_CONFIG_OPTIONS,
  CHAT_SERVICE_CONFIG_OPTIONS,
  POLISH_DEFAULT_PROMPT,
  POLISH_SERVICE_CONFIG_OPTIONS
} from './constants';
</script>
