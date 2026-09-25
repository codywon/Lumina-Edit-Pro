import { describe, expect, it } from 'vitest';
import { isTauriRuntime } from './environment';

describe('isTauriRuntime', () => {
  it('returns false in the jsdom test environment', () => {
    expect(isTauriRuntime()).toBe(false);
  });
});
