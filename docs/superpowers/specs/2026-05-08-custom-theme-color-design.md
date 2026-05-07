# 自定义主题色功能设计文档

## 功能概述

允许用户通过自然语言描述颜色（如"浅蓝色"、"深绿色"），AI 自动解析并应用自定义主题色到整个应用。系统会自动生成所有颜色变体（hover、active、bg、border 等），并动态更新 CSS 变量和 Ant Design 主题配置。

## 核心需求

1. **自然语言输入**：用户可以用自然语言描述颜色，AI 解析为具体的颜色值
2. **自动生成变体**：基于主色调自动生成所有颜色变体，无需用户手动配置
3. **持久化存储**：主题色保存在本地设置中，重启应用后仍然保留
4. **Light/Dark 共用**：一个主题色同时应用于 light 和 dark 模式，系统自动调整亮度
5. **实时预览**：主题色修改后立即生效，无需重启应用

## 技术方案

### 方案选择：AI 工具 + 颜色算法库 + 动态更新

**核心组件**：
- **AI 工具**：`setThemeColor` 工具，接收自然语言颜色描述
- **颜色算法库**：`colord`，用于生成颜色变体
- **动态更新**：实时更新 CSS 变量和 Ant Design 主题配置

**优势**：
- 颜色生成算法稳定可靠，生成的颜色和谐统一
- 支持任意颜色，灵活性高
- 响应速度快，无需调用外部 API
- 符合用户需求：用户说"浅蓝色"，AI 自动实现

## 架构设计

### 整体架构

```
用户输入 "浅蓝色"
    ↓
AI 工具 setThemeColor
    ↓
解析为 HEX 颜色值 (#87CEEB)
    ↓
colord 颜色算法库
    ↓
生成颜色变体 (hover, active, bg, border 等)
    ↓
更新 CSS 变量 + Ant Design 主题
    ↓
持久化到本地设置
```

### 文件结构

```
src/
├── tools/
│   └── setThemeColor.ts          # AI 工具：设置主题色
├── utils/
│   └── colorGenerator.ts          # 颜色生成器：基于主色调生成变体
├── hooks/
│   └── useAntdTheme.ts            # 修改：支持动态主题色
├── stores/
│   └── setting.ts                 # 修改：存储自定义主题色
└── assets/
    └── styles/
        └── theme/
            ├── variables.less     # 修改：支持动态主题色
            ├── light.less         # 修改：使用 CSS 变量
            └── dark.less          # 修改：使用 CSS 变量
```

## 数据流设计

### 1. 主题色存储

在 `setting.ts` 中添加：

```typescript
interface SettingState {
  // 现有字段...
  
  // 自定义主题色（HEX 格式，如 "#87CEEB"）
  customThemeColor: string | null;
}
```

### 2. 颜色生成算法

使用 `colord` 库生成颜色变体：

```typescript
interface ThemeColorVariants {
  primary: string;           // 主色调
  primaryHover: string;      // hover 状态
  primaryActive: string;     // active 状态
  primaryBg: string;         // 背景色
  primaryBgHover: string;    // 背景色 hover
  primaryBorder: string;     // 边框色
}

function generateColorVariants(primaryColor: string): ThemeColorVariants {
  // 使用 colord 生成变体
  // hover: 亮度 +10%
  // active: 亮度 -10%
  // bg: 透明度 10%
  // border: 透明度 24%
}
```

### 3. AI 工具实现

```typescript
// src/tools/setThemeColor.ts
export const setThemeColorTool = {
  name: 'setThemeColor',
  description: '设置应用的主题色，支持自然语言描述',
  parameters: {
    colorDescription: {
      type: 'string',
      description: '颜色描述，如"浅蓝色"、"深绿色"、"红色"'
    }
  },
  execute: async (params: { colorDescription: string }) => {
    // 1. 解析颜色描述为 HEX 值
    // 2. 生成颜色变体
    // 3. 更新设置
    // 4. 返回结果
  }
};
```

