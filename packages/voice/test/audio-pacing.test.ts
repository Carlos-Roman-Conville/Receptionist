import { describe, it, expect, vi } from 'vitest';
import { sendPacedPcmuFrames } from '../src/elevenlabs/client.js';
import { isInboundMediaTrack } from '../src/telnyx/types.js';

describe('isInboundMediaTrack', () => {
  it('accepts inbound variants and rejects outbound echo', () => {
    expect(isInboundMediaTrack(undefined)).toBe(true);
    expect(isInboundMediaTrack('inbound')).toBe(true);
    expect(isInboundMediaTrack('inbound_track')).toBe(true);
    expect(isInboundMediaTrack('outbound')).toBe(false);
    expect(isInboundMediaTrack('outbound_track')).toBe(false);
  });
});

describe('sendPacedPcmuFrames', () => {
  it('paces frames on a wall clock', async () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    const chunks = [Buffer.alloc(160), Buffer.alloc(160), Buffer.alloc(160)];

    const promise = sendPacedPcmuFrames(chunks, () => {
      sent.push(Date.now());
    });

    await vi.runAllTimersAsync();
    await promise;

    expect(sent).toHaveLength(3);
    vi.useRealTimers();
  });
});
