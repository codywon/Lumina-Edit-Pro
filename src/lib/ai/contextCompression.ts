import { createChatCompletion } from './openaiClient';

const SUMMARY_MAX_CHARS = 800;

interface SummaryRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  signal?: AbortSignal;
}

export async function summarizeContextWithModel(request: SummaryRequest) {
  const trimmed = request.text.trim();
  if (!trimmed) return '';

  const result = await createChatCompletion({
    baseUrl: request.baseUrl,
    apiKey: request.apiKey,
    model: request.model,
    stream: false,
    temperature: 0.2,
    signal: request.signal,
    messages: [
      {
        role: 'system',
        content:
          '你是上下文压缩助手。请提取关键约束、偏好、已确认事实、术语定义与必要背景，保持条理清晰。',
      },
      {
        role: 'user',
        content:
          '请将以下内容压缩为可直接用于后续对话的摘要，避免冗余，尽量短但不丢失关键细节：\n' +
          trimmed,
      },
    ],
  });

  const content = result.content?.trim() ?? '';
  if (!content) return '';
  return content.length > SUMMARY_MAX_CHARS ? content.slice(0, SUMMARY_MAX_CHARS) : content;
}
