// Types du serveur embarqué (module virtuel construit par vite.backend.ts).
declare module 'virtual:pecule-backend' {
  const backend: {
    handle(request: { method: string; url: string; headers?: Record<string, string>; body?: unknown }):
      Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
    serialize(): Uint8Array;
    takeDirty(): boolean;
    setAiKey(key: string): void;
  };
  export default backend;
}

declare var __peculeSqlite: { SQL: unknown; bytes: Uint8Array | null } | undefined;
declare var __peculeEnv: Record<string, string | undefined> | undefined;
