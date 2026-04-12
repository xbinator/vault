export interface BMessageProps {
  /** 累积的文本内容（父组件负责拼接 chunk） */
  content?: string;
  /** 流式状态 */
  loading?: boolean;
  /** 内容类型：markdown 渲染富文本，text 渲染纯文本 */
  type?: 'markdown' | 'text';
  // 高度
  height?: number | string;
  // 最大高度
  maxHeight?: number | string;
}
