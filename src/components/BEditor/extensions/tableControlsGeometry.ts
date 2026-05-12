/**
 * @file tableControlsGeometry.ts
 * @description 表格 NodeView 控件所需的几何命中与按钮位置派生逻辑。
 */

/**
 * 纯数据矩形结构，避免命中逻辑直接依赖实时 DOM 对象。
 */
export interface DOMRectLike {
  /** 顶部坐标 */
  top: number;
  /** 右侧坐标 */
  right: number;
  /** 底部坐标 */
  bottom: number;
  /** 左侧坐标 */
  left: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 分割线 hover 命中结果。
 */
export interface DividerHit {
  /** 分割线类型 */
  type: 'row' | 'column';
  /** 目标索引；内部分割线的列索引表示“分割线右侧列” */
  index: number;
  /** 分割线所处边界类型 */
  edge: 'leading' | 'inner' | 'trailing';
  /** 用于绘制高亮线的矩形 */
  lineRect: DOMRectLike;
}

/**
 * 删除目标区块命中结果。
 */
export interface SegmentHit {
  /** 区块类型 */
  type: 'row' | 'column';
  /** 命中的行或列索引 */
  index: number;
  /** 目标区块矩形 */
  segmentRect: DOMRectLike;
}

/**
 * 同一悬浮位置下的行列删除命中集合。
 */
export interface SegmentHover {
  /** 当前命中的行删除目标 */
  row: SegmentHit | null;
  /** 当前命中的列删除目标 */
  column: SegmentHit | null;
}

/**
 * 按钮定位结果。
 */
export interface ButtonPosition {
  /** 顶部坐标 */
  top: number;
  /** 左侧坐标 */
  left: number;
}

interface DividerInput {
  /** 鼠标横坐标 */
  clientX: number;
  /** 鼠标纵坐标 */
  clientY: number;
  /** 列矩形列表 */
  columnRects: DOMRectLike[];
  /** 行矩形列表 */
  rowRects: DOMRectLike[];
  /** 单侧命中阈值 */
  threshold: number;
}

type SegmentInput = DividerInput;

/**
 * 构造纯数据矩形。
 * @param left - 左坐标
 * @param top - 上坐标
 * @param width - 宽度
 * @param height - 高度
 * @returns 纯数据矩形
 */
function createRect(left: number, top: number, width: number, height: number): DOMRectLike {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

/**
 * 判断某个点是否落在矩形内部。
 * @param rect - 目标矩形
 * @param clientX - 鼠标横坐标
 * @param clientY - 鼠标纵坐标
 * @returns 命中时返回 true
 */
function isInsideRect(rect: DOMRectLike, clientX: number, clientY: number): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/**
 * 根据列矩形构建所有竖向分割线候选。
 * @param columnRects - 列矩形列表
 * @param rowRects - 行矩形列表
 * @returns 分割线候选
 */
function buildColumnDividers(columnRects: DOMRectLike[], rowRects: DOMRectLike[]): DividerHit[] {
  if (columnRects.length === 0 || rowRects.length === 0) {
    return [];
  }

  const { top } = rowRects[0];
  const { bottom } = rowRects[rowRects.length - 1];
  const hits: DividerHit[] = [
    {
      type: 'column',
      index: 0,
      edge: 'leading',
      lineRect: createRect(columnRects[0].left, top, 0, bottom - top)
    }
  ];

  for (let index = 1; index < columnRects.length; index += 1) {
    hits.push({
      type: 'column',
      index,
      edge: 'inner',
      lineRect: createRect(columnRects[index - 1].right, top, 0, bottom - top)
    });
  }

  hits.push({
    type: 'column',
    index: columnRects.length - 1,
    edge: 'trailing',
    lineRect: createRect(columnRects[columnRects.length - 1].right, top, 0, bottom - top)
  });

  return hits;
}

/**
 * 根据行矩形构建所有横向分割线候选。
 * @param columnRects - 列矩形列表
 * @param rowRects - 行矩形列表
 * @returns 分割线候选
 */
function buildRowDividers(columnRects: DOMRectLike[], rowRects: DOMRectLike[]): DividerHit[] {
  if (columnRects.length === 0 || rowRects.length === 0) {
    return [];
  }

  const { left } = columnRects[0];
  const { right } = columnRects[columnRects.length - 1];
  const hits: DividerHit[] = [
    {
      type: 'row',
      index: 0,
      edge: 'leading',
      lineRect: createRect(left, rowRects[0].top, right - left, 0)
    }
  ];

  for (let index = 1; index < rowRects.length; index += 1) {
    hits.push({
      type: 'row',
      index,
      edge: 'inner',
      lineRect: createRect(left, rowRects[index - 1].bottom, right - left, 0)
    });
  }

  hits.push({
    type: 'row',
    index: rowRects.length - 1,
    edge: 'trailing',
    lineRect: createRect(left, rowRects[rowRects.length - 1].bottom, right - left, 0)
  });

  return hits;
}

/**
 * 计算指针到分割线的距离。
 * @param hit - 分割线候选
 * @param clientX - 鼠标横坐标
 * @param clientY - 鼠标纵坐标
 * @returns 轴向距离
 */
function getDividerDistance(hit: DividerHit, clientX: number, clientY: number): number {
  return hit.type === 'column' ? Math.abs(clientX - hit.lineRect.left) : Math.abs(clientY - hit.lineRect.top);
}

/**
 * 判断鼠标是否命中分割线阈值带。
 * @param hit - 分割线候选
 * @param clientX - 鼠标横坐标
 * @param clientY - 鼠标纵坐标
 * @param threshold - 单侧阈值
 * @returns 命中时返回 true
 */
function matchesDivider(hit: DividerHit, clientX: number, clientY: number, threshold: number): boolean {
  if (hit.type === 'column') {
    const withinVerticalRange = clientY >= hit.lineRect.top && clientY <= hit.lineRect.bottom;
    if (!withinVerticalRange) {
      return false;
    }

    if (hit.edge === 'leading') {
      return clientX >= hit.lineRect.left && clientX <= hit.lineRect.left + threshold;
    }

    if (hit.edge === 'trailing') {
      return clientX <= hit.lineRect.left && clientX >= hit.lineRect.left - threshold;
    }

    return clientX >= hit.lineRect.left - threshold && clientX <= hit.lineRect.left + threshold;
  }

  const withinHorizontalRange = clientX >= hit.lineRect.left && clientX <= hit.lineRect.right;
  if (!withinHorizontalRange) {
    return false;
  }

  if (hit.edge === 'leading') {
    return clientY >= hit.lineRect.top && clientY <= hit.lineRect.top + threshold;
  }

  if (hit.edge === 'trailing') {
    return clientY <= hit.lineRect.top && clientY >= hit.lineRect.top - threshold;
  }

  return clientY >= hit.lineRect.top - threshold && clientY <= hit.lineRect.top + threshold;
}

/**
 * 查找当前命中的分割线。
 * @param input - 分割线命中输入
 * @returns 命中的分割线；不存在时返回 null
 */
export function findHoveredDivider(input: DividerInput): DividerHit | null {
  const candidates = [...buildColumnDividers(input.columnRects, input.rowRects), ...buildRowDividers(input.columnRects, input.rowRects)].filter((hit) =>
    matchesDivider(hit, input.clientX, input.clientY, input.threshold)
  );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const distanceDiff = getDividerDistance(left, input.clientX, input.clientY) - getDividerDistance(right, input.clientX, input.clientY);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }

    if (left.type === right.type) {
      return 0;
    }

    return left.type === 'column' ? -1 : 1;
  });

  return candidates[0] ?? null;
}

