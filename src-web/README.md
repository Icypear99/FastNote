# src-web 模块结构

`src-web` 采用按功能优先的目录结构。目标是让工作台、项目任务、随笔、工具箱、AI 助手和设置等模块可以独立演进，同时把跨模块能力收敛到清晰的位置。

## 目录职责

```text
src-web/
├── app/                  # 应用壳、导航、窗口控制、全局 UI 状态
│   ├── App.tsx
│   └── stores/
├── core/                 # 基础设施层，不承载页面 UI
│   └── services/         # Tauri command 封装、浏览器 localStorage fallback
├── features/             # 功能模块，每个业务模块一个目录
│   ├── assistant/
│   ├── dashboard/
│   ├── essays/
│   ├── settings/
│   ├── tasks/
│   └── tools/
├── shared/               # 跨功能共享内容
│   ├── styles/           # 全局样式和跨页面样式
│   └── types/            # 跨模块领域类型
└── main.tsx              # React 入口
```

## 扩展规则

- 新增功能时，优先创建 `features/<feature-name>/`，页面、局部组件、局部 hooks 和局部工具函数都先放在该功能目录内。
- 只有被两个及以上功能复用的内容，才提升到 `shared/`。
- 和 Tauri、浏览器存储、接口调用相关的基础设施代码放到 `core/`，功能页面通过 `core/services/commands` 调用。
- 应用级导航、主题、窗口控制和全局 UI 状态放在 `app/`，不要下沉到具体功能模块。
- 跨模块类型统一从 `shared/types` 导出，避免功能模块之间互相引用内部文件。

## 当前边界

- `features/dashboard`：工作台概览和快捷入口。
- `features/tasks`：项目、任务创建、筛选、看板和列表。
- `features/essays`：随笔分类、随笔列表和编辑。
- `features/tools`：工具箱。
- `features/assistant`：AI 助手会话。
- `features/settings`：个人信息、主题和模型配置。

## 后续建议

当单个功能目录继续变大时，可以在该功能内再拆分：

```text
features/tasks/
├── components/
├── hooks/
├── services/
├── types/
└── TasksPage.tsx
```

拆分时仍保持一个原则：功能内部的私有实现留在功能目录内，真正跨功能复用的能力再放到 `shared/`。
