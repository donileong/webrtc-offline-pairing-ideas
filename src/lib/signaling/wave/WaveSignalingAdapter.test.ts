import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WaveSignalingAdapter } from './WaveSignalingAdapter';
import { ggwaveService } from './ggwaveService';

describe('WaveSignalingAdapter - Pattern 2 (Slotted Leader Election)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(ggwaveService, 'transmit').mockResolvedValue();
    vi.spyOn(ggwaveService, 'startListening').mockImplementation(async () => {});
    vi.spyOn(ggwaveService, 'stopListening').mockImplementation(() => {});
    vi.spyOn(ggwaveService, 'stopTransmitting').mockImplementation(() => {});
    vi.spyOn(ggwaveService, 'releaseMicrophone').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes with ultrasound protocol by default for near-silent operation', () => {
    const adapter = new WaveSignalingAdapter();
    expect(adapter.id).toBe('wave');
    expect(adapter.protocol).toBe('ULTRASOUND_FAST');
    expect(adapter.volume).toBe(40);
    expect(adapter.autoPairMode).toBe(true);
    expect(adapter.handshakeState).toBe('IDLE');
    expect(adapter.electedRole).toBeNull();
  });

  it('broadcastOffer saves payload without immediate audio if autoPairMode is true', async () => {
    const adapter = new WaveSignalingAdapter();
    adapter.autoPairMode = true;

    await adapter.broadcastOffer('O|ufrag|pwd|fp|ip|1');
    expect(ggwaveService.transmit).not.toHaveBeenCalled();
  });

  it('broadcastOffer plays audio immediately if in classic manual host mode', async () => {
    const adapter = new WaveSignalingAdapter();
    adapter.autoPairMode = false;

    await adapter.broadcastOffer('O|ufrag|pwd|fp|ip|1');
    expect(ggwaveService.transmit).toHaveBeenCalledWith(
      'O|ufrag|pwd|fp|ip|1',
      'ULTRASOUND_FAST',
      40,
      expect.any(Function),
    );
  });

  it('slotted leader election: silence timeout elects device as HOST and broadcasts Offer', async () => {
    const adapter = new WaveSignalingAdapter();
    let electedRole: string | null = null;
    adapter.onRoleElected = (role) => {
      electedRole = role;
    };

    await adapter.broadcastOffer('O|myHostOffer|1');
    const signalPromise = adapter.listenForAnySignal();

    expect(adapter.handshakeState).toBe('ELECTING');
    expect(electedRole).toBeNull();

    // Advance past the 1.8s - 3.0s listen window
    await vi.advanceTimersByTimeAsync(3200);

    expect(adapter.handshakeState).toBe('HOST_BROADCASTING');
    expect(adapter.electedRole).toBe('host');
    expect(electedRole).toBe('host');
    expect(adapter.broadcastAttempt).toBe(1);
    expect(ggwaveService.transmit).toHaveBeenCalledWith(
      'O|myHostOffer|1',
      'ULTRASOUND_FAST',
      40,
      expect.any(Function),
    );

    // Host receives Answer -> connects!
    const listener = vi.mocked(ggwaveService.startListening).mock.calls[0][0];
    listener('A|remoteAnswer|2');

    const result = await signalPromise;
    expect(result).toBe('A|remoteAnswer|2');
    expect(adapter.handshakeState).toBe('CONNECTED');
  });

  it('slotted leader election: audio detected during listen window elects device as JOINER', async () => {
    const adapter = new WaveSignalingAdapter();
    let electedRole: string | null = null;
    adapter.onRoleElected = (role) => {
      electedRole = role;
    };

    let listenerCb: ((msg: string) => void) | undefined;
    vi.spyOn(ggwaveService, 'startListening').mockImplementation(async (cb) => {
      listenerCb = cb;
    });

    const signalPromise = adapter.listenForAnySignal();
    expect(adapter.handshakeState).toBe('ELECTING');

    // Peer begins chirping before our silence timer expires
    await vi.advanceTimersByTimeAsync(500);
    listenerCb!('O|remoteHostOffer|1');

    const result = await signalPromise;
    expect(result).toBe('O|remoteHostOffer|1');
    expect(adapter.handshakeState).toBe('JOINER_LISTENING');
    expect(adapter.electedRole).toBe('joiner');
    expect(electedRole).toBe('joiner');
  });

  it('host broadcasts Offer up to 3 times with pauses between attempts', async () => {
    const adapter = new WaveSignalingAdapter();
    await adapter.broadcastOffer('O|repeatOffer|1');
    adapter.listenForAnySignal();

    // Attempt 1: election expires at ~3s
    await vi.advanceTimersByTimeAsync(3200);
    expect(adapter.broadcastAttempt).toBe(1);
    expect(ggwaveService.transmit).toHaveBeenCalledTimes(1);

    // Attempt 2: after 2.2s repeat timer
    await vi.advanceTimersByTimeAsync(2300);
    expect(adapter.broadcastAttempt).toBe(2);
    expect(ggwaveService.transmit).toHaveBeenCalledTimes(2);

    // Attempt 3: after another 2.2s repeat timer
    await vi.advanceTimersByTimeAsync(2300);
    expect(adapter.broadcastAttempt).toBe(3);
    expect(ggwaveService.transmit).toHaveBeenCalledTimes(3);

    // No 4th attempt scheduled
    await vi.advanceTimersByTimeAsync(5000);
    expect(adapter.broadcastAttempt).toBe(3);
    expect(ggwaveService.transmit).toHaveBeenCalledTimes(3);
  });

  it('times out after 16 seconds and calls onTimeout', async () => {
    const adapter = new WaveSignalingAdapter();
    let timedOut = false;
    adapter.onTimeout = () => {
      timedOut = true;
    };

    adapter.listenForAnySignal();
    expect(timedOut).toBe(false);

    // Advance to 16.5 seconds
    await vi.advanceTimersByTimeAsync(16500);

    expect(timedOut).toBe(true);
    expect(adapter.handshakeState).toBe('TIMED_OUT');
  });

  it('cleans up timers and processes on cleanup', () => {
    const adapter = new WaveSignalingAdapter();
    adapter.listenForAnySignal();

    adapter.cleanup(true);
    expect(ggwaveService.stopTransmitting).toHaveBeenCalled();
    expect(ggwaveService.stopListening).toHaveBeenCalled();
    expect(ggwaveService.releaseMicrophone).toHaveBeenCalled();
    expect(adapter.handshakeState).toBe('IDLE');
  });

  it('manual mode: host broadcasts offer and receives answer', async () => {
    const adapter = new WaveSignalingAdapter();
    adapter.autoPairMode = false;

    let listenerCb: ((msg: string) => void) | undefined;
    vi.spyOn(ggwaveService, 'startListening').mockImplementation(async (cb) => {
      listenerCb = cb;
    });

    await adapter.broadcastOffer('O|hostPayload|1');
    expect(ggwaveService.transmit).toHaveBeenCalledWith(
      'O|hostPayload|1',
      'ULTRASOUND_FAST',
      40,
      expect.any(Function),
    );

    const answerPromise = adapter.listenForAnswer();
    expect(listenerCb).toBeDefined();

    // Joiner responds with Answer
    listenerCb!('A|joinerAnswer|2');
    const answer = await answerPromise;
    expect(answer).toBe('A|joinerAnswer|2');
  });

  it('manual mode: replayLastTone plays the last tone again with progress notification', async () => {
    const adapter = new WaveSignalingAdapter();
    adapter.autoPairMode = false;

    await adapter.broadcastOffer('O|firstTone|1');
    expect(ggwaveService.transmit).toHaveBeenCalledTimes(1);

    await adapter.replayLastTone();
    expect(ggwaveService.transmit).toHaveBeenCalledTimes(2);
    expect(ggwaveService.transmit).toHaveBeenLastCalledWith(
      'O|firstTone|1',
      'ULTRASOUND_FAST',
      40,
      expect.any(Function),
    );
  });

  it('manual mode: joiner listens for offer and transmits answer', async () => {
    const adapter = new WaveSignalingAdapter();
    adapter.autoPairMode = false;

    let listenerCb: ((msg: string) => void) | undefined;
    vi.spyOn(ggwaveService, 'startListening').mockImplementation(async (cb) => {
      listenerCb = cb;
    });

    const offerPromise = adapter.listenForOffer();
    expect(listenerCb).toBeDefined();

    // Host sends offer
    listenerCb!('O|remoteHostOffer|1');
    const offer = await offerPromise;
    expect(offer).toBe('O|remoteHostOffer|1');

    // Joiner sends answer back
    const answerSendPromise = adapter.sendAnswer('A|joinerResponse|2');
    await vi.advanceTimersByTimeAsync(400); // 400ms turnaround delay
    await answerSendPromise;

    expect(ggwaveService.transmit).toHaveBeenCalledWith(
      'A|joinerResponse|2',
      'ULTRASOUND_FAST',
      40,
      expect.any(Function),
    );
  });
});
