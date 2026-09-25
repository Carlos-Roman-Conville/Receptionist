import WebSocket from 'ws';

export type DeepgramTranscriptKind = 'interim' | 'utterance';

export interface DeepgramTranscript {
  text: string;
  kind: DeepgramTranscriptKind;
}

export interface DeepgramLiveOptions {
  apiKey: string;
  onTranscript: (transcript: DeepgramTranscript) => void;
  onError?: (error: Error) => void;
  model?: string;
  WebSocketImpl?: typeof WebSocket;
}

export class DeepgramLiveClient {
  private readonly apiKey: string;
  private readonly onTranscript: DeepgramLiveOptions['onTranscript'];
  private readonly onError?: DeepgramLiveOptions['onError'];
  private readonly model: string;
  private readonly WebSocketImpl: typeof WebSocket;
  private socket: WebSocket | null = null;
  /** Concatenated is_final segments until speech_final or UtteranceEnd. */
  private accumulatedFinal = '';

  constructor(options: DeepgramLiveOptions) {
    this.apiKey = options.apiKey;
    this.onTranscript = options.onTranscript;
    this.onError = options.onError;
    this.model = options.model ?? 'nova-2-phonecall';
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  }

  connect(): void {
    if (!this.apiKey) {
      throw new Error('DEEPGRAM_API_KEY is required');
    }

    const params = new URLSearchParams({
      model: this.model,
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      interim_results: 'true',
      // Longer pauses while dictating phone numbers; default 400 ms cut callers off.
      endpointing: '800',
      utterance_end_ms: '2000',
      smart_format: 'true',
      numerals: 'true',
      punctuate: 'true',
    });

    this.socket = new this.WebSocketImpl(
      `wss://api.deepgram.com/v1/listen?${params.toString()}`,
      {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      },
    );

    this.socket.on('message', (data) => {
      try {
        this.handleMessage(JSON.parse(String(data)) as DeepgramMessage);
      } catch (err) {
        this.onError?.(
          err instanceof Error ? err : new Error('Deepgram parse error'),
        );
      }
    });

    this.socket.on('error', () => {
      this.onError?.(new Error('Deepgram websocket error'));
    });
  }

  /** Exposed for unit tests — simulates websocket payloads. */
  handleMessage(parsed: DeepgramMessage): void {
    if (parsed.type === 'UtteranceEnd') {
      this.flushUtterance();
      return;
    }

    if (parsed.type !== 'Results') return;

    const text = parsed.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
    if (!parsed.is_final) {
      if (text) {
        this.onTranscript({ text, kind: 'interim' });
      }
      return;
    }

    if (text) {
      this.accumulatedFinal = this.accumulatedFinal
        ? `${this.accumulatedFinal} ${text}`
        : text;
    }

    if (parsed.speech_final) {
      this.flushUtterance();
    }
  }

  private flushUtterance(): void {
    const text = this.accumulatedFinal.trim();
    this.accumulatedFinal = '';
    if (text) {
      this.onTranscript({ text, kind: 'utterance' });
    }
  }

  sendAudio(audio: Buffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(audio);
    }
  }

  close(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'CloseStream' }));
    }
    this.socket?.close();
    this.socket = null;
    this.accumulatedFinal = '';
  }
}

interface DeepgramMessage {
  type?: string;
  channel?: { alternatives?: Array<{ transcript?: string }> };
  is_final?: boolean;
  speech_final?: boolean;
}
