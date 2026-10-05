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

# Lumina Edit Pro 现代列表排版与层次设计规范 (List Design Specification)

> **核心原则**：汲取 Notion 与 Linear 的微型块（Block）排版精髓，彻底解决传统 Markdown 列表在面对架构规范、长篇长句罗列时“密密麻麻、项距坍塌、视线串行”的阅读窒息感。

---

## 1. 核心技术痛点回顾

在 Markdown 富文本编辑中，列表排版普遍存在三大天然痛点：

1. **格式塔邻近原则破坏（Item Gap Collapse）**：传统 CSS 赋予 `li` 的垂直外间距常常只有 2~3px，而列表项内部折行的行间距却有 10~12px。条目间距比条内折行间距还要窄，读者的视知觉无法将每条识别为独立观点，直接糊成“文字砖块”；
2. **符号定位感微弱（Marker Drift）**：原生浏览器的 `list-style: disc` 在中文长段和行内代码混排时极易发虚且垂直基线漂移，在大量代码药丸和长句面前起不到视觉抓力；
3. **扫描锚点缺失（Lack of Scannability）**：长列表缺少主题词对比和悬停视觉锁定，用户无法进行 F 型快速扫读，长时间精读极易发生“串行疲劳”。

---

## 2. 黄金排版四法则 (The 4 List Pillars)

### 法则一：块级纵向呼吸韵律（Vertical Rhythm & Item Margin）

- 条目间距拉开至 `0.85em`（约 14px~16px），内部行距收敛至 `1.62`，确保 **条目间距（Item Gap）明显大于条内行距（Line Gap）**，彻底打破 CSS 外边距折叠陷阱。
- 无论单条文字只有 1 行还是长达 5 行，大脑扫一眼就能精确识别出共有多少个独立观点。
- 自动消除 `li` 内部 `<p>` 标签二次产生的多余边距，杜绝高度失控。

```css
.prose-custom ul:not([data-type="taskList"]) > li,
.tiptap ul:not([data-type="taskList"]) > li,
.prose-custom ol > li,
.tiptap ol > li {
  position: relative;
  line-height: 1.62 !important;
  margin-top: 0.15em !important;
  margin-bottom: 0.85em !important;
  padding: 0.2rem 0.5rem 0.2rem 0.35rem !important;
  margin-left: -0.35rem !important;
  border-radius: 6px;
  transition: background-color 0.15s ease;
}

.prose-custom li > p,
.tiptap li > p {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  line-height: inherit !important;
}
```

### 法则二：Notion 标志性三级几何 Marker 系统（Hierarchical Markers）

- **一级列表（Level 1）**：温润高级中性灰实心圆点（`#94a3b8` / `#64748b`），克制不抢戏；
- **二级列表（Level 2）**：精致空心圆环（`circle`）；
- **三级列表（Level 3）**：微型小方块（`square`）；
- **有序列表（OL）**：采用等宽半粗中性字色（`tabular-nums`），秩序感出众。

```css
/* 一级列表：实心圆点 */
.prose-custom ul:not([data-type="taskList"]) > li::marker,
.tiptap ul:not([data-type="taskList"]) > li::marker {
  color: #94a3b8 !important;
  font-size: 0.84em;
  transition: color 0.15s ease;
}
.dark .prose-custom ul:not([data-type="taskList"]) > li::marker,
.dark .tiptap ul:not([data-type="taskList"]) > li::marker {
  color: #64748b !important;
}

/* 二级与三级几何标记 */
.prose-custom ul:not([data-type="taskList"]) ul,
.tiptap ul:not([data-type="taskList"]) ul {
  list-style-type: circle !important;
}
.prose-custom ul:not([data-type="taskList"]) ul ul,
.tiptap ul:not([data-type="taskList"]) ul ul {
  list-style-type: square !important;
}
```

### 法则三：嵌套树状导轨与悬挂缩进（Tree Indent Guides）

- 列表项多行折行时严格左对齐首行文本起点，保留一条平直、清爽的阅读纵轴。
- 嵌套列表在左侧绘制极淡、半透明的树状导轨（`1.5px solid rgba(148, 163, 184, 0.22)`），一眼看清归属层级，彻底消除散落漂浮感。

```css
.prose-custom ul ul,
.prose-custom ol ol,
.prose-custom ul ol,
.prose-custom ol ul,
.tiptap ul ul,
.tiptap ol ol,
.tiptap ul ol,
.tiptap ol ul {
  position: relative;
  margin-top: 0.25em !important;
  margin-bottom: 0.35em !important;
  padding-left: 1.25em !important;
  border-left: 1.5px solid rgba(148, 163, 184, 0.22);
  margin-left: 0.25em;
}
.dark .prose-custom ul ul,
.dark .prose-custom ol ol,
.dark .tiptap ul ul,
.dark .tiptap ol ol {
  border-left-color: rgba(100, 116, 139, 0.28);
}
```

### 法则四：视线锁定微光与扫描锚点（Hover Focus & Lead-in Anchor）

- **悬停微光**：鼠标掠过列表项时赋予 `rgba(accent, 0.035)` 微弱底色，Marker 灵动过渡为主题色，阅读长段时余光始终能锁定上下文边界；
- **扫描锚点**：对列表首个粗体词或短语（`**关键词:**`）赋予略深字重与对比度，便于用户进行 F 型快速扫读。

```css
/* 悬停微光 */
.prose-custom ul:not([data-type="taskList"]) > li:hover,
.tiptap ul:not([data-type="taskList"]) > li:hover,
.prose-custom ol > li:hover,
.tiptap ol > li:hover {
  background-color: rgba(var(--accent-rgb, 236, 91, 19), 0.035);
}
.dark .prose-custom ul:not([data-type="taskList"]) > li:hover,
.dark .tiptap ul:not([data-type="taskList"]) > li:hover {
  background-color: rgba(var(--accent-rgb, 236, 91, 19), 0.075);
}
.prose-custom ul:not([data-type="taskList"]) > li:hover::marker,
.tiptap ul:not([data-type="taskList"]) > li:hover::marker {
  color: var(--accent) !important;
}

/* 扫描锚点 */
.prose-custom li > strong:first-child,
.tiptap li > strong:first-child,
.prose-custom li > p > strong:first-child,
.tiptap li > p > strong:first-child {
  color: #0f172a;
  font-weight: 600;
  margin-right: 0.2em;
}
.dark .prose-custom li > strong:first-child,
.dark .tiptap li > strong:first-child {
  color: #f8fafc;
}
```

---

## 3. 边界与纯粹性保证

- **仅作用于列表**：上述规则使用精准选择器严格约束在 `ul / ol / li` 之内；
- **绝不污染其他元素**：普通段落 `p`、表格 `table`、代码块 `pre/code`、数学公式 `math`、引用块 `blockquote` 以及任务清单 `ul[data-type="taskList"]` 均拥有各自独立的作用域与排版逻辑，彼此完全解耦；
- **Markdown 原文 0 污染**：底层存储与导出保持标准 Markdown 语法，无任何附加属性侵入。

---

*本文档为 Lumina Edit Pro 永久排版设计规范，后续所有列表与层次结构样式更新均需严格遵守此标准。*