# 主题与配色方案功能设计文档

## 功能概述

将外观设置分为两个独立的概念：

1. **配色方案**（Color Scheme）：控制明暗模式
   - 跟随系统（自动）
   - 浅色模式
   - 深色模式

2. **主题**（Theme）：控制颜色风格
   - 预设主题：默认（棕色）、蓝色、绿色、紫色等
   - 自定义主题：用户通过 AI 工具输入颜色描述

用户可以自由组合配色方案和主题，例如：蓝色主题 + 深色模式。

## 核心需求

### 配色方案需求

1. **三种模式**：跟随系统、浅色、深色
2. **自动切换**：跟随系统模式下，根据系统设置自动切换
3. **持久化存储**：用户选择持久化到本地

### 主题需求

1. **预设主题**：提供 6-8 个预设主题，用户可快速选择
2. **自定义主题**：用户通过自然语言描述颜色，AI 自动应用
3. **自动生成变体**：基于主色调自动生成所有颜色变体
4. **持久化存储**：主题选择持久化到本地
5. **Light/Dark 共用**：一个主题同时应用于 light 和 dark 模式

## 技术方案

### 方案选择：预设主题 + AI 自定义 + 颜色算法库

**核心组件**：
- **预设主题**：预先定义 6-8 个主题方案
- **AI 工具**：`setTheme` 工具，支持预设主题和自定义主题
- **颜色算法库**：`colord`，用于生成颜色变体
- **动态更新**：实时更新 CSS 变量和 Ant Design 主题配置

**优势**：
- 预设主题开箱即用，用户体验好
- 自定义主题满足个性化需求
- 颜色生成算法稳定可靠
- 概念清晰，易于理解

## 架构设计

### 整体架构

```
用户选择配色方案（跟随系统/浅色/深色）
    ↓
应用配色方案（light/dark）
    ↓
用户选择主题（预设/自定义）
    ↓
如果是预设主题 → 应用预设主题配置
如果是自定义主题 → AI 解析颜色 → colord 生成变体
    ↓
更新 CSS 变量 + Ant Design 主题
    ↓
持久化到本地设置
```

### 文件结构

```
src/
├── tools/
│   ├── setColorScheme.ts         # AI 工具：设置配色方案
│   └── setThemeColor.ts          # AI 工具：设置主题色
├── utils/
│   ├── colorGenerator.ts         # 颜色生成器：基于主色调生成变体
│   └── themePresets.ts           # 预设主题配置
├── hooks/
│   └── useAntdTheme.ts           # 修改：支持动态主题
├── stores/
│   └── setting.ts                # 修改：存储配色方案和主题
└── assets/
    └── styles/
        └── theme/
            ├── variables.less    # 修改：支持动态主题
            ├── light.less        # 修改：使用 CSS 变量
            └── dark.less         # 修改：使用 CSS 变量
```

## 数据流设计

### 1. 设置存储

在 `setting.ts` 中添加：

```typescript
interface SettingState {
  // 现有字段...
  
  // 配色方案：明暗模式
  colorScheme: 'auto' | 'light' | 'dark';
  
  // 主题名称：预设主题名称或自定义
  themeName: 'default' | 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'custom';
  
  // 自定义主题色（仅当 themeName = 'custom' 时有效）
  customThemeColor: string | null;
}
```

**重要说明**：
- `resolvedColorScheme`（实际应用的配色方案）是运行时派生值，不应该存储在 store 中
- 应该使用 `computed` 根据 `colorScheme` 和系统设置计算得出
```

### 2. 预设主题配置

```typescript
// src/utils/themePresets.ts
interface ThemePreset {
  name: string;
  displayName: string;
  primaryColor: string;
  description: string;
}

