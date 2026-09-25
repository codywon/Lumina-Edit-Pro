import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CHAT_PREFERENCES,
  DEFAULT_MEMORY_STATE,
  DEFAULT_PROVIDER_SETTINGS,
  DEFAULT_TEMPLATES,
  DEFAULT_TEMPLATES_STATE,
} from '../lib/ai/defaults';
import type {
  AIChatHistory,
  AIChatPreferences,
  AIConnectionTest,
  AIContextValue,
  AIMemoryState,
  AIProviderSettings,
  AITemplate,
  AITemplatesState,
  AIMessage,
} from '../lib/ai/types';
import {
  loadChatHistoryFromLocalStorage,
  loadChatHistoryFromPersistentStore,
  persistChatHistoryToPersistentStore,
} from '../lib/ai/chatHistoryStore';

const STORAGE_KEYS = {
  provider: 'ai-settings',
  chatPreferences: 'ai-chat-preferences',
  templates: 'ai-templates',
  memory: 'ai-memory',
  chatHistory: 'ai-chat-history',
  connectionTest: 'ai-connection-test',
};

function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function loadTemplatesState(fallback: AITemplatesState): AITemplatesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.templates);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as AITemplatesState;
    const templates = parsed.templates?.length ? parsed.templates : fallback.templates;
    const hasCorrupted = templates.some((item) => {
      const joinedTags = Array.isArray(item.tags) ? item.tags.join(',') : '';
      return [item.name, item.prompt, item.slashCommand, joinedTags].some(
        (value) => typeof value === 'string' && value.includes('�')
      );
    });
    if (hasCorrupted) {
      return fallback;
    }
    const existingIds = new Set(templates.map((item) => item.id));
    const existingCommands = new Set(
      templates
        .map((item) => item.slashCommand?.toLowerCase().trim())
        .filter((value): value is string => Boolean(value))
    );
    const existingNames = new Set(
      templates
        .map((item) => item.name?.toLowerCase().trim())
        .filter((value): value is string => Boolean(value))
    );
    const merged = [...templates];
    for (const builtIn of DEFAULT_TEMPLATES) {
      const command = builtIn.slashCommand?.toLowerCase().trim();
      const name = builtIn.name?.toLowerCase().trim();
      if (existingIds.has(builtIn.id)) continue;
      if (command && existingCommands.has(command)) continue;
      if (name && existingNames.has(name)) continue;
      merged.push(builtIn);
    }
    const recent = (parsed.recent ?? []).filter((id) => merged.some((item) => item.id === id));
    const desiredDefault = parsed.defaultTemplateId ?? fallback.defaultTemplateId ?? null;
    const defaultTemplateId = desiredDefault && merged.some((item) => item.id === desiredDefault)
      ? desiredDefault
      : fallback.defaultTemplateId ?? null;
    return {
      templates: merged,
      recent,
      defaultTemplateId,
    };
  } catch {
    return fallback;
  }
}

function persistState<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
}

function chooseRicherMessages(current: AIMessage[] = [], stored: AIMessage[] = []) {
  if (stored.length > current.length) {
    return stored;
  }
  if (current.length > stored.length) {
    return current;
  }

  const currentSize = current.reduce((sum, item) => sum + item.content.length, 0);
  const storedSize = stored.reduce((sum, item) => sum + item.content.length, 0);
  return storedSize > currentSize ? stored : current;
}

function mergeChatHistory(current: AIChatHistory, stored: AIChatHistory): AIChatHistory {
  const keys = new Set([...Object.keys(current), ...Object.keys(stored)]);
  const next: AIChatHistory = {};

  for (const key of keys) {
    next[key] = chooseRicherMessages(current[key], stored[key]);
  }

  return next;
}

