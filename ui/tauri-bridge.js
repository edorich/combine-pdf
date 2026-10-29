// Tauri Bridge Adapter for window.api
// Preserves 100% existing renderer.js compatibility without changing application logic.

(function () {
  console.log('[Tauri Bridge] Initializing window.api bridge...');

  function getTauriInvoker() {
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      return window.__TAURI__.core.invoke;
    }
    if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
      return window.__TAURI__.invoke;
    }
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      return window.__TAURI_INTERNALS__.invoke;
    }
    return null;
  }

  async function invokeTauri(cmd, payload) {
    const invoker = getTauriInvoker();

    if (!invoker) {
      console.error('[Tauri Bridge] Tauri IPC invoke function not found on window.__TAURI__');
      throw new Error('Tauri API not available in current window context. Ensure withGlobalTauri is true in tauri.conf.json.');
    }

    return await invoker(cmd, payload);
  }

  // OS File Drop Handling
  const onFileDropCallbacks = [];

  function notifyFileDrop(filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return;
    
    const pdfFiles = filePaths
      .filter(p => typeof p === 'string' && p.toLowerCase().endsWith('.pdf'))
      .map(p => {
        const name = p.split(/[/\\]/).pop();
        return { name: name, path: p };
      });

    if (pdfFiles.length > 0) {
      onFileDropCallbacks.forEach(cb => {
        try { cb(pdfFiles); } catch (e) { console.error('[Tauri Bridge] File drop callback error:', e); }
      });
    }
  }

  function initTauriDropListeners() {
    let eventApi = null;
    if (window.__TAURI__ && window.__TAURI__.event) {
      eventApi = window.__TAURI__.event;
    } else if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.plugins && window.__TAURI_INTERNALS__.plugins.event) {
      eventApi = window.__TAURI_INTERNALS__.plugins.event;
    }

    if (eventApi && typeof eventApi.listen === 'function') {
      const dropEvents = ['tauri://drag-drop', 'tauri://file-drop', 'drag-drop'];
      dropEvents.forEach(evtName => {
        try {
          eventApi.listen(evtName, (event) => {
            console.log('[Tauri Bridge] Received drop event:', evtName, event);
            let payload = event.payload;
            if (payload && payload.paths) {
              payload = payload.paths;
            }
            if (Array.isArray(payload)) {
              notifyFileDrop(payload);
            }
          });
        } catch (err) {
          console.warn('[Tauri Bridge] Listener warning for', evtName, err);
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTauriDropListeners);
  } else {
    setTimeout(initTauriDropListeners, 100);
  }

  window.api = {
    selectFiles: () => invokeTauri('select_files'),
    selectFolder: () => invokeTauri('select_folder'),
    selectOutput: () => invokeTauri('select_output'),
    combinePDFs: (files, outputPath) => invokeTauri('combine_pdfs', { files, outputPath }),

    selectSinglePDF: () => invokeTauri('select_single_pdf'),
    detectScanners: () => invokeTauri('detect_scanners'),
    openImageCapture: () => invokeTauri('open_image_capture'),
    mergeScans: (basePdfPath, scannedImages, outputPath) => invokeTauri('merge_scans', { basePdfPath, scannedImages, outputPath }),
    selectScannedFiles: () => invokeTauri('select_scanned_files'),
    scanFromPhysicalScanner: (scannerName) => invokeTauri('scan_from_physical_scanner', { scannerName }),

    selectDirectory: () => invokeTauri('select_directory'),
    selectImageFile: () => invokeTauri('select_image_file'),
    writeFileBytes: (filePath, bytes) => invokeTauri('write_file_bytes', { filePath, bytes: Array.from(bytes) }),
    applyPageEdits: (pages, splitPoints, outputDir, outputPrefix) => invokeTauri('apply_page_edits', { pages, splitPoints, outputDir, outputPrefix }),
    readFileBytes: async (filePath) => {
      const result = await invokeTauri('read_file_bytes', { filePath });
      return new Uint8Array(result);
    },
    onFileDrop: (callback) => {
      if (typeof callback === 'function') {
        onFileDropCallbacks.push(callback);
      }
    }
  };

  console.log('[Tauri Bridge] window.api initialized successfully.');
})();