export const themePresets: Record<string, ThemePreset> = {
  default: {
    name: 'default',
    displayName: '默认（棕色）',
    primaryColor: '#8a6f5a',
    description: '温暖的棕色调，适合长时间阅读',
  },
  blue: {
    name: 'blue',
    displayName: '蓝色',
    primaryColor: '#1677ff',
    description: '经典的蓝色，专业稳重',
  },
  green: {
    name: 'green',
    displayName: '绿色',
    primaryColor: '#52c41a',
    description: '清新的绿色，护眼舒适',
  },
  purple: {
    name: 'purple',
    displayName: '紫色',
    primaryColor: '#722ed1',
    description: '优雅的紫色，富有创意',
  },
  orange: {
    name: 'orange',
    displayName: '橙色',
    primaryColor: '#fa8c16',
    description: '活力的橙色，充满热情',
  },
  red: {
    name: 'red',
    displayName: '红色',
    primaryColor: '#f5222d',
    description: '鲜明的红色，个性十足',
  },
};
```

### 3. 颜色生成算法

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
  const color = colord(primaryColor);
  
  return {
    primary: primaryColor,
    primaryHover: color.lighten(0.1).toHex(),
    primaryActive: color.darken(0.1).toHex(),
    primaryBg: color.alpha(0.1).toRgbString(),
    primaryBgHover: color.alpha(0.16).toRgbString(),
    primaryBorder: color.alpha(0.24).toRgbString(),
  };
}
```

### 4. AI 工具实现

**拆分为两个独立的 AI 工具**：

#### 4.1 设置配色方案工具

```typescript
// src/tools/setColorScheme.ts
export const setColorSchemeTool = {
  name: 'setColorScheme',
  description: '设置应用的配色方案（明暗模式）',
  parameters: {
    colorScheme: {
      type: 'string',
      enum: ['auto', 'light', 'dark'],
      description: '配色方案：auto（跟随系统）、light（浅色）、dark（深色）',
    },
  },
  execute: async (params: { colorScheme: 'auto' | 'light' | 'dark' }) => {
    const settingStore = useSettingStore();
    settingStore.setColorScheme(params.colorScheme);
    
    return {
      success: true,
      message: `配色方案已设置为：${params.colorScheme === 'auto' ? '跟随系统' : params.colorScheme === 'light' ? '浅色' : '深色'}`,
    };
  },
};
```

#### 4.2 设置主题色工具

```typescript
// src/tools/setThemeColor.ts
export const setThemeColorTool = {
  name: 'setThemeColor',
  description: '设置应用的主题色，支持预设主题和自定义主题',
  parameters: {
    themeName: {
      type: 'string',
      description: '主题名称：default（默认）、blue（蓝色）、green（绿色）、purple（紫色）、orange（橙色）、red（红色）、custom（自定义）',
    },
    customColorDescription: {
      type: 'string',
      description: '自定义颜色描述（仅当 themeName = custom 时需要），如"浅蓝色"、"深绿色"',
    },
  },
  execute: async (params: { themeName: string; customColorDescription?: string }) => {
    // 1. 验证主题名称
    // 2. 如果是自定义主题，解析颜色描述
    // 3. 生成颜色变体
    // 4. 更新设置
    // 5. 返回结果
  },
};
```

**拆分优势**：
- 职责单一，避免误操作
- 用户可以独立控制配色方案和主题色
- 更符合用户的心智模型
```

### 5. 配色方案实现

```typescript
// 计算实际应用的配色方案（运行时派生值，不存储）
const resolvedColorScheme = computed(() => {
  if (settingStore.colorScheme === 'auto') {
    // 跟随系统
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return settingStore.colorScheme;
});

// 监听系统配色方案变化（仅在 auto 模式下）
watch(
  () => settingStore.colorScheme,
  (newScheme) => {
    if (newScheme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        // computed 会自动重新计算，无需手动更新
      };
      mediaQuery.addEventListener('change', handler);
    }
  },
  { immediate: true }
);
```

### 6. 动态更新机制

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
  root.style.setProperty('--color-primary-active', variants.primaryActive);
  root.style.setProperty('--color-primary-bg', variants.primaryBg);
  root.style.setProperty('--color-primary-bg-hover', variants.primaryBgHover);
  root.style.setProperty('--color-primary-border', variants.primaryBorder);
}
```

