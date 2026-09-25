import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Moon, Sun, MonitorSmartphone, Type, FileText, Sliders, Keyboard } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { cn } from '../lib/utils';
import { THEME_COLORS } from '../lib/themeColors';
import { DEFAULT_SHORTCUTS, SHORTCUT_GROUPS } from '../lib/shortcuts';
import { openNativeDefaultAppsSettings, setNativeAsDefaultEditor } from '../services/native';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = React.useState('appearance');
  const [defaultEditorNotice, setDefaultEditorNotice] = React.useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [isRegisteringDefault, setIsRegisteringDefault] = React.useState(false);

  const handleSetAsDefaultEditor = async () => {
    setIsRegisteringDefault(true);
    setDefaultEditorNotice(null);
    try {
      const res = await setNativeAsDefaultEditor();
      setDefaultEditorNotice({
        type: res.success ? 'info' : 'error',
        text: res.message,
      });
    } catch (e: any) {
      setDefaultEditorNotice({
        type: 'error',
        text: e?.message || '设置默认编辑器失败',
      });
    } finally {
      setIsRegisteringDefault(false);
    }
  };

  const tabs = [
    { id: 'appearance', label: '外观', icon: Monitor },
    { id: 'editor', label: '编辑器', icon: Type },
    { id: 'files', label: '文件与链接', icon: FileText },
    { id: 'features', label: '功能', icon: Sliders },
    { id: 'shortcuts', label: '快捷键', icon: Keyboard },
  ];

  const normalizeHexColor = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return `#${hex.toLowerCase()}`;
  };

  const customColorValue = normalizeHexColor(settings.customThemeColor) ?? '#ec5b13';
  const handleCustomColorChange = (value: string) => {
    updateSettings({ themeColor: 'custom', customThemeColor: value });
  };

  const themeColorOptions = [
    THEME_COLORS.orange,
    THEME_COLORS.blue,
    THEME_COLORS.green,
    THEME_COLORS.teal,
    THEME_COLORS.purple,
    THEME_COLORS.graphite,
    THEME_COLORS.sakura,
  ];

  const Toggle = ({ checked, onChange, label, description }: { checked: boolean; onChange: (val: boolean) => void; label: string; description?: string }) => (
    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-[#27272A] transition-colors duration-200">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
          checked ? "bg-accent" : "bg-slate-200 dark:bg-[#27272A]"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );

  const Select = ({ value, onChange, options, label, description }: { value: string | number; onChange: (val: any) => void; options: { label: string; value: any }[]; label: string; description?: string }) => (
    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-[#27272A] transition-colors duration-200">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus-border-accent focus:ring-1 ring-accent transition-colors duration-200"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  const Slider = ({ value, onChange, min, max, step, label, description, unit = '' }: { value: number; onChange: (val: number) => void; min: number; max: number; step: number; label: string; description?: string; unit?: string }) => (
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-slate-200 dark:border-[#27272A] transition-colors duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
          {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
        </div>
        <span className="text-xs font-mono text-accent bg-accent-soft px-2 py-1 rounded">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ accentColor: 'var(--accent)' }}
        className="w-full h-1.5 bg-slate-200 dark:bg-[#27272A] rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );

  const TextInput = ({ value, onChange, label, description, placeholder }: { value: string; onChange: (val: string) => void; label: string; description?: string; placeholder?: string }) => (
    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-[#27272A] transition-colors duration-200">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-56 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus-border-accent focus:ring-1 ring-accent transition-colors duration-200"
      />
    </div>
  );

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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-white dark:bg-[#0E0E11] border border-slate-200 dark:border-[#27272A] rounded-2xl shadow-2xl z-50 flex overflow-hidden transition-colors duration-200"
          >
            <div className="w-48 shrink-0 bg-slate-50 dark:bg-[#18181B] border-r border-slate-200 dark:border-[#27272A] p-4 flex flex-col transition-colors duration-200">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">设置</h2>
              <nav className="flex-1 space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                      activeTab === tab.id
                        ? "bg-slate-200 dark:bg-[#27272A] text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272A]/50 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </nav>
              <button
                onClick={resetSettings}
                className="mt-auto flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-500 transition-colors"
              >
                恢复默认设置
              </button>
            </div>

            <div className="flex-1 flex flex-col bg-white dark:bg-[#0E0E11] transition-colors duration-200">
              <div className="h-14 flex items-center justify-between px-6 border-b border-slate-200 dark:border-[#27272A] transition-colors duration-200">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h3>
                <button
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-[#27272A]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {activeTab === 'appearance' && (
                  <div className="space-y-8">
                    <section>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">主题模式</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <button
                          onClick={() => setTheme('light')}
                          className={cn(
                            "flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all",
                            theme === 'light'
                              ? "border-accent bg-accent-subtle"
                              : "border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-slate-600"
                          )}
                        >
                          <div className="w-full h-20 bg-slate-100 rounded-md border border-slate-200 flex items-center justify-center">
                            <Sun size={24} className="text-amber-500" />
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">浅色</span>
                        </button>
                        <button
                          onClick={() => setTheme('dark')}
                          className={cn(
                            "flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all",
                            theme === 'dark'
                              ? "border-accent bg-accent-subtle"
                              : "border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-slate-600"
                          )}
                        >
                          <div className="w-full h-20 bg-[#0E0E11] rounded-md border border-[#27272A] flex items-center justify-center">
                            <Moon size={24} className="text-indigo-400" />
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">深色</span>
                        </button>
                        <button
                          onClick={() => setTheme('system')}
                          className={cn(
                            "flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all",
                            theme === 'system'
                              ? "border-accent bg-accent-subtle"
                              : "border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-slate-600"
                          )}
                        >
                          <div className="w-full h-20 rounded-md border border-slate-200 dark:border-[#27272A] bg-slate-100/80 dark:bg-[#141419] overflow-hidden relative">
                            <div className="absolute inset-0 flex items-center justify-center gap-2">
                              <div className="h-12 w-16 rounded-md bg-white border border-slate-200 shadow-sm flex flex-col">
                                <div className="h-2 bg-accent rounded-t-md" />
                                <div className="flex-1 px-2 py-1">
                                  <div className="h-1.5 bg-slate-200 rounded" />
                                  <div className="mt-1 h-1.5 bg-slate-100 rounded" />
                                </div>
                              </div>
                              <div className="h-12 w-16 rounded-md bg-[#0E0E11] border border-[#27272A] shadow-sm flex flex-col -ml-4 translate-y-2">
                                <div className="h-2 bg-accent rounded-t-md" />
                                <div className="flex-1 px-2 py-1">
                                  <div className="h-1.5 bg-[#27272A] rounded" />
                                  <div className="mt-1 h-1.5 bg-[#1f1f25] rounded" />
                                </div>
                              </div>
                            </div>
                            <div className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-soft text-accent font-medium">
                              AUTO
                            </div>
                          </div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">跟随系统</span>
                        </button>
                      </div>
                    </section>

                    <section>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">主题色</h4>
                      <div className="grid grid-cols-4 gap-3">
                        {themeColorOptions.map((color) => (
                          <button
                            key={color.id}
                            onClick={() => updateSettings({ themeColor: color.id })}
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                              settings.themeColor === color.id
                                ? "border-accent bg-accent-subtle"
                                : "border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-slate-600"
                            )}
                          >
                            <span
                              className="size-5 rounded-full border border-slate-200 dark:border-[#27272A] shadow-sm"
                              style={{ backgroundColor: color.hex }}
                            />
                            <span className="text-[11px] text-slate-600 dark:text-slate-400">{color.label}</span>
                          </button>
                        ))}
                        <button
                          onClick={() => updateSettings({ themeColor: 'custom' })}
                          className={cn(
                            "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                            settings.themeColor === 'custom'
                              ? "border-accent bg-accent-subtle"
                              : "border-slate-200 dark:border-[#27272A] hover:border-slate-300 dark:hover:border-slate-600"
                          )}
                        >
                          <span
                            className="size-5 rounded-full border border-slate-200 dark:border-[#27272A] shadow-sm"
                            style={{ backgroundColor: customColorValue }}
                          />
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">自定义</span>
                        </button>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <label className="text-xs text-slate-500">自定义颜色</label>
                        <input
                          type="color"
                          value={customColorValue}
                          onChange={(event) => handleCustomColorChange(event.target.value)}
                          className="size-9 rounded-md border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B]"
                        />
                        <input
                          type="text"
                          value={settings.customThemeColor}
                          onChange={(event) => handleCustomColorChange(event.target.value)}
                          placeholder="#RRGGBB"
                          className="w-28 rounded-md border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#18181B] px-2 py-1 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus-border-accent focus:ring-1 ring-accent outline-none"
                        />
                        <span className="text-[11px] text-slate-400">选择或输入 6 位十六进制</span>
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">界面</h4>
                      <Select
                        label="界面字体"
                        description="用于标题和菜单"
                        value={settings.uiFont}
                        onChange={(val) => updateSettings({ uiFont: val })}
                        options={[
                          { label: 'Inter (默认)', value: 'Inter' },
                          { label: 'System UI', value: 'system-ui' },
                          { label: 'Roboto', value: 'Roboto' },
                        ]}
                      />
                      <Select
                        label="界面密度"
                        description="空间与字体紧凑度"
                        value={settings.uiDensity}
                        onChange={(val) => updateSettings({ uiDensity: val })}
                        options={[
                          { label: '舒适(推荐)', value: 'comfortable' },
                          { label: '紧凑', value: 'compact' },
                        ]}
                      />
                    </section>
                  </div>
                )}

                {activeTab === 'editor' && (
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">排版</h4>
                      <Select
                        label="正文字体"
                        value={settings.fontFamily}
                        onChange={(val) => updateSettings({ fontFamily: val })}
                        options={[
                          { label: '现代黑体 (推荐 / 系统无衬线)', value: 'Inter' },
                          { label: 'JetBrains Mono (极客等宽)', value: 'JetBrains Mono' },
                          { label: '思源宋体 / Noto Serif (典雅书卷)', value: 'Noto Serif SC' },
                          { label: 'Georgia (经典西文衬线)', value: 'Georgia' },
                        ]}
                      />
                      <Slider
                        label="字号"
                        min={12}
                        max={24}
                        step={1}
                        unit="px"
                        value={settings.fontSize}
                        onChange={(val) => updateSettings({ fontSize: val })}
                      />
                      <Slider
                        label="行高"
                        min={1.3}
                        max={2.4}
                        step={0.05}
                        value={settings.lineHeight}
                        onChange={(val) => updateSettings({ lineHeight: val })}
                      />
                      <Slider
                        label="段间距"
                        min={0.2}
                        max={1.5}
                        step={0.05}
                        unit="em"
                        value={settings.paragraphSpacing ?? 0.6}
                        onChange={(val) => updateSettings({ paragraphSpacing: val })}
                      />
                    </section>

                    <section className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">编辑体验</h4>
                      <Toggle
                        label="打字机模式"
                        description="光标始终居中"
                        checked={settings.typewriterMode}
                        onChange={(val) => updateSettings({ typewriterMode: val })}
                      />
                      <Toggle
                        label="专注模式"
                        description="隐藏外围面板，聚焦正文"
                        checked={settings.focusMode}
                        onChange={(val) => updateSettings({ focusMode: val })}
                      />
                    </section>
                  </div>
                )}

                {activeTab === 'files' && (
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">保存</h4>
                      <Toggle
                        label="编辑后自动保存"
                        description="默认关闭。开启后仅在文档有实际变动且停止输入后才触发保存；无变动绝不执行保存动作"
                        checked={settings.autoSave}
                        onChange={(val) => updateSettings({ autoSave: val })}
                      />
                      {settings.autoSave && (
                        <Select
                          label="自动保存静止等待时长"
                          description="文档停止修改后等待的时间（最少 3 秒）"
                          value={String(settings.autoSaveInterval || 3)}
                          onChange={(val) => updateSettings({ autoSaveInterval: Number(val) })}
                          options={[
                            { label: '3 秒 (推荐)', value: '3' },
                            { label: '5 秒', value: '5' },
                            { label: '10 秒', value: '10' },
                            { label: '30 秒', value: '30' },
                          ]}
                        />
                      )}
                      <Select
                        label="默认导出格式"
                        value={settings.defaultFormat}
                        onChange={(val) => updateSettings({ defaultFormat: val })}
                        options={[
                          { label: 'Markdown (.md)', value: 'md' },
                          { label: 'HTML (.html)', value: 'html' },
                        ]}
                      />
                    </section>

                    <section className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">图片</h4>
                      <Select
                        label="图片保存位置"
                        description="文件夹/同名资源目录"
                        value={settings.imageStorageMode}
                        onChange={(val) => updateSettings({ imageStorageMode: val })}
                        options={[
                          { label: '${filename}.assets (推荐)', value: 'filename-assets' },
                          { label: 'assets/ (共享)', value: 'shared-assets' },
                          { label: '自定义路径', value: 'custom' },
                        ]}
                      />
                      {settings.imageStorageMode === 'custom' && (
                        <TextInput
                          label="自定义路径"
                          description="支持 ${filename} 占位"
                          value={settings.imageStoragePath}
                          onChange={(val) => updateSettings({ imageStoragePath: val })}
                          placeholder="例: assets 或 ${filename}.assets"
                        />
                      )}
                    </section>

                    <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-[#27272A]">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">系统文件关联</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          将 Lumina Edit Pro 设为系统默认的 Markdown 写作与浏览工具
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={handleSetAsDefaultEditor}
                          disabled={isRegisteringDefault}
                          className="px-3.5 py-2 bg-accent hover:bg-accent-strong text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <FileText size={14} />
                          {isRegisteringDefault ? '正在注册...' : '一键设为默认 Markdown 编辑器'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void openNativeDefaultAppsSettings()}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#27272A] dark:hover:bg-[#333338] text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 transition-colors"
                        >
                          打开 Windows 默认应用设置
                        </button>
                      </div>

                      {defaultEditorNotice && (
                        <div
                          className={cn(
                            'p-3 rounded-lg text-xs leading-relaxed border',
                            defaultEditorNotice.type === 'info'
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40'
                          )}
                        >
                          {defaultEditorNotice.text}
                        </div>
                      )}

                      <div className="rounded-lg bg-slate-50 dark:bg-[#18181B] p-3 border border-slate-200/80 dark:border-white/5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 space-y-1">
                        <div className="font-semibold text-slate-600 dark:text-slate-300">💡 提示：</div>
                        <div>1. 点击“一键设为默认”将自动向 Windows 注册表写入 .md / .markdown 文件类型识别。</div>
                        <div>2. 如需固定双击打开：在任意 .md 文件上<b>右键 &gt; 打开方式 &gt; 选择其他应用</b>，选择 Lumina Edit Pro 并勾选“始终使用此应用打开”。</div>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === 'features' && (
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">智能功能</h4>
                      <Toggle
                        label="启用 AI 助手"
                        description="开启侧边栏 AI 聊天与行内 AI 补全"
                        checked={settings.enableAI}
                        onChange={(val) => updateSettings({ enableAI: val })}
                      />
                      <Toggle
                        label="拼写检查"
                        description="自动标记可能的拼写错误"
                        checked={settings.spellCheck}
                        onChange={(val) => updateSettings({ spellCheck: val })}
                      />
                    </section>
                  </div>
                )}

                {activeTab === 'shortcuts' && (
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">快捷键配置</h4>
                          <p className="text-xs text-slate-500 mt-1">默认快捷键对标 Typora，可按需修改。留空表示禁用。</p>
                        </div>
                        <button
                          onClick={() => updateSettings({ shortcuts: DEFAULT_SHORTCUTS })}
                          className="text-xs font-medium text-slate-500 hover:text-accent transition-colors"
                        >
                          恢复 Typora 默认
                        </button>
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-[#27272A] p-3 text-xs text-slate-500 bg-slate-50 dark:bg-[#18181B]">
                        提示：部分浏览器快捷键（如 Ctrl+1～6、Ctrl+0）可能被系统占用，无法被网页拦截。
                      </div>
                    </section>

                    {SHORTCUT_GROUPS.map((group) => (
                      <section key={group.id} className="space-y-3">
                        <h5 className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</h5>
                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-[#27272A] bg-white dark:bg-[#0E0E11]"
                            >
                              <div>
                                <p className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</p>
                                <p className="text-xs text-slate-500 mt-1">默认：{item.defaultShortcut}</p>
                              </div>
                              <input
                                type="text"
                                value={settings.shortcuts[item.id] ?? ''}
                                onChange={(event) =>
                                  updateSettings({
                                    shortcuts: {
                                      ...settings.shortcuts,
                                      [item.id]: event.target.value,
                                    },
                                  })
                                }
                                placeholder={item.defaultShortcut}
                                className="w-40 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white outline-none focus-border-accent focus:ring-1 ring-accent transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
