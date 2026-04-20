/**
 * @file utils.mts
 * @description 错误详情提取工具函数
 */
import type { ExtractedErrorDetails } from './codes.mjs';
import { get, isObject } from 'lodash-es';

/**
 * 将未知值转换为小写字符串
 * @param v - 未知值
 * @returns 小写字符串或 undefined
 */
const toStr = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : undefined);

/**
 * 将未知值转换为数字
 * @param v - 未知值
 * @returns 数字或 undefined
 */
const toNum = (v: unknown) => (typeof v === 'number' ? v : undefined);

/**
 * 从错误对象中提取标准化的错误详情
 * @param error - 原始错误对象
 * @param fallbackMessage - 默认错误消息
 * @returns 提取的错误详情
 */
export function extractErrorDetails(error: unknown, fallbackMessage: string): ExtractedErrorDetails {
  const root = isObject(error) ? error : undefined;
  const message = error instanceof Error ? error.message : fallbackMessage;

  // 按优先级依次查找 error 载体
  const errorSource = get(root, 'responseBody.error') ?? get(root, 'data.error') ?? root ?? {};

  return {
    message,
    normalizedMessage: message.toLowerCase(),
    statusCode: toNum(get(root, 'statusCode')),
    errorCode: toStr(get(errorSource, 'code')),
    errorType: toStr(get(errorSource, 'type')),
    providerStatus: toStr(get(errorSource, 'status'))
  };
}