### 4. 动态更新机制

#### CSS 变量更新

在 `variables.less` 中定义主题色变量：

```less
:root {
  --color-primary: #8a6f5a;
  --color-primary-hover: #755d4b;
  --color-primary-active: #614c3e;
  --color-primary-bg: rgb(138 111 90 / 10%);
  --color-primary-bg-hover: rgb(138 111 90 / 16%);
  --color-primary-border: rgb(138 111 90 / 24%);
}
```

通过 JavaScript 动态更新：

```typescript
function updateThemeColors(variants: ThemeColorVariants) {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', variants.primary);
  root.style.setProperty('--color-primary-hover', variants.primaryHover);
  // ... 更新其他变量
}
```

#### Ant Design 主题更新

修改 `useAntdTheme.ts`：

```typescript
export function useAntdTheme(): UseAntdThemeResult {
  const settingStore = useSettingStore();
  
  const antdTheme = computed<AntdThemeConfig>(() => {
    const customColor = settingStore.customThemeColor;
    
    if (settingStore.resolvedTheme === 'dark') {
      return {
        algorithm: darkAlgorithm,
        token: {
          // 如果有自定义主题色，使用自定义颜色
          colorPrimary: customColor || '#c8a98b',
          // ... 其他配置
        }
      };
    }
    
    // light 模式类似
  });
  
  return { antdTheme };
}
```

## 实现细节

### 1. 颜色解析

AI 需要将自然语言颜色描述解析为具体的 HEX 颜色值。

**方案**：
- AI 内置颜色知识库，包含常见颜色名称和对应的 HEX 值
- 支持的颜色描述格式：
  - 基础颜色：红色、蓝色、绿色
  - 亮度修饰：浅蓝色、深绿色、亮黄色
  - 饱和度修饰：淡紫色、鲜艳的橙色
  - 具体颜色：天蓝色、薄荷绿、珊瑚红

**示例**：
```typescript
const colorMap = {
  '浅蓝色': '#87CEEB',
  '深绿色': '#006400',
  '天蓝色': '#87CEEB',
  '薄荷绿': '#98FF98',
  '珊瑚红': '#FF7F50',
  // ... 更多颜色
};
```

### 2. 颜色变体生成算法

使用 `colord` 库生成颜色变体：

```typescript
import { colord } from 'colord';

function generateColorVariants(primaryColor: string): ThemeColorVariants {
  const color = colord(primaryColor);
  
  return {
    primary: primaryColor,
    primaryHover: color.lighten(0.1).toHex(),      // 亮度 +10%
    primaryActive: color.darken(0.1).toHex(),      // 亮度 -10%
    primaryBg: color.alpha(0.1).toRgbString(),     // 透明度 10%
    primaryBgHover: color.alpha(0.16).toRgbString(), // 透明度 16%
    primaryBorder: color.alpha(0.24).toRgbString(),  // 透明度 24%
  };
}
```

### 3. Light/Dark 模式适配

Light 和 Dark 模式共用一个主题色，但需要根据模式调整亮度：

```typescript
function adaptColorForTheme(color: string, theme: 'light' | 'dark'): string {
  const col = colord(color);
  
  if (theme === 'dark') {
    // Dark 模式：提高亮度，确保对比度
    return col.lighten(0.2).toHex();
  } else {
    // Light 模式：使用原色
    return color;
  }
}
```

### 4. 持久化存储

在 `setting.ts` 中添加主题色存储：

```typescript
export const useSettingStore = defineStore('setting', {
  state: (): SettingState => ({
    // 现有字段...
    customThemeColor: null,
  }),
  
  actions: {
    setCustomThemeColor(color: string | null) {
      this.customThemeColor = color;
      // 自动持久化到本地存储
    },
  },
  
  persist: {
    key: 'app-settings',
    storage: localStorage,
  },
});
```

## 测试计划

### 单元测试

1. **颜色解析测试**
   - 测试常见颜色名称解析
   - 测试亮度修饰词解析
   - 测试不认识的颜色描述

