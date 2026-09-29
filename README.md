<div align="center">
  <img src="app-icon.svg" width="96" height="96" alt="Lumina Edit Pro Logo" />
  <h1>Lumina Edit Pro</h1>
  <p>面向现代化写作与工程文档的 Local-First AI Markdown 桌面编辑器</p>

  <p>
    <a href="https://github.com/codywon/Lumina-Edit-Pro/releases/latest"><img src="https://img.shields.io/github/v/release/codywon/Lumina-Edit-Pro?color=ec5b13&label=Release" alt="Latest Release" /></a>
    <img src="https://img.shields.io/badge/Platform-Windows%20(x64)-blue" alt="Platform Windows" />
    <img src="https://img.shields.io/badge/Tauri-2.0-24C8D5?logo=tauri&logoColor=white" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/Rust-1.77%2B-DEA584?logo=rust&logoColor=white" alt="Rust" />
    <img src="https://img.shields.io/badge/License-Non--Commercial-brightgreen" alt="License" />
  </p>

  <p>
    <a href="https://github.com/codywon/Lumina-Edit-Pro/releases/latest">下载体验</a> ·
    <a href="docs/USER_MANUAL.html">用户手册</a> ·
    <a href="docs/表格排版与自适应设计规范.md">排版规范</a> ·
    <a href="#-快速上手-本地开发">开发构建</a>
  </p>
</div>

---

## 📖 项目简介

**Lumina Edit Pro** 是一款基于 **Tauri 2 + Rust + React 19** 构建的轻量级、本地优先（Local-First）Markdown 桌面编辑器。专为注重隐私、追求极速输入流与专业排版的技术创作者打造，具备真正的单文件绿色运行与零依赖出版级导出能力。

---

## ✨ 核心特性

### ⚡ 极速启动与大文档渲染
- **毫秒级冷启动**：启动即进入编辑，打字与 AST 序列化彻底解耦，超低输入延迟。
- **硬件级虚拟化渲染**：引入 Chromium 视窗虚拟化布局（`content-visibility: auto`），数十万字超长技术文档滚屏依然稳定维持 60/120 FPS 高刷。

### 📐 专业排版与数学公式
- **LaTeX / KaTeX 公式系统**：支持行内公式（`$...$`）与块级公式（`$$...$$`），提供公式浮动交互框，支持实时预览与即时纠错。
- **自适应智能表格**：内容驱动列宽自适应，避免文字异常折行；支持鼠标自由拖拽调节、快捷键单元格穿梭与行末自动增行。
- **中英文排版规范化**：内置盘古之白引擎，一键在汉字与英文/数字之间插入呼吸间距。

### 📄 出版级多格式导出
- **Word 导出 (.docx)**：内置零依赖 OpenXML 引擎（**无需安装 Pandoc**），支持商业报告、白皮书、公文规范等专业版式，自动生成大纲导航与页码。
- **PDF 与长图直出**：分页纯墨呈现，支持 W3C 标准页码与 2x Retina 高清长图直出。
- **标准 Markdown & HTML**：自包含排版样式无损输出。

### 🛠️ 键盘流与工程生产力
- **全键盘快捷键体系**：对标主流 Markdown 快捷键习惯，支持标题、列表、引用、表格、代码块与专注模式无缝切换。
- **全局命令盘 (`Ctrl + P`) & 全文查找替换 (`Ctrl + H`)**：拼音模糊检索快速切文，批量替换精准计数。
- **动态大纲与元数据卡片**：支持交互式 `[TOC]` 大纲生成、YAML Frontmatter 商务元数据折叠卡片。
- **时光机与外部文件监控**：静默记录多版本快照，支持差异比对与一键回滚；实时感知 Git pull 与外部文件变动。

### 🤖 本地优先 AI 协同 (可选)
- **自由接入大模型**：支持配置任意兼容 OpenAI 标准的 API 地址与密钥，本地 Local-First 存储，密钥绝不上云。
- **行内就地重塑 (`Ctrl + K`)**：选区原地润色、翻译、代码转换。
- **可收起 AI 侧边栏**：支持上下文带入、图像生成与长对话流式交互。

---

## 📦 下载与安装

进入 [**Releases 页面**](https://github.com/codywon/Lumina-Edit-Pro/releases/latest) 下载唯一的单文件可执行程序：

- 文件名：**`Lumina-Edit-Pro.exe`**
- 免安装、纯绿色、零残留，直接双击即可运行。
- 内置**原子置换在线更新**：点击【帮助】->【检查更新...】即可无感原地自更新。

---

## 💻 快速上手 (本地开发)

```bash
# 1. 克隆仓库
git clone https://github.com/codywon/Lumina-Edit-Pro.git
cd Lumina-Edit-Pro

# 2. 安装依赖
npm install

# 3. 启动本地前端开发服务
npm run dev

# 4. 运行全量测试套件 (127 项单元测试)
npm test

# 5. 编译构建 Windows 桌面单文件程序
npm run desktop:build
```

---

## 📜 许可协议 (License)

本项目遵循 **Non-Commercial Personal Use License**（个人非商业使用许可）：
- ✅ **允许**：个人学习、研究、交流和个人写作使用；
- ❌ **严禁**：任何未经作者书面授权的商业营利、收费集成、转售、商业分发或提供闭源商业服务；
- 详细许可条款请参阅根目录下的 [LICENSE](LICENSE) 文件。
