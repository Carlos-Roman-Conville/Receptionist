import type { Pool } from 'pg';
import type { ClientConfig } from '@receptionist/config';
import type { Brain, BrainResponse, ClaudeMessage } from '@receptionist/brain';
import {
  getSessionByExternalId,
  getSessionMessages,
  logInteraction,
  updateCall,
} from '@receptionist/db';
import {
  buildOpeningScript,
  hardCapMinutes,
  hardCapScript,
  softCapMinutes,
} from '../compliance.js';
import { DeepgramLiveClient } from '../deepgram/client.js';
import {
  chunkAudio,
  ElevenLabsClient,
  sendPacedPcmuFrames,
  TELNYX_CHUNK_BYTES,
} from '../elevenlabs/client.js';
import {
  callDurationMinutes,
  callerDeclinedRecording,
  resolveEmergencyTransferNumber,
} from '../env.js';
import type { TelnyxCallControl } from '../telnyx/client.js';
import { encodeMediaPayload } from '../telnyx/types.js';

export interface CallSessionOptions {
  callControlId: string;
  callDbId: string;
  callerNumber: string | null;
  externalSessionId: string;
  config: ClientConfig;
  pool: Pool;
  brain: Brain;
  telnyx: TelnyxCallControl;
  elevenLabs: ElevenLabsClient;
  deepgramApiKey: string;
  sendMedia: (payloadBase64: string) => void;
  onClose?: () => void;
}

export class CallSession {
  private readonly options: CallSessionOptions;
  private readonly emergencyNumber: string | null;
  private deepgram: DeepgramLiveClient | null = null;
  private readonly startedAt = Date.now();
  private opened = false;
  private closed = false;
  private speaking = false;
  private processing = false;
  private speechGeneration = 0;
  private pendingFinalTranscript: string | null = null;
  private hardCapReached = false;
  private transferred = false;

  constructor(options: CallSessionOptions) {
    this.options = options;
    this.emergencyNumber = resolveEmergencyTransferNumber(
      this.options.config.compliance.emergency as Record<string, unknown>,
    );
  }

  attachMedia(): void {
    this.deepgram = new DeepgramLiveClient({
      apiKey: this.options.deepgramApiKey,
      onTranscript: (transcript) => {
        void this.onTranscript(transcript.text, transcript.isFinal);
      },
    });
    this.deepgram.connect();
  }

  ingestInboundAudio(audio: Buffer): void {
    this.deepgram?.sendAudio(audio);
  }

  async start(): Promise<void> {
    if (this.opened) return;
    this.opened = true;
    const opening = buildOpeningScript(this.options.config);
    if (opening) {
      await this.speak(opening);
    }
  }

  private async onTranscript(text: string, isFinal: boolean): Promise<void> {
    if (this.closed || this.transferred) return;

    if (callerDeclinedRecording(text)) {
      await updateCall(this.options.pool, this.options.callDbId, {
        recordingDeclined: true,
      });
      await logInteraction(this.options.pool, {
        clientSlug: this.options.config.paths.clientSlug,
        callId: this.options.callDbId,
        eventType: 'recording_declined',
        payload: { snippet: text.slice(0, 200) },
      });
    }

    // Barge-in on caller speech only — ignore interim STT noise/echo.
    if (this.speaking && isFinal) {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        this.bargeIn();
      }
    }

    if (!isFinal) return;

