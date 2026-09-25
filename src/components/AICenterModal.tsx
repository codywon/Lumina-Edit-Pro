import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Cpu, Database, Key, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { useAI } from '../contexts/AIContext';
import { DEFAULT_MEMORY_STATE, DEFAULT_MODELS, DEFAULT_PROVIDER_SETTINGS } from '../lib/ai/defaults';
import { listModels } from '../lib/ai/openaiClient';
import type { AIImageQuality, AIImageSize, AITemplate } from '../lib/ai/types';
import { isValidApiKey, isValidBaseUrl, maskApiKey, normalizeBaseUrl } from '../lib/ai/validation';
import { cn } from '../lib/utils';

interface AICenterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const tabs = [
  { id: 'models', label: '模型配置', icon: Cpu },
  { id: 'templates', label: '模板指令', icon: Sparkles },
  { id: 'memory', label: '记忆偏好', icon: Database },
  { id: 'api', label: 'API 配置', icon: Key },
];

const imageSizeOptions = [
  { value: 'auto', label: '自动（推荐）' },
  { value: '1024x1024', label: '方图 1024x1024' },
  { value: '1536x1024', label: '横图 1536x1024' },
  { value: '1024x1536', label: '竖图 1024x1536' },
  { value: '2048x2048', label: '高清方图 2048x2048' },
  { value: '2048x1152', label: '16:9 横图 2048x1152' },
  { value: '1152x2048', label: '9:16 竖图 1152x2048' },
  { value: '3840x2160', label: '4K 横图 3840x2160' },
  { value: '2160x3840', label: '4K 竖图 2160x3840' },
] as const satisfies ReadonlyArray<{ value: AIImageSize; label: string }>;

const imageQualityOptions = [
  { value: 'auto', label: '自动（推荐）' },
  { value: 'low', label: '低：更快/更省' },
  { value: 'medium', label: '中：平衡' },
  { value: 'high', label: '高：质量优先' },
] as const;

function createTemplateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `template-${Date.now()}`;
}

