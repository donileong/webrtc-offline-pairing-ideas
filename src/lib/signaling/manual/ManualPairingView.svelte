<script lang="ts">
  import { onDestroy } from 'svelte';
  import { activeSession } from '../../transport/activeSession.svelte';
  import { ManualSignalingAdapter } from './ManualSignalingAdapter';

  const adapter = new ManualSignalingAdapter();

  let selectedRole = $state<'host' | 'joiner' | null>(null);
  let currentPayload = $state('');
  let payloadType = $state<'offer' | 'answer' | null>(null);
  let waitingFor = $state<'offer' | 'answer' | null>(null);
  let pastedInput = $state('');
  let inputError = $state<string | null>(null);
  let copiedToast = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  adapter.onPayload = (payload, type) => {
    currentPayload = payload;
    payloadType = type;
  };

  adapter.onWaitingForChange = (waiting) => {
    waitingFor = waiting;
  };

  function startHost() {
    selectedRole = 'host';
    currentPayload = '';
    payloadType = null;
    pastedInput = '';
    inputError = null;
    adapter.cleanup();
    activeSession.startPairing('host', adapter);
  }

  function startJoiner() {
    selectedRole = 'joiner';
    currentPayload = '';
    payloadType = null;
    pastedInput = '';
    inputError = null;
    adapter.cleanup();
    activeSession.startPairing('joiner', adapter);
  }

  async function copyPayload() {
    if (!currentPayload) return;
    try {
      await navigator.clipboard.writeText(currentPayload);
      copiedToast = true;
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedToast = false;
      }, 2000);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        pastedInput = text.trim();
        inputError = null;
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  }

  function submitInput() {
    inputError = null;
    const res = adapter.submitPastedInput(pastedInput);
    if (!res.success) {
      inputError = res.error || 'Failed to submit code.';
    } else {
      pastedInput = '';
    }
  }

  function resetRole() {
    adapter.cleanup();
    if (activeSession.state !== 'connected') {
      activeSession.reset();
    }
    selectedRole = null;
    currentPayload = '';
    payloadType = null;
    waitingFor = null;
    pastedInput = '';
    inputError = null;
  }

  onDestroy(() => {
    if (copyTimeout) clearTimeout(copyTimeout);
    adapter.cleanup();
  });
</script>

