<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ggwaveService } from './ggwaveService';

  let { active = false }: { active?: boolean } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);
  let animId: number | null = null;

  onMount(() => {
    let ctx2d: CanvasRenderingContext2D | null = null;
    if (canvas) {
      ctx2d = canvas.getContext('2d');
    }

    const render = () => {
      if (!canvas || !ctx2d) {
        animId = requestAnimationFrame(render);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx2d.clearRect(0, 0, width, height);

      let analyser: AnalyserNode | null = null;
      try {
        analyser = ggwaveService.getAnalyserNode();
      } catch {
        // audio context not yet initialized
      }

      if (analyser && active) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const barWidth = (width / bufferLength) * 2.2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height * 0.9;

          // Gradient color from cyan to indigo
          const grad = ctx2d.createLinearGradient(0, height, 0, height - barHeight);
          grad.addColorStop(0, '#06b6d4');
          grad.addColorStop(0.5, '#6366f1');
          grad.addColorStop(1, '#a855f7');

          ctx2d.fillStyle = grad;
          ctx2d.fillRect(x, height - barHeight, barWidth - 1, barHeight);

          x += barWidth;
        }
      } else {
        // Gentle resting idle line
        ctx2d.strokeStyle = 'rgba(148, 163, 184, 0.25)';
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        const midY = height / 2;
        ctx2d.moveTo(0, midY);
        for (let x = 0; x < width; x += 10) {
          const y = midY + Math.sin(x * 0.05 + Date.now() * 0.002) * (active ? 4 : 2);
          ctx2d.lineTo(x, y);
        }
        ctx2d.stroke();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
  });

  onDestroy(() => {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  });
</script>

<div class="visualizer-wrapper">
  <canvas bind:this={canvas} width="400" height="70" class="visualizer-canvas"></canvas>
</div>

<style>
  .visualizer-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 0.5rem;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--card-border, #334155);
    overflow: hidden;
    padding: 0.25rem 0.5rem;
  }

  .visualizer-canvas {
    width: 100%;
    max-width: 400px;
    height: 70px;
    display: block;
  }
</style>
