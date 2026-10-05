# Lumina Edit Pro 表格排版与自适应设计规范 (Table Design Specification)

> **核心原则**：兼顾 DeepSeek/ChatGPT 的智能自适应内容宽度与 Microsoft Word 的自由鼠标拖拽调节，彻底解决传统 Markdown 表格死板均分或单字断行孤儿字的行业顽疾。

---

## 1. 核心技术痛点回顾

在 Markdown 富文本编辑器中，表格排版普遍存在三大天然矛盾：

1. **死板均分 vs 内容不均**：若强制使用 `table-layout: fixed`，2 列表格会死板 50%:50%，3 列表格死板 33%:33%。简短的“状态”列占据大片空白，长达数百字的“说明”列被严重挤压；
2. **浏览器原生 auto-layout 的 CJK 碎裂陷阱**：在 `table-layout: auto` 下，浏览器遇到长内容列时会试图将其他列压缩到“最小宽度”。而在默认 `word-break: normal` 下，中文汉字被视为在任意字符间均可断行，导致 `full (默认)` 被折成 `full (默` 和 `认)`，`3.6x 更小` 的 `小` 掉到下一行，排版极其丑陋；
3. **行内代码块（Code Chips）膨胀**：单元格内的 `` `code` `` 标签若使用正文的较大内边距和圆角，在密集混排时会导致行高突兀、行距失调。

---

## 2. 黄金排版四法则 (The 4 Pillars)

### 法则一：动静双轨制布局（Dynamic Layout Switching）

- **默认状态**：`table-layout: auto`。让浏览器根据实际内容权重进行智能自适应分配，短列紧凑，长说明列舒适占据 70%\~80% 宽度。
- **用户拖拽后状态**：一旦用户通过鼠标拖动列宽（ProseMirror 注入具体的 `width: XXXpx`），CSS 智能识别并切换为 `table-layout: fixed !important`。

```css
/* 默认自适应 */
.prose-custom table,
.tiptap table {
  width: 100%;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  table-layout: auto;
  box-sizing: border-box;
}

/* 仅在用户手动拖拽产生绝对 width 时，才锁定为固定布局，绝不误判 min-width */
.prose-custom table[style^="width:"],
.prose-custom table[style*="; width:"],
.prose-custom table[style*=";width:"],
.tiptap table[style^="width:"],
.tiptap table[style*="; width:"],
.tiptap table[style*=";width:"],
.prose-custom table:has(col[style^="width:"]),
.prose-custom table:has(col[style*="; width:"]),
.prose-custom table:has(col[style*=";width:"]),
.tiptap table:has(col[style^="width:"]),
.tiptap table:has(col[style*="; width:"]),
.tiptap table:has(col[style*=";width:"]) {
  table-layout: fixed !important;
}
```

### 法则二：汉字语义防碎裂约束（CJK Semantic Integrity）

- 使用 `word-break: keep-all;` 约束 `th` 与 `td`。
- 具有连续语义的中文词组（如 `(默认)`、`已实现`、`更小`、`需后台改造`）被浏览器作为整体看待，**严禁将单个汉字拆成孤行**。
- 搭配 `overflow-wrap: break-word;`（或 `anywhere`），确保即使出现无空格的超长变量名或代码路径也能安全截断换行，绝不撑破容器。

```css
.prose-custom td,
.tiptap td {
  word-break: keep-all; /* 保护中文语义单元完整，杜绝单字孤行 */
  overflow-wrap: break-word; /* 防止超长无空格英文字符串溢出 */
  vertical-align: top;
  line-height: 1.6;
}
```

### 法则三：设立列宽呼吸底线与首列紧凑原则（Min-Width & First-Column Compactness）