<div class="manual-pairing-container">
  <div class="card pairing-card">
    <div class="card-header">
      <div class="title-row">
        <div>
          <h3>Manual Copy-Paste Pairing</h3>
          <p class="subtitle">Directly copy and paste short compact connection codes</p>
        </div>
      </div>
      <span class="status-badge" class:active={activeSession.state !== 'idle'}>
        {activeSession.state}
      </span>
    </div>

    <div class="status-callout" class:highlight={activeSession.state !== 'idle'}>
      <span class="status-dot" class:pulsing={activeSession.state !== 'idle'}></span>
      <span>{activeSession.statusMessage}</span>
    </div>

    {#if selectedRole === null}
      <div class="role-grid">
        <button class="btn btn-primary role-btn" onclick={startHost} type="button">
          <div class="btn-text">
            <strong>Device 1: Host</strong>
            <small>Generate Offer code to share</small>
          </div>
        </button>

        <button class="btn btn-secondary role-btn" onclick={startJoiner} type="button">
          <div class="btn-text">
            <strong>Device 2: Joiner</strong>
            <small>Paste Offer code to join</small>
          </div>
        </button>
      </div>
    {:else if selectedRole === 'host'}
      <div class="manual-workspace">
        <div class="workspace-header">
          <span class="badge host-badge">Host Mode</span>
          <button class="btn-text-action" onclick={resetRole} type="button">&larr; Switch Role</button>
        </div>

        <div class="step-card" class:completed={waitingFor === 'answer'}>
          <div class="step-header">
            <span class="step-number">1</span>
            <div>
              <h5>Share Offer Code</h5>
              <p class="step-sub">Copy and send this Offer code to Device 2:</p>
            </div>
          </div>

          {#if currentPayload && payloadType === 'offer'}
            <div class="copy-box">
              <input type="text" readonly value={currentPayload} class="code-input" />
              <button class="btn btn-secondary" onclick={copyPayload} type="button">
                {copiedToast ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
          {:else}
            <div class="loading-code">
              <span class="spinner"></span>
              <span>Generating connection offer...</span>
            </div>
          {/if}
        </div>

        <div class="step-card" class:active={waitingFor === 'answer'}>
          <div class="step-header">
            <span class="step-number">2</span>
            <div>
              <h5>Paste Joiner's Answer</h5>
              <p class="step-sub">Paste the code received back from Device 2:</p>
            </div>
          </div>

          <div class="copy-box">
            <div class="input-wrapper">
              <input
                type="text"
                placeholder="Paste code starting with A|..."
                bind:value={pastedInput}
                onkeydown={(e) => e.key === 'Enter' && submitInput()}
                class="code-input"
                class:has-error={!!inputError}
              />
              <button class="btn-paste" onclick={pasteFromClipboard} type="button" title="Paste from clipboard">
                Paste
              </button>
            </div>
            <button class="btn btn-primary" onclick={submitInput} disabled={!pastedInput.trim()} type="button">
              Connect
            </button>
          </div>

          {#if inputError}
            <p class="error-msg">{inputError}</p>
          {/if}
        </div>

        <div class="active-actions">
          <button class="btn btn-danger" onclick={resetRole} type="button">Cancel Pairing</button>
        </div>
      </div>
    {:else if selectedRole === 'joiner'}
      <div class="manual-workspace">
        <div class="workspace-header">
          <span class="badge joiner-badge">Joiner Mode</span>
          <button class="btn-text-action" onclick={resetRole} type="button">&larr; Switch Role</button>
        </div>

        <div class="step-card" class:completed={!!currentPayload}>
          <div class="step-header">
            <span class="step-number">1</span>
            <div>
              <h5>Paste Host Offer Code</h5>
              <p class="step-sub">Paste the code received from Device 1:</p>
            </div>
          </div>

          <div class="copy-box">
            <div class="input-wrapper">
              <input
                type="text"
                placeholder="Paste code starting with O|..."
                bind:value={pastedInput}
                onkeydown={(e) => e.key === 'Enter' && submitInput()}
                class="code-input"
                class:has-error={!!inputError}
                disabled={activeSession.state !== 'listening-offer'}
              />
              <button
                class="btn-paste"
                onclick={pasteFromClipboard}
                disabled={activeSession.state !== 'listening-offer'}
                type="button"
                title="Paste from clipboard"
              >
                Paste
              </button>
            </div>
            <button
              class="btn btn-primary"
              onclick={submitInput}
              disabled={!pastedInput.trim() || activeSession.state !== 'listening-offer'}
              type="button"
            >
              Generate Answer
            </button>
          </div>

          {#if inputError}
            <p class="error-msg">{inputError}</p>
          {/if}
        </div>

        {#if currentPayload && payloadType === 'answer'}
          <div class="step-card active">
            <div class="step-header">
              <span class="step-number">2</span>
              <div>
                <h5>Send Answer Code Back</h5>
                <p class="step-sub">Copy and send this response code back to Device 1 to finish:</p>
              </div>
            </div>

            <div class="copy-box">
              <input type="text" readonly value={currentPayload} class="code-input" />
              <button class="btn btn-secondary" onclick={copyPayload} type="button">
                {copiedToast ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
            <p class="hint-text">Waiting for Host to finalize connection...</p>
          </div>
        {/if}

        <div class="active-actions">
          <button class="btn btn-danger" onclick={resetRole} type="button">Cancel Pairing</button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .manual-pairing-container {
    max-width: 680px;
    margin: 0 auto;
  }

  .pairing-card {
    background: var(--card-bg, #1e293b);
    border: 1px solid var(--card-border, #334155);
    border-radius: 1rem;
    padding: 1.5rem;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.25rem;
  }

  .title-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #f8fafc;
  }

  .subtitle {
    margin: 0.25rem 0 0 0;
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .status-badge {
    padding: 0.25rem 0.6rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    background: #334155;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .status-badge.active {
    background: #0284c7;
    color: #e0f2fe;
  }

  .status-callout {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid #334155;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.9rem;
    color: #cbd5e1;
    margin-bottom: 1.25rem;
  }

  .status-callout.highlight {
    border-color: #38bdf8;
    color: #f0f9ff;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #64748b;
  }

  .status-dot.pulsing {
    background: #38bdf8;
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.3);
      opacity: 1;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.7;
    }
  }

  .role-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .role-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1.2rem;
    border-radius: 0.75rem;
    text-align: left;
    cursor: pointer;
    border: 1px solid #334155;
    transition: transform 0.15s, border-color 0.15s;
  }

  .role-btn:hover {
    transform: translateY(-2px);
    border-color: #38bdf8;
  }

  .btn-text strong {
    display: block;
    font-size: 1rem;
  }

  .btn-text small {
    display: block;
    font-size: 0.78rem;
    opacity: 0.85;
    margin-top: 0.2rem;
  }

  .btn-primary {
    background: #0284c7;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-secondary {
    background: #334155;
    color: white;
    border: none;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #475569;
  }

  .manual-workspace {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .workspace-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #334155;
  }

  .badge {
    padding: 0.2rem 0.5rem;
    border-radius: 0.35rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .host-badge {
    background: #0284c7;
    color: #e0f2fe;
  }

  .joiner-badge {
    background: #6366f1;
    color: #e0e7ff;
  }

  .btn-text-action {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .btn-text-action:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.08);
  }

  .step-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.75rem;
    padding: 1rem;
    transition: all 0.2s ease;
  }

  .step-card.active {
    border-color: #38bdf8;
    box-shadow: 0 0 0 1px #38bdf8;
  }

  .step-card.completed {
    border-color: #10b981;
    opacity: 0.9;
  }

  .step-header {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    margin-bottom: 0.75rem;
  }

  .step-number {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #1e293b;
    border: 1px solid #475569;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-card.active .step-number {
    background: #0284c7;
    border-color: #38bdf8;
    color: white;
  }

  .step-card.completed .step-number {
    background: #10b981;
    border-color: #34d399;
    color: white;
  }

  h5 {
    margin: 0;
    font-size: 0.92rem;
    color: #f8fafc;
  }

  .step-sub {
    margin: 0.15rem 0 0 0;
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .copy-box {
    display: flex;
    gap: 0.5rem;
  }

  .input-wrapper {
    position: relative;
    flex: 1;
    display: flex;
  }

  .input-wrapper .code-input {
    padding-right: 3.5rem;
  }

  .btn-paste {
    position: absolute;
    right: 0.35rem;
    top: 50%;
    transform: translateY(-50%);
    background: #334155;
    border: none;
    color: #cbd5e1;
    font-size: 0.72rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .btn-paste:hover {
    background: #475569;
    color: white;
  }

  .code-input {
    flex: 1;
    background: #1e293b;
    border: 1px solid #475569;
    color: #38bdf8;
    padding: 0.55rem 0.75rem;
    border-radius: 0.4rem;
    font-size: 0.82rem;
    font-family: monospace;
    outline: none;
  }

  .code-input:focus {
    border-color: #38bdf8;
  }

  .code-input.has-error {
    border-color: #ef4444;
  }

  .error-msg {
    margin: 0.4rem 0 0 0;
    font-size: 0.75rem;
    color: #f87171;
  }

  .hint-text {
    margin: 0.5rem 0 0 0;
    font-size: 0.75rem;
    color: #94a3b8;
    font-style: italic;
  }

  .loading-code {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #334155;
    border-top-color: #38bdf8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .active-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .btn-danger {
    background: #dc2626;
    color: white;
    border: none;
    padding: 0.55rem 1.1rem;
    border-radius: 0.4rem;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-danger:hover {
    background: #b91c1c;
  }
</style>
