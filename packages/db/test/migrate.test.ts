import { describe, it, expect } from 'vitest';
import { listMigrationFiles } from '../src/migrate.js';

describe('migrations', () => {
  it('includes initial schema migration', () => {
    const files = listMigrationFiles();
    expect(files).toContain('001_initial.sql');
    expect(files).toContain('002_daily_briefings.sql');
  });
});
