export type NativeInvoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

type TauriInternals = {
  invoke?: NativeInvoke;
};

export function getNativeInvoke(): NativeInvoke {
  const internals = (window as typeof window & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (typeof internals?.invoke !== 'function') {
    throw new Error('Tauri native invoke bridge is not available');
  }

  return internals.invoke;
}
