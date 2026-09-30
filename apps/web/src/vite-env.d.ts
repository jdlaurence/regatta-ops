/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'memory' runs the app on MemoryStore and the seed world (same as `--mode demo`). */
  readonly VITE_DATA_MODE?: 'memory' | 'pocketbase';
  /** PocketBase base URL; defaults to the page's origin ('/'), proxied in development. */
  readonly VITE_PB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
