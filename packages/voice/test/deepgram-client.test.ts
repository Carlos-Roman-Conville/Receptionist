import { describe, it, expect, vi } from 'vitest';
import { DeepgramLiveClient } from '../src/deepgram/client.js';

describe('DeepgramLiveClient utterance assembly', () => {
  it('accumulates is_final segments until speech_final', () => {
    const onTranscript = vi.fn();
    const client = new DeepgramLiveClient({
      apiKey: 'test-key',
      onTranscript,
    });

    client.handleMessage({
      type: 'Results',
      is_final: true,
      speech_final: false,
      channel: { alternatives: [{ transcript: 'my number is two six seven' }] },
    });
    expect(onTranscript).not.toHaveBeenCalled();

    client.handleMessage({
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'four eight seven three six zero nine' }] },
    });

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith({
      kind: 'utterance',
      text: 'my number is two six seven four eight seven three six zero nine',
    });
  });

  it('flushes accumulated text on UtteranceEnd when speech_final was missed', () => {
    const onTranscript = vi.fn();
    const client = new DeepgramLiveClient({
      apiKey: 'test-key',
      onTranscript,
    });

    client.handleMessage({
      type: 'Results',
      is_final: true,
      speech_final: false,
      channel: { alternatives: [{ transcript: 'two six seven' }] },
    });
    client.handleMessage({ type: 'UtteranceEnd' });

    expect(onTranscript).toHaveBeenCalledWith({
      kind: 'utterance',
      text: 'two six seven',
    });
  });

  it('emits interim transcripts without triggering utterance processing', () => {
    const onTranscript = vi.fn();
    const client = new DeepgramLiveClient({
      apiKey: 'test-key',
      onTranscript,
    });

    client.handleMessage({
      type: 'Results',
      is_final: false,
      channel: { alternatives: [{ transcript: 'hello there' }] },
    });

    expect(onTranscript).toHaveBeenCalledWith({
      kind: 'interim',
      text: 'hello there',
    });
  });
});
