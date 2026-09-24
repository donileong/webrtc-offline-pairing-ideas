<script lang="ts">
  import { activeSession } from '../lib/transport/activeSession.svelte';
  import { router } from '../lib/router/routerStore.svelte';

  let messageInput = $state('');
  let uploadPercentage = $state<number | null>(null);

  function sendChat() {
    if (!messageInput.trim()) return;
    try {
      activeSession.sendChatMessage(messageInput.trim());
      messageInput = '';
    } catch (e: unknown) {
      alert(`Send error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      uploadPercentage = 0;
      activeSession.sendFile(file, (pct) => {
        uploadPercentage = pct;
        if (pct >= 100) {
          setTimeout(() => {
            uploadPercentage = null;
          }, 2000);
        }
      });
    }
  }

  function disconnect() {
    activeSession.reset();
    router.navigate('/');
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="room-container">
  {#if activeSession.state !== 'connected'}
    <div class="empty-room-card">
      <div class="empty-badge">Session Inactive</div>
      <h2>No Active Peer Connection</h2>
      <p>Pair with another device via sound, QR code, or manual code exchange first.</p>
      <button class="btn btn-primary" onclick={() => router.navigate('/')}>
        Go to Pairing Methods
      </button>
    </div>
  {:else}
    <!-- Active Room Header -->
    <div class="room-header">
      <div class="room-info">
        <span class="peer-badge">
          {activeSession.role === 'host' ? 'Host' : 'Joiner'}
        </span>
        <span class="connection-status">
          <span class="status-indicator"></span>
          Direct P2P Active
        </span>
        {#if activeSession.latencyMs !== null}
          <span class="latency-badge">
            RTT: {activeSession.latencyMs}ms
          </span>
        {/if}
      </div>

      <button class="btn btn-disconnect" onclick={disconnect}> Disconnect </button>
    </div>

    <!-- Workspace Grid: Chat & File Sharing -->
    <div class="workspace-grid">
      <!-- Chat Column -->
      <div class="card chat-card">
        <div class="section-title">
          <span>Live Chat</span>
          <small>{activeSession.chatMessages.length} messages</small>
        </div>

        <div class="messages-list">
          {#if activeSession.chatMessages.length === 0}
            <div class="empty-chat">
              <span>No messages yet. Send a greeting!</span>
            </div>
          {:else}
            {#each activeSession.chatMessages as msg (msg.id)}
              <div class="chat-message" class:me={msg.sender === 'me'}>
                <div class="message-bubble">
                  <span class="message-text">{msg.text}</span>
                  <span class="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <form
          class="chat-input-form"
          onsubmit={(e) => {
            e.preventDefault();
            sendChat();
          }}
        >
          <input
            type="text"
            placeholder="Type a message to peer..."
            bind:value={messageInput}
            class="chat-input"
          />
          <button type="submit" class="btn btn-primary btn-send" disabled={!messageInput.trim()}>
            Send
          </button>
        </form>
      </div>

      <!-- File Transfer Column -->
      <div class="card file-card">
        <div class="section-title">
          <span>File Transfer</span>
          <small>End-to-end direct</small>
        </div>

        <div class="file-upload-zone">
          <label class="file-drop-area">
            <strong>Select File to Send</strong>
            <small>Direct peer transfer over DataChannel</small>
            <input type="file" onchange={handleFileSelect} class="hidden-input" />
          </label>

          {#if uploadPercentage !== null}
            <div class="progress-bar-container">
              <div class="progress-bar-header">
                <span>Sending...</span>
                <span>{uploadPercentage}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: {uploadPercentage}%"></div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Incoming File Progress -->
        {#if activeSession.fileProgress}
          <div class="incoming-file-card">
            <div class="incoming-file-info">
              <div class="incoming-details">
                <strong>{activeSession.fileProgress.meta.name}</strong>
                <small>
                  {formatBytes(activeSession.fileProgress.receivedBytes)} / {formatBytes(
                    activeSession.fileProgress.totalBytes,
                  )}
                </small>
              </div>
            </div>

            <div class="progress-track">
              <div
                class="progress-fill"
                style="width: {activeSession.fileProgress.percentage}%"
              ></div>
            </div>

            {#if activeSession.fileProgress.blobUrl}
              <a
                href={activeSession.fileProgress.blobUrl}
                download={activeSession.fileProgress.meta.name}
                class="btn btn-download"
              >
                Download Received File
              </a>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .room-container {
    max-width: 900px;
    margin: 0 auto;
  }

  .empty-room-card {
    text-align: center;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 1rem;
    padding: 3rem 1.5rem;
    max-width: 500px;
    margin: 3rem auto;
  }

  .empty-badge {
    display: inline-block;
    padding: 0.25rem 0.65rem;
    border-radius: 9999px;
    background: rgba(148, 163, 184, 0.12);
    color: #94a3b8;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.75rem;
  }

  .empty-room-card h2 {
    color: #f1f5f9;
    margin: 0.5rem 0 0.5rem 0;
  }

  .empty-room-card p {
    color: #94a3b8;
    margin: 0 0 1.5rem 0;
  }

  .room-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #1e293b;
    border: 1px solid #334155;
    padding: 0.75rem 1.25rem;
    border-radius: 0.75rem;
    margin-bottom: 1.25rem;
  }

  .room-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .peer-badge {
    background: #0284c7;
    color: white;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.6rem;
    border-radius: 9999px;
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #10b981;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
  }

  .latency-badge {
    background: #0f172a;
    border: 1px solid #334155;
    color: #38bdf8;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    font-family: monospace;
  }

  .btn-disconnect {
    background: #334155;
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
    padding: 0.4rem 0.8rem;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-disconnect:hover {
    background: #ef4444;
    color: white;
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 1.25rem;
  }

  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    color: #f1f5f9;
    font-size: 0.95rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid #334155;
    padding-bottom: 0.5rem;
  }

  .section-title small {
    color: #94a3b8;
    font-weight: 400;
    font-size: 0.75rem;
  }

  .messages-list {
    height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-right: 0.4rem;
    margin-bottom: 1rem;
  }

  .empty-chat {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #64748b;
    font-size: 0.85rem;
  }

  .chat-message {
    display: flex;
  }

  .chat-message.me {
    justify-content: flex-end;
  }

  .message-bubble {
    max-width: 80%;
    padding: 0.6rem 0.9rem;
    border-radius: 0.75rem;
    background: #334155;
    color: #f1f5f9;
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .chat-message.me .message-bubble {
    background: #0284c7;
    color: white;
  }

  .message-time {
    font-size: 0.65rem;
    opacity: 0.7;
    align-self: flex-end;
  }

  .chat-input-form {
    display: flex;
    gap: 0.5rem;
  }

  .chat-input {
    flex: 1;
    background: #0f172a;
    border: 1px solid #334155;
    color: white;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.85rem;
  }

  .btn-primary {
    background: #0284c7;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 600;
  }

  .file-drop-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 2px dashed #475569;
    border-radius: 0.5rem;
    padding: 1.5rem 1rem;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.2s;
  }

  .file-drop-area:hover {
    border-color: #38bdf8;
  }

  .file-drop-area strong {
    color: #f1f5f9;
    font-size: 0.9rem;
  }

  .file-drop-area small {
    color: #94a3b8;
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .hidden-input {
    display: none;
  }

  .progress-bar-container {
    margin-top: 1rem;
  }

  .progress-bar-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #94a3b8;
    margin-bottom: 0.3rem;
  }

  .progress-track {
    width: 100%;
    height: 6px;
    background: #0f172a;
    border-radius: 9999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #38bdf8;
    transition: width 0.15s ease;
  }

  .incoming-file-card {
    margin-top: 1.25rem;
    background: #0f172a;
    border: 1px solid #334155;
    padding: 0.75rem;
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .incoming-file-info {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .incoming-details strong {
    display: block;
    color: #f1f5f9;
    font-size: 0.85rem;
  }

  .incoming-details small {
    color: #94a3b8;
    font-size: 0.75rem;
  }

  .btn-download {
    display: block;
    text-align: center;
    background: #10b981;
    color: #064e3b;
    padding: 0.4rem;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
  }

  @media (max-width: 768px) {
    .workspace-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