    this.pendingFinalTranscript = text;
    if (!this.processing && !this.speaking) {
      await this.flushPendingTranscript();
    }
  }

  private async flushPendingTranscript(): Promise<void> {
    if (!this.pendingFinalTranscript || this.processing || this.closed) return;

    const text = this.pendingFinalTranscript;
    this.pendingFinalTranscript = null;
    this.processing = true;

    try {
      await this.processCallerTurn(text);
    } finally {
      this.processing = false;
      if (this.pendingFinalTranscript && !this.speaking) {
        await this.flushPendingTranscript();
      }
    }
  }

  private async processCallerTurn(text: string): Promise<void> {
    if (this.hardCapReached || this.transferred) return;

    const duration = callDurationMinutes(this.startedAt);
    if (duration >= hardCapMinutes(this.options.config)) {
      this.hardCapReached = true;
      await this.speak(hardCapScript(this.options.config));
      await this.options.telnyx.hangup(this.options.callControlId);
      return;
    }

    const history = await this.loadHistory();
    let userMessage = text;
    if (duration >= softCapMinutes(this.options.config)) {
      userMessage = `[Call nearing time limit.] ${text}`;
    }

    const result = await this.options.brain.respond({
      channel: 'phone',
      sessionId: this.options.externalSessionId,
      userMessage,
      history,
      callerPhone: this.options.callerNumber,
    });

    await updateCall(this.options.pool, this.options.callDbId, {
      classifierResult: result.classifier,
      sessionId: result.sessionDbId,
    });

    const transferred = await this.handleToolSideEffects(result);
    if (transferred) return;

    await this.speak(result.reply);
  }

  private async loadHistory(): Promise<ClaudeMessage[]> {
    const session = await getSessionByExternalId(this.options.pool, {
      clientSlug: this.options.config.paths.clientSlug,
      channel: 'phone',
      externalSessionId: this.options.externalSessionId,
    });
    if (!session) return [];

    const rows = await getSessionMessages(this.options.pool, session.id, 20);
    return rows
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({
        role: row.role as 'user' | 'assistant',
        content: row.content,
      }));
  }

  private async handleToolSideEffects(result: BrainResponse): Promise<boolean> {
    const transferRequested = result.toolResults.some(
      (tool) =>
        (tool.name === 'transfer_call' || tool.name === 'send_emergency_alert') &&
        tool.ok,
    );

    const emergency =
      result.classifier === 'EMERGENCY_CLIENT_DOWN' || transferRequested;

    if (!emergency || !this.emergencyNumber) {
      return false;
    }

    this.transferred = true;
    await logInteraction(this.options.pool, {
      clientSlug: this.options.config.paths.clientSlug,
      callId: this.options.callDbId,
      eventType: 'emergency_transfer',
      payload: { simultaneous_alert: true },
    });
    await this.options.telnyx.transfer(
      this.options.callControlId,
      this.emergencyNumber,
    );
    await updateCall(this.options.pool, this.options.callDbId, {
      outcome: 'emergency_transfer',
    });
    return true;
  }

  bargeIn(): void {
    if (!this.speaking) return;
    this.speechGeneration += 1;
    this.speaking = false;
  }

  async speak(text: string): Promise<void> {
    if (!text.trim() || this.closed || this.transferred) return;

    const generation = ++this.speechGeneration;
    this.speaking = true;

    try {
      const audio = await this.options.elevenLabs.synthesize(text);
      if (generation !== this.speechGeneration || this.closed) return;

      const chunks = chunkAudio(audio, TELNYX_CHUNK_BYTES);
      console.info(
        `[voice] TTS ready call=${this.options.callControlId} bytes=${audio.length} chunks=${chunks.length}`,
      );

      await sendPacedPcmuFrames(
        chunks,
        (chunk) => this.options.sendMedia(encodeMediaPayload(chunk)),
        20,
        () => generation === this.speechGeneration && !this.closed,
      );
    } catch (err) {
      if (generation === this.speechGeneration) {
        console.error(
          `[voice] TTS failed call=${this.options.callControlId}:`,
          err instanceof Error ? err.message : err,
        );
        await logInteraction(this.options.pool, {
          clientSlug: this.options.config.paths.clientSlug,
          callId: this.options.callDbId,
          eventType: 'tts_error',
          payload: {
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    } finally {
      if (generation === this.speechGeneration) {
        this.speaking = false;
        await this.flushPendingTranscript();
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.deepgram?.close();
    this.options.onClose?.();
  }
}
