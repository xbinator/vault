/**
 * @file scroll.ts
 * @description 滚动工具类，提供滚动容器查找、滚动位置控制、滚动信息获取等功能
 */

class Scroll {
  /**
   * 判断是否为window对象
   * @param val 待检测的值
   * @returns 如果是window对象则返回true，否则返回false
   */
  private isWindow(val: Window | Element | unknown): val is Window {
    return val === window;
  }

  /**
   * 获取滚动容器
   * @param el 起始元素，从该元素开始向上查找滚动容器
   * @returns 找到的滚动容器元素，若无则返回window
   */
  container(el?: HTMLElement | null): Window | HTMLElement {
    const root = window;
    let node: HTMLElement | undefined | null = el;

    while (node && node.tagName !== 'HTML' && node.tagName !== 'BODY' && node.nodeType === 1) {
      const { overflowY } = window.getComputedStyle(node);

      if (/scroll|auto|overlay/i.test(overflowY)) {
        return node;
      }

      node = node.parentNode as HTMLElement | null;
    }

    return root;
  }

  /**
   * 滚动到指定位置
   * @param el 滚动容器元素或window
   * @param value 目标滚动位置
   * @param behavior 滚动行为，默认为auto
   */
  to(el: Element | Window, value: number, behavior: ScrollBehavior = 'auto'): void {
    if ('scrollTo' in el) {
      el.scrollTo({ top: value, behavior });
    } else {
      (el as HTMLElement).scrollTop = value;
    }
  }

  /**
   * 获取滚动位置
   * @param el 滚动容器元素或window
   * @returns 当前滚动位置
   */
  top(el: Element | Window): number {
    if (this.isWindow(el)) {
      return el.scrollY;
    }

    if ('scrollTop' in el) {
      return el.scrollTop;
    }

    return 0;
  }

  /**
   * 获取元素相对于滚动容器顶部的位置
   * @param el 目标元素
   * @param scroller 滚动容器，可选
   * @returns 元素相对于滚动容器顶部的位置
   */
  elementTop(el: Element | Window, scroller?: Element | Window): number {
    if (this.isWindow(el)) {
      return 0;
    }

    const scrollTop = scroller ? this.top(scroller) : this.rootTop();
    return el.getBoundingClientRect().top + scrollTop;
  }

  /**
   * 获取根元素的滚动位置
   * @returns 根元素的滚动位置
   */
  private rootTop(): number {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  /**
   * 获取滚动信息
   * @param el 滚动容器元素或window
   * @returns 包含滚动位置、可见高度和总高度的对象
   */
  info(el: Window | HTMLElement | null | undefined): { top: number; height: number; total: number } {
    if (this.isWindow(el)) {
      const doc = document.documentElement || document.body;
      const top = window.pageYOffset || doc.scrollTop || 0;

      return { top, height: window.innerHeight, total: doc.scrollHeight };
    }

    if (el && 'scrollTop' in el && 'clientHeight' in el && 'scrollHeight' in el) {
      return { top: el.scrollTop, height: el.clientHeight, total: el.scrollHeight };
    }

    return { top: 0, height: 0, total: 0 };
  }
}

export const scroll = new Scroll();
