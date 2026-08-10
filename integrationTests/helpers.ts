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

/**
 * Reads from an SSE stream reader until an event of `eventType` is seen (or the stream ends /
 * the request is aborted), returning whatever was buffered. Centralizes the buffer-read loop
 * that the put and delete SSE tests both need.
 *
 * Matching on the event type matters: Harper prefixes each frame with `event: <type>` (the
 * audit record's type — see harper's Table.ts subscribe / contentTypes.ts serialize), and a
 * subscription delivers a `put` per existing record as its initial snapshot. A loop that
 * stopped at the first `data:` line would therefore resolve off an unrelated snapshot event
 * and pass even if delivery of the event under test had regressed.
 */
export function collectFirstSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  dec: TextDecoder,
  eventType: string,
): Promise<string> {
  return (async () => {
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // `serialize` writes `event:` immediately followed by `data:`, so require both to
        // have arrived — a frame split across chunks must not match on its header alone.
        if (buf.includes(`event: ${eventType}\ndata:`)) return buf;
      }
    } catch {
      // AbortError when the controller fires — return whatever was buffered
    }
    return buf;
  })();
}