const AIContext = createContext<AIContextValue | undefined>(undefined);

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider] = useState<AIProviderSettings>(() =>
    loadState(STORAGE_KEYS.provider, DEFAULT_PROVIDER_SETTINGS)
  );
  const [chatPreferences, setChatPreferences] = useState<AIChatPreferences>(() =>
    loadState(STORAGE_KEYS.chatPreferences, DEFAULT_CHAT_PREFERENCES)
  );
  const [templates, setTemplates] = useState<AITemplatesState>(() =>
    loadTemplatesState(DEFAULT_TEMPLATES_STATE)
  );
  const [memory, setMemory] = useState<AIMemoryState>(() =>
    loadState(STORAGE_KEYS.memory, DEFAULT_MEMORY_STATE)
  );
  const [chatHistory, setChatHistory] = useState<AIChatHistory>(() =>
    loadChatHistoryFromLocalStorage(STORAGE_KEYS.chatHistory)
  );
  const [chatHistoryHydrated, setChatHistoryHydrated] = useState(false);
  const [connectionTest, setConnectionTest] = useState<AIConnectionTest | null>(() =>
    loadState(STORAGE_KEYS.connectionTest, null)
  );

  useEffect(() => {
    persistState(STORAGE_KEYS.provider, provider);
  }, [provider]);

  useEffect(() => {
    persistState(STORAGE_KEYS.chatPreferences, chatPreferences);
  }, [chatPreferences]);

  useEffect(() => {
    persistState(STORAGE_KEYS.templates, templates);
  }, [templates]);

  useEffect(() => {
    persistState(STORAGE_KEYS.memory, memory);
  }, [memory]);

  useEffect(() => {
    let cancelled = false;

    loadChatHistoryFromPersistentStore(STORAGE_KEYS.chatHistory).then((storedHistory) => {
      if (cancelled) {
        return;
      }

      setChatHistory((currentHistory) => mergeChatHistory(currentHistory, storedHistory));
      setChatHistoryHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chatHistoryHydrated) {
      return;
    }

    void persistChatHistoryToPersistentStore(STORAGE_KEYS.chatHistory, chatHistory);
  }, [chatHistory, chatHistoryHydrated]);

  useEffect(() => {
    if (connectionTest) {
      persistState(STORAGE_KEYS.connectionTest, connectionTest);
    }
  }, [connectionTest]);

  const updateProvider = (patch: Partial<AIProviderSettings>) => {
    setProvider((prev) => ({ ...prev, ...patch }));
  };

  const updateChatPreferences = (patch: Partial<AIChatPreferences>) => {
    setChatPreferences((prev) => ({ ...prev, ...patch }));
  };

  const updateTemplates = (next: AITemplate[]) => {
    setTemplates((prev) => ({ ...prev, templates: next }));
  };

  const resetTemplates = () => {
    setTemplates(DEFAULT_TEMPLATES_STATE);
  };

  const setDefaultTemplateId = (templateId: string | null) => {
    setTemplates((prev) => ({ ...prev, defaultTemplateId: templateId }));
  };

  const updateTemplate = (template: AITemplate) => {
    setTemplates((prev) => {
      const exists = prev.templates.some((item) => item.id === template.id);
      const nextTemplates = exists
        ? prev.templates.map((item) => (item.id === template.id ? template : item))
        : [template, ...prev.templates];
      return { ...prev, templates: nextTemplates };
    });
  };

  const removeTemplate = (id: string) => {
    setTemplates((prev) => ({
      ...prev,
      templates: prev.templates.filter((item) => item.id !== id),
      recent: prev.recent.filter((item) => item !== id),
    }));
  };

  const markTemplateUsed = (id: string) => {
    setTemplates((prev) => ({
      ...prev,
      recent: [id, ...prev.recent.filter((item) => item !== id)].slice(0, 10),
    }));
  };

  const updateMemory = (patch: Partial<AIMemoryState>) => {
    setMemory((prev) => ({ ...prev, ...patch }));
  };

  const setChatHistoryForDoc = (docId: string, messages: AIMessage[]) => {
    setChatHistory((prev) => ({ ...prev, [docId]: messages }));
  };

  const clearChatHistory = (docId?: string) => {
    if (!docId) {
      setChatHistory({});
      return;
    }
    setChatHistory((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const value = useMemo<AIContextValue>(
    () => ({
      provider,
      chatPreferences,
      templates,
      memory,
      chatHistory,
      connectionTest,
      updateProvider,
      updateChatPreferences,
      updateTemplates,
      resetTemplates,
      setDefaultTemplateId,
      updateTemplate,
      removeTemplate,
      markTemplateUsed,
      updateMemory,
      setChatHistoryForDoc,
      clearChatHistory,
      setConnectionTest,
    }),
    [provider, chatPreferences, templates, memory, chatHistory, connectionTest]
  );

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within AIProvider');
  }
  return context;
}
