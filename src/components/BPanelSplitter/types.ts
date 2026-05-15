export interface BPanelSplitterProps {
  position?: 'left' | 'right';
  // 最小宽度
  minWidth?: number;
  // 最大宽度
  maxWidth?: number;
  // 内容区的额外 CSS 类名
  sectionClass?: string;
  // 过拖触发关闭的阈值，单位 px；当面板在 minWidth 处继续往缩小方向拖拽超过此距离时触发 close 事件
  closeThreshold?: number;
}
