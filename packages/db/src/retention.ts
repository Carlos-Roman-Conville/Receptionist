import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';

function retentionDays(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface RetentionResult {
  recordingsDeleted: number;
  transcriptsPurged: number;
}

/**
 * Enforces compliance.yaml retention: delete expired recordings and purge verbatim transcripts.
 */
export async function runRetentionJob(
  pool: Pool,
  config: ClientConfig,
): Promise<RetentionResult> {
  const data = (config.compliance as { data?: Record<string, unknown> }).data ?? {};
  const recordingDays = retentionDays(data.retention_days_recordings, 90);
  const transcriptDays = retentionDays(data.retention_days_transcripts, 365);

  const recordings = await pool.query(
    `UPDATE recordings
     SET deleted_at = NOW(), storage_path = NULL
     WHERE deleted_at IS NULL AND retain_until < NOW()
     RETURNING id`,
  );

  const transcripts = await pool.query(
    `UPDATE transcripts
     SET verbatim = NULL
     WHERE retain_until IS NOT NULL AND retain_until < NOW() AND verbatim IS NOT NULL
     RETURNING id`,
  );

  // Backfill retain_until on rows missing it (legacy safety)
  await pool.query(
    `UPDATE recordings SET retain_until = created_at + ($1 || ' days')::interval
     WHERE retain_until IS NULL`,
    [String(recordingDays)],
  );
  await pool.query(
    `UPDATE transcripts SET retain_until = created_at + ($1 || ' days')::interval
     WHERE retain_until IS NULL`,
    [String(transcriptDays)],
  );

  return {
    recordingsDeleted: recordings.rowCount ?? 0,
    transcriptsPurged: transcripts.rowCount ?? 0,
  };
}
