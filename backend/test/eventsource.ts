// A minimal EventSource for tests. Node 22 has none without --experimental-eventsource, and the
// PocketBase SDK's realtime client needs one. Covers what the SDK uses: named events with
// `data` and `lastEventId`, `onerror`, `close()`. Not a general-purpose implementation (no
// reconnect; the SDK reconnects by constructing a new one).

export class TestEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readonly url: string;
  readyState = TestEventSource.CONNECTING;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  private readonly controller = new AbortController();

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    void this.run();
  }

  close() {
    this.readyState = TestEventSource.CLOSED;
    this.controller.abort();
  }

  private async run() {
    try {
      const res = await fetch(this.url, {
        headers: { Accept: 'text/event-stream' },
        signal: this.controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`EventSource: HTTP ${res.status}`);
      this.readyState = TestEventSource.OPEN;
      this.onopen?.(new Event('open'));
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let type = 'message';
      let data: string[] = [];
      let lastEventId = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.search(/\r\n|\n|\r/)) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + (buffer.startsWith('\r\n', nl) ? 2 : 1));
          if (line === '') {
            if (data.length > 0) {
              this.dispatchEvent(new MessageEvent(type, { data: data.join('\n'), lastEventId }));
            }
            type = 'message';
            data = [];
            continue;
          }
          if (line.startsWith(':')) continue;
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const val = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') type = val;
          else if (field === 'data') data.push(val);
          else if (field === 'id') lastEventId = val;
        }
      }
      throw new Error('EventSource: stream ended');
    } catch {
      if (this.readyState === TestEventSource.CLOSED) return;
      this.readyState = TestEventSource.CLOSED;
      this.onerror?.(new Event('error'));
    }
  }
}

/** Install TestEventSource as the global EventSource when the runtime has none. */
export function ensureEventSource() {
  const g = globalThis as { EventSource?: unknown };
  g.EventSource ??= TestEventSource;
}
