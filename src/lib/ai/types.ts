export type AIModelSource = 'remote' | 'local';
export type AIContextScope = 'document' | 'selection' | 'none';
export type AIHistorySearchScope = 'current' | 'all';
export type AIChatSessionScope = 'document' | 'global';
export type AIImageSize =
  | 'auto'
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | '2048x2048'
  | '2048x1152'
  | '1152x2048'
  | '3840x2160'
  | '2160x3840';
export type AIImageQuality = 'auto' | 'low' | 'medium' | 'high';

export interface AIModel {
  id: string;
  label?: string;
  description?: string;
}

export interface AIProviderSettings {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  imageModel: string;
  imageSize: AIImageSize;
  imageQuality: AIImageQuality;
  modelSource: AIModelSource;
  models: AIModel[];
  modelContextWindows: Record<string, number>;
}

export interface AIChatPreferences {
  contextScope: AIContextScope;
  sessionScope: AIChatSessionScope;
  useMemory: boolean;
  stream: boolean;
  autoSummarize: boolean;
  historySearchEnabled: boolean;
  historySearchScope: AIHistorySearchScope;
  contextWindowTokens: number;
  contextWarnRatio: number;
  docSearchEnabled: boolean;
}

export interface AITemplate {
  id: string;
  name: string;
  tags: string[];
  prompt: string;
  scope: AIContextScope;
  slashCommand: string;
  builtIn?: boolean;
  updatedAt: string;
}

export interface AITemplatesState {
  templates: AITemplate[];
  recent: string[];
  defaultTemplateId?: string | null;
}

export interface AIMemoryState {
  enabled: boolean;
  fixedInstructionEnabled: boolean;
  fixedInstruction: string;
  preferencesEnabled: boolean;
  preferences: string[];
  summary?: string;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  error?: string;
}

export type AIChatHistory = Record<string, AIMessage[]>;

export interface AIConnectionTest {
  ok: boolean;
  message: string;
  at: string;
}

export interface AIContextValue {
  provider: AIProviderSettings;
  chatPreferences: AIChatPreferences;
  templates: AITemplatesState;
  memory: AIMemoryState;
  chatHistory: AIChatHistory;
  connectionTest: AIConnectionTest | null;
  updateProvider: (patch: Partial<AIProviderSettings>) => void;
  updateChatPreferences: (patch: Partial<AIChatPreferences>) => void;
  updateTemplates: (templates: AITemplate[]) => void;
  resetTemplates: () => void;
  setDefaultTemplateId: (templateId: string | null) => void;
  updateTemplate: (template: AITemplate) => void;
  removeTemplate: (id: string) => void;
  markTemplateUsed: (id: string) => void;
  updateMemory: (patch: Partial<AIMemoryState>) => void;
  setChatHistoryForDoc: (docId: string, messages: AIMessage[]) => void;
  clearChatHistory: (docId?: string) => void;
  setConnectionTest: (test: AIConnectionTest | null) => void;
}
