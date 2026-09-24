<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { activeSession } from '../../transport/activeSession.svelte';
  import { ManualSignalingAdapter } from './ManualSignalingAdapter';
  import Modal from '../../ui/Modal.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

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

  function handleResetRole() {
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

  function handleClose() {
    handleResetRole();
    onclose();
  }

  let wasOpen = false;
  $effect(() => {
    const isOpen = open;
    untrack(() => {
      if (isOpen) {
        wasOpen = true;
        handleResetRole();
      } else if (wasOpen) {
        wasOpen = false;
        handleResetRole();
      }
    });
  });

  // Watch for successful connection to auto-dismiss modal
  $effect(() => {
    const isConnected = activeSession.state === 'connected';
    untrack(() => {
      if (isConnected) {
        adapter.cleanup();
        onclose();
      }
    });
  });

  onDestroy(() => {
    if (copyTimeout) clearTimeout(copyTimeout);
    adapter.cleanup();
  });
</script>

<Modal
  {open}
  title="Manual Copy-Paste Pairing"
  subtitle="Exchange compact connection codes between devices"
  maxWidth="540px"
  onclose={handleClose}
>
  <!-- Status banner -->
  <div class="status-callout" class:highlight={activeSession.state !== 'idle'}>
    <span class="status-dot" class:pulsing={activeSession.state !== 'idle'}></span>
    <span class="status-text">{activeSession.statusMessage}</span>
  </div>

  <div class="modal-body">
    {#if selectedRole === null}
      <!-- Role Selection Screen -->
      <div class="role-intro">
        <p>Choose which device initiates the connection:</p>
      </div>

      <div class="role-grid">
        <button class="role-card host-card" onclick={startHost} type="button">
          <div class="role-card-badge">Step 1</div>
          <div class="role-card-header">
            <h4>Host (Device 1)</h4>
            <span class="role-tag">Creates Offer</span>
          </div>
          <p class="role-desc">Generates a short connection code to send to the joiner.</p>
          <div class="role-action">
            <span>Start as Host</span>
            <span class="arrow">&rarr;</span>
          </div>
        </button>

        <button class="role-card joiner-card" onclick={startJoiner} type="button">
          <div class="role-card-badge">Step 2</div>
          <div class="role-card-header">
            <h4>Joiner (Device 2)</h4>
            <span class="role-tag">Receives Offer</span>
          </div>
          <p class="role-desc">Pastes the Host's code and generates an Answer response.</p>
          <div class="role-action">
            <span>Start as Joiner</span>
            <span class="arrow">&rarr;</span>
          </div>
        </button>
      </div>
    {:else if selectedRole === 'host'}
      <!-- Host Workflow -->
      <div class="workspace-header">
        <div class="role-indicator">
          <span class="badge host-badge">Host</span>
          <span class="role-label">Sharing Connection Code</span>
        </div>
        <button class="btn-text-action" onclick={handleResetRole} type="button">
          &larr; Switch Role
        </button>
      </div>

      <div class="flow-steps">
        <!-- Step 1: Copy Offer Code -->
        <div class="step-card" class:completed={waitingFor === 'answer'}>
          <div class="step-header">
            <span class="step-number">1</span>
            <div>
              <h5>Share Offer Code</h5>
              <p class="step-sub">Send this code to Device 2 (via chat, email, or message):</p>
            </div>
          </div>

          {#if currentPayload && payloadType === 'offer'}
            <div class="code-box">
              <input type="text" readonly value={currentPayload} class="code-input" />
              <button class="btn-copy" onclick={copyPayload} type="button">
                {copiedToast ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
          {:else}
            <div class="loading-code">
              <span class="spinner"></span>
              <span>Generating compact connection offer...</span>
            </div>
          {/if}
        </div>

        <!-- Step 2: Paste Joiner's Answer -->
        <div class="step-card" class:active={waitingFor === 'answer'}>
          <div class="step-header">
            <span class="step-number">2</span>
            <div>
              <h5>Paste Answer from Device 2</h5>
              <p class="step-sub">Once Device 2 responds, paste its Answer code here:</p>
            </div>
          </div>

          <div class="input-row">
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
            <button
              class="btn btn-primary"
              disabled={!pastedInput.trim()}
              onclick={submitInput}
              type="button"
            >
              Connect
            </button>
          </div>

          {#if inputError}
            <p class="error-msg">{inputError}</p>
          {/if}
        </div>
      </div>
    {:else if selectedRole === 'joiner'}
      <!-- Joiner Workflow -->
      <div class="workspace-header">
        <div class="role-indicator">
          <span class="badge joiner-badge">Joiner</span>
          <span class="role-label">Connecting to Host</span>
        </div>
        <button class="btn-text-action" onclick={handleResetRole} type="button">
          &larr; Switch Role
        </button>
      </div>

      <div class="flow-steps">
        <!-- Step 1: Paste Host's Offer -->
        <div class="step-card" class:completed={!!currentPayload}>
          <div class="step-header">
            <span class="step-number">1</span>
            <div>
              <h5>Paste Offer from Host</h5>
              <p class="step-sub">Paste the code received from Device 1:</p>
            </div>
          </div>

          <div class="input-row">
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
              disabled={!pastedInput.trim() || activeSession.state !== 'listening-offer'}
              onclick={submitInput}
              type="button"
            >
              Process Offer
            </button>
          </div>

          {#if inputError}
            <p class="error-msg">{inputError}</p>
          {/if}
        </div>

        <!-- Step 2: Share Answer back to Host -->
        {#if currentPayload && payloadType === 'answer'}
          <div class="step-card active">
            <div class="step-header">
              <span class="step-number">2</span>
              <div>
                <h5>Send Answer Code Back</h5>
                <p class="step-sub">Copy and send this response code back to Device 1 to finish:</p>
              </div>
            </div>

            <div class="code-box">
              <input type="text" readonly value={currentPayload} class="code-input" />
              <button class="btn-copy" onclick={copyPayload} type="button">
                {copiedToast ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
            <p class="hint-text">Waiting for Host to complete handshake...</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Footer Actions -->
  <div class="modal-footer">
    <button class="btn btn-cancel" onclick={handleClose} type="button">
      Cancel Pairing
    </button>
  </div>
</Modal>

<style>
  .status-callout {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 1.25rem;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid #334155;
    font-size: 0.82rem;
    color: #cbd5e1;
  }

  .status-callout.highlight {
    color: #f0f9ff;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #64748b;
    flex-shrink: 0;
  }

  .status-dot.pulsing {
    background: #38bdf8;
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .modal-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Role Selection */
  .role-intro p {
    margin: 0;
    font-size: 0.88rem;
    color: #94a3b8;
  }

  .role-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .role-card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.75rem;
    padding: 1.15rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .role-card:hover {
    border-color: #38bdf8;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.15);
  }

  .role-card-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    font-size: 0.65rem;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    font-weight: 600;
  }

  .role-card-header {
    margin-bottom: 0.4rem;
  }

  .role-card h4 {
    margin: 0 0 0.2rem 0;
    font-size: 1rem;
    color: #f8fafc;
  }

  .role-tag {
    font-size: 0.7rem;
    color: #38bdf8;
    font-weight: 500;
  }

  .role-desc {
    margin: 0 0 1rem 0;
    font-size: 0.78rem;
    color: #94a3b8;
    line-height: 1.35;
    flex-grow: 1;
  }

  .role-action {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    font-weight: 600;
    color: #38bdf8;
    border-top: 1px solid #1e293b;
    padding-top: 0.6rem;
  }

  /* Workspace */
  .workspace-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #334155;
  }

  .role-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge {
    padding: 0.2rem 0.5rem;
    border-radius: 0.35rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .host-badge {
    background: #0284c7;
    color: #e0f2fe;
  }

  .joiner-badge {
    background: #6366f1;
    color: #e0e7ff;
  }

  .role-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #e2e8f0;
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

  .flow-steps {
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
    opacity: 0.85;
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
    font-size: 0.76rem;
    color: #94a3b8;
  }

  .code-box {
    display: flex;
    gap: 0.5rem;
  }

  .code-input {
    flex: 1;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 0.4rem;
    padding: 0.55rem 0.75rem;
    font-family: monospace;
    font-size: 0.8rem;
    color: #38bdf8;
    outline: none;
    transition: border-color 0.15s;
  }

  .code-input:focus {
    border-color: #38bdf8;
  }

  .code-input.has-error {
    border-color: #ef4444;
  }

  .btn-copy {
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 0.4rem;
    padding: 0.55rem 0.9rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s;
  }

  .btn-copy:hover {
    background: #0369a1;
  }

  .input-row {
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

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 0.85rem 1.25rem;
    border-top: 1px solid #334155;
    background: rgba(15, 23, 42, 0.4);
  }

  .btn {
    border-radius: 0.4rem;
    padding: 0.55rem 1rem;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity 0.15s, background-color 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #0284c7;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0369a1;
  }

  .btn-cancel {
    background: #334155;
    color: #cbd5e1;
  }

  .btn-cancel:hover {
    background: #475569;
    color: white;
  }

  @media (max-width: 520px) {
    .role-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
