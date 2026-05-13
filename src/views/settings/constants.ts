import type { AIProviderType } from 'types/ai';

export type SettingsMenuKey = 'provider' | 'service-model' | 'tools' | 'editor' | 'speech' | 'logger';

export interface MenuItem {
  key: SettingsMenuKey;
  label: string;
  icon: string;
  path: string;
}

export const menuItems: MenuItem[] = [
  { key: 'provider', label: 'AI服务商', icon: 'lucide:brain', path: '/settings/provider' },
  { key: 'service-model', label: '服务模型', icon: 'lucide:sparkles', path: '/settings/service-model' },
  { key: 'tools', label: '工具', icon: 'lucide:wrench', path: '/settings/tools/search' },
  { key: 'editor', label: '编辑器', icon: 'lucide:square-pen', path: '/settings/editor' },
  { key: 'speech', label: '语音组件', icon: 'lucide:mic', path: '/settings/speech' },
  { key: 'logger', label: '运行日志', icon: 'lucide:file-text', path: '/settings/logger' }
];

export interface ProviderFormatOption {
  value: AIProviderType;
  label: string;
}

export const providerFormatOptions: ProviderFormatOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'deepseek', label: 'Deepseek' }
];

export const providerFormatLabels = Object.fromEntries(providerFormatOptions.map((option) => [option.value, option.label]));

export const CONTAINER_WIDTH_THRESHOLD = 800;

export const SIDEBAR_WIDTH_LARGE = 280;

export const SIDEBAR_WIDTH_SMALL = 60;