- 避免短信息列被长文本列挤压至不足以显示简短词组：
  - **首列紧凑单行呈现**：`th:first-child, td:first-child { white-space: nowrap; width: 1%; min-width: 54px; font-weight: 500; }`，自适应贴合维度、参数、序号等短字段，绝不虚胖占位；
  - **单元格弹性列底线**：`th, td { min-width: 50px; vertical-align: middle; }`；
  - **舒适内边距**：`padding: var(--table-row-padding, 0.65rem) 0.95rem !important;`。

### 法则四：单元格内代码块（Code Chips）原子完整性规范（Atomic Code Integrity）

- 单元格内的代码块必须轻量紧凑，且**严禁中途拆词折断**（如严禁将 `device_id` 拆成 `devi` 和 `ce_id`，将 `people` 拆成 `peop` 和 `le`）：

```css
.prose-custom td code,
.prose-custom th code,
.tiptap td code,
.tiptap th code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace !important;
  font-size: 0.84em !important;
  padding: 0.14em 0.42em !important;
  border-radius: 4px !important;
  background-color: rgba(175, 184, 193, 0.2) !important;
  border: 1px solid rgba(175, 184, 193, 0.28) !important;
  color: #cf222e !important; /* Typora/GitHub 经典代码药丸红 */
  white-space: nowrap !important; /* 关键：代码标识符原子完整，禁止拆词折断 */
  display: inline-block !important;
  line-height: 1.35 !important;
  vertical-align: baseline !important;
}

.dark .prose-custom td code,
.dark .tiptap td code {
  color: #ff7b72 !important;
  background-color: rgba(110, 118, 129, 0.25) !important;
  border-color: rgba(110, 118, 129, 0.3) !important;
}
```

---

## 3. 视觉与交互规范

1. **表头单实线与圆角**：表头底部采用 `border-bottom: 1px solid #d0d7de;`，四角平滑包裹（`border-radius: 8px`），彰显正式出版物与专业文档的高级质感。

2. **行悬停微光**：

   ```css
   .prose-custom tr:hover td,
   .tiptap tr:hover td {
     background-color: rgba(var(--accent-rgb, 236, 91, 19), 0.04) !important;
   }
   .dark .prose-custom tr:hover td,
   .dark .tiptap tr:hover td {
     background-color: rgba(var(--accent-rgb, 236, 91, 19), 0.08) !important;
   }
   ```

3. **Typora / Excel 快捷键操作集**：

   - Tab：跳到下一个单元格；行末单元格按 Tab 自动新增一行；
   - Shift + Tab：回退到上一个单元格；
   - Ctrl + Enter：表格内任意位置立即向下插入新行；
   - Ctrl + T：快速插入标准表格。

4. **菜单辅助能力**：

   - 支持【自适应内容列宽 (推荐)】一键清除手动像素值恢复黄金自适应；
   - 支持【当前列对齐：居左 / 居中 / 靠右】；
   - 支持【均等分配各列列宽】。

---

*本文档为 Lumina Edit Pro 永久排版设计规范，后续所有表格组件、节点扩展与样式更新均需严格遵守此标准。*

---

# Lumina Edit Pro 现代列表微卡片块排版规范 (Notion Card-Block List Specification)

> **核心原则**：汲取 Notion 的微型卡片块（Card Block）排版精髓，将散乱游离的列表项封装为独立微卡片，彻底解决传统 Markdown 列表在面对架构规范、长篇长句罗列时“密密麻麻、项距坍塌、视线串行”的阅读窒息感。

---

## 1. 核心技术痛点回顾

在 Markdown 富文本编辑中，列表排版普遍存在三大天然痛点：

1. **格式塔邻近原则破坏（Item Gap Collapse）**：传统 CSS 赋予 `li` 的垂直外间距常常只有 2~3px，而列表项内部折行的行间距却有 10~12px。条目间距比条内折行间距还要窄，读者的视知觉无法将每条识别为独立观点，直接糊成“文字砖块”；
2. **符号定位感微弱（Marker Drift）**：原生浏览器的 `list-style: disc` 在中文长段和行内代码混排时极易发虚且垂直基线漂移，在大量代码药丸和长句面前起不到视觉抓力；
3. **扫描锚点缺失（Lack of Scannability）**：长列表缺少主题词对比和悬停视觉锁定，用户无法进行 F 型快速扫读，长时间精读极易发生“串行疲劳”。

