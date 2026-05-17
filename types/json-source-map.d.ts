/**
 * @file json-source-map.d.ts
 * @description json-source-map 类型声明。
 */

declare module 'json-source-map' {
  /**
   * 源码位置信息。
   */
  interface LocationInfo {
    /** 行号。 */
    line: number;
    /** 列号。 */
    column: number;
    /** 文本偏移量。 */
    pos: number;
  }

  /**
   * JSON Pointer 对应的位置映射。
   */
  interface PointerInfo {
    /** key 起始位置。 */
    key?: LocationInfo;
    /** key 结束位置。 */
    keyEnd?: LocationInfo;
    /** value 起始位置。 */
    value: LocationInfo;
    /** value 结束位置。 */
    valueEnd: LocationInfo;
  }

  /**
   * json-source-map 解析结果。
   */
  interface ParseResult {
    /** 解析出的 JSON 数据。 */
    data: unknown;
    /** Pointer 到源码位置的映射。 */
    pointers: Record<string, PointerInfo>;
  }

  /**
   * 解析 JSON 文本并返回源码映射。
   * @param text - JSON 文本
   * @returns 解析结果
   */
  export function parse(text: string): ParseResult;
}
