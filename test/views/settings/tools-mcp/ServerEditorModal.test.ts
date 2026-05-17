/**
 * @file ServerEditorModal.test.ts
 * @description 验证 MCP Server 编辑弹窗的回填、校验与确认行为。
 */
/* @vitest-environment jsdom */

import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const codemirrorMocks = vi.hoisted(() => {
  /**
   * 创建最小文档模型。
   * @param value - 文本内容
   * @returns 文档对象
   */
  function createMockDoc(value: string): { value: string; length: number; toString: () => string } {
    return {
      value,
      get length(): number {
        return value.length;
      },
      /**
       * 序列化文档文本。
       * @returns 文本内容
       */
      toString(): string {
        return value;
      }
    };
  }

  /**
   * 最小文档模型类型。
   */
  type MockDoc = ReturnType<typeof createMockDoc>;

  /**
   * 最近一次创建的 EditorView 实例。
   */
  let latestEditorView: {
    state: {
      doc: { value: string; length: number; toString: () => string };
      extensions: unknown[];
    };
    listener: ((update: { docChanged: boolean; state: { doc: { value: string; length: number; toString: () => string } } }) => void) | null;
    focused: boolean;
    focus: () => void;
    destroy: () => void;
    dispatch: (transaction: { changes?: { insert: string } }) => void;
  } | null = null;

  /**
   * 记录最近一次创建的 EditorView。
   * @param editorView - 编辑器实例
   */
  function setLatestEditorView(editorView: typeof latestEditorView): void {
    latestEditorView = editorView;
  }

  /**
   * 最小 EditorView 实现。
   */
  class MockEditorView {
    /**
     * 编辑器状态。
     */
    state: {
      doc: MockDoc;
      extensions: unknown[];
    };

    /**
     * 文档更新监听器。
     */
    listener: ((update: { docChanged: boolean; state: { doc: MockDoc } }) => void) | null;

    /**
     * 是否已聚焦。
     */
    focused: boolean;

    /**
     * 初始化 EditorView。
     * @param config - 初始化配置
     */
    constructor(config: { state: { doc: MockDoc; extensions: unknown[] }; parent: HTMLElement }) {
      this.state = config.state;
      this.listener = null;
      this.focused = false;
      config.parent.innerHTML = '<div class="mock-codemirror"></div>';
      for (const extension of config.state.extensions) {
        if (typeof extension === 'object' && extension !== null && 'kind' in extension && extension.kind === 'listener') {
          this.listener = extension.callback as (update: { docChanged: boolean; state: { doc: MockDoc } }) => void;
        }
      }
      setLatestEditorView(this);
    }

    /**
     * 应用文档变更。
     * @param transaction - 编辑事务
     */
    dispatch(transaction: { changes?: { insert: string } }): void {
      if (!transaction.changes) {
        return;
      }

      this.state.doc = createMockDoc(transaction.changes.insert);
      this.listener?.({
        docChanged: true,
        state: {
          doc: this.state.doc
        }
      });
    }

    /**
     * 聚焦编辑器。
     */
    focus(): void {
      this.focused = true;
    }

    /**
     * 销毁编辑器。
     */
    destroy(): void {
      if (latestEditorView === this) {
        setLatestEditorView(null);
      }
    }

    /**
     * 读取最近一次创建的编辑器实例。
     * @returns EditorView 实例
     */
    static getLatest(): MockEditorView | null {
      return latestEditorView;
    }

    /**
     * CodeMirror lineWrapping 扩展桩。
     */
    static lineWrapping = { kind: 'lineWrapping' };

    /**
     * CodeMirror 内容属性扩展桩。
     */
    static contentAttributes = {
      /**
       * 返回内容属性扩展描述。
       * @param attributes - 内容属性
       * @returns 扩展描述
       */
      of(attributes: Record<string, string>) {
        return { kind: 'contentAttributes', attributes };
      }
    };

    /**
     * CodeMirror 主题扩展桩。
     * @param theme - 主题配置
     * @returns 扩展描述
     */
    static theme(theme: Record<string, unknown>) {
      return { kind: 'theme', theme };
    }

    /**
     * CodeMirror 更新监听扩展桩。
     */
    static updateListener = {
      /**
       * 返回更新监听扩展描述。
       * @param callback - 监听回调
       * @returns 扩展描述
       */
      of(callback: (update: { docChanged: boolean; state: { doc: MockDoc } }) => void) {
        return { kind: 'listener', callback };
      }
    };
  }

  return {
    createMockDoc,
    MockEditorView
  };
});

