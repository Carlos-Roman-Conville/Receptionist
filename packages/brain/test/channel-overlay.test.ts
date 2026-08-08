import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseChatJson, chatJsonFallback } from '../src/channel-overlay.js';

describe('channel overlay', () => {
  it('parses valid chat JSON', () => {
    const parsed = parseChatJson(
      '{"reply":"Hello","leadScore":"warm","action":"none"}',
    );
    expect(parsed.reply).toBe('Hello');
    expect(parsed.leadScore).toBe('warm');
  });

  it('returns fallback on invalid JSON', () => {
    expect(() => parseChatJson('not json')).toThrow();
    expect(chatJsonFallback().reply.length).toBeGreaterThan(10);
  });
});

describe('replicability: no client strings in packages/brain/src', () => {
  const srcDir = join(import.meta.dirname, '../src');
  const forbidden = [/CRC/i, /Carlos/i, /crc-solutions/i];

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
  }

  for (const pattern of forbidden) {
    it(`source must not match ${pattern}`, () => {
      for (const file of walk(srcDir)) {
        const content = readFileSync(file, 'utf-8');
        expect(content.match(pattern), file).toBeNull();
      }
    });
  }
});
