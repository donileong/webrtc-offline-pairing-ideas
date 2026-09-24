/**
 * FileTransferManager.ts
 *
 * Dedicated manager for peer-to-peer binary file streaming and reassembly
 * over WebRTC RTCDataChannel. Handles:
 * - Metadata dispatch
 * - Chunking and flow control
 * - Incoming chunk buffering and Blob URL reconstruction
 */

import type { FileTransferMeta, FileTransferProgress } from './types';

export class FileTransferManager {
  private incomingMeta: FileTransferMeta | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingReceivedBytes = 0;

  public onFileProgress?: (progress: FileTransferProgress) => void;

  /**
   * Resets active file transfer state (e.g. on channel close or error).
   */
  public reset(): void {
    this.incomingMeta = null;
    this.incomingChunks = [];
    this.incomingReceivedBytes = 0;
  }

  /**
   * Handles incoming metadata announcing the start of a file transfer.
   */
  public handleFileStart(meta: FileTransferMeta): void {
    this.incomingMeta = meta;
    this.incomingChunks = [];
    this.incomingReceivedBytes = 0;
    this.onFileProgress?.({
      meta,
      receivedBytes: 0,
      totalBytes: meta.size,
      percentage: 0,
    });
  }

  /**
   * Handles an incoming binary ArrayBuffer chunk and completes Blob assembly
   * when all expected bytes have arrived.
   */
  public handleChunk(data: ArrayBuffer): void {
    if (!this.incomingMeta) return;

    this.incomingChunks.push(data);
    this.incomingReceivedBytes += data.byteLength;

    const percentage = Math.min(
      100,
      Math.round((this.incomingReceivedBytes / this.incomingMeta.size) * 100),
    );

    let blobUrl: string | undefined;
    if (this.incomingReceivedBytes >= this.incomingMeta.size) {
      const blob = new Blob(this.incomingChunks, { type: this.incomingMeta.type });
      blobUrl = URL.createObjectURL(blob);
    }

    this.onFileProgress?.({
      meta: this.incomingMeta,
      receivedBytes: this.incomingReceivedBytes,
      totalBytes: this.incomingMeta.size,
      percentage,
      blobUrl,
    });

    if (blobUrl) {
      this.incomingMeta = null;
      this.incomingChunks = [];
    }
  }

  /**
   * Chunks and transmits a local File over the RTCDataChannel with backpressure flow control.
   */
  public async sendFile(
    file: File,
    dataChannel: RTCDataChannel,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    if (dataChannel.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }

    const meta: FileTransferMeta = {
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    };

    dataChannel.send(JSON.stringify({ type: 'file-start', meta }));

    const chunkSize = 16 * 1024;
    const arrayBuffer = await file.arrayBuffer();
    let offset = 0;

    while (offset < arrayBuffer.byteLength) {
      // Backpressure threshold (4MB buffered)
      if (dataChannel.bufferedAmount > 4 * 1024 * 1024) {
        await new Promise((r) => setTimeout(r, 50));
      }

      const chunk = arrayBuffer.slice(offset, offset + chunkSize);
      dataChannel.send(chunk);
      offset += chunk.byteLength;

      const progress = Math.min(100, Math.round((offset / file.size) * 100));
      onProgress?.(progress);
    }
  }
}