/**
 * 查找当前命中的行列删除区块集合。
 * @param input - 区块命中输入
 * @returns 命中的区块集合；不存在时返回 null
 */
export function findHoveredSegments(input: SegmentInput): SegmentHover | null {
  if (findHoveredDivider(input)) {
    return null;
  }

  const rowHit = input.rowRects.findIndex((rect) => isInsideRect(rect, input.clientX, input.clientY));
  const columnHit = input.columnRects.findIndex((rect) => isInsideRect(rect, input.clientX, input.clientY));

  const row =
    rowHit === -1
      ? null
      : {
          type: 'row' as const,
          index: rowHit,
          segmentRect: input.rowRects[rowHit]
        };

  const column =
    columnHit === -1
      ? null
      : {
          type: 'column' as const,
          index: columnHit,
          segmentRect: input.columnRects[columnHit]
        };

  return row || column ? { row, column } : null;
}

/**
 * 查找当前命中的删除区块。
 * @param input - 区块命中输入
 * @returns 命中的区块；不存在时返回 null
 */
export function findHoveredSegment(input: SegmentInput): SegmentHit | null {
  const hover = findHoveredSegments(input);
  return hover?.row ?? hover?.column ?? null;
}

/**
 * 根据分割线派生新增按钮位置。
 * @param hit - 分割线命中结果
 * @param buttonSize - 按钮尺寸
 * @returns 按钮左上角坐标
 */
export function getAddButtonPosition(hit: DividerHit, buttonSize: number): ButtonPosition {
  if (hit.type === 'column') {
    return {
      top: hit.lineRect.top,
      left: hit.lineRect.left
    };
  }

  return {
    top: hit.lineRect.top,
    left: hit.lineRect.left
  };
}

/**
 * 根据区块派生删除按钮位置。
 * @param hit - 区块命中结果
 * @param buttonSize - 按钮尺寸
 * @returns 按钮左上角坐标
 */
export function getRemoveButtonPosition(hit: SegmentHit, buttonSize: number): ButtonPosition {
  if (hit.type === 'column') {
    return {
      top: hit.segmentRect.top,
      left: hit.segmentRect.left + hit.segmentRect.width / 2
    };
  }

  return {
    top: hit.segmentRect.top + hit.segmentRect.height / 2,
    left: hit.segmentRect.left
  };
}
