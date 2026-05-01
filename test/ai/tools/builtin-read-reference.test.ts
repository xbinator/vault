/**
 * @file builtin-read-reference.test.ts
 * @description 内置 read_reference 工具测试。
 */
import { describe, expect, it } from 'vitest';
import { createBuiltinReadReferenceTool } from '@/ai/tools/builtin/read-reference';

describe('createBuiltinReadReferenceTool', () => {
  it('reads a frozen snapshot by reference id using the default line window', async () => {
    const tool = createBuiltinReadReferenceTool({
      getReferenceSnapshot: async () => ({
        referenceId: 'ref-1',
        fileName: 'draft.ts',
        path: null,
        documentId: 'doc-1',
        snapshotId: 'snapshot-1',
        content: Array.from({ length: 200 }, (_, index) => `line ${index + 1}`).join('\n'),
        startLine: 50,
        endLine: 55
      })
    });

    const result = await tool.execute({ referenceId: 'ref-1' });

    expect(result.status).toBe('success');
    if (result.status !== 'success') {
      throw new Error('expected success result');
    }
    expect(result.data.offset).toBe(1);
    expect(result.data.readLines).toBe(120);
    expect(result.data.hasMore).toBe(true);
    expect(result.data.content).toContain('line 1');
  });

  it('returns failure when the reference snapshot cannot be resolved', async () => {
    const tool = createBuiltinReadReferenceTool({
      getReferenceSnapshot: async () => null
    });

    const result = await tool.execute({ referenceId: 'missing-ref' });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('EXECUTION_FAILED');
  });
});
