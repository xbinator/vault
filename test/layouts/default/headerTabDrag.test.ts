/**
 * @file headerTabDrag.test.ts
 * @description 验证 closestEdge 到 TabMovePosition 的转换映射。
 */

import { describe, expect, it } from 'vitest';
import { closestEdgeToMovePosition } from '@/layouts/default/components/headerTabDrag';

describe('headerTabDrag', () => {
  describe('closestEdgeToMovePosition', () => {
    it('maps "left" edge to "before" position', () => {
      expect(closestEdgeToMovePosition('left')).toBe('before');
    });

    it('maps "right" edge to "after" position', () => {
      expect(closestEdgeToMovePosition('right')).toBe('after');
    });

    it('defaults null to "after" position for safety', () => {
      expect(closestEdgeToMovePosition(null)).toBe('after');
    });

    it('maps other non-left edges to "after"', () => {
      expect(closestEdgeToMovePosition('top')).toBe('after');
      expect(closestEdgeToMovePosition('bottom')).toBe('after');
    });
  });
});
