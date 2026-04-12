const overflowScrollReg = /scroll|auto|overlay/i;

// 获取视图 滚动条
export function getScroller(el?: HTMLElement) {
  const root = window;

  let node: HTMLElement | undefined = el;

  while (node && node.tagName !== 'HTML' && node.tagName !== 'BODY' && node.nodeType === 1) {
    const { overflowY } = window.getComputedStyle(node);

    if (overflowScrollReg.test(overflowY)) {
      return node;
    }

    node = node.parentNode as HTMLElement;
  }

  return root;
}

// 设置滚动到指定位置
export function setScrollTop(el: Element | Window, options: { top: number; behavior?: 'smooth' | 'auto' }) {
  el.scrollTo(options);
}

// 获取滚动 距离位置
export function getScrollTop(el: Element | Window) {
  const top = 'scrollTop' in el ? el.scrollTop : el.scrollY; // iOS scroll bounce cause minus scrollTop

  return top;
}
