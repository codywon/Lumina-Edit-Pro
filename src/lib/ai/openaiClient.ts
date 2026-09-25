import type { AIModel } from './types';
import { normalizeBaseUrl } from './validation';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type ChatRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  signal?: AbortSignal;
  temperature?: number;
};

type StreamHandlers = {
  onDelta?: (delta: string) => void;
  onFallback?: () => void;
};

type ImageGenerationRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  signal?: AbortSignal;
};

export type AIErrorType = 'auth' | 'network' | 'invalid_request' | 'rate_limit' | 'server' | 'stream' | 'unknown';

export class AIClientError extends Error {
  type: AIErrorType;
  status?: number;
  detail?: string;

  constructor(type: AIErrorType, message: string, status?: number, detail?: string) {
    super(message);
    this.name = 'AIClientError';
    this.type = type;
    this.status = status;
    this.detail = detail;
  }
}

function buildHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function buildUrl(baseUrl: string, path: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return `${normalized}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseErrorResponse(response: Response) {
  try {
    const data = await response.json();
    const message = data?.error?.message || data?.message || response.statusText;
    return { message, detail: JSON.stringify(data) };
  } catch {
    return { message: response.statusText, detail: undefined };
  }
}

function mapStatusToType(status: number): AIErrorType {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 400 && status < 500) return 'invalid_request';
  if (status >= 500) return 'server';
  return 'unknown';
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const { message, detail } = await parseErrorResponse(response);
    throw new AIClientError(mapStatusToType(response.status), message, response.status, detail);
  }
}

export async function listModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<AIModel[]> {
  const response = await fetch(buildUrl(baseUrl, '/v1/models'), {
    method: 'GET',
    headers: buildHeaders(apiKey),
    signal,
  });

  await handleResponse(response);
  const payload = await response.json();
  const models = Array.isArray(payload?.data) ? payload.data : [];
  return models
    .map((item: any) => ({ id: String(item?.id ?? '') }))
    .filter((item: AIModel) => item.id);
}

async function streamChatCompletion(request: ChatRequest, handlers: StreamHandlers) {
  const response = await fetch(buildUrl(request.baseUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers: buildHeaders(request.apiKey),
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
      temperature: request.temperature ?? 0.7,
    }),
    signal: request.signal,
  });

  await handleResponse(response);
  if (!response.body) {
    throw new AIClientError('stream', '流式响应没有返回内容');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.replace(/^data:\s*/, '');
          if (data === '[DONE]') {
            return fullText;
          }
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullText += delta;
              handlers.onDelta?.(delta);
            }
          } catch {
            throw new AIClientError('stream', '流式数据解析失败');
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof AIClientError) {
      throw err;
    }
    if ((err as Error).name === 'AbortError') {
      throw err;
    }
    throw new AIClientError('stream', '流式传输异常', undefined, (err as Error).message);
  }

  return fullText;
}

export async function createChatCompletion(
  request: ChatRequest,
  handlers: StreamHandlers = {}
): Promise<{ content: string; usedStream: boolean; usedFallback: boolean }> {
  if (request.stream) {
    try {
      const content = await streamChatCompletion(request, handlers);
      return { content, usedStream: true, usedFallback: false };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw err;
      }
      handlers.onFallback?.();
      const fallback = await createChatCompletion({ ...request, stream: false }, {});
      return { ...fallback, usedStream: false, usedFallback: true };
    }
  }

  const response = await fetch(buildUrl(request.baseUrl, '/v1/chat/completions'), {
    method: 'POST',
    headers: buildHeaders(request.apiKey),
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: false,
      temperature: request.temperature ?? 0.7,
    }),
    signal: request.signal,
  });

  await handleResponse(response);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content ?? '';
  return { content, usedStream: false, usedFallback: false };
}

async function createImageGenerationOnce(request: ImageGenerationRequest): Promise<string> {
  let response: Response;
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    n: 1,
  };
  if (request.size) {
    body.size = request.size;
  }
  if (request.quality) {
    body.quality = request.quality;
  }

  try {
    response = await fetch(buildUrl(request.baseUrl, '/v1/images/generations'), {
      method: 'POST',
      headers: buildHeaders(request.apiKey),
      body: JSON.stringify(body),
      signal: request.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error;
    }
    throw new AIClientError('network', '图片生成网络连接失败', undefined, (error as Error).message);
  }

  await handleResponse(response);
  const payload = await response.json();
  const item = Array.isArray(payload?.data) ? payload.data[0] : null;
  const b64 = item?.b64_json;
  if (typeof b64 === 'string' && b64.length > 0) {
    return `data:image/png;base64,${b64}`;
  }

  const url = item?.url;
  if (typeof url === 'string' && url.length > 0) {
    return url;
  }

  throw new AIClientError('server', '图片生成接口未返回图片内容', response.status, JSON.stringify(payload));
}

function shouldRetryImageGeneration(error: unknown) {
  if ((error as Error | undefined)?.name === 'AbortError') {
    return false;
  }
  if (!(error instanceof AIClientError)) {
    return true;
  }
  return error.type === 'network' || error.type === 'server' || error.type === 'stream' || error.type === 'unknown';
}

export async function createImageGeneration(
  request: ImageGenerationRequest
): Promise<{ imageMarkdown: string; dataUrl: string }> {
  try {
    const imageUrl = await createImageGenerationOnce(request);
    return {
      imageMarkdown: `![AI 生成图片](${imageUrl})`,
      dataUrl: imageUrl,
    };
  } catch (error) {
    if (!shouldRetryImageGeneration(error)) {
      throw error;
    }

    const imageUrl = await createImageGenerationOnce(request);
    return {
      imageMarkdown: `![AI 生成图片](${imageUrl})`,
      dataUrl: imageUrl,
    };
  }
}

export function normalizeError(err: unknown) {
  if (err instanceof AIClientError) {
    return err;
  }
  if (err && typeof err === 'object' && (err as Error).name === 'AbortError') {
    return new AIClientError('stream', '已停止生成');
  }
  return new AIClientError('network', '网络请求失败');
}