export default function AICenterModal({ isOpen, onClose }: AICenterModalProps) {
  const {
    provider,
    chatPreferences,
    templates,
    memory,
    connectionTest,
    updateProvider,
    updateChatPreferences,
    resetTemplates,
    setDefaultTemplateId,
    updateTemplate,
    removeTemplate,
    updateMemory,
    setConnectionTest,
  } = useAI();
  const [activeTab, setActiveTab] = React.useState('models');
  const [baseUrlDraft, setBaseUrlDraft] = React.useState(provider.baseUrl);
  const [apiKeyDraft, setApiKeyDraft] = React.useState(provider.apiKey);
  const [editingApiKey, setEditingApiKey] = React.useState(false);
  const [modelRefreshState, setModelRefreshState] = React.useState<'idle' | 'loading' | 'error'>('idle');
  const [localModelsDraft, setLocalModelsDraft] = React.useState(
    provider.models.map((model) => model.id).join('\n')
  );
  const [templateSearch, setTemplateSearch] = React.useState('');
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(
    templates.templates[0]?.id ?? null
  );

  const buildModelContextWindows = React.useCallback(
    (modelsList: { id: string }[]) => {
      const next: Record<string, number> = {};
      modelsList.forEach((model) => {
        const existing = provider.modelContextWindows?.[model.id];
        next[model.id] = existing ?? chatPreferences.contextWindowTokens;
      });
      return next;
    },
    [provider.modelContextWindows, chatPreferences.contextWindowTokens]
  );

  React.useEffect(() => {
    setBaseUrlDraft(provider.baseUrl);
  }, [provider.baseUrl]);

  React.useEffect(() => {
    setApiKeyDraft(provider.apiKey);
  }, [provider.apiKey]);

  React.useEffect(() => {
    setLocalModelsDraft(provider.models.map((model) => model.id).join('\n'));
  }, [provider.models]);

  React.useEffect(() => {
    if (!templates.templates.find((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(templates.templates[0]?.id ?? null);
    }
  }, [templates.templates, selectedTemplateId]);

  const filteredTemplates = React.useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return templates.templates;
    return templates.templates.filter((item) =>
      item.name.toLowerCase().includes(query) ||
      item.tags.join(',').toLowerCase().includes(query) ||
      item.slashCommand.toLowerCase().includes(query)
    );
  }, [templates.templates, templateSearch]);

  const selectedTemplate = templates.templates.find((item) => item.id === selectedTemplateId) ?? null;

  const handleSaveProvider = () => {
    updateProvider({
      baseUrl: normalizeBaseUrl(baseUrlDraft),
      apiKey: apiKeyDraft.trim(),
    });
    setEditingApiKey(false);
  };

  const handleRefreshModels = async () => {
    if (!isValidBaseUrl(baseUrlDraft) || !isValidApiKey(apiKeyDraft)) {
      setConnectionTest({
        ok: false,
        message: '请先填写有效的 baseUrl 与 API Key',
        at: new Date().toISOString(),
      });
      return;
    }
    setModelRefreshState('loading');
    try {
      const models = await listModels(normalizeBaseUrl(baseUrlDraft), apiKeyDraft.trim());
      updateProvider({
        models,
        modelSource: 'remote',
        defaultModel: models[0]?.id ?? provider.defaultModel,
        modelContextWindows: buildModelContextWindows(models),
      });
      setModelRefreshState('idle');
      setConnectionTest({ ok: true, message: '模型列表刷新成功', at: new Date().toISOString() });
    } catch (err) {
      setModelRefreshState('error');
      setConnectionTest({ ok: false, message: '刷新模型列表失败', at: new Date().toISOString() });
    }
  };

  const handleSaveLocalModels = () => {
    const items = localModelsDraft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((id) => ({ id }));
    updateProvider({ models: items, modelSource: 'local', defaultModel: items[0]?.id ?? provider.defaultModel });
    updateProvider({ modelContextWindows: buildModelContextWindows(items) });
  };

  const handleResetLocalModels = () => {
    const ids = DEFAULT_MODELS.map((model) => model.id).join('\n');
    setLocalModelsDraft(ids);
    updateProvider({
      models: DEFAULT_MODELS,
      modelSource: 'local',
      defaultModel: DEFAULT_MODELS[0]?.id ?? provider.defaultModel,
      modelContextWindows: buildModelContextWindows(DEFAULT_MODELS),
    });
  };

  const handleTestConnection = async () => {
    if (!isValidBaseUrl(baseUrlDraft) || !isValidApiKey(apiKeyDraft)) {
      setConnectionTest({ ok: false, message: '请填写有效的 baseUrl 与 API Key', at: new Date().toISOString() });
      return;
    }
    try {
      await listModels(normalizeBaseUrl(baseUrlDraft), apiKeyDraft.trim());
      setConnectionTest({ ok: true, message: '连接成功', at: new Date().toISOString() });
    } catch (err) {
      setConnectionTest({ ok: false, message: '连接失败，请检查配置', at: new Date().toISOString() });
    }
  };

  const handleCreateTemplate = () => {
    const template: AITemplate = {
      id: createTemplateId(),
      name: '新模板',
      tags: ['自定义'],
      prompt: '',
      scope: 'document',
      slashCommand: '新模板',
      updatedAt: new Date().toISOString(),
    };
    updateTemplate(template);
    setSelectedTemplateId(template.id);
  };

  const handleResetTemplates = () => {
    resetTemplates();
    setSelectedTemplateId(null);
  };
  const handleTemplatePatch = (patch: Partial<AITemplate>) => {
    if (!selectedTemplate) return;
    updateTemplate({
      ...selectedTemplate,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const apiKeyMasked = maskApiKey(provider.apiKey);
  const configValid = isValidBaseUrl(provider.baseUrl) && isValidApiKey(provider.apiKey);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[820px] h-[600px] bg-white dark:bg-[#0E0E11] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-2xl z-50 flex overflow-hidden"
          >
            <aside className="w-52 shrink-0 bg-slate-50 dark:bg-[#18181B] border-r border-slate-200 dark:border-[#27272A] p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-6 px-2">
                <div className="p-1.5 bg-accent-gradient rounded-lg">
                  <Sparkles size={16} className="text-white" />
                </div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">AI 能力中心</h2>
              </div>
              <nav className="flex-1 space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                      activeTab === tab.id
                        ? 'bg-accent-soft text-accent'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]/50 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </nav>
              <div className="mt-auto p-3 bg-slate-100 dark:bg-[#27272A]/50 rounded-xl border border-slate-200 dark:border-[#27272A]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">配置状态</span>
                  <span className={cn('text-xs font-bold', configValid ? 'text-emerald-500' : 'text-amber-500')}>
                    {configValid ? '已就绪' : '待配置'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">默认模型：{provider.defaultModel || '未选择'}</div>
              </div>
            </aside>

            <section className="flex-1 flex flex-col">
              <header className="h-14 flex items-center justify-between px-6 border-b border-slate-200 dark:border-[#27272A]">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {tabs.find((t) => t.id === activeTab)?.label}
                </h3>
                <button
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-[#27272A]"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {activeTab === 'models' && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 dark:border-[#27272A] p-4">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">图像生成</p>
                      <p className="text-xs text-slate-500 mb-3">
                        用于 AI 助手输入框中的图片/插图请求；图片请求会强制使用非流式接口。
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <label className="space-y-1">
                          <span className="text-xs text-slate-500">图像模型</span>
                          <input
                            value={provider.imageModel || 'gpt-image-2'}
                            onChange={(e) => updateProvider({ imageModel: e.target.value.trim() })}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                            placeholder="gpt-image-2"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-slate-500">默认尺寸</span>
                          <select
                            value={provider.imageSize || 'auto'}
                            onChange={(e) =>
                              updateProvider({
                                imageSize: e.target.value as AIImageSize,
                              })
                            }
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                          >
                            {imageSizeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-slate-500">默认质量</span>
                          <select
                            value={provider.imageQuality || 'auto'}
                            onChange={(e) =>
                              updateProvider({
                                imageQuality: e.target.value as AIImageQuality,
                              })
                            }
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                          >
                            {imageQualityOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">模型来源</p>
                        <p className="text-xs text-slate-500">远程拉取或本地维护</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-md border',
                            provider.modelSource === 'remote'
                              ? 'border-accent text-accent bg-accent-subtle'
                              : 'border-slate-200 dark:border-[#27272A] text-slate-500'
                          )}
                          onClick={() => updateProvider({ modelSource: 'remote' })}
                        >
                          远程
                        </button>
                        <button
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-md border',
                            provider.modelSource === 'local'
                              ? 'border-accent text-accent bg-accent-subtle'
                              : 'border-slate-200 dark:border-[#27272A] text-slate-500'
                          )}
                          onClick={() => updateProvider({ modelSource: 'local' })}
                        >
                          本地
                        </button>
                      </div>
                    </div>

                    {provider.modelSource === 'remote' && (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleRefreshModels}
                          className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-strong transition-colors flex items-center gap-2"
                          disabled={modelRefreshState === 'loading'}
                        >
                          <RefreshCw size={14} className={modelRefreshState === 'loading' ? 'animate-spin' : ''} />
                          刷新模型列表
                        </button>
                        {modelRefreshState === 'error' && (
                          <span className="text-xs text-amber-500">刷新失败，请检查配置</span>
                        )}
                      </div>
                    )}

                    {provider.modelSource === 'local' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">本地模型列表</label>
                        <textarea
                          value={localModelsDraft}
                          onChange={(e) => setLocalModelsDraft(e.target.value)}
                          className="w-full min-h-[140px] bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                          placeholder="每行一个模型 ID"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSaveLocalModels}
                            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                          >
                            保存本地模型
                          </button>
                          <button
                            onClick={handleResetLocalModels}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                          >
                            重置为默认
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">模型列表</h4>
                        <span className="text-xs text-slate-400">默认：{provider.defaultModel || '未选择'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {provider.models.map((model) => (
                          <div
                            key={model.id}
                            className={cn(
                              'p-3 border rounded-xl transition-colors',
                              provider.defaultModel === model.id
                                ? 'border-accent bg-accent-subtle'
                                : 'border-slate-200 dark:border-[#27272A]'
                            )}
                          >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {model.label ?? model.id}
                            </p>
                            {provider.defaultModel === model.id && (
                              <span className="text-[10px] font-bold text-accent">默认</span>
                            )}
                          </div>
                          <div className="space-y-1 mb-2">
                            <label className="text-[10px] text-slate-500">上下文窗口（tokens）</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1000}
                                value={provider.modelContextWindows?.[model.id] ?? chatPreferences.contextWindowTokens}
                                onChange={(e) => {
                                  const next = Number(e.target.value);
                                  if (!Number.isFinite(next)) return;
                                  updateProvider({
                                    modelContextWindows: {
                                      ...provider.modelContextWindows,
                                      [model.id]: Math.max(1000, Math.floor(next)),
                                    },
                                  });
                                }}
                                className="w-full px-2 py-1 text-xs bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-md"
                              />
                              <button
                                onClick={() => {
                                  const next = { ...(provider.modelContextWindows ?? {}) };
                                  delete next[model.id];
                                  updateProvider({ modelContextWindows: next });
                                }}
                                className="text-[10px] text-slate-500"
                              >
                                用全局
                              </button>
                            </div>
                          </div>
                          <button
                            className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#27272A] px-3 py-1.5 rounded-md w-full hover:bg-slate-200 dark:hover:bg-[#3f3f46] transition-colors"
                            onClick={() => updateProvider({ defaultModel: model.id })}
                          >
                            设为默认
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'templates' && (
                  <div className="grid grid-cols-[240px_1fr] gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">模板库</h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleResetTemplates}
                            className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-md"
                          >
                            重置为默认
                          </button>
                          <button
                            onClick={handleCreateTemplate}
                            className="px-2 py-1 text-xs font-medium bg-accent text-white rounded-md flex items-center gap-1"
                          >
                            <Plus size={12} /> 新建
                          </button>
                        </div>
                      </div>
                      <input
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="搜索模板"
                        className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                      />
                      {templates.recent.length > 0 && (
                        <div className="text-xs text-slate-500">
                          最近使用：
                          <div className="mt-2 flex flex-wrap gap-2">
                            {templates.recent.map((id) => {
                              const item = templates.templates.find((t) => t.id === id);
                              if (!item) return null;
                              return (
                                <button
                                  key={id}
                                  onClick={() => setSelectedTemplateId(id)}
                                  className="px-2 py-1 rounded-full bg-slate-100 dark:bg-[#27272A]"
                                >
                                  {item.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    <div className="space-y-2">
                      {filteredTemplates.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedTemplateId(item.id)}
                            className={cn(
                              'w-full text-left p-2 rounded-lg border transition-colors',
                              selectedTemplateId === item.id
                                ? 'border-accent bg-accent-subtle'
                                : 'border-slate-200 dark:border-[#27272A]'
                            )}
                        >
                          <div className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
                            {item.name}
                            {templates.defaultTemplateId === item.id && (
                              <span className="text-[9px] font-bold text-accent">默认</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">/{item.slashCommand}</div>
                        </button>
                      ))}
                    </div>
                    </div>

                    <div className="space-y-4">
                      {selectedTemplate ? (
                        <>
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">模板详情</h4>
                            <div className="flex items-center gap-3">
                              {templates.defaultTemplateId === selectedTemplate.id ? (
                                <button
                                  onClick={() => setDefaultTemplateId(null)}
                                  className="text-xs text-slate-500"
                                >
                                  取消默认
                                </button>
                              ) : (
                                <button
                                  onClick={() => setDefaultTemplateId(selectedTemplate.id)}
                                  className="text-xs text-accent"
                                >
                                  设为默认
                                </button>
                              )}
                              <button
                                onClick={() => removeTemplate(selectedTemplate.id)}
                                className="text-xs text-red-500 flex items-center gap-1"
                              >
                                <Trash2 size={12} /> 删除
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-slate-500">名称</label>
                              <input
                                value={selectedTemplate.name}
                                onChange={(e) => handleTemplatePatch({ name: e.target.value })}
                                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-500">/ 指令</label>
                              <input
                                value={selectedTemplate.slashCommand}
                                onChange={(e) => handleTemplatePatch({ slashCommand: e.target.value })}
                                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">标签（逗号分隔）</label>
                            <input
                              value={selectedTemplate.tags.join(',')}
                              onChange={(e) =>
                                handleTemplatePatch({
                                  tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean),
                                })
                              }
                              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">作用范围</label>
                            <div className="flex items-center gap-2 mt-1">
                              {['document', 'selection', 'none'].map((scope) => (
                                <button
                                  key={scope}
                                  onClick={() => handleTemplatePatch({ scope: scope as AITemplate['scope'] })}
                                  className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded-md border',
                                    selectedTemplate.scope === scope
                                      ? 'border-accent text-accent bg-accent-subtle'
                                      : 'border-slate-200 dark:border-[#27272A] text-slate-500'
                                  )}
                                >
                                  {scope === 'document' ? '全文' : scope === 'selection' ? '选中' : '关闭'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">指令内容</label>
                            <textarea
                              value={selectedTemplate.prompt}
                              onChange={(e) => handleTemplatePatch({ prompt: e.target.value })}
                              className="w-full min-h-[180px] px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                              placeholder="描述模板指令"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-slate-500">请选择一个模板进行编辑</div>
                      )}
                    </div>
                  </div>
                )}
                {activeTab === 'memory' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">记忆总开关</h4>
                        <p className="text-xs text-slate-500">记忆仅保存在本地，可随时清除</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={memory.enabled}
                        onChange={(e) => updateMemory({ enabled: e.target.checked })}
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">固定指令</label>
                        <input
                          type="checkbox"
                          checked={memory.fixedInstructionEnabled}
                          onChange={(e) => updateMemory({ fixedInstructionEnabled: e.target.checked })}
                        />
                      </div>
                      <textarea
                        value={memory.fixedInstruction}
                        onChange={(e) => updateMemory({ fixedInstruction: e.target.value })}
                        className="w-full min-h-[120px] bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm"
                        placeholder="例如：请用简洁、专业的风格回答"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">偏好记忆</label>
                        <input
                          type="checkbox"
                          checked={memory.preferencesEnabled}
                          onChange={(e) => updateMemory({ preferencesEnabled: e.target.checked })}
                        />
                      </div>
                      <div className="space-y-2">
                        {memory.preferences.map((item, index) => (
                          <div key={`${item}-${index}`} className="flex items-center gap-2">
                            <input
                              value={item}
                              onChange={(e) => {
                                const next = [...memory.preferences];
                                next[index] = e.target.value;
                                updateMemory({ preferences: next });
                              }}
                              className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                            />
                            <button
                              onClick={() => {
                                const next = memory.preferences.filter((_, i) => i !== index);
                                updateMemory({ preferences: next });
                              }}
                              className="text-xs text-red-500"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => updateMemory({ preferences: [...memory.preferences, ''] })}
                        className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-[#27272A] rounded-lg"
                      >
                        新增偏好
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">长期记忆摘要</label>
                        <span className="text-xs text-slate-400">自动生成，可手动编辑</span>
                      </div>
                      <textarea
                        value={memory.summary ?? ''}
                        onChange={(e) => updateMemory({ summary: e.target.value })}
                        className="w-full min-h-[120px] bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm"
                        placeholder="当上下文超过阈值时会自动生成摘要，用于长期记忆。"
                      />
                      <button
                        onClick={() => updateMemory({ summary: '' })}
                        className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-[#27272A] rounded-lg"
                      >
                        清空摘要
                      </button>
                    </div>
                    <button
                      onClick={() => updateMemory({ preferences: [], fixedInstruction: '', summary: '' })}
                      className="px-4 py-2 text-xs font-medium text-red-500 border border-red-200 rounded-lg"
                    >
                      清除记忆内容
                    </button>
                  </div>
                )}
                {activeTab === 'api' && (
                  <div className="space-y-6">
                    <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-800 dark:text-amber-200 text-sm">
                      <p className="font-bold mb-1">安全提示</p>
                      <p>API Key 仅存储在本地浏览器，请勿在公共设备使用。</p>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Base URL</label>
                      <input
                        value={baseUrlDraft}
                        onChange={(e) => setBaseUrlDraft(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                        placeholder="https://api.openai.com"
                      />
                      {!isValidBaseUrl(baseUrlDraft) && baseUrlDraft.trim() && (
                        <span className="text-xs text-amber-500">Base URL 格式不正确</span>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">API Key</label>
                      <div className="flex gap-2">
                        {editingApiKey ? (
                          <input
                            type="password"
                            value={apiKeyDraft}
                            onChange={(e) => setApiKeyDraft(e.target.value)}
                            className="flex-1 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                            placeholder="输入 API Key"
                          />
                        ) : (
                          <div className="flex-1 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-sm text-slate-500">
                            {apiKeyMasked || '未配置'}
                          </div>
                        )}
                        <button
                          onClick={() => {
                            if (editingApiKey) {
                              handleSaveProvider();
                            } else {
                              setEditingApiKey(true);
                            }
                          }}
                          className="px-4 py-2 bg-slate-200 dark:bg-[#27272A] text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-300 dark:hover:bg-[#3f3f46] transition-colors"
                        >
                          {editingApiKey ? '保存' : '编辑'}
                        </button>
                      </div>
                      {!isValidApiKey(apiKeyDraft) && apiKeyDraft.trim() && (
                        <span className="text-xs text-amber-500">API Key 长度不足</span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSaveProvider}
                        className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                      >
                        保存配置
                      </button>
                      <button
                        onClick={handleTestConnection}
                        className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-strong transition-colors"
                      >测试连接</button>
                    </div>

                    {connectionTest && (
                      <div className="flex items-center gap-2 text-sm">
                        {connectionTest.ok ? (
                          <CheckCircle2 size={14} className="text-emerald-500" />
                        ) : (
                          <AlertTriangle size={14} className="text-amber-500" />
                        )}
                        <span className="text-slate-700 dark:text-slate-300">{connectionTest.message}</span>
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-200 dark:border-[#27272A]">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">聊天偏好</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-slate-500">上下文范围</label>
                          <div className="flex items-center gap-2">
                            {['document', 'selection', 'none'].map((scope) => (
                              <button
                                key={scope}
                                onClick={() =>
                                  updateChatPreferences({ contextScope: scope as typeof chatPreferences.contextScope })
                                }
                                className={cn(
                                  'px-3 py-1.5 text-xs font-medium rounded-md border',
                                  chatPreferences.contextScope === scope
                                    ? 'border-accent text-accent bg-accent-subtle'
                                    : 'border-slate-200 dark:border-[#27272A] text-slate-500'
                                )}
                              >
                                {scope === 'document' ? '全文' : scope === 'selection' ? '选中' : '关闭'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500">上下文窗口（tokens）</label>
                            <input
                              type="number"
                              min={1000}
                              value={chatPreferences.contextWindowTokens}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                if (!Number.isFinite(next)) return;
                                updateChatPreferences({ contextWindowTokens: Math.max(1000, Math.floor(next)) });
                              }}
                              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-slate-500">阈值（%）</label>
                            <input
                              type="number"
                              min={50}
                              max={95}
                              value={Math.round(chatPreferences.contextWarnRatio * 100)}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                if (!Number.isFinite(next)) return;
                                const clamped = Math.min(Math.max(next, 50), 95);
                                updateChatPreferences({ contextWarnRatio: clamped / 100 });
                              }}
                              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">上下文自动摘要</p>
                            <p className="text-xs text-slate-500">达到阈值自动压缩上下文（含文档摘要）</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={chatPreferences.autoSummarize}
                            onChange={(e) => updateChatPreferences({ autoSummarize: e.target.checked })}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">历史检索（grep）</p>
                            <p className="text-xs text-slate-500">按关键词检索历史对话作为补充上下文</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={chatPreferences.historySearchEnabled}
                            onChange={(e) => updateChatPreferences({ historySearchEnabled: e.target.checked })}
                          />
                        </div>

                        {chatPreferences.historySearchEnabled && (
                          <div className="flex items-center gap-2">
                            {(['current', 'all'] as const).map((scope) => (
                              <button
                                key={scope}
                                onClick={() => updateChatPreferences({ historySearchScope: scope })}
                                className={cn(
                                  'px-3 py-1.5 text-xs font-medium rounded-md border',
                                  chatPreferences.historySearchScope === scope
                                    ? 'border-accent text-accent bg-accent-subtle'
                                    : 'border-slate-200 dark:border-[#27272A] text-slate-500'
                                )}
                              >
                                {scope === 'current' ? '当前文档' : '全部文档'}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">文档检索（工作区）</p>
                            <p className="text-xs text-slate-500">从其他 Markdown 文件提取相关片段</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={chatPreferences.docSearchEnabled}
                            onChange={(e) => updateChatPreferences({ docSearchEnabled: e.target.checked })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
