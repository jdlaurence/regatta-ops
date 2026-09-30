/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** 'memory' runs the app on MemoryStore and the seed world (same as `--mode demo`). */
  readonly VITE_DATA_MODE?: 'memory' | 'pocketbase';
  /** PocketBase base URL; defaults to the page's origin ('/'), proxied in development. */
  readonly VITE_PB_URL?: string;
  /** Set by vite.config.ts: the app version and a hash of the record schema (data/persist.ts). */
  readonly VITE_CACHE_BUSTER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
