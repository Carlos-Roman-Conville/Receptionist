import WebSocket from 'ws';

export interface DeepgramTranscript {
  text: string;
  isFinal: boolean;
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

  constructor(options: DeepgramLiveOptions) {
    this.apiKey = options.apiKey;
    this.onTranscript = options.onTranscript;
    this.onError = options.onError;
    this.model = options.model ?? 'nova-2';
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
      endpointing: '400',
      utterance_end_ms: '1200',
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
        const parsed = JSON.parse(String(data)) as {
          type?: string;
          channel?: { alternatives?: Array<{ transcript?: string }> };
          is_final?: boolean;
          speech_final?: boolean;
        };

        if (parsed.type !== 'Results') return;
        const text = parsed.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
        if (!text) return;

        this.onTranscript({
          text,
          isFinal: Boolean(parsed.is_final || parsed.speech_final),
        });
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
  }
}
