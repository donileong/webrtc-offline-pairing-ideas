<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { activeSession } from '../../transport/activeSession.svelte';
  import { WaveSignalingAdapter } from './WaveSignalingAdapter';
  import type { TxProgress } from './ggwaveService';
  import AudioVisualizer from './AudioVisualizer.svelte';
  import Modal from '../../ui/Modal.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  const adapter = new WaveSignalingAdapter();

  let selectedRole = $state<'host' | 'joiner' | null>(null);
  let isSilent = $state(true); // Default to near-silent ultrasound (~16–20 kHz)
  let txProgress = $state<TxProgress | null>(null);
  let isTransmitting = $state(false);

  // Track transmission progress from adapter
  adapter.onTxProgress = (p) => {
    txProgress = p;
    isTransmitting = p.isPlaying;
  };

  adapter.onProgress = (prog) => {
    if (prog.isTransmitting !== undefined) {
      isTransmitting = prog.isTransmitting;
    }
  };

  function updateProtocol(silent: boolean) {
    isSilent = silent;
    adapter.protocol = silent ? 'ULTRASOUND_FAST' : 'AUDIBLE_FASTEST';
    adapter.volume = silent ? 40 : 22;
  }

  function startHostRole() {
    selectedRole = 'host';
    adapter.cleanup(false);
    adapter.autoPairMode = false;
    updateProtocol(isSilent);
    activeSession.startPairing('host', adapter);
  }

  function startJoinerRole() {
    selectedRole = 'joiner';
    adapter.cleanup(false);
    adapter.autoPairMode = false;
    updateProtocol(isSilent);
    activeSession.startPairing('joiner', adapter);
  }

  async function handleReplayTone() {
    if (isTransmitting) return;
    await adapter.replayLastTone();
  }

  function handleResetRole() {
    adapter.cleanup(false);
    activeSession.reset();
    txProgress = null;
    isTransmitting = false;
    selectedRole = null;
  }

  let wasOpen = false;

  function handleClose() {
    wasOpen = false;
    adapter.cleanup(true);
    if (activeSession.state !== 'connected') {
      activeSession.reset();
    }
    txProgress = null;
    isTransmitting = false;
    selectedRole = null;
    onclose();
  }

  // Handle open prop changes
  $effect(() => {
    const isOpen = open;
    untrack(() => {
      if (isOpen) {
        wasOpen = true;
        selectedRole = null;
        updateProtocol(isSilent);
        adapter.prewarm().catch(() => {});
      } else if (wasOpen) {
        wasOpen = false;
        adapter.cleanup(true);
        if (activeSession.state !== 'connected') {
          activeSession.reset();
        }
        isTransmitting = false;
        txProgress = null;
        selectedRole = null;
      }
    });
  });

  // Watch for connection to auto-dismiss modal
  $effect(() => {
    const isConnected = activeSession.state === 'connected';
    untrack(() => {
      if (isConnected) {
        adapter.cleanup(true);
        onclose();
      }
    });
  });

  onDestroy(() => {
    adapter.cleanup(true);
  });

  // Derived step helpers for Host
  let hostOfferDone = $derived(
    activeSession.state === 'waiting-answer' ||
      activeSession.state === 'connecting' ||
      activeSession.state === 'connected',
  );

  let hostAnswerDone = $derived(
    activeSession.state === 'connecting' || activeSession.state === 'connected',
  );

  // Derived step helpers for Joiner
  let joinerOfferReceived = $derived(
    activeSession.state === 'generating-answer' ||
      activeSession.state === 'broadcasting-answer' ||
      activeSession.state === 'connecting' ||
      activeSession.state === 'connected',
  );

  let joinerAnswerSent = $derived(
    activeSession.state === 'connecting' || activeSession.state === 'connected',
  );
</script>

<Modal
  {open}
  title="Sound Wave Pairing"
  subtitle="Connect nearby devices using acoustic sound"
  maxWidth="540px"
  onclose={handleClose}
