/**
 * VideoEditorService - Encapsula FFmpeg.wasm (core single-thread) para unión de vídeos en el navegador.
 * No requiere COOP/COEP (usa @ffmpeg/core-st).
 */
(function () {
  'use strict';

  const CORE_ST_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist';
  let ffmpegInstance = null;
  let loadPromise = null;

  /**
   * Obtiene la librería FFmpeg del global (debe estar cargada vía script antes).
   * @returns {{ createFFmpeg: Function, fetchFile: Function }}
   */
  function getFFmpegLib() {
    if (typeof window.FFmpeg !== 'undefined' && window.FFmpeg.createFFmpeg && window.FFmpeg.fetchFile) {
      return window.FFmpeg;
    }
    throw new Error('FFmpeg no cargado. Incluye el script de @ffmpeg/ffmpeg antes de usar el editor.');
  }

  /**
   * Carga FFmpeg con el core single-thread (no requiere SharedArrayBuffer).
   * @param {Object} [opts] - Opciones: log (boolean), onProgress (function)
   * @returns {Promise<Object>} Instancia de FFmpeg
   */
  async function loadFFmpeg(opts = {}) {
    if (ffmpegInstance) return ffmpegInstance;
    if (loadPromise) return loadPromise;

    const { createFFmpeg } = getFFmpegLib();
    const coreURL = opts.coreURL || `${CORE_ST_BASE}/ffmpeg-core.js`;
    const wasmURL = opts.wasmURL || `${CORE_ST_BASE}/ffmpeg-core.wasm`;
    // En 0.11 el core se elige en createFFmpeg (core-st = single-thread, sin SharedArrayBuffer)
    const ffmpeg = createFFmpeg({
      log: opts.log !== false,
      coreURL: coreURL,
      wasmURL: wasmURL
    });

    loadPromise = ffmpeg.load();
    await loadPromise;
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  }

  /**
   * Une dos vídeos (concat demuxer). Compatible con MP4.
   * @param {File} file1 - Primer vídeo
   * @param {File} file2 - Segundo vídeo
   * @param {Object} [opts] - { onProgress: (msg) => void }
   * @returns {Promise<string>} URL del blob del vídeo resultante (revocar con URL.revokeObjectURL cuando no se use)
   */
  async function concatVideos(file1, file2, opts = {}) {
    const ffmpeg = await loadFFmpeg({ onProgress: opts.onProgress });
    const { fetchFile } = getFFmpegLib();

    const v1 = 'v1.mp4';
    const v2 = 'v2.mp4';
    const out = 'output.mp4';

    if (opts.onProgress) opts.onProgress('Leyendo archivos…');
    ffmpeg.FS('writeFile', v1, await fetchFile(file1));
    ffmpeg.FS('writeFile', v2, await fetchFile(file2));

    if (opts.onProgress) opts.onProgress('Uniendo vídeos…');
    // concat demuxer: archivo de lista y luego run con -f concat
    const listContent = `file '${v1}'\nfile '${v2}'`;
    ffmpeg.FS('writeFile', 'list.txt', new TextEncoder().encode(listContent));
    await ffmpeg.run('-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', out);

    const data = ffmpeg.FS('readFile', out);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    // Limpieza en memoria
    try {
      ffmpeg.FS('unlink', v1);
      ffmpeg.FS('unlink', v2);
      ffmpeg.FS('unlink', 'list.txt');
      ffmpeg.FS('unlink', out);
    } catch (_) {}

    return url;
  }

  /**
   * Revoca una URL de blob creada por concatVideos (liberar memoria).
   * @param {string} url
   */
  function revokeOutputURL(url) {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  window.VideoEditorService = {
    loadFFmpeg,
    concatVideos,
    revokeOutputURL,
    getFFmpegLib
  };
})();
