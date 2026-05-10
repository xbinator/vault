/**
 * @file fileErrors.ts
 * @description 文件工具共享错误定义与构造函数。
 */
import type { AIToolExecutionError } from 'types/ai';

/**
 * 文件工具共享错误码。
 */
export type FileToolErrorCode = 'FILE_NOT_READ' | 'FILE_READ_PARTIAL' | 'FILE_CHANGED' | 'MATCH_NOT_FOUND' | 'MATCH_NOT_UNIQUE';

/**
 * 将文件工具错误码映射为统一执行错误。
 * @param code - 文件工具共享错误码
 * @returns 统一工具错误码与消息
 */
export function toFileToolExecutionError(code: FileToolErrorCode): Pick<AIToolExecutionError, 'code' | 'message'> {
  switch (code) {
    case 'FILE_NOT_READ':
      return { code: 'PERMISSION_DENIED', message: '修改现有文件前必须先完整读取该文件' };
    case 'FILE_READ_PARTIAL':
      return { code: 'PERMISSION_DENIED', message: '当前文件仅做了局部读取，请先完整读取后再修改' };
    case 'FILE_CHANGED':
      return { code: 'STALE_CONTEXT', message: '文件内容已发生变化，请重新读取后再试' };
    case 'MATCH_NOT_FOUND':
      return { code: 'INVALID_INPUT', message: '未找到要替换的内容' };
    case 'MATCH_NOT_UNIQUE':
      return { code: 'INVALID_INPUT', message: '匹配内容不唯一，请提供更精确的 oldString 或开启 replaceAll' };
    default:
      return { code: 'EXECUTION_FAILED', message: '未知的文件工具错误' };
  }
}
