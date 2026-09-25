import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNativeClient } from './client';
import { isTauriRuntime } from './environment';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('./environment', () => ({
  isTauriRuntime: vi.fn(() => true),
}));

vi.mock('./invoke', () => ({
  getNativeInvoke: vi.fn(() => mockInvoke),
}));

describe('native client window controls', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauriRuntime).mockReturnValue(true);
  });

  it('routes desktop window controls through native commands and no-ops in browser runtime', async () => {
    const client = createNativeClient();

    await client.minimizeWindow();
    await client.toggleMaximizeWindow();
    await client.closeWindow();
    await client.startWindowDrag();

    expect(mockInvoke).toHaveBeenCalledWith('app_window_minimize');
    expect(mockInvoke).toHaveBeenCalledWith('app_window_toggle_maximize');
    expect(mockInvoke).toHaveBeenCalledWith('app_window_close');
    expect(mockInvoke).toHaveBeenCalledWith('app_window_start_dragging');

    vi.clearAllMocks();
    vi.mocked(isTauriRuntime).mockReturnValue(false);

    await client.minimizeWindow();
    await client.toggleMaximizeWindow();
    await client.closeWindow();
    await client.startWindowDrag();

    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
