/**
 * @file chipResolver.test.ts
 * @description chipResolver 单元测试，覆盖新格式解析和 DOM 渲染。
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';
import { chipResolver } from '@/components/BChatSidebar/utils/chipResolver';
import type { ChipResult } from '@/components/BPromptEditor/extensions/variableChip';

/**
 * 窄化 ChipResult 并断言 Widget 构造参数。
 */
function expectFileRefWidget(result: ChipResult | null, expected: { fileName: string; startLine: number; endLine: number }): void {
  expect(result).not.toBeNull();
  const chipResult = result as ChipResult;
  expect(chipResult).toHaveProperty('widget');
  if ('widget' in chipResult) {
    expect(chipResult.widget).toMatchObject({
      fileName: expected.fileName,
      startLine: expected.startLine,
      endLine: expected.endLine
    });
  }
}

describe('chipResolver', () => {
  describe('新格式（@fileName:行号）', () => {
    test('范围引用：@fileName:startLine-endLine', () => {
      expectFileRefWidget(chipResolver('@file.ts:5-15'), {
        fileName: 'file.ts',
        startLine: 5,
        endLine: 15
      });
    });

    test('单行引用：@fileName:startLine', () => {
      expectFileRefWidget(chipResolver('@file.ts:10'), {
        fileName: 'file.ts',
        startLine: 10,
        endLine: 10
      });
    });

    test('无行号：@fileName', () => {
      expectFileRefWidget(chipResolver('@file.ts'), {
        fileName: 'file.ts',
        startLine: 0,
        endLine: 0
      });
    });

    test('文件名含点号', () => {
      expectFileRefWidget(chipResolver('@helper.ts:3-8'), {
        fileName: 'helper.ts',
        startLine: 3,
        endLine: 8
      });
    });
  });

  describe('非 file-ref 类型', () => {
    test('其他类型 body → 返回 null', () => {
      expect(chipResolver('todo:something')).toBeNull();
    });

    test('空字符串 → 返回 null', () => {
      expect(chipResolver('')).toBeNull();
    });
  });

  describe('FileRefWidget DOM 渲染', () => {
    /**
     * 从 chipResolver 结果中提取 Widget 并返回其 toDOM 结果。
     */
    function resolveWidgetDom(body: string): HTMLElement | null {
      const result = chipResolver(body);
      if (result && 'widget' in result) {
        return (result.widget as { toDOM(view?: unknown): HTMLElement }).toDOM();
      }
      return null;
    }

    test('toDOM 单行渲染', () => {
      const dom = resolveWidgetDom('@file.ts:5');
      expect(dom?.textContent).toBe('file.ts:5');
    });

    test('toDOM 范围渲染', () => {
      const dom = resolveWidgetDom('@file.ts:5-15');
      expect(dom?.textContent).toBe('file.ts:5-15');
    });

    test('toDOM 无行号仅显示文件名', () => {
      const dom = resolveWidgetDom('@file.ts');
      expect(dom?.textContent).toBe('file.ts');
    });
  });
});
