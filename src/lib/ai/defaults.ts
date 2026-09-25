import type { AIChatPreferences, AIMemoryState, AIModel, AIProviderSettings, AITemplate, AITemplatesState } from './types';

export const DEFAULT_MODELS: AIModel[] = [
  { id: 'gpt-5', label: 'GPT-5' },
];

export const DEFAULT_PROVIDER_SETTINGS: AIProviderSettings = {
  baseUrl: 'https://api.openai.com',
  apiKey: '',
  defaultModel: DEFAULT_MODELS[0].id,
  imageModel: 'gpt-image-2',
  imageSize: 'auto',
  imageQuality: 'auto',
  modelSource: 'remote',
  models: DEFAULT_MODELS,
  modelContextWindows: {},
};

export const DEFAULT_CHAT_PREFERENCES: AIChatPreferences = {
  contextScope: 'document',
  sessionScope: 'document',
  useMemory: true,
  stream: true,
  autoSummarize: true,
  historySearchEnabled: false,
  historySearchScope: 'current',
  contextWindowTokens: 200000,
  contextWarnRatio: 0.8,
  docSearchEnabled: false,
};

function nowIso() {
  return new Date().toISOString();
}

export const DEFAULT_TEMPLATES: AITemplate[] = [
  {
    id: 'template-writing-polish',
    name: '润色改写',
    tags: ['写作', '润色'],
    prompt: '请在保持原意的前提下润色下面内容，使其更流畅、自然。',
    scope: 'selection',
    slashCommand: '润色',
    builtIn: true,
    updatedAt: nowIso(),
  },
  {
    id: 'template-editor-assistant',
    name: '通用编辑助手',
    tags: ['写作', '编辑', '优化'],
    prompt:
      '你是中文写作与编辑助手。默认用自然、清晰、简洁的中文回答。' +
      '当我提出“优化/润色/改写/扩写/缩写/排版/纠错/风格转换”等要求时，' +
      '请直接输出修改后的正文，不要解释；如有歧义先问一句澄清。' +
      '需要保留标题/列表/引用/Markdown 格式时请保持。',
    scope: 'document',
    slashCommand: '编辑',
    builtIn: true,
    updatedAt: nowIso(),
  },
  {
    id: 'template-translate',
    name: '翻译',
    tags: ['翻译', '语言'],
    prompt: '将选中的英文翻译为中文。',
    scope: 'selection',
    slashCommand: '翻译',
    builtIn: true,
    updatedAt: nowIso(),
  },
  {
    id: 'template-tech-summary',
    name: '技术文档总结',
    tags: ['技术文档', '总结'],
    prompt: '请用要点形式总结下面内容，突出关键概念与结论。',
    scope: 'document',
    slashCommand: '总结',
    builtIn: true,
    updatedAt: nowIso(),
  },
  {
    id: 'template-notes-structure',
    name: '笔记整理',
    tags: ['笔记', '整理'],
    prompt: '请将下面笔记整理为结构化清单，保留重点与待办。',
    scope: 'document',
    slashCommand: '整理',
    builtIn: true,
    updatedAt: nowIso(),
  },
  {
    id: 'template-project-plan',
    name: '项目方案生成',
    tags: ['项目方案', '规划'],
    prompt: '请基于下面信息生成项目方案，包含目标、范围、里程碑、风险与资源。',
    scope: 'document',
    slashCommand: '方案',
    builtIn: true,
    updatedAt: nowIso(),
  },
];

export const DEFAULT_TEMPLATES_STATE: AITemplatesState = {
  templates: DEFAULT_TEMPLATES,
  recent: [],
  defaultTemplateId: 'template-editor-assistant',
};

export const DEFAULT_MEMORY_STATE: AIMemoryState = {
  enabled: false,
  fixedInstructionEnabled: true,
  fixedInstruction: '',
  preferencesEnabled: true,
  preferences: [],
  summary: '',
};
