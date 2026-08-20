/**
 * Shared helpers for the integration tests. Extracted so the harper CLI resolution,
 * basic-auth encoding, and SSE stream-reading logic live in one place instead of being
 * copy-pasted across the individual test files.
 */
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';

const require = createRequire(import.meta.url);

// harper's `exports` map only exposes ".", so the harness's default resolution of
// 'harper/dist/bin/harper.js' throws ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the CLI
// from the exported package root and pass it explicitly as harperBinPath.
export const harperBinPath = resolve(dirname(require.resolve('harper')), 'bin/harper.js');

export function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

export interface SseTableEvent {
  id: string;
  type: string;
  value?: unknown;
  localTime?: number;
  version?: number;
}

/**
 * Reads an SSE stream until a table event of `eventType` ('put', 'delete', …) arrives,
 * returning the parsed event (or `null` if the stream ends / the request is aborted first).
 *
 * Matching on the type matters: a table subscription delivers a `put` per already-existing
 * record as its initial snapshot, so a loop that stopped at the first `data:` line would
 * resolve off an unrelated snapshot event and pass even if delivery of the event under test
 * had regressed.
 *
 * Harper does not put the type in an `event:` header for these frames. `serialize`
 * (harper server/serverHelpers/contentTypes.ts) only lifts `type` into `event:` for messages
 * carrying a `timestamp`; table subscription events carry `localTime`/`version` instead, so
 * the whole event object is serialized as one `data:` line with `type` inside the JSON.
 */
export function collectSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dec: TextDecoder,
  eventType: string,
): Promise<SseTableEvent | null> {
  return (async () => {
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // Only consider complete lines; a frame split across chunks must not be parsed early.
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          let parsed: SseTableEvent;
          try {
            parsed = JSON.parse(line.slice('data:'.length));
          } catch {
            continue; // heartbeat or non-JSON frame
          }
          if (parsed?.type === eventType) return parsed;
        }
      }
    } catch {
      // AbortError when the controller fires
    }
    return null;
  })();
}
