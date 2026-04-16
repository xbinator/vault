import type { AIUsage } from 'types/ai';
import type { ChatMessageFile, ChatMessageRole } from 'types/chat';

export interface BChatProps {
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  submitOnEnter?: boolean;
  canSubmit?: boolean;
}

export interface Message {
  id: string;
  role: ChatMessageRole;
  // 消息内容
  content: string;
  // 文件列表
  files?: ChatMessageFile[];
  // Token 使用统计
  usage?: AIUsage;
  // 创建时间
  createdAt: number;
  // 是否正在加载
  loading?: boolean;
  // 完成状态
  finished?: boolean;
  // 错误信息
  error?: string;
}
