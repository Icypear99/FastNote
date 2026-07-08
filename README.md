# FastNote

FastNote 是一个本地优先的个人效率工作台，提供项目任务推进、随笔记录、常用开发工具、AI 助手和个人设置等能力。项目支持浏览器调试，也可以通过 Tauri 打包为桌面应用。

## 功能特性

- 工作台：查看活跃项目、推进任务、最近随笔和快捷入口。
- 项目任务：创建项目、设置项目颜色，按项目管理任务、优先级、截止日期和状态流转。
- 随笔创作：快速记录灵感和知识沉淀，支持自定义分类、标签和归档。
- 工具箱：内置 JSON 格式化、Base64 编解码、URL 编解码、时间戳转换、JWT 解析和 UUID 生成。
- AI 助手：默认本地 mock 模式；配置 OpenAI-compatible 接口后，桌面端后端会转发模型请求。
- 主题设置：支持浅色、暗色、深蓝、透明和跟随系统。
- 本地数据：浏览器模式使用 `localStorage`，Tauri 桌面端使用 SQLite。

## 技术栈

- React 19
- TypeScript
- Vite
- Tauri 2
- Rust + rusqlite
- Zustand
- lucide-react
- Astryx Design 组件库

## 环境要求

- Node.js
- npm
- Rust 工具链
- Tauri 2 所需的系统依赖

如果只运行网页调试模式，通常只需要 Node.js 和 npm。桌面开发与打包需要安装 Rust 和 Tauri 相关依赖。

## 快速开始

安装依赖：

```bash
npm install
```

启动网页开发服务：

```bash
npm run dev
```

构建前端产物：

```bash
npm run build
```

预览构建产物：

```bash
npm run preview
```

启动 Tauri 桌面开发模式：

```bash
npm run tauri:dev
```

打包桌面应用：

```bash
npm run tauri:build
```

## 目录结构

```text
.
├── public/                 # 静态资源，包含 logo.webp
├── src-web/                # 当前 Web/Tauri 前端入口
│   ├── app/                # 应用壳、导航、全局 UI 状态
│   ├── core/               # 基础设施层：Tauri 命令、浏览器本地数据
│   ├── features/           # 按功能划分的页面与模块
│   ├── shared/             # 跨功能共享的类型、样式和通用能力
│   └── main.tsx            # React 入口
├── src-tauri/              # Tauri 桌面端和 Rust 后端
│   ├── migrations/         # SQLite 初始化脚本
│   ├── src/                # Tauri 命令与数据访问逻辑
│   └── tauri.conf.json     # Tauri 应用配置
├── src/                    # Astryx 版本的旧前端实现
├── index.html              # Vite 页面入口
├── package.json            # npm 脚本和依赖
└── vite.config.ts          # Vite 配置
```

## 数据存储

网页模式下，数据保存在浏览器 `localStorage`，键名为 `fastnote:v2`。

桌面模式下，数据保存在 Tauri 应用数据目录中的 `workspace.sqlite`。启动时会自动创建数据库并执行初始化迁移。

任务、项目、随笔和随笔分类的移除逻辑采用归档字段，例如 `archivedAt`，不会直接执行数据库删除操作。

## AI 配置

默认模式为 `mock`，不会请求外部模型。要使用真实模型，请在设置页中切换到 `OpenAI-compatible`，并配置：

- API Key
- Base URL
- Model

后端会按 OpenAI-compatible 的 chat completions 格式发送最近上下文。

## 开发说明

- 当前页面入口是 `src-web/main.tsx`。
- 应用内 logo 统一使用 `public/logo.webp`。
- Tauri 打包图标仍由 `src-tauri/icons/icon.ico` 提供。
- 修改前端后建议执行 `npm run build` 检查 TypeScript 和构建。
- 修改 Tauri 后端后建议使用 `npm run tauri:dev` 验证桌面端行为。

## 常用命令

```bash
npm run dev          # 启动 Vite 开发服务
npm run build        # TypeScript 检查并构建前端
npm run preview      # 预览 dist
npm run tauri:dev    # 启动 Tauri 桌面开发模式
npm run tauri:build  # 构建桌面安装包
```