>

      <!-- VIEW 1: Manual Role Selection (when selectedRole is null) -->
      {#if selectedRole === null}
        <div class="modal-body role-selection-view">
          <div class="intro-callout">
            <p>
              Choose a role for each device. One device must act as <strong>Host (Sender)</strong>
              and the other as <strong>Joiner (Receiver)</strong>.
            </p>
          </div>

          <div class="role-grid">
            <!-- Joiner Card (Recommended First) -->
            <button class="role-card joiner-card" onclick={startJoinerRole} type="button">
              <div class="role-card-badge">Step 1 (Recommended First)</div>
              <div class="role-card-content">
                <div class="role-text-box">
                  <h4 class="role-title">Joiner (Receiver)</h4>
                  <p class="role-desc">
                    Opens microphone to listen for sound from Host, then responds back.
                  </p>
                </div>
              </div>
              <div class="role-action-row">
                <span class="action-label">Start as Receiver</span>
                <span class="action-arrow">&rarr;</span>
              </div>
            </button>

            <!-- Host Card -->
            <button class="role-card host-card" onclick={startHostRole} type="button">
              <div class="role-card-badge">Step 2</div>
              <div class="role-card-content">
                <div class="role-text-box">
                  <h4 class="role-title">Host (Sender)</h4>
                  <p class="role-desc">
                    Creates room offer and chirps connection sound through speakers.
                  </p>
                </div>
              </div>
              <div class="role-action-row">
                <span class="action-label">Start as Sender</span>
                <span class="action-arrow">&rarr;</span>
              </div>
            </button>
          </div>

          <!-- Audio Mode Selector -->
          <div class="audio-mode-selector">
            <div class="mode-label-group">
              <span class="label-title">Sound Mode</span>
              <span class="label-desc">
                {isSilent
                  ? 'Near-silent ultrasound (~16–20 kHz) inaudible to human ears'
                  : 'Audible chirp tones (~1.2s rapid tone bursts)'}
              </span>
            </div>

            <div class="toggle-pill-group">
              <button
                class="pill-btn"
                class:selected={isSilent}
                onclick={() => updateProtocol(true)}
                type="button"
              >
                Near-Silent
              </button>
              <button
                class="pill-btn"
                class:selected={!isSilent}
                onclick={() => updateProtocol(false)}
                type="button"
              >
                Audible
              </button>
            </div>
          </div>

          <div class="tip-banner">
            <span class="tip-text">
              <strong>Quick Tip:</strong> Tap <em>Joiner (Receiver)</em> first on Device 2 so it is
              listening, then tap <em>Host (Sender)</em> on Device 1.
            </span>
          </div>
        </div>

        <!-- VIEW 2: Host Mode Active -->
      {:else if selectedRole === 'host'}
        <!-- Status Bar -->
        <div class="status-callout host-status">
          <div class="status-left">
            <span class="status-badge host-badge">Host</span>
            <span class="status-dot pulsing"></span>
            <span class="status-text">{activeSession.statusMessage}</span>
          </div>
          {#if isTransmitting}
            <span class="tx-pill">
              Chirping: {txProgress?.durationSeconds.toFixed(1) || '1.2'}s
            </span>
          {/if}
        </div>

        <div class="modal-body">
          <!-- Audio Visualizer -->
          <div class="visualizer-container">
            <AudioVisualizer active={open} />
            <div class="visualizer-caption">
              <span>Microphone Activity</span>
              <span class="status-indicator-badge" class:transmitting={isTransmitting}>
                {isTransmitting ? 'Sending Sound' : 'Listening for Joiner'}
              </span>
            </div>
          </div>

          <!-- Step Progression Card -->
          <div class="progress-card">
            <!-- Step 1: Broadcast Offer -->
            <div
              class="step-item"
              class:completed={hostOfferDone}
              class:in-progress={!hostOfferDone}
            >
              <div class="step-badge">
                <span class="step-num">1</span>
              </div>
              <div class="step-content">
                <div class="step-header-line">
                  <span class="step-label">1. Send Offer Sound</span>
                  <span class="step-pill" class:completed-pill={hostOfferDone}>
                    {hostOfferDone ? 'Sent' : isTransmitting ? 'Chirping' : 'Preparing'}
                  </span>
                </div>
                <p class="step-desc">
                  {hostOfferDone
                    ? 'Offer sound sent through speakers'
                    : 'Transmitting connection data via sound'}
                </p>
              </div>
            </div>

            <!-- Step 2: Await Answer -->
            <div
              class="step-item"
              class:completed={hostAnswerDone}
              class:in-progress={hostOfferDone && !hostAnswerDone}
            >
              <div class="step-badge">
                <span class="step-num">2</span>
              </div>
              <div class="step-content">
                <div class="step-header-line">
                  <span class="step-label">2. Receive Joiner Response</span>
                  <span class="step-pill" class:completed-pill={hostAnswerDone}>
                    {hostAnswerDone ? 'Received' : 'Listening'}
                  </span>
                </div>
                <p class="step-desc">
                  {hostAnswerDone
                    ? 'Response received from Joiner'
                    : 'Listening with microphone for Joiner sound'}
                </p>
              </div>
            </div>

            <!-- Step 3: WebRTC Connect -->
            <div
              class="step-item"
              class:completed={activeSession.state === 'connected'}
              class:in-progress={hostAnswerDone && activeSession.state !== 'connected'}
            >
              <div class="step-badge">
                <span class="step-num">3</span>
              </div>
              <div class="step-content">
                <div class="step-header-line">
                  <span class="step-label">3. Direct P2P Link</span>
                  <span
                    class="step-pill"
                    class:completed-pill={activeSession.state === 'connected'}
                  >
                    {activeSession.state === 'connected' ? 'Connected' : 'Waiting'}
                  </span>
                </div>
                <p class="step-desc">
                  {activeSession.state === 'connected'
                    ? 'P2P DataChannel connected!'
                    : 'Handshaking direct WebRTC connection'}
                </p>
              </div>
            </div>
          </div>

          <!-- Controls: Send Sound Again & Switch Role -->
          <div class="action-buttons-group">
            <button
              class="btn btn-primary btn-replay"
              onclick={handleReplayTone}
              disabled={isTransmitting}
              type="button"
            >
              <span>{isTransmitting ? 'Chirping Sound...' : 'Send Sound Again'}</span>
            </button>

            <button class="btn btn-outline" onclick={handleResetRole} type="button">
              Switch Role
            </button>
          </div>

          <!-- Sound Mode Switcher inside Host View -->
          <div class="audio-mode-selector compact">
            <span class="label-title">Audio Mode:</span>
            <div class="toggle-pill-group">
              <button
                class="pill-btn"
                class:selected={isSilent}
                onclick={() => updateProtocol(true)}
                type="button"
              >
                Near-Silent
              </button>
              <button
                class="pill-btn"
                class:selected={!isSilent}
                onclick={() => updateProtocol(false)}
                type="button"
              >
                Audible
              </button>
            </div>
          </div>
        </div>

        <!-- VIEW 3: Joiner Mode Active -->
      {:else if selectedRole === 'joiner'}
        <!-- Status Bar -->
        <div class="status-callout joiner-status">
          <div class="status-left">
            <span class="status-badge joiner-badge">Joiner</span>
            <span class="status-dot pulsing"></span>
            <span class="status-text">{activeSession.statusMessage}</span>
          </div>
          {#if isTransmitting}
            <span class="tx-pill">
              Sending Answer: {txProgress?.durationSeconds.toFixed(1) || '1.2'}s
            </span>
          {/if}
        </div>

        <div class="modal-body">
          <!-- Audio Visualizer -->
          <div class="visualizer-container">
            <AudioVisualizer active={open} />
            <div class="visualizer-caption">
              <span>Microphone Activity</span>
              <span class="status-indicator-badge" class:transmitting={isTransmitting}>
                {isTransmitting ? 'Sending Answer' : 'Listening for Host'}
              </span>
            </div>
          </div>

          <!-- Step Progression Card -->
          <div class="progress-card">
            <!-- Step 1: Listen for Host Offer -->
            <div
              class="step-item"
              class:completed={joinerOfferReceived}
              class:in-progress={!joinerOfferReceived}
            >
              <div class="step-badge">
                <span class="step-num">1</span>
              </div>
              <div class="step-content">
                <div class="step-header-line">
                  <span class="step-label">1. Listen for Host Sound</span>
                  <span class="step-pill" class:completed-pill={joinerOfferReceived}>
                    {joinerOfferReceived ? 'Received' : 'Listening'}
                  </span>
                </div>
                <p class="step-desc">
                  {joinerOfferReceived
                    ? 'Host connection offer heard'
                    : 'Listening for sound chirp from Host device...'}
                </p>
              </div>
            </div>

            <!-- Step 2: Send Answer -->
            <div
              class="step-item"
              class:completed={joinerAnswerSent}
              class:in-progress={joinerOfferReceived && !joinerAnswerSent}
            >
              <div class="step-badge">
                <span class="step-num">2</span>
              </div>
              <div class="step-content">
                <div class="step-header-line">
                  <span class="step-label">2. Send Response Sound</span>
                  <span class="step-pill" class:completed-pill={joinerAnswerSent}>
                    {joinerAnswerSent ? 'Sent' : joinerOfferReceived ? 'Sending' : 'Waiting'}
                  </span>
                </div>
                <p class="step-desc">
                  {joinerAnswerSent
                    ? 'Response sound transmitted back to Host'
                    : 'Transmitting response back to Host'}
                </p>
              </div>
            </div>

            <!-- Step 3: WebRTC Connect -->
            <div
              class="step-item"
              class:completed={activeSession.state === 'connected'}
              class:in-progress={joinerAnswerSent && activeSession.state !== 'connected'}
            >
              <div class="step-badge">
                <span class="step-num">3</span>
              </div>
              <div class="step-content">
                <div class="step-header-line">
                  <span class="step-label">3. Direct P2P Link</span>
                  <span
                    class="step-pill"
                    class:completed-pill={activeSession.state === 'connected'}
                  >
                    {activeSession.state === 'connected' ? 'Connected' : 'Waiting'}
                  </span>
                </div>
                <p class="step-desc">
                  {activeSession.state === 'connected'
                    ? 'P2P DataChannel connected!'
                    : 'Handshaking direct WebRTC connection'}
                </p>
              </div>
            </div>
          </div>

          <!-- Controls: Switch Role & Replay (if answer sent) -->
          <div class="action-buttons-group">
            {#if joinerAnswerSent}
              <button
                class="btn btn-primary btn-replay"
                onclick={handleReplayTone}
                disabled={isTransmitting}
                type="button"
              >
                <span>{isTransmitting ? 'Chirping Answer...' : 'Send Response Again'}</span>
              </button>
            {/if}

            <button class="btn btn-outline" onclick={handleResetRole} type="button">
              Switch Role
            </button>
          </div>

          <!-- Sound Mode Switcher inside Joiner View -->
          <div class="audio-mode-selector compact">
            <span class="label-title">Audio Mode:</span>
            <div class="toggle-pill-group">
              <button
                class="pill-btn"
                class:selected={isSilent}
                onclick={() => updateProtocol(true)}
                type="button"
              >
                Near-Silent
              </button>
              <button
                class="pill-btn"
                class:selected={!isSilent}
                onclick={() => updateProtocol(false)}
                type="button"
              >
                Audible
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Modal Footer -->
      <div class="modal-footer">
        <button class="btn btn-cancel" onclick={handleClose} type="button"> Cancel </button>
      </div>
</Modal>

<style>
  .modal-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.15rem;
  }

  /* Role Selection View */
  .intro-callout {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid #334155;
    border-radius: 0.65rem;
    padding: 0.75rem 0.85rem;
    font-size: 0.82rem;
    color: #cbd5e1;
    line-height: 1.4;
  }

  .intro-callout p {
    margin: 0;
  }

  .role-grid {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .role-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.85rem;
    padding: 1rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    position: relative;
    overflow: hidden;
  }

  .role-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.4);
  }

  .host-card:hover {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }

  .joiner-card:hover {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.05);
  }

  .role-card-badge {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #94a3b8;
  }

  .role-card-content {
    display: flex;
    align-items: center;
  }

  .role-text-box {
    flex: 1;
  }

  .role-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .role-desc {
    margin: 0.2rem 0 0 0;
    font-size: 0.76rem;
    color: #94a3b8;
    line-height: 1.35;
  }

  .role-action-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(51, 65, 85, 0.6);
    padding-top: 0.5rem;
    margin-top: 0.2rem;
  }

  .action-label {
    font-size: 0.78rem;
    font-weight: 600;
  }

  .host-card .action-label {
    color: #fbbf24;
  }

  .joiner-card .action-label {
    color: #38bdf8;
  }

  .action-arrow {
    font-size: 0.95rem;
    transition: transform 0.15s ease;
  }

  .role-card:hover .action-arrow {
    transform: translateX(3px);
  }

  /* Status Bar */
  .status-callout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.65rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid #334155;
    font-size: 0.82rem;
    color: #cbd5e1;
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex: 1;
    overflow: hidden;
  }

  .status-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border-radius: 9999px;
    white-space: nowrap;
  }

  .status-badge.host-badge {
    background: rgba(245, 158, 11, 0.2);
    color: #facc15;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  .status-badge.joiner-badge {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.35);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #38bdf8;
    flex-shrink: 0;
  }

  .status-dot.pulsing {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.3);
      opacity: 1;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.6;
    }
  }

  .status-text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-pill {
    background: #0284c7;
    color: #e0f2fe;
    font-size: 0.72rem;
    padding: 0.15rem 0.5rem;
    border-radius: 9999px;
    font-weight: 600;
    white-space: nowrap;
  }

  /* Audio Visualizer */
  .visualizer-container {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .visualizer-caption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
    color: #94a3b8;
    padding: 0 0.25rem;
  }

  .status-indicator-badge {
    background: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    font-weight: 500;
    font-size: 0.68rem;
  }

  .status-indicator-badge.transmitting {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  /* Step Progress Card */
  .progress-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .step-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    opacity: 0.55;
    transition: opacity 0.2s ease;
  }

  .step-item.in-progress,
  .step-item.completed {
    opacity: 1;
  }

  .step-badge {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    background: #1e293b;
    border: 1px solid #334155;
    flex-shrink: 0;
  }

  .step-item.in-progress .step-badge {
    background: rgba(56, 189, 248, 0.15);
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .step-item.completed .step-badge {
    background: rgba(16, 185, 129, 0.15);
    border-color: #10b981;
    color: #34d399;
  }

  .step-num {
    font-size: 0.78rem;
    font-weight: 700;
  }

  .step-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .step-header-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .step-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .step-desc {
    margin: 0;
    font-size: 0.72rem;
    color: #94a3b8;
  }

  .step-pill {
    font-size: 0.68rem;
    padding: 0.1rem 0.45rem;
    border-radius: 9999px;
    background: #334155;
    color: #94a3b8;
    font-weight: 500;
  }

  .step-pill.completed-pill {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  /* Audio Mode Selector */
  .audio-mode-selector {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.75rem;
    padding: 0.85rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .audio-mode-selector.compact {
    padding: 0.6rem 0.85rem;
    background: rgba(15, 23, 42, 0.5);
  }

  .mode-label-group {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .label-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .label-desc {
    font-size: 0.7rem;
    color: #94a3b8;
    max-width: 230px;
    line-height: 1.3;
  }

  .toggle-pill-group {
    display: flex;
    background: #1e293b;
    padding: 0.2rem;
    border-radius: 0.5rem;
    border: 1px solid #334155;
    gap: 0.2rem;
  }

  .pill-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 0.35rem 0.65rem;
    border-radius: 0.35rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .pill-btn:hover {
    color: #f1f5f9;
  }

  .pill-btn.selected {
    background: #0284c7;
    color: #ffffff;
    font-weight: 600;
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.3);
  }

  .tip-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.65rem 0.85rem;
    background: rgba(56, 189, 248, 0.08);
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 0.5rem;
    font-size: 0.75rem;
    color: #bae6fd;
    line-height: 1.35;
  }

  /* Action Buttons */
  .action-buttons-group {
    display: flex;
    gap: 0.75rem;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.65rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-primary {
    flex: 1;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: white;
    border: none;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(2, 132, 199, 0.35);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .btn-outline {
    background: transparent;
    border: 1px solid #475569;
    color: #cbd5e1;
    white-space: nowrap;
  }

  .btn-outline:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    border-color: #64748b;
  }

  .modal-footer {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid #334155;
    display: flex;
    justify-content: flex-end;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid #475569;
    color: #cbd5e1;
    padding: 0.45rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-cancel:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
    color: #fca5a5;
  }
</style>
