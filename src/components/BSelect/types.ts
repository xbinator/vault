import type { SelectProps } from 'ant-design-vue';

// 扩展 option 类型，支持 tips 字段
export type SelectOption = NonNullable<SelectProps['options']>[number] & {
  tips?: string;
};