---

## 2. 黄金排版四法则 (The 4 Card-Block Pillars)

### 法则一：Notion 独立微卡片块（Card-Block Structure）

- 每个列表条目拥有专属的浅色边框、温润底色、独立圆角（8px）与微阴影，将一条条长句封装为高质感的“知识微卡片”；
- 彻底消除单行过长或多行文本之间的模糊边界。

```css
.prose-custom ul:not([data-type="taskList"]) > li,
.tiptap ul:not([data-type="taskList"]) > li,
.prose-custom ol > li,
.tiptap ol > li {
  position: relative !important;
  border: 1px solid rgba(0, 0, 0, 0.08) !important;
  background-color: rgba(0, 0, 0, 0.015) !important;
  border-radius: 8px !important;
  padding: 11px 16px 11px 34px !important;
  margin-top: 0 !important;
  margin-bottom: 10px !important;
  line-height: 1.68 !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) !important;
  box-sizing: border-box !important;
}

.dark .prose-custom ul:not([data-type="taskList"]) > li,
.dark .tiptap ul:not([data-type="taskList"]) > li {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background-color: rgba(255, 255, 255, 0.025) !important;
}
```

### 法则二：精制几何指示器（Refined Card Markers）

- **无序列表**：左侧对齐 7px 精致 Accent 主题色微球与微弱半透明光环，起笔稳重；
- **有序列表**：采用等宽半粗主题色数字计数器（`tabular-nums`），整齐对齐。

```css
.prose-custom ul:not([data-type="taskList"]) > li::before,
.tiptap ul:not([data-type="taskList"]) > li::before {
  content: "" !important;
  position: absolute !important;
  left: 14px !important;
  top: 19px !important;
  width: 7px !important;
  height: 7px !important;
  border-radius: 50% !important;
  background-color: var(--accent, #ec5b13) !important;
  box-shadow: 0 0 0 2.5px rgba(var(--accent-rgb, 236, 91, 19), 0.16) !important;
}
```

### 法则三：卡片悬停微光浮动与视线锁定（Card Hover Focus）

- 鼠标划过某张卡片时，整张卡片边框亮起为 Accent 主题色，呈现极淡微光浮动，帮助读者的余光死死锁定当前条目的边界，绝不串行。

```css
.prose-custom ul:not([data-type="taskList"]) > li:hover,
.tiptap ul:not([data-type="taskList"]) > li:hover {
  border-color: rgba(var(--accent-rgb, 236, 91, 19), 0.38) !important;
  background-color: rgba(var(--accent-rgb, 236, 91, 19), 0.035) !important;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.04) !important;
}
```

### 法则四：嵌套轻量化与首词粗体锚点（Nested Sub-items & Lead-in Anchor）

- 卡片内部如果出现嵌套子列表，子条目自动转为轻量化树状导轨，不再堆叠冗余的大卡片边框；
- 对列表首个粗体词或短语（`**关键词:**`）赋予略深字重与对比度，便于用户进行 F 型快速扫读。

---

## 3. 边界与纯粹性保证

- **仅作用于列表**：上述规则使用精准选择器严格约束在 `ul / ol / li` 之内；
- **绝不污染其他元素**：普通段落 `p`、表格 `table`、代码块 `pre/code`、数学公式 `math`、引用块 `blockquote` 以及任务清单 `ul[data-type="taskList"]` 均拥有各自独立的作用域与排版逻辑，彼此完全解耦；
- **Markdown 原文 0 污染**：底层存储与导出保持标准 Markdown 语法，无任何附加属性侵入。

---

*本文档为 Lumina Edit Pro 永久排版设计规范，后续所有列表与层次结构样式更新均需严格遵守此标准。*
