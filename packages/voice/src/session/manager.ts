import { CallSession, type CallSessionOptions } from './call-session.js';

export class CallSessionManager {
  private readonly sessions = new Map<string, CallSession>();

  get(callControlId: string): CallSession | undefined {
    return this.sessions.get(callControlId);
  }

  create(options: CallSessionOptions): CallSession {
    const existing = this.sessions.get(options.callControlId);
    if (existing) return existing;

    const session = new CallSession({
      ...options,
      onClose: () => {
        this.sessions.delete(options.callControlId);
        options.onClose?.();
      },
    });
    this.sessions.set(options.callControlId, session);
    return session;
  }

  async close(callControlId: string): Promise<void> {
    const session = this.sessions.get(callControlId);
    if (session) {
      await session.close();
      this.sessions.delete(callControlId);
    }
  }

  size(): number {
    return this.sessions.size;
  }
}