vi.mock('@codemirror/lang-json', () => ({
  /**
   * JSON 语言扩展桩。
   * @returns 扩展描述
   */
  json: () => ({ kind: 'json' })
}));

vi.mock('@codemirror/state', () => ({
  /**
   * 最小 EditorState 实现。
   */
  EditorState: {
    /**
     * 创建编辑器状态。
     * @param config - 状态配置
     * @returns 编辑器状态
     */
    create(config: { doc: string; extensions: unknown[] }) {
      return {
        doc: codemirrorMocks.createMockDoc(config.doc),
        extensions: config.extensions
      };
    }
  }
}));

vi.mock('@codemirror/view', () => ({
  /**
   * 返回行号扩展桩。
   * @returns 扩展描述
   */
  lineNumbers: () => ({ kind: 'lineNumbers' }),
  /**
   * 返回占位提示扩展桩。
   * @param value - 占位文案
   * @returns 扩展描述
   */
  placeholder: (value: string) => ({ kind: 'placeholder', value }),
  EditorView: codemirrorMocks.MockEditorView
}));

/**
 * BModal 占位组件。
 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: Number, default: 0 }
  },
  emits: ['update:open', 'cancel'],
  template: `
    <div v-if="open" class="modal-stub">
      <div class="modal-stub__title">{{ title }}</div>
      <div class="modal-stub__body"><slot /></div>
      <div class="modal-stub__footer"><slot name="footer" /></div>
    </div>
  `
});

/**
 * BButton 占位组件。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    disabled: { type: Boolean, default: false }
  },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
});

describe('ServerEditorModal', () => {
  beforeEach(() => {
    codemirrorMocks.MockEditorView.getLatest()?.destroy();
  });

  /**
   * 挂载弹窗组件。
   * @param props - 组件属性
   * @returns 包装器
   */
  async function mountModal(props: Record<string, unknown> = {}) {
    const { default: ServerEditorModal } = await import('@/views/settings/tools/mcp/components/ServerEditorModal.vue');
    const wrapper = mount(ServerEditorModal, {
      props: {
        open: true,
        ...props
      },
      global: {
        stubs: {
          BModal: BModalStub,
          BButton: BButtonStub
        }
      }
    });

    await nextTick();
    return wrapper;
  }

  it('fills placeholder JSON in create mode and emits parsed draft on confirm', async () => {
    const wrapper = await mountModal();
    const editor = codemirrorMocks.MockEditorView.getLatest();

    expect(editor?.state.doc.toString()).toContain('"command": "npx"');
    expect(wrapper.text()).toContain('添加 MCP Server');

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeDefined();
    await saveButton!.trigger('click');

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({
      name: 'filesystem',
      command: 'npx',
      toolCallTimeoutMs: 30000
    });
  });

  it('hydrates editor content from existing server when opened in edit mode', async () => {
    const wrapper = await mountModal({
      server: {
        id: 'server-1',
        name: 'Filesystem',
        enabled: true,
        transport: 'stdio',
        command: 'uvx',
        args: ['mcp-server-filesystem'],
        env: { ROOT: '/tmp' },
        toolAllowlist: ['list_directory'],
        connectTimeoutMs: 45000,
        toolCallTimeoutMs: 15000
      }
    });

    const editor = codemirrorMocks.MockEditorView.getLatest();
    expect(wrapper.text()).toContain('编辑 MCP Server');
    expect(editor?.state.doc.toString()).toContain('"command": "uvx"');
    expect(editor?.state.doc.toString()).not.toContain('"enabled"');
  });

  it('shows parse error and blocks confirm when JSON is invalid', async () => {
    const wrapper = await mountModal();
    const editor = codemirrorMocks.MockEditorView.getLatest();

    editor?.dispatch({
      changes: {
        insert: '{"name": "broken"'
      }
    });
    await nextTick();

    expect(wrapper.text()).toContain('Expected');

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton?.attributes('disabled')).toBeDefined();
    await saveButton!.trigger('click');

    expect(wrapper.emitted('confirm')).toBeUndefined();
  });
});