2. **颜色变体生成测试**
   - 测试主色调生成变体的正确性
   - 测试边界情况（纯黑、纯白）
   - 测试透明度计算

3. **主题适配测试**
   - 测试 Light 模式颜色适配
   - 测试 Dark 模式颜色适配
   - 测试模式切换时颜色更新

### 集成测试

1. **AI 工具测试**
   - 测试工具调用流程
   - 测试错误处理
   - 测试结果返回格式

2. **动态更新测试**
   - 测试 CSS 变量更新
   - 测试 Ant Design 主题更新
   - 测试持久化存储

### 用户验收测试

1. **基本功能**
   - 用户说"浅蓝色"，主题色变为浅蓝色
   - 用户说"恢复默认"，主题色恢复为默认棕色
   - 重启应用后主题色仍然保留

2. **Light/Dark 模式**
   - Light 模式下主题色显示正确
   - Dark 模式下主题色显示正确
   - 切换模式时主题色自动适配

3. **边界情况**
   - 用户输入不认识的颜色描述
   - 用户输入无效的颜色值
   - 用户频繁切换主题色

## 风险与挑战

### 1. 颜色对比度问题

**风险**：某些颜色在 Light 或 Dark 模式下对比度不足，影响可读性。

**解决方案**：
- 使用 WCAG 对比度算法验证颜色
- 如果对比度不足，自动调整亮度
- 提供对比度警告提示

### 2. 颜色和谐性

**风险**：自定义主题色可能与背景、文本等其他颜色不和谐。

**解决方案**：
- 基于主色调生成背景、文本等颜色
- 使用颜色理论（互补色、类似色）生成配色
- 提供预设配色方案供参考

### 3. 性能影响

**风险**：动态更新 CSS 变量可能影响性能。

**解决方案**：
- 使用 CSS 变量批量更新，避免多次重绘
- 缓存颜色变体，避免重复计算
- 使用 requestAnimationFrame 优化更新时机

## 后续优化

### 短期优化（1-2 周）

1. **颜色预设方案**：提供 8-10 套预设主题色方案，用户可以快速选择
2. **颜色历史记录**：记录用户最近使用的 5 个主题色，方便切换
3. **颜色预览**：在设置界面提供颜色预览功能

### 中期优化（1-2 月）

1. **高级配色**：支持自定义背景、文本、边框等颜色
2. **导入导出**：支持主题配置的导入导出
3. **主题分享**：支持分享主题配置给其他用户

### 长期优化（3-6 月）

1. **AI 配色建议**：AI 根据用户喜好推荐主题色
2. **场景化主题**：根据使用场景自动切换主题（如夜间模式、阅读模式）
3. **主题市场**：提供主题市场，用户可以下载其他用户分享的主题

## 实施计划

### 第一阶段：核心功能（3-5 天）

1. 安装 `colord` 依赖
2. 实现颜色生成器 `colorGenerator.ts`
3. 实现 AI 工具 `setThemeColor.ts`
4. 修改 `setting.ts` 添加主题色存储
5. 修改 `useAntdTheme.ts` 支持动态主题色
6. 修改 `variables.less` 支持动态更新

### 第二阶段：测试与优化（2-3 天）

1. 编写单元测试
2. 编写集成测试
3. 用户验收测试
4. 性能优化
5. 文档完善

### 第三阶段：发布与反馈（1 周）

1. 发布功能
2. 收集用户反馈
3. 修复问题
4. 迭代优化

## 总结

本设计方案通过 AI 工具 + 颜色算法库的方式，实现了用户用自然语言自定义主题色的需求。方案具有以下特点：

1. **用户友好**：用户只需说"浅蓝色"，AI 自动实现
2. **技术成熟**：使用成熟的颜色算法库，稳定可靠
3. **易于维护**：架构清晰，代码模块化
4. **可扩展**：为后续高级功能预留扩展空间

该方案能够很好地满足用户需求，提升用户体验。