#### Ant Design 主题更新

修改 `useAntdTheme.ts`：

```typescript
export function useAntdTheme(): UseAntdThemeResult {
  const settingStore = useSettingStore();
  
  // 计算实际应用的配色方案
  const resolvedColorScheme = computed(() => {
    if (settingStore.colorScheme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return settingStore.colorScheme;
  });
  
  const antdTheme = computed<AntdThemeConfig>(() => {
    // 统一获取主色调的逻辑
    const primaryColor = getPrimaryColor(settingStore.themeName, settingStore.customThemeColor);
    
    // 统一生成主题 token 的逻辑
    const tokens = generateThemeTokens(primaryColor, resolvedColorScheme.value);
    
    if (resolvedColorScheme.value === 'dark') {
      return {
        algorithm: darkAlgorithm,
        token: tokens,
      };
    }
    
    return {
      algorithm: defaultAlgorithm,
      token: tokens,
    };
  });
  
  return { antdTheme };
}

/**
 * 统一获取主色调的逻辑
 * @param themeName - 主题名称
 * @param customThemeColor - 自定义主题色
 * @returns 主色调 HEX 值
 */
function getPrimaryColor(themeName: string, customThemeColor: string | null): string {
  if (themeName === 'custom' && customThemeColor) {
    return customThemeColor;
  }
  
  const preset = themePresets[themeName];
  if (preset) {
    return preset.primaryColor;
  }
  
  // 默认返回棕色
  return themePresets.default.primaryColor;
}

/**
 * 统一生成主题 token 的逻辑
 * @param primaryColor - 主色调
 * @param colorScheme - 配色方案
 * @returns Ant Design 主题 token
 */
function generateThemeTokens(primaryColor: string, colorScheme: 'light' | 'dark'): AntdThemeToken {
  const color = colord(primaryColor);
  
  // 根据配色方案调整颜色
  const adaptedColor = adaptColorForScheme(primaryColor, colorScheme);
  
  return {
    colorPrimary: adaptedColor,
    colorPrimaryBg: color.alpha(0.1).toRgbString(),
    colorPrimaryBorder: color.alpha(0.24).toRgbString(),
    // ... 其他配置
  };
}
```

**统一逻辑优势**：
- 预设主题和自定义主题使用相同的生成逻辑
- 代码更简洁，易于维护
- 确保所有主题的视觉效果一致
```

## 实现细节

### 1. 配色方案切换

```typescript
// 监听系统配色方案变化
watch(
  () => settingStore.colorScheme,
  (newScheme) => {
    if (newScheme === 'auto') {
      // 监听系统变化
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        settingStore.resolvedColorScheme = e.matches ? 'dark' : 'light';
      };
      mediaQuery.addEventListener('change', handler);
    } else {
      settingStore.resolvedColorScheme = newScheme;
    }
  },
  { immediate: true }
);
```

### 2. 主题切换

```typescript
/**
 * 应用主题
 * @param themeName - 主题名称
 * @param customColor - 自定义颜色描述（可选）
 */
