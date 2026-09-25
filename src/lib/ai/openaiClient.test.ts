import { afterEach, describe, expect, it, vi } from 'vitest';

import { createImageGeneration } from './openaiClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createImageGeneration', () => {
  it('requests base64 image output and returns a data url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'abc123' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createImageGeneration({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-test',
      model: 'gpt-image-2',
      prompt: '生成一张总结图',
      size: '1024x1024',
    });

    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,abc123',
      imageMarkdown: '![AI 生成图片](data:image/png;base64,abc123)',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: '生成一张总结图',
          n: 1,
          size: '1024x1024',
        }),
      })
    );
  });
});
