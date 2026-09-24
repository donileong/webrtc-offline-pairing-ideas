<script lang="ts">
  import { router } from './lib/router/routerStore.svelte';
  import { activeSession } from './lib/transport/activeSession.svelte';
  import Router from './lib/router/Router.svelte';

  function goHome() {
    router.navigate('/');
  }

  function goToRoom() {
    router.navigate('/room');
  }
</script>

<div class="app-layout">
  <header class="app-header">
    <button class="brand-btn" onclick={goHome}>
      <img src="/favicon.svg" alt="Peer Box Logo" class="brand-mark" width="28" height="28" />
      <span class="brand-title">Peer Box</span>
    </button>

    <nav class="nav-links">
      <button
        class="nav-btn"
        class:active={router.path === '/' || router.path.startsWith('/connect')}
        onclick={goHome}
      >
        Methods
      </button>

      {#if activeSession.state === 'connected'}
        <button
          class="nav-btn room-active-btn"
          class:active={router.path === '/room'}
          onclick={goToRoom}
        >
          <span class="online-dot"></span>
          Room
        </button>
      {/if}
    </nav>
  </header>

  <main class="main-content">
    <Router />
  </main>

  <footer class="app-footer">
    <p>Peer Box &bull; Decentralized, Serverless P2P WebRTC</p>
  </footer>
</div>

<style>
  .app-layout {
    display: flex;
    flex-direction: column;
    min-height: 90vh;
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 0;
    margin-bottom: 2rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .brand-btn {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: block;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }

  .brand-title {
    font-size: 1.25rem;
    font-weight: 700;
    background: linear-gradient(135deg, #f8fafc, #94a3b8);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 0.9rem;
    font-weight: 500;
    padding: 0.4rem 0.8rem;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .nav-btn:hover {
    color: #f1f5f9;
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-btn.active {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
  }

  .room-active-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: #10b981;
    font-weight: 600;
  }

  .online-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
  }

  .main-content {
    flex: 1;
  }

  .app-footer {
    text-align: center;
    padding: 2rem 0 1rem 0;
    color: #64748b;
    font-size: 0.8rem;
  }
</style>
