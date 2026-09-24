<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    subtitle?: string;
    maxWidth?: string;
    onclose: () => void;
    children?: Snippet;
  }

  let { open, title, subtitle, maxWidth = '480px', onclose, children }: Props = $props();

  function handleBackdropKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }
</script>

{#if open}
  <div
    class="modal-backdrop"
    onclick={onclose}
    onkeydown={handleBackdropKey}
    role="presentation"
  >
    <div
      class="modal-card"
      style:max-width={maxWidth}
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-header">
        <div class="header-title-box">
          <div>
            <h3>{title}</h3>
            {#if subtitle}
              <p class="header-subtitle">{subtitle}</p>
            {/if}
          </div>
        </div>
        <button class="close-btn" onclick={onclose} title="Cancel and close">&times;</button>
      </div>

      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 1rem;
    width: 100%;
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    animation: slideUp 0.2s ease-out;
    display: flex;
    flex-direction: column;
  }

  @keyframes slideUp {
    from {
      transform: translateY(12px) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #334155;
  }

  .header-title-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #f8fafc;
  }

  .header-subtitle {
    margin: 0.15rem 0 0 0;
    font-size: 0.78rem;
    color: #94a3b8;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
  }

  .close-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.08);
  }
</style>
