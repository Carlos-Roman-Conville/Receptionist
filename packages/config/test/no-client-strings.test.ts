import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [/CRC/i, /Carlos/i, /crc-solutions/i];

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('replicability: no client strings in packages/config/src', () => {
  const srcDir = join(import.meta.dirname, '../src');
  const files = walkTsFiles(srcDir);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const pattern of FORBIDDEN) {
    it(`source must not match ${pattern}`, () => {
      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        const match = content.match(pattern);
        expect(
          match,
          `Forbidden match "${match?.[0]}" in ${file}`,
        ).toBeNull();
      }
    });
  }
});