function applyTheme(themeName: string, customColor?: string) {
  // 统一获取主色调的逻辑
  let primaryColor: string;
  
  if (themeName === 'custom' && customColor) {
    // 自定义主题：解析颜色描述
    primaryColor = parseColorDescription(customColor);
  } else if (themePresets[themeName]) {
    // 预设主题：使用预设颜色
    primaryColor = themePresets[themeName].primaryColor;
  } else {
    throw new Error(`Unknown theme: ${themeName}`);
  }
  
  // 统一生成颜色变体的逻辑
  const variants = generateColorVariants(primaryColor);
  
  // 更新 CSS 变量
  updateThemeColors(variants);
  
  // 更新设置
  settingStore.themeName = themeName;
  settingStore.customThemeColor = themeName === 'custom' ? primaryColor : null;
}
```

### 3. 颜色解析

AI 需要将自然语言颜色描述解析为具体的 HEX 颜色值。

**颜色知识库**：

```typescript
const colorKnowledgeBase = {
  // 基础颜色
  '红色': '#ff0000',
  '蓝色': '#0000ff',
  '绿色': '#00ff00',
  '黄色': '#ffff00',
  '紫色': '#800080',
  '橙色': '#ffa500',
  '粉色': '#ffc0cb',
  '黑色': '#000000',
  '白色': '#ffffff',
  '灰色': '#808080',
  
  // 亮度修饰
  '浅蓝色': '#87ceeb',
  '深蓝色': '#00008b',
  '浅绿色': '#90ee90',
  '深绿色': '#006400',
  '浅紫色': '#e6e6fa',
  '深紫色': '#4b0082',
  
  // 具体颜色
  '天蓝色': '#87ceeb',
  '薄荷绿': '#98ff98',
  '珊瑚红': '#ff7f50',
  '薰衣草紫': '#e6e6fa',
  '玫瑰红': '#ff007f',
  '海军蓝': '#000080',
  '橄榄绿': '#808000',
  '酒红色': '#722f37',
};
```

### 4. Light/Dark 模式适配

```typescript
function adaptColorForScheme(color: string, scheme: 'light' | 'dark'): string {
  const col = colord(color);
  
  if (scheme === 'dark') {
    // Dark 模式：提高亮度，确保对比度
    const luminance = col.luminance();
    if (luminance < 0.3) {
      return col.lighten(0.2).toHex();
    }
    return color;
  } else {
    // Light 模式：降低亮度，确保对比度
    const luminance = col.luminance();
    if (luminance > 0.7) {
      return col.darken(0.1).toHex();
    }
    return color;
  }
}
```

### 5. 持久化存储

```typescript
export const useSettingStore = defineStore('setting', {
  state: (): SettingState => ({
    // 现有字段...
    colorScheme: 'auto',
    themeName: 'default',
    customThemeColor: null,
  }),
  
  actions: {
    setColorScheme(scheme: 'auto' | 'light' | 'dark') {
      this.colorScheme = scheme;
    },
    
    setThemeName(themeName: string, customColor?: string) {
      this.themeName = themeName;
      if (themeName === 'custom' && customColor) {
        this.customThemeColor = customColor;
      } else {
        this.customThemeColor = null;
      }
    },
  },
  
  persist: {
    key: 'app-settings',
    storage: localStorage,
  },
});
```

**重要说明**：
- `resolvedColorScheme` 不存储在 state 中，因为它是由 `colorScheme` 和系统设置派生的运行时值
- 使用 `computed` 计算 `resolvedColorScheme`，确保响应式更新

## 设置界面设计

### 外观设置页面

```
┌─────────────────────────────────────┐
│ 外观设置                              │
├─────────────────────────────────────┤
│                                      │
│ 配色方案                              │
│ ○ 跟随系统                            │
│ ○ 浅色                                │
│ ○ 深色                                │
│                                      │
├─────────────────────────────────────┤
│                                      │
│ 主题                                  │
│ ○ 默认（棕色）                         │
│   温暖的棕色调，适合长时间阅读            │
│                                      │
│ ○ 蓝色                                │
│   经典的蓝色，专业稳重                   │
│                                      │
│ ○ 绿色                                │
│   清新的绿色，护眼舒适                   │
│                                      │
│ ○ 紫色                                │
│   优雅的紫色，富有创意                   │
│                                      │
│ ○ 橙色                                │
│   活力的橙色，充满热情                   │
│                                      │
│ ○ 红色                                │
│   鲜明的红色，个性十足                   │
│                                      │
│ ○ 自定义...                           │
│   通过 AI 设置自定义主题色               │
│                                      │
└─────────────────────────────────────┘
```

## 测试计划

### 单元测试

1. **配色方案测试**
   - 测试配色方案切换
   - 测试跟随系统模式
   - 测试持久化存储

2. **主题测试**
   - 测试预设主题应用
   - 测试自定义主题应用
   - 测试颜色解析
   - 测试颜色变体生成

3. **颜色适配测试**
   - 测试 Light 模式颜色适配
   - 测试 Dark 模式颜色适配
   - 测试对比度验证

### 集成测试

1. **AI 工具测试**
   - 测试预设主题设置
   - 测试自定义主题设置
   - 测试错误处理

2. **动态更新测试**
   - 测试 CSS 变量更新
   - 测试 Ant Design 主题更新
   - 测试配色方案和主题组合

### 用户验收测试

1. **配色方案**
   - 用户切换配色方案，界面立即更新
   - 跟随系统模式下，系统切换时界面自动更新
   - 重启应用后配色方案仍然保留

2. **预设主题**
   - 用户选择预设主题，主题立即应用
   - Light 和 Dark 模式下主题显示正确
   - 重启应用后主题仍然保留

3. **自定义主题**
   - 用户说"浅蓝色"，主题变为浅蓝色
   - 用户说"恢复默认"，主题恢复为默认棕色
   - 重启应用后自定义主题仍然保留

## 风险与挑战

### 1. 配色方案和主题的组合复杂度

**风险**：配色方案和主题的组合可能导致某些组合视觉效果不佳。

**解决方案**：
- 为每个主题提供 light 和 dark 两套配色
- 使用颜色算法自动适配不同配色方案
- 提供对比度验证和警告

### 2. 颜色对比度问题

**风险**：某些颜色在 Light 或 Dark 模式下对比度不足。

**解决方案**：
- 使用 WCAG 对比度算法验证颜色
- 如果对比度不足，自动调整亮度
- 提供对比度警告提示

### 3. 性能影响

**风险**：动态更新 CSS 变量可能影响性能。

**解决方案**：
- 使用 CSS 变量批量更新
- 缓存颜色变体
- 使用 requestAnimationFrame 优化

## 后续优化

### 短期优化（1-2 周）

1. **主题预览**：在设置界面提供主题预览
2. **主题历史**：记录用户最近使用的主题
3. **更多预设主题**：添加更多预设主题（如青色、粉色等）

### 中期优化（1-2 月）

1. **高级配色**：支持自定义背景、文本、边框等颜色
2. **导入导出**：支持主题配置的导入导出
3. **主题分享**：支持分享主题配置

### 长期优化（3-6 月）

1. **AI 配色建议**：AI 根据用户喜好推荐主题
2. **场景化主题**：根据使用场景自动切换主题
3. **主题市场**：提供主题市场，用户可以下载其他用户分享的主题

## 实施计划

### 第一阶段：核心功能（4-6 天）

1. 安装 `colord` 依赖
2. 实现预设主题配置 `themePresets.ts`
3. 实现颜色生成器 `colorGenerator.ts`
4. 修改 `setting.ts` 添加配色方案和主题存储
5. 实现配色方案切换逻辑
6. 实现主题切换逻辑
7. 修改 `useAntdTheme.ts` 支持动态主题
8. 修改 `variables.less` 支持动态更新
9. 实现 AI 工具 `setColorScheme.ts` 和 `setThemeColor.ts`

### 第二阶段：设置界面（2-3 天）

1. 设计并实现设置界面
2. 添加配色方案选择器
3. 添加主题选择器
4. 添加主题预览功能

### 第三阶段：测试与优化（2-3 天）

1. 编写单元测试
2. 编写集成测试
3. 用户验收测试
4. 性能优化
5. 文档完善

### 第四阶段：发布与反馈（1 周）

1. 发布功能
2. 收集用户反馈
3. 修复问题
4. 迭代优化

## 总结

本设计方案通过将配色方案和主题分离，提供了更清晰的概念和更灵活的组合方式：

1. **概念清晰**：配色方案控制明暗，主题控制颜色风格
2. **灵活组合**：用户可以自由组合配色方案和主题
3. **易于使用**：预设主题开箱即用，自定义主题满足个性化需求
4. **技术成熟**：使用成熟的颜色算法库，稳定可靠
5. **易于维护**：架构清晰，代码模块化
6. **可扩展**：为后续高级功能预留扩展空间

该方案能够很好地满足用户需求，提升用户体验。
