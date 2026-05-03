/**
 * @file voice-transcription-session.test.ts
 * @description 验证当前语音转写会话 hook 的分段顺序拼接与完成行为。
 */
import { describe, expect, it, vi } from 'vitest';
import { useVoiceSession } from '@/components/BChatSidebar/hooks/useVoiceSession';

/**
 * 转写返回结果映射。
 */
const TRANSCRIPT_MAP: Record<string, string> = {
  '1': '第一段',
  '2': '第二段'
};

describe('useVoiceSession', () => {
  it('appends automatic segments in order and joins them without newlines', async () => {
    const transcribe = vi.fn(async ({ id }: { id: string }) => ({
      text: TRANSCRIPT_MAP[id]
    }));
    const session = useVoiceSession(transcribe);

    session.enqueueSegment({ id: '1', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    session.enqueueSegment({ id: '2', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    await session.completeSession();

    expect(session.finalText.value).toBe('第一段第二段');
  });

  it('inserts a newline separator for manual paragraph breaks', async () => {
    const transcribe = vi.fn(async ({ id }: { id: string }) => ({
      text: TRANSCRIPT_MAP[id]
    }));
    const session = useVoiceSession(transcribe);

    session.enqueueSegment({ id: '1', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    session.enqueueSegment({ id: '2', separator: '\n', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    await session.completeSession();

    expect(session.finalText.value).toBe('第一段\n第二段');
  });

  it('waits for queued segments before completing the session', async () => {
    const resolvers: Array<() => void> = [];
    const transcribe = vi.fn(({ id }: { id: string }) => {
      return new Promise<{ text: string }>((resolve) => {
        resolvers.push(() => {
          resolve({ text: TRANSCRIPT_MAP[id] });
        });
      });
    });
    const session = useVoiceSession(transcribe);

    const firstTask = session.enqueueSegment({ id: '1', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    const secondTask = session.enqueueSegment({ id: '2', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    const completionTask = session.completeSession();

    await Promise.resolve();
    resolvers[0]?.();
    await firstTask;
    await vi.waitFor(() => {
      expect(transcribe).toHaveBeenCalledTimes(2);
    });
    resolvers[1]?.();
    await secondTask;

    await expect(completionTask).resolves.toEqual({
      text: '第一段第二段',
      failedSegmentIds: []
    });
  });

  it('resets accumulated text for a new recording session', async () => {
    const transcribe = vi.fn(async ({ id }: { id: string }) => ({
      text: TRANSCRIPT_MAP[id]
    }));
    const session = useVoiceSession(transcribe);

    session.enqueueSegment({ id: '1', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    await session.completeSession();
    expect(session.finalText.value).toBe('第一段');

    session.resetSession();

    expect(session.finalText.value).toBe('');
    expect(session.segments.value).toHaveLength(0);
  });

  it('marks failed segments and excludes them from the final text', async () => {
    /**
     * 仅让第二段转写失败，验证当前 hook 的失败收集行为。
     * @param input - 待转写语音段
     * @returns 成功时返回转写文本
     */
    const transcribe = vi.fn(async (input: { id: string }) => {
      if (input.id === '2') {
        throw new Error('mock failure');
      }

      return {
        text: TRANSCRIPT_MAP[input.id]
      };
    });
    const session = useVoiceSession(transcribe);

    session.enqueueSegment({ id: '1', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });
    session.enqueueSegment({ id: '2', separator: '', buffer: new ArrayBuffer(4), mimeType: 'audio/webm' });

    await expect(session.completeSession()).resolves.toEqual({
      text: '第一段',
      failedSegmentIds: ['2']
    });
  });
});
