// State Management
let queue = [];
let outputPath = '';
let draggedQueueIndex = null;
let activeDraggedLi = null;

// Scan & Merge State Management
let scanBasePdf = null;
let scannedPages = [];
let scanOutputPath = '';
let cameraStream = null;
let cameraDevices = [];
let usbScanners = [];
let selectedFilter = 'none';

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileList = document.getElementById('file-list');
const emptyState = document.getElementById('empty-state');
const queueCount = document.getElementById('queue-count');
const btnClearQueue = document.getElementById('btn-clear-queue');
const outputPathInput = document.getElementById('output-path');
const btnBrowseFiles = document.getElementById('btn-browse-files');
const btnBrowseFolder = document.getElementById('btn-browse-folder');
const btnBrowseOutput = document.getElementById('btn-browse-output');
const btnCombine = document.getElementById('btn-combine');
const toastContainer = document.getElementById('toast-container');

// Initialize Events
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  setupQueueSortable();
  setupDragAndDrop();
  setupClickHandlers();
  setupTabNavigation();
  initOrganizeTab();
  initEmbedTab();
  initFreeEmbedTab();
  updateUI();
}

// Drag and Drop Handling
function setupDragAndDrop() {
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-active');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (!dt || !dt.files) return;
    const files = Array.from(dt.files);
    
    const addedPDFs = [];
    files.forEach(file => {
      const filePath = file.path;
      if (filePath && file.name.toLowerCase().endsWith('.pdf')) {
        addedPDFs.push({
          name: file.name,
          path: filePath
        });
      }
    });

    if (addedPDFs.length > 0) {
      addFilesToQueue(addedPDFs);
      showToast('Files Added', `Successfully added ${addedPDFs.length} PDF(s) to the queue.`, 'success');
    }
  });

  // Listen for Tauri native OS drag & drop
  if (window.api && typeof window.api.onFileDrop === 'function') {
    window.api.onFileDrop((addedPDFs) => {
      if (addedPDFs && addedPDFs.length > 0) {
        addFilesToQueue(addedPDFs);
        showToast('Files Added', `Successfully added ${addedPDFs.length} PDF(s) to the queue.`, 'success');
      }
    });
  }
}

// Click Action Handlers
function setupClickHandlers() {
  // Browse Files button
  btnBrowseFiles.addEventListener('click', async (e) => {
    if (e) e.preventDefault();
    try {
      const selected = await window.api.selectFiles();
      if (selected && selected.length > 0) {
        addFilesToQueue(selected);
        showToast('Files Added', `Added ${selected.length} PDF file(s).`, 'success');
      }
    } catch (err) {
      showToast('Error', 'Failed to browse files: ' + err.message, 'error');
    }
  });

  // Browse Folder button
  btnBrowseFolder.addEventListener('click', async (e) => {
    if (e) e.preventDefault();
    try {
      const folderPDFs = await window.api.selectFolder();
      if (folderPDFs && folderPDFs.length > 0) {
        addFilesToQueue(folderPDFs);
        showToast('Folder Loaded', `Loaded ${folderPDFs.length} PDF file(s) from folder.`, 'success');
      } else if (folderPDFs) {
        showToast('No PDFs Found', 'No PDF files were found in the selected folder.', 'info');
      }
    } catch (err) {
      showToast('Error', 'Failed to read folder: ' + err.message, 'error');
    }
  });

  // Browse Output Save Location
  btnBrowseOutput.addEventListener('click', async (e) => {
    if (e) e.preventDefault();
    try {
      const selectedPath = await window.api.selectOutput();
      if (selectedPath) {
        outputPath = selectedPath;
        outputPathInput.value = outputPath;
        updateUI();
        showToast('Output Target Set', 'Save location defined.', 'success');
      }
    } catch (err) {
      showToast('Error', 'Failed to define output destination: ' + err.message, 'error');
    }
  });

  // Clear Queue button
  btnClearQueue.addEventListener('click', () => {
    queue = [];
    updateUI();
    showToast('Queue Cleared', 'All files removed from compilation queue.', 'info');
  });

  // Combine PDFs Trigger
  btnCombine.addEventListener('click', async () => {
    if (queue.length < 2) {
      showToast('Minimum Required', 'Please add at least 2 PDF files to combine.', 'error');
      return;
    }
    if (!outputPath) {
      showToast('Destination Needed', 'Please select an output file path first.', 'error');
      return;
    }

    setCombiningState(true);

    try {
      const filePaths = queue.map(f => f.path);
      const result = await window.api.combinePDFs(filePaths, outputPath);

      if (result.success) {
        showToast('Combine Succeeded', 'Your PDF documents have been successfully merged.', 'success');
      } else {
        showToast('Merge Failed', result.error || 'An unknown error occurred.', 'error');
      }
    } catch (err) {
      showToast('Merge Failed', err.message, 'error');
    } finally {
      setCombiningState(false);
    }
  });
}

// Queue modification helpers
function addFilesToQueue(files) {
  files.forEach(file => {
    // Avoid exact duplicate paths already in queue to prevent redundancy
    const exists = queue.some(item => item.path === file.path);
    if (!exists) {
      queue.push(file);
    }
  });
  updateUI();
}

function removeFile(index) {
  queue.splice(index, 1);
  updateUI();
}

function moveUp(index) {
  if (index > 0) {
    const temp = queue[index];
    queue[index] = queue[index - 1];
    queue[index - 1] = temp;
    updateUI();
  }
}

function moveDown(index) {
  if (index < queue.length - 1) {
    const temp = queue[index];
    queue[index] = queue[index + 1];
    queue[index + 1] = temp;
    updateUI();
  }
}

// UI State Updates
function updateUI() {
  // Update badges & empty state visibility
  queueCount.textContent = `${queue.length} file${queue.length === 1 ? '' : 's'}`;
  
  if (queue.length === 0) {
    emptyState.style.display = 'flex';
    fileList.innerHTML = '';
    btnClearQueue.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    btnClearQueue.style.display = 'inline-block';
    renderQueueList();
  }

  // Handle Combine button activation status
  const canCombine = queue.length >= 2 && outputPath !== '';
  if (canCombine) {
    btnCombine.classList.remove('btn-disabled');
    btnCombine.removeAttribute('disabled');
  } else {
    btnCombine.classList.add('btn-disabled');
    btnCombine.setAttribute('disabled', 'true');
  }
}

let activeGhost = null;
let activePlaceholder = null;
let activeSourceCard = null;
let dragOffsetY = 0;

// Setup Global Window Queue Sortable Engine (Ghost & Placeholder strategy)
function setupQueueSortable() {
  window.addEventListener('pointermove', (e) => {
    if (!activeGhost || !activePlaceholder) return;
    e.preventDefault();

    // 1. Move floating ghost layer under cursor
    const currentY = e.clientY - dragOffsetY;
    activeGhost.style.top = `${currentY}px`;

    // 2. Detect card under cursor pointer
    const elementUnderPoint = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementUnderPoint) return;

    const targetCard = elementUnderPoint.closest('.file-item:not(.dragging-ghost)');
    if (targetCard && targetCard !== activePlaceholder && targetCard.parentNode === fileList) {
      const rect = targetCard.getBoundingClientRect();
      const isAfter = (e.clientY - rect.top) / rect.height > 0.5;
      fileList.insertBefore(activePlaceholder, isAfter ? targetCard.nextSibling : targetCard);
    }
  });

  const finishDrag = (e) => {
    if (!activeGhost || !activePlaceholder || !activeSourceCard) return;

    // Drop original card into final placeholder position
    fileList.insertBefore(activeSourceCard, activePlaceholder);

    if (activeGhost.parentNode) activeGhost.parentNode.removeChild(activeGhost);
    if (activePlaceholder.parentNode) activePlaceholder.parentNode.removeChild(activePlaceholder);

    activeSourceCard.style.display = '';
    activeSourceCard = null;
    activeGhost = null;
    activePlaceholder = null;
    document.body.style.cursor = '';

    // Read updated DOM order & sync queue array
    const newQueue = [];
    const currentNodes = fileList.querySelectorAll('.file-item');
    currentNodes.forEach(node => {
      const origIdx = parseInt(node.getAttribute('data-original-index'), 10);
      if (!isNaN(origIdx) && queue[origIdx]) {
        newQueue.push(queue[origIdx]);
      }
    });

    if (newQueue.length === queue.length) {
      queue = newQueue;
    }
    updateUI();
  };

  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', finishDrag);
}

// Render dynamic queue elements
function renderQueueList() {
  fileList.innerHTML = '';
  
  queue.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.setAttribute('data-original-index', index);
    
    // File Card Structure (Entire card is draggable!)
    li.innerHTML = `
      <div class="drag-handle" title="Hold & drag anywhere on card to reorder position">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="5" r="1.5" fill="currentColor"></circle>
          <circle cx="9" cy="12" r="1.5" fill="currentColor"></circle>
          <circle cx="9" cy="19" r="1.5" fill="currentColor"></circle>
          <circle cx="15" cy="5" r="1.5" fill="currentColor"></circle>
          <circle cx="15" cy="12" r="1.5" fill="currentColor"></circle>
          <circle cx="15" cy="19" r="1.5" fill="currentColor"></circle>
        </svg>
      </div>
      <div class="file-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <path d="M9 15h6"></path>
        </svg>
      </div>
      <div class="file-details">
        <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <span class="file-path" title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</span>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-action-icon btn-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button type="button" class="btn-action-icon btn-move-down" title="Move Down" ${index === queue.length - 1 ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <button type="button" class="btn-action-icon btn-delete" title="Remove File">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    `;

    // Initiate drag anywhere on card (skipping action buttons)
    li.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.file-actions') || e.target.closest('button')) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      const rect = li.getBoundingClientRect();
      dragOffsetY = e.clientY - rect.top;
      activeSourceCard = li;

      // Create Placeholder
      activePlaceholder = document.createElement('li');
      activePlaceholder.className = 'file-item-placeholder';
      activePlaceholder.style.height = `${rect.height}px`;

      // Create Floating Ghost
      activeGhost = li.cloneNode(true);
      activeGhost.classList.add('dragging-ghost');
      activeGhost.style.top = `${rect.top}px`;
      activeGhost.style.left = `${rect.left}px`;
      activeGhost.style.width = `${rect.width}px`;
      activeGhost.style.height = `${rect.height}px`;

      document.body.appendChild(activeGhost);
      fileList.insertBefore(activePlaceholder, li);
      li.style.display = 'none';

      document.body.style.cursor = 'grabbing';
    });

    // Event listeners inside the generated items
    li.querySelector('.btn-move-up').addEventListener('click', (e) => { e.stopPropagation(); moveUp(index); });
    li.querySelector('.btn-move-down').addEventListener('click', (e) => { e.stopPropagation(); moveDown(index); });
    li.querySelector('.btn-delete').addEventListener('click', (e) => { e.stopPropagation(); removeFile(index); });

    fileList.appendChild(li);
  });
}

// Toggle Combine processing status
function setCombiningState(isCombining) {
  if (isCombining) {
    btnCombine.classList.add('btn-disabled');
    btnCombine.setAttribute('disabled', 'true');
    btnCombine.innerHTML = `<span class="spinner"></span> Combining Documents...`;
    
    // Disable inputs & list buttons while working
    btnBrowseFiles.classList.add('btn-disabled');
    btnBrowseFolder.classList.add('btn-disabled');
    btnBrowseOutput.classList.add('btn-disabled');
    btnBrowseFiles.setAttribute('disabled', 'true');
    btnBrowseFolder.setAttribute('disabled', 'true');
    btnBrowseOutput.setAttribute('disabled', 'true');
    btnClearQueue.setAttribute('disabled', 'true');
    
    document.querySelectorAll('.file-actions button').forEach(b => b.setAttribute('disabled', 'true'));
  } else {
    btnCombine.innerHTML = `Combine PDF Documents`;
    
    btnBrowseFiles.classList.remove('btn-disabled');
    btnBrowseFolder.classList.remove('btn-disabled');
    btnBrowseOutput.classList.remove('btn-disabled');
    btnBrowseFiles.removeAttribute('disabled');
    btnBrowseFolder.removeAttribute('disabled');
    btnBrowseOutput.removeAttribute('disabled');
    btnClearQueue.removeAttribute('disabled');
    
    updateUI();
  }
}

// Toast Notifications System
function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Custom toast icon mappings
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-start)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
  `;

  toastContainer.appendChild(toast);

  // Trigger dismissal after timer
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

// Simple HTML escaping helper to avoid XSS issues from filenames
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// TAB SYSTEM NAVIGATION
function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update buttons
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update contents
      tabContents.forEach(c => {
        c.style.display = 'none';
        c.classList.remove('active');
      });
      const targetContent = document.getElementById(targetTab);
      if (targetContent) {
        targetContent.style.display = 'block';
        targetContent.classList.add('active');
      }
      
      // If switching away from scan tab, stop camera stream
      if (targetTab !== 'scan-tab') {
        stopCamera();
      } else {
        refreshDevices();
      }
    });
  });
}

// SCAN & MERGE LOGIC INITIALIZATION
function initScanTab() {
  const btnSelectBasePdf = document.getElementById('btn-select-base-pdf');
  const btnRefreshScanners = document.getElementById('btn-refresh-scanners');
  const scannerSelect = document.getElementById('scanner-select');
  const btnTriggerScan = document.getElementById('btn-trigger-scan');
  const btnOpenSysScanner = document.getElementById('btn-open-sys-scanner');
  const btnClearScans = document.getElementById('btn-clear-scans');
  const btnBrowseScanOutput = document.getElementById('btn-browse-scan-output');
  const btnMergeScans = document.getElementById('btn-merge-scans');
  const btnImportScanFiles = document.getElementById('btn-import-scan-files');
  const filterBtns = document.querySelectorAll('.btn-filter');

  // Add files manually from explorer
  if (btnImportScanFiles) {
    btnImportScanFiles.addEventListener('click', async () => {
      try {
        const selected = await window.api.selectScannedFiles();
        if (selected && selected.length > 0) {
          selected.forEach(file => {
            const exists = scannedPages.some(path => path === file.path);
            if (!exists) {
              scannedPages.push(file.path);
            }
          });
          updateScanUI();
          showToast('Pages Imported', `Imported ${selected.length} scanned page(s) successfully.`, 'success');
        }
      } catch (err) {
        showToast('Error', 'Failed to import files: ' + err.message, 'error');
      }
    });
  }

  // Setup drag and drop for scanned pages container
  const scanQueueContainer = document.querySelector('#scan-tab .queue-container');
  if (scanQueueContainer) {
    ['dragenter', 'dragover'].forEach(eventName => {
      scanQueueContainer.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        scanQueueContainer.classList.add('drag-active');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      scanQueueContainer.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        scanQueueContainer.classList.remove('drag-active');
      }, false);
    });

    scanQueueContainer.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = Array.from(dt.files);
      
      const addedFiles = [];
      files.forEach(file => {
        if (file.path) {
          const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
          if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.pdf') {
            const exists = scannedPages.some(path => path === file.path);
            if (!exists) {
              addedFiles.push(file.path);
            }
          }
        }
      });

      if (addedFiles.length > 0) {
        scannedPages.push(...addedFiles);
        updateScanUI();
        showToast('Files Imported', `Successfully imported ${addedFiles.length} file(s).`, 'success');
      } else {
        showToast('Invalid File', 'Please drop image files (PNG/JPG) or PDFs only.', 'error');
      }
    });
  }

  // Choose base PDF
  btnSelectBasePdf.addEventListener('click', async () => {
    try {
      const selected = await window.api.selectSinglePDF();
      if (selected) {
        scanBasePdf = selected;
        
        // Update PDF UI Card
        document.getElementById('base-pdf-name').textContent = selected.name;
        document.getElementById('base-pdf-pages').textContent = `${selected.pages} page${selected.pages === 1 ? '' : 's'}`;
        document.getElementById('base-pdf-info').style.display = 'block';
        btnSelectBasePdf.textContent = 'Change Base PDF';
        
        // Auto-populate default save destination if empty
        if (!scanOutputPath) {
          const basePath = selected.path;
          const ext = basePath.substring(basePath.lastIndexOf('.'));
          const withoutExt = basePath.substring(0, basePath.lastIndexOf('.'));
          scanOutputPath = `${withoutExt}_merged${ext}`;
          document.getElementById('scan-output-path').value = scanOutputPath;
        }
        
        updateScanUI();
        showToast('PDF Target Selected', `Selected: ${selected.name}`, 'success');
      }
    } catch (err) {
      showToast('Error', 'Failed to select PDF: ' + err.message, 'error');
    }
  });

  // Refresh devices
  btnRefreshScanners.addEventListener('click', refreshDevices);

  // Scanner dropdown change
  scannerSelect.addEventListener('change', handleScannerChange);

  // Trigger Scan
  btnTriggerScan.addEventListener('click', triggerScan);

  // Open native scan app
  btnOpenSysScanner.addEventListener('click', async () => {
    try {
      const result = await window.api.openImageCapture();
      if (result.success) {
        showToast('Utility Opened', 'Open scanner wizard success. Save scanned pages to your PC, then drag them here or add them.', 'info');
      } else {
        showToast('Open Failed', result.error || 'Could not open native scanner helper.', 'error');
      }
    } catch (err) {
      showToast('Error', err.message, 'error');
    }
  });

  // Filter selection
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFilter = btn.getAttribute('data-filter');
    });
  });

  // Clear scans
  btnClearScans.addEventListener('click', () => {
    scannedPages = [];
    updateScanUI();
    showToast('Scans Cleared', 'All scans removed.', 'info');
  });

  // Output destination selection
  btnBrowseScanOutput.addEventListener('click', async () => {
    try {
      const selectedPath = await window.api.selectOutput();
      if (selectedPath) {
        scanOutputPath = selectedPath;
        document.getElementById('scan-output-path').value = scanOutputPath;
        updateScanUI();
        showToast('Destination Set', 'Save location defined.', 'success');
      }
    } catch (err) {
      showToast('Error', 'Failed to set output path: ' + err.message, 'error');
    }
  });

  // Execute merge
  btnMergeScans.addEventListener('click', async () => {
    if (!scanBasePdf) {
      showToast('PDF Required', 'Please select a base PDF first.', 'error');
      return;
    }
    if (scannedPages.length === 0) {
      showToast('Scans Required', 'Please perform or capture at least one scan page.', 'error');
      return;
    }
    if (!scanOutputPath) {
      showToast('Destination Required', 'Please select output destination.', 'error');
      return;
    }

    setScanMergingState(true);

    try {
      const result = await window.api.mergeScans(scanBasePdf.path, scannedPages, scanOutputPath);
      if (result.success) {
        showToast('Merge Succeeded', 'Scanned page(s) successfully merged to base PDF.', 'success');
        // Clear scans after successful merge
        scannedPages = [];
        updateScanUI();
      } else {
        showToast('Merge Failed', result.error || 'An error occurred.', 'error');
      }
    } catch (err) {
      showToast('Merge Failed', err.message, 'error');
    } finally {
      setScanMergingState(false);
    }
  });
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
  
  const container = document.getElementById('camera-preview-container');
  if (container) container.style.display = 'none';
}

async function refreshDevices() {
  const select = document.getElementById('scanner-select');
  if (!select) return;
  
  select.innerHTML = '<option value="" disabled selected>Searching for devices...</option>';
  
  try {
    usbScanners = await window.api.detectScanners();
    
    // Get camera devices
    cameraDevices = [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      devices.forEach(device => {
        if (device.kind === 'videoinput') {
          cameraDevices.push({
            id: device.deviceId,
            name: device.label || `Camera ${cameraDevices.length + 1}`
          });
        }
      });
    } catch (camErr) {
      console.error('Error fetching cameras:', camErr);
    }
    
    select.innerHTML = '<option value="" disabled selected>Select scanner or camera...</option>';
    
    // 1. Populate USB Scanners
    const hasUSB = usbScanners.some(s => s.type === 'USB Scanner');
    if (hasUSB) {
      const optGroupUSB = document.createElement('optgroup');
      optGroupUSB.label = 'Physical USB Scanners';
      usbScanners.forEach(s => {
        if (s.type === 'USB Scanner') {
          const opt = document.createElement('option');
          opt.value = `usb:${s.name}`;
          opt.textContent = `${s.name}`;
          optGroupUSB.appendChild(opt);
        }
      });
      select.appendChild(optGroupUSB);
    }
    
    // 2. Populate Camera/Doc Cams
    if (cameraDevices.length > 0) {
      const optGroupCam = document.createElement('optgroup');
      optGroupCam.label = 'Cameras & Document Cams';
      cameraDevices.forEach(cam => {
        const opt = document.createElement('option');
        opt.value = `cam:${cam.id}`;
        opt.textContent = `${cam.name}`;
        optGroupCam.appendChild(opt);
      });
      select.appendChild(optGroupCam);
    }
    
    // 3. Populate Virtual Sim
    const optGroupVirtual = document.createElement('optgroup');
    optGroupVirtual.label = 'Simulator';
    const optVirtual = document.createElement('option');
    optVirtual.value = 'virtual:sim';
    optVirtual.textContent = 'Virtual Scanner (Simulation Mode)';
    optGroupVirtual.appendChild(optVirtual);
    select.appendChild(optGroupVirtual);
    
  } catch (err) {
    select.innerHTML = '<option value="" disabled selected>Failed to search devices</option>';
    showToast('Device Scan Error', err.message, 'error');
  }
}

async function handleScannerChange(e) {
  const value = e.target.value;
  stopCamera();
  
  const statusText = document.getElementById('scanner-status-text');
  const physicalHelp = document.getElementById('physical-scan-help');
  const previewContainer = document.getElementById('camera-preview-container');
  const filterControls = document.getElementById('camera-filter-controls');
  const btnTriggerScan = document.getElementById('btn-trigger-scan');
  
  physicalHelp.style.display = 'none';
  previewContainer.style.display = 'none';
  filterControls.style.display = 'none';
  btnTriggerScan.classList.add('btn-disabled');
  btnTriggerScan.setAttribute('disabled', 'true');
  
  if (value.startsWith('usb:')) {
    const name = value.replace('usb:', '');
    statusText.innerHTML = `<span class="status-dot online"></span> Status: Connected to ${name}`;
    physicalHelp.style.display = 'block';
    btnTriggerScan.innerHTML = 'Trigger Physical Scan';
    btnTriggerScan.classList.remove('btn-disabled');
    btnTriggerScan.removeAttribute('disabled');
  } else if (value.startsWith('cam:')) {
    const camId = value.replace('cam:', '');
    statusText.innerHTML = `<span class="status-dot online"></span> Status: Connecting camera...`;
    
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: camId ? { exact: camId } : undefined }
      });
      
      const video = document.getElementById('camera-video');
      video.srcObject = cameraStream;
      
      previewContainer.style.display = 'block';
      filterControls.style.display = 'flex';
      btnTriggerScan.innerHTML = 'Scan/Capture Page';
      btnTriggerScan.classList.remove('btn-disabled');
      btnTriggerScan.removeAttribute('disabled');
      
      statusText.innerHTML = `<span class="status-dot online"></span> Status: Live Camera Connected`;
    } catch (err) {
      statusText.innerHTML = `<span class="status-dot offline"></span> Status: Connection error`;
      showToast('Camera Connection Failed', err.message, 'error');
    }
  } else if (value === 'virtual:sim') {
    statusText.innerHTML = `<span class="status-dot online"></span> Status: Connected to Simulator`;
    btnTriggerScan.innerHTML = 'Scan Simulated Page';
    btnTriggerScan.classList.remove('btn-disabled');
    btnTriggerScan.removeAttribute('disabled');
  }
}

async function triggerScan() {
  const select = document.getElementById('scanner-select');
  const val = select.value;
  
  if (val.startsWith('usb:')) {
    const scannerName = val.replace('usb:', '');
    showToast('Scanning Started', 'Connecting to scanner and acquiring page...', 'info');
    
    btnTriggerScan.classList.add('btn-disabled');
    btnTriggerScan.setAttribute('disabled', 'true');
    btnTriggerScan.innerHTML = `<span class="spinner"></span> Scanning...`;
    
    try {
      const result = await window.api.scanFromPhysicalScanner(scannerName);
      if (result.success) {
        scannedPages.push(result.filePath);
        updateScanUI();
        showToast('Scan Successful', 'Page acquired from physical scanner.', 'success');
      } else {
        if (result.fallback) {
          showToast('Utility Needed', 'Opening system scanner utility...', 'info');
        } else {
          showToast('Direct Scan Failed', 'Opening native scanning wizard...', 'warning');
        }
        await window.api.openImageCapture();
      }
    } catch (e) {
      showToast('Scan Failed', 'Opening native scanning wizard...', 'warning');
      await window.api.openImageCapture();
    } finally {
      btnTriggerScan.innerHTML = 'Trigger Physical Scan';
      btnTriggerScan.classList.remove('btn-disabled');
      btnTriggerScan.removeAttribute('disabled');
    }
  } else if (val.startsWith('cam:')) {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    if (!video || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    // Draw current webcam frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Apply filters
    applyImageFilter(canvas, selectedFilter);
    
    const dataUrl = canvas.toDataURL('image/png');
    scannedPages.push(dataUrl);
    updateScanUI();
    showToast('Page Captured', `Captured page ${scannedPages.length} from camera.`, 'success');
  } else if (val === 'virtual:sim') {
    // Render mock paper page
    const canvas = document.createElement('canvas');
    canvas.width = 595;
    canvas.height = 842;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add scanner border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
    // Header
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 22px Outfit, sans-serif';
    ctx.fillText('SCANNED DOCUMENT PAGE', 60, 90);
    
    // Metadata
    ctx.fillStyle = '#64748b';
    ctx.font = '13px Outfit, sans-serif';
    ctx.fillText(`Timestamp: ${new Date().toLocaleString()}`, 60, 130);
    ctx.fillText(`Device Model: VirtualScanner-3000`, 60, 150);
    ctx.fillText(`Page Index: ${scannedPages.length + 1}`, 60, 170);
    
    // Divider
    ctx.beginPath();
    ctx.moveTo(60, 190);
    ctx.lineTo(535, 190);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Content lines
    ctx.fillStyle = '#0f172a';
    ctx.font = '14px Courier New, monospace';
    const contents = [
      'SCAN RECORD SUMMARY',
      '===================',
      `Reference ID: REF-${Math.floor(Math.random() * 89999) + 10000}`,
      `Scan Mode   : Simulated High Resolution`,
      `Destination : Append to Base PDF`,
      '',
      'Notes:',
      'This page was automatically generated by the Virtual Scanner',
      'to simulate real paper document digitization. You can append',
      'multiple pages to the end of your document in this session.',
      '',
      'Thank you for using PDF Combiner Pro.'
    ];
    
    let y = 230;
    contents.forEach(line => {
      ctx.fillText(line, 60, y);
      y += 24;
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    scannedPages.push(dataUrl);
    updateScanUI();
    showToast('Simulation Page Scanned', `Page ${scannedPages.length} generated.`, 'success');
  }
}

function applyImageFilter(canvas, filter) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  
  if (filter === 'mono') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      data[i] = gray;
      data[i+1] = gray;
      data[i+2] = gray;
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (filter === 'contrast') {
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      let val = 255;
      if (gray < 130) {
        val = 0;
      }
      data[i] = val;
      data[i+1] = val;
      data[i+2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
  }
}

function removeScannedPage(index) {
  scannedPages.splice(index, 1);
  updateScanUI();
  showToast('Page Removed', 'Scanned page removed from queue.', 'info');
}

function updateScanUI() {
  const countSpan = document.getElementById('scan-count');
  const clearBtn = document.getElementById('btn-clear-scans');
  const emptyState = document.getElementById('scan-empty-state');
  const grid = document.getElementById('scanned-grid');
  const mergeBtn = document.getElementById('btn-merge-scans');
  
  countSpan.textContent = `${scannedPages.length} page${scannedPages.length === 1 ? '' : 's'} scanned`;
  
  if (scannedPages.length === 0) {
    emptyState.style.display = 'flex';
    grid.innerHTML = '';
    clearBtn.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    clearBtn.style.display = 'inline-block';
    
    // Render grid
    grid.innerHTML = '';
    scannedPages.forEach((page, index) => {
      const card = document.createElement('div');
      card.className = 'scanned-thumbnail';
      
      let thumbnailHtml = '';
      if (page.startsWith('data:')) {
        thumbnailHtml = `<img src="${page}" class="thumbnail-image" alt="Page ${index + 1}">`;
      } else {
        const ext = page.substring(page.lastIndexOf('.')).toLowerCase();
        const filename = page.substring(page.lastIndexOf(/[/\\]/) + 1);
        if (ext === '.pdf') {
          thumbnailHtml = `
            <div class="thumbnail-pdf-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:4px;padding:4px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span style="font-size:0.6rem;color:var(--text-secondary);max-width:80px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span>
            </div>`;
        } else {
          thumbnailHtml = `<img id="scan-thumb-${index}" class="thumbnail-image" alt="Page ${index + 1}" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%231e293b'/></svg>">`;
          
          window.api.readFileBytes(page).then(bytes => {
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            
            const array = new Uint8Array(bytes);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < array.length; i += chunkSize) {
              const subArray = array.subarray(i, i + chunkSize);
              binary += String.fromCharCode.apply(null, subArray);
            }
            const base64 = btoa(binary);
            const imgEl = document.getElementById(`scan-thumb-${index}`);
            if (imgEl) {
              imgEl.src = `data:${mimeType};base64,${base64}`;
            }
          }).catch(err => {
            console.error('Error loading thumbnail image:', err);
          });
        }
      }
      
      card.innerHTML = `
        <div class="thumbnail-wrapper">
          ${thumbnailHtml}
        </div>
        <div class="thumbnail-meta">
          <span class="thumbnail-label">Page ${index + 1}</span>
          <button class="btn-delete-thumbnail" title="Delete Page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            </svg>
          </button>
        </div>
      `;
      
      card.querySelector('.btn-delete-thumbnail').addEventListener('click', () => removeScannedPage(index));
      grid.appendChild(card);
    });
  }
  
  // Enable merge btn if base PDF exists and at least 1 scanned page exists, and output path is defined
  const canMerge = scanBasePdf !== null && scannedPages.length > 0 && scanOutputPath !== '';
  if (canMerge) {
    mergeBtn.classList.remove('btn-disabled');
    mergeBtn.removeAttribute('disabled');
  } else {
    mergeBtn.classList.add('btn-disabled');
    mergeBtn.setAttribute('disabled', 'true');
  }
}

function setScanMergingState(isMerging) {
  const mergeBtn = document.getElementById('btn-merge-scans');
  const btnSelectBasePdf = document.getElementById('btn-select-base-pdf');
  const btnBrowseScanOutput = document.getElementById('btn-browse-scan-output');
  const btnClearScans = document.getElementById('btn-clear-scans');
  
  if (isMerging) {
    mergeBtn.classList.add('btn-disabled');
    mergeBtn.setAttribute('disabled', 'true');
    mergeBtn.innerHTML = `<span class="spinner"></span> Merging Scans...`;
    
    btnSelectBasePdf.classList.add('btn-disabled');
    btnBrowseScanOutput.classList.add('btn-disabled');
    btnSelectBasePdf.setAttribute('disabled', 'true');
    btnBrowseScanOutput.setAttribute('disabled', 'true');
    if (btnClearScans) btnClearScans.setAttribute('disabled', 'true');
  } else {
    mergeBtn.innerHTML = `Merge Scans into PDF`;
    
    btnSelectBasePdf.classList.remove('btn-disabled');
    btnBrowseScanOutput.classList.remove('btn-disabled');
    btnSelectBasePdf.removeAttribute('disabled');
    btnBrowseScanOutput.removeAttribute('disabled');
    if (btnClearScans) btnClearScans.removeAttribute('disabled');
    
    updateScanUI();
  }
}

// PAGE ORGANIZER STATE MANAGEMENT VARIABLES
let orgSourceFiles = []; // array of { path, name, pagesCount, colorClass, pdfDoc }
let orgPagesState = [];  // array of { id, filePath, fileName, colorClass, pdfDoc, originalIndex, currentRotation, isDeleted }
let orgSplitPoints = new Set(); // set of 0-based indices *after* which to split (relative to final kept pages)
let orgOutputDir = '';
const colorClasses = ['org-badge-blue', 'org-badge-purple', 'org-badge-emerald', 'org-badge-amber', 'org-badge-rose'];

let activeOrgGhost = null;
let activeOrgPlaceholder = null;
let activeOrgSourceCard = null;
let orgDragOffsetX = 0;
let orgDragOffsetY = 0;

// Setup Page Organizer Grid Pointer Drag Sortable Engine
function setupOrgWorkspaceSortable() {
  window.addEventListener('pointermove', (e) => {
    if (!activeOrgGhost || !activeOrgPlaceholder) return;
    e.preventDefault();

    // 1. Position floating ghost layer under cursor
    activeOrgGhost.style.left = `${e.clientX - orgDragOffsetX}px`;
    activeOrgGhost.style.top = `${e.clientY - orgDragOffsetY}px`;

    // 2. Detect target card element under pointer
    const elementUnderPoint = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementUnderPoint) return;

    const targetWrapper = elementUnderPoint.closest('.org-page-card-wrapper');
    const grid = document.getElementById('org-pages-grid');

    if (targetWrapper && targetWrapper !== activeOrgPlaceholder && targetWrapper.parentNode === grid) {
      const rect = targetWrapper.getBoundingClientRect();
      const isAfter = (e.clientX - rect.left) / rect.width > 0.5;
      grid.insertBefore(activeOrgPlaceholder, isAfter ? targetWrapper.nextSibling : targetWrapper);
    }
  });

  const finishOrgDrag = () => {
    if (!activeOrgGhost || !activeOrgPlaceholder || !activeOrgSourceCard) return;

    const grid = document.getElementById('org-pages-grid');
    grid.insertBefore(activeOrgSourceCard, activeOrgPlaceholder);

    if (activeOrgGhost.parentNode) activeOrgGhost.parentNode.removeChild(activeOrgGhost);
    if (activeOrgPlaceholder.parentNode) activeOrgPlaceholder.parentNode.removeChild(activeOrgPlaceholder);

    activeOrgSourceCard.style.display = '';
    activeOrgSourceCard = null;
    activeOrgGhost = null;
    activeOrgPlaceholder = null;
    document.body.style.cursor = '';

    // Synchronize orgPagesState array with new DOM card order
    const newPagesState = [];
    const currentCardWrappers = grid.querySelectorAll('.org-page-card-wrapper');

    currentCardWrappers.forEach(wrapper => {
      const card = wrapper.querySelector('.org-page-card');
      if (card) {
        const pageId = card.getAttribute('data-page-id');
        const found = orgPagesState.find(p => p.id === pageId);
        if (found) newPagesState.push(found);
      }
    });

    if (newPagesState.length > 0) {
      orgPagesState = newPagesState;
      renderOrgWorkspace();
    }
  };

  window.addEventListener('pointerup', finishOrgDrag);
  window.addEventListener('pointercancel', finishOrgDrag);
}

// PAGE ORGANIZER LOGIC INITIALIZATION
function initOrganizeTab() {
  setupOrgWorkspaceSortable();

  const btnAddPdf = document.getElementById('btn-org-add-pdf');
  const btnBrowseDir = document.getElementById('btn-org-browse-dir');
  const btnReset = document.getElementById('btn-org-reset');
  const btnRotateAllCw = document.getElementById('btn-org-rotate-all-cw');
  const btnApply = document.getElementById('btn-org-apply');
  
  // Add PDF Document to Workspace
  if (btnAddPdf) {
    btnAddPdf.addEventListener('click', async () => {
      try {
        const selected = await window.api.selectSinglePDF();
        if (selected) {
          // Check if already added
          if (orgSourceFiles.some(f => f.path === selected.path)) {
            showToast('Already Added', 'This PDF is already in the workspace.', 'warning');
            return;
          }

          const colorClass = colorClasses[orgSourceFiles.length % colorClasses.length];

          // Hide empty state
          document.getElementById('org-empty-state').style.display = 'none';

          // Load PDF bytes and parse with PDF.js
          const fileBytes = await window.api.readFileBytes(selected.path);
          const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
          const pdfDoc = await loadingTask.promise;

          const fileItem = {
            path: selected.path,
            name: selected.name,
            pagesCount: pdfDoc.numPages,
            colorClass,
            pdfDoc
          };

          orgSourceFiles.push(fileItem);

          // Append pages to workspace state
          for (let i = 0; i < pdfDoc.numPages; i++) {
            orgPagesState.push({
              id: `page_${selected.path}_${i}_${Date.now()}_${Math.random()}`,
              filePath: selected.path,
              fileName: selected.name,
              colorClass,
              pdfDoc,
              originalIndex: i,
              currentRotation: 0,
              isDeleted: false
            });
          }

          renderOrgSourceFilesList();
          renderOrgWorkspace();
          showToast('PDF Added', `Added ${selected.name} (${pdfDoc.numPages} pages)`, 'success');
        }
      } catch (err) {
        showToast('Load Failed', 'Failed to read/parse PDF file: ' + err.message, 'error');
      }
    });
  }

  // Browse Directory Location
  if (btnBrowseDir) {
    btnBrowseDir.addEventListener('click', async () => {
      try {
        const dirPath = await window.api.selectDirectory();
        if (dirPath) {
          orgOutputDir = dirPath;
          document.getElementById('org-out-dir').value = orgOutputDir;
          updateOrgUI();
          showToast('Destination Selected', 'Output folder set.', 'success');
        }
      } catch (err) {
        showToast('Error', 'Failed to select folder: ' + err.message, 'error');
      }
    });
  }

  // Rotate All 90° CW
  if (btnRotateAllCw) {
    btnRotateAllCw.addEventListener('click', () => {
      orgPagesState.forEach(p => {
        if (!p.isDeleted) {
          p.currentRotation = (p.currentRotation + 90) % 360;
        }
      });
      renderOrgWorkspace();
      showToast('Rotated All Pages', 'Spun all active pages 90° CW.', 'info');
    });
  }

  // Clear All / Reset Layout
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      orgSourceFiles = [];
      orgPagesState = [];
      orgSplitPoints.clear();
      renderOrgSourceFilesList();
      renderOrgWorkspace();
      showToast('Workspace Cleared', 'All documents and edits cleared.', 'info');
    });
  }

  // Apply & Export Edits
  if (btnApply) {
    btnApply.addEventListener('click', async () => {
      if (orgSourceFiles.length === 0) return;
      if (!orgOutputDir) return;
      
      const keptPages = orgPagesState.filter(p => !p.isDeleted);
      if (keptPages.length === 0) {
        showToast('No Pages Kept', 'You must keep at least one page in the output.', 'error');
        return;
      }

      setOrgWorkingState(true);

      try {
        // Map current pages structure
        const pagesParam = keptPages.map(p => ({
          filePath: p.filePath,
          originalIndex: p.originalIndex,
          rotation: p.currentRotation
        }));

        // Map split points relative to final kept pages array indices
        const splitsParam = Array.from(orgSplitPoints);

        const prefixInput = document.getElementById('org-out-filename');
        const outputPrefix = prefixInput && prefixInput.value.trim() !== '' ? prefixInput.value.trim() : 'combined_document';

        const result = await window.api.applyPageEdits(pagesParam, splitsParam, orgOutputDir, outputPrefix);
        
        if (result.success) {
          let msg = 'PDF edits successfully applied.';
          if (result.files.length > 1) {
            msg = `Split complete! Exported ${result.files.length} parts to output folder.`;
          }
          showToast('Export Succeeded', msg, 'success');
          
          renderOrgWorkspace();
        } else {
          showToast('Export Failed', result.error || 'An error occurred.', 'error');
        }
      } catch (err) {
        showToast('Export Failed', err.message, 'error');
      } finally {
        setOrgWorkingState(false);
      }
    });
  }
}

// Render source files list badges
function renderOrgSourceFilesList() {
  const container = document.getElementById('org-source-files-list');
  if (!container) return;
  container.innerHTML = '';

  orgSourceFiles.forEach((file) => {
    const div = document.createElement('div');
    div.className = 'org-source-file-item';
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;overflow:hidden;flex:1;min-width:0;">
        <span class="org-file-badge ${file.colorClass}" style="max-width:110px;" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
        <span style="color:var(--text-muted);font-size:0.75rem;white-space:nowrap;">(${file.pagesCount} p.)</span>
      </div>
      <button type="button" class="btn-action-icon btn-delete" title="Remove PDF" style="padding:2px;flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
        </svg>
      </button>
    `;

    div.querySelector('.btn-delete').addEventListener('click', () => {
      removePdfFromOrganizer(file.path);
    });

    container.appendChild(div);
  });
}

// Remove specific PDF from organizer
function removePdfFromOrganizer(filePath) {
  orgSourceFiles = orgSourceFiles.filter(f => f.path !== filePath);
  orgPagesState = orgPagesState.filter(p => p.filePath !== filePath);
  orgSplitPoints.clear();
  renderOrgSourceFilesList();
  renderOrgWorkspace();
  showToast('File Removed', 'Removed PDF document from workspace.', 'info');
}

// Render visual organizer workspace
async function renderOrgWorkspace() {
  const grid = document.getElementById('org-pages-grid');
  grid.innerHTML = '';
  
  const keptPages = orgPagesState.filter(p => !p.isDeleted);
  
  if (keptPages.length === 0) {
    document.getElementById('org-empty-state').style.display = 'flex';
    updateOrgUI();
    return;
  }
  
  document.getElementById('org-empty-state').style.display = 'none';

  // We render cards and split markers alternately
  for (let k = 0; k < keptPages.length; k++) {
    const pageState = keptPages[k];
    const originalIndex = pageState.originalIndex;
    
    // 1. Create Page Card Wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'org-page-card-wrapper';
    
    // 2. Create Card Element
    const card = document.createElement('div');
    card.className = 'org-page-card';
    card.setAttribute('data-page-id', pageState.id);
    
    card.innerHTML = `
      <div class="org-card-header">
        <span class="org-file-badge ${pageState.colorClass}" title="${escapeHtml(pageState.fileName)}">${escapeHtml(pageState.fileName)}</span>
        <div style="display:flex;gap:2px;">
          <button type="button" class="org-card-btn btn-rotate" title="Rotate 90° Clockwise">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button type="button" class="org-card-btn btn-delete" title="Exclude Page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="org-card-canvas-container">
        <span class="spinner" style="position: absolute;"></span>
      </div>
      <div class="org-card-footer">
        <span>Page ${originalIndex + 1}</span>
        <span class="org-rot-indicator">${pageState.currentRotation > 0 ? pageState.currentRotation + '°' : ''}</span>
      </div>
    `;
    
    wrapper.appendChild(card);
    grid.appendChild(wrapper);

    // Pointer Events Drag Initiator on Page Card (skipping buttons)
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.org-card-header') || e.target.closest('button')) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();

      const rect = card.getBoundingClientRect();
      orgDragOffsetX = e.clientX - rect.left;
      orgDragOffsetY = e.clientY - rect.top;

      activeOrgSourceCard = wrapper;

      // Create Placeholder
      activeOrgPlaceholder = document.createElement('div');
      activeOrgPlaceholder.className = 'org-page-card-wrapper file-item-placeholder';
      activeOrgPlaceholder.style.width = `${rect.width + 8}px`;
      activeOrgPlaceholder.style.height = `${rect.height}px`;

      // Create Floating Ghost
      activeOrgGhost = wrapper.cloneNode(true);
      activeOrgGhost.classList.add('dragging-ghost');
      activeOrgGhost.style.left = `${rect.left}px`;
      activeOrgGhost.style.top = `${rect.top}px`;
      activeOrgGhost.style.width = `${rect.width}px`;
      activeOrgGhost.style.height = `${rect.height}px`;

      document.body.appendChild(activeOrgGhost);
      grid.insertBefore(activeOrgPlaceholder, wrapper);
      wrapper.style.display = 'none';

      document.body.style.cursor = 'grabbing';
    });
    
    // Add page rotate click
    card.querySelector('.btn-rotate').addEventListener('click', (e) => {
      e.stopPropagation();
      pageState.currentRotation = (pageState.currentRotation + 90) % 360;
      
      const canvas = card.querySelector('canvas');
      if (canvas) {
        canvas.className = '';
        if (pageState.currentRotation > 0) {
          canvas.classList.add(`rotate-${pageState.currentRotation}`);
        }
      }
      
      const rotSpan = card.querySelector('.org-rot-indicator');
      rotSpan.textContent = pageState.currentRotation > 0 ? pageState.currentRotation + '°' : '';
      
      updateOrgUI();
    });
    
    // Add page delete click
    card.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      pageState.isDeleted = true;
      
      const currentSplitIndices = Array.from(orgSplitPoints);
      orgSplitPoints.clear();
      currentSplitIndices.forEach(idx => {
        if (idx < keptPages.length - 2) {
          orgSplitPoints.add(idx);
        }
      });
      
      renderOrgWorkspace();
    });
    
    // Render Canvas via PDF.js
    if (pageState.pdfDoc) {
      pageState.pdfDoc.getPage(originalIndex + 1).then(async (page) => {
        const canvasContainer = card.querySelector('.org-card-canvas-container');
        const viewport = page.getViewport({ scale: 1.0 });
        
        const targetWidth = 112;
        const scale = targetWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        if (pageState.currentRotation > 0) {
          canvas.classList.add(`rotate-${pageState.currentRotation}`);
        }
        
        const ctx = canvas.getContext('2d');
        const renderContext = {
          canvasContext: ctx,
          viewport: scaledViewport
        };
        
        await page.render(renderContext).promise;
        
        canvasContainer.innerHTML = '';
        canvasContainer.appendChild(canvas);
      }).catch(err => {
        console.error('Render page canvas failed:', err);
        const canvasContainer = card.querySelector('.org-card-canvas-container');
        canvasContainer.innerHTML = '<span style="font-size: 0.65rem; color: var(--accent-error);">Error rendering</span>';
      });
    }

    // 3. Create Split Separator between cards
    if (k < keptPages.length - 1) {
      const sep = document.createElement('div');
      sep.className = 'org-split-separator';
      
      if (orgSplitPoints.has(k)) {
        sep.classList.add('active-split');
      }
      
      sep.innerHTML = `
        <div class="org-split-line"></div>
        <div class="org-split-scissors" title="Toggle split document here">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
            <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
            <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
          </svg>
        </div>
      `;
      
      sep.addEventListener('click', () => {
        if (orgSplitPoints.has(k)) {
          orgSplitPoints.delete(k);
          sep.classList.remove('active-split');
        } else {
          orgSplitPoints.add(k);
          sep.classList.add('active-split');
        }
        updateOrgUI();
      });
      
      grid.appendChild(sep);
    }
  }
  
  updateOrgUI();
}

function updateOrgUI() {
  const activeCount = document.getElementById('org-active-pages');
  const resetBtn = document.getElementById('btn-org-reset');
  const rotateAllBtn = document.getElementById('btn-org-rotate-all-cw');
  const applyBtn = document.getElementById('btn-org-apply');
  
  const keptCount = orgPagesState.filter(p => !p.isDeleted).length;
  
  activeCount.textContent = `${keptCount} page${keptCount === 1 ? '' : 's'} active`;
  
  if (orgSourceFiles.length > 0) {
    if (resetBtn) resetBtn.style.display = 'inline-block';
    if (rotateAllBtn) rotateAllBtn.style.display = 'inline-block';
  } else {
    if (resetBtn) resetBtn.style.display = 'none';
    if (rotateAllBtn) rotateAllBtn.style.display = 'none';
  }
  
  const canApply = orgSourceFiles.length > 0 && keptCount > 0 && orgOutputDir !== '';
  if (canApply) {
    applyBtn.classList.remove('btn-disabled');
    applyBtn.removeAttribute('disabled');
  } else {
    applyBtn.classList.add('btn-disabled');
    applyBtn.setAttribute('disabled', 'true');
  }
}

function setOrgWorkingState(isWorking) {
  const applyBtn = document.getElementById('btn-org-apply');
  const resetBtn = document.getElementById('btn-org-reset');
  const addPdfBtn = document.getElementById('btn-org-add-pdf');
  const browseDirBtn = document.getElementById('btn-org-browse-dir');
  
  if (isWorking) {
    applyBtn.classList.add('btn-disabled');
    applyBtn.setAttribute('disabled', 'true');
    applyBtn.innerHTML = `<span class="spinner"></span> Exporting...`;
    
    if (addPdfBtn) addPdfBtn.classList.add('btn-disabled');
    if (browseDirBtn) browseDirBtn.classList.add('btn-disabled');
    if (addPdfBtn) addPdfBtn.setAttribute('disabled', 'true');
    if (browseDirBtn) browseDirBtn.setAttribute('disabled', 'true');
    if (resetBtn) resetBtn.setAttribute('disabled', 'true');
    
    document.querySelectorAll('.org-card-btn').forEach(b => b.setAttribute('disabled', 'true'));
  } else {
    applyBtn.innerHTML = `Apply & Export PDF(s)`;
    
    if (addPdfBtn) addPdfBtn.classList.remove('btn-disabled');
    if (browseDirBtn) browseDirBtn.classList.remove('btn-disabled');
    if (addPdfBtn) addPdfBtn.removeAttribute('disabled');
    if (browseDirBtn) browseDirBtn.removeAttribute('disabled');
    if (resetBtn) resetBtn.removeAttribute('disabled');
    
    updateOrgUI();
  }
}

// PDF EMBEDDED STATE MANAGEMENT
let embedPdfPath = null;
let embedCapPath = null;
let embedSigPath = null;
let embedCapBytes = null;
let embedSigBytes = null;
let embedPdfBytes = null;
let embedPdfDoc = null;
let embedOutputDir = '';
let embedCurrentPreviewPage = 1;
let embedPageDimensions = { width: 612, height: 792 };

function initEmbedTab() {
  setupEmbedOverlayDrag();

  const btnSelectPdf = document.getElementById('btn-embed-select-pdf');
  const btnSelectCap = document.getElementById('btn-embed-select-cap');
  const btnSelectSig = document.getElementById('btn-embed-select-sig');
  const btnBrowseDir = document.getElementById('btn-embed-browse-dir');
  const btnPresetMengetahui = document.getElementById('btn-preset-mengetahui');
  const btnPresetBawahKiri = document.getElementById('btn-preset-bawah-kiri');
  const btnProcess = document.getElementById('btn-embed-process');

  const inputX = document.getElementById('embed-pos-x');
  const inputY = document.getElementById('embed-pos-y');
  const inputCapSize = document.getElementById('embed-cap-size');
  const inputSigW = document.getElementById('embed-sig-w');
  const pageSelect = document.getElementById('embed-preview-page-select');

  // 1. Select Main PDF File
  if (btnSelectPdf) {
    btnSelectPdf.addEventListener('click', async () => {
      try {
        const selected = await window.api.selectSinglePDF();
        if (selected) {
          embedPdfPath = selected.path;
          embedPdfBytes = await window.api.readFileBytes(selected.path);

          const loadingTask = pdfjsLib.getDocument({ data: embedPdfBytes.slice() });
          embedPdfDoc = await loadingTask.promise;

          document.getElementById('embed-pdf-name').textContent = selected.name;
          document.getElementById('embed-pdf-pages').textContent = `${embedPdfDoc.numPages} pages`;
          document.getElementById('embed-pdf-file-info').style.display = 'flex';

          // Populate page selector dropdown
          pageSelect.innerHTML = '';
          for (let p = 1; p <= Math.min(embedPdfDoc.numPages, 100); p++) {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = `Page ${p}`;
            pageSelect.appendChild(opt);
          }

          embedCurrentPreviewPage = 1;
          await scanPdfKeywordPositions();
          renderEmbedLivePreview();
          updateEmbedUI();
          showToast('PDF Dokumen Dimuat', `Berhasil membaca ${selected.name} (${embedPdfDoc.numPages} halaman).`, 'success');
        }
      } catch (err) {
        showToast('Error', 'Gagal membaca file PDF: ' + err.message, 'error');
      }
    });
  }

  // Keyword Regex Input Listener
  const keywordInput = document.getElementById('embed-keyword-input');
  if (keywordInput) {
    let debounceTimer;
    keywordInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanPdfKeywordPositions();
      }, 400);
    });
  }

  // 2. Select Cap Image
  if (btnSelectCap) {
    btnSelectCap.addEventListener('click', async () => {
      try {
        const selected = await window.api.selectImageFile();
        if (selected) {
          embedCapPath = selected.path;
          embedCapBytes = await window.api.readFileBytes(selected.path);

          document.getElementById('embed-cap-label').textContent = selected.name;
          
          // Set preview image src
          const blob = new Blob([embedCapBytes], { type: 'image/png' });
          document.getElementById('embed-cap-img-element').src = URL.createObjectURL(blob);
          document.getElementById('embed-overlay-cap').style.display = 'block';

          renderEmbedLivePreview();
          updateEmbedUI();
          showToast('Cap Dimuat', `File Cap ${selected.name} dipilih.`, 'success');
        }
      } catch (err) {
        showToast('Error', 'Gagal membaca file Cap: ' + err.message, 'error');
      }
    });
  }

  // 3. Select Signature Image
  if (btnSelectSig) {
    btnSelectSig.addEventListener('click', async () => {
      try {
        const selected = await window.api.selectImageFile();
        if (selected) {
          embedSigPath = selected.path;
          embedSigBytes = await window.api.readFileBytes(selected.path);

          document.getElementById('embed-sig-label').textContent = selected.name;

          // Set preview image src
          const blob = new Blob([embedSigBytes], { type: 'image/png' });
          document.getElementById('embed-sig-img-element').src = URL.createObjectURL(blob);
          document.getElementById('embed-overlay-sig').style.display = 'block';

          renderEmbedLivePreview();
          updateEmbedUI();
          showToast('Tanda Tangan Dimuat', `File Tanda Tangan ${selected.name} dipilih.`, 'success');
        }
      } catch (err) {
        showToast('Error', 'Gagal membaca file Tanda Tangan: ' + err.message, 'error');
      }
    });
  }

  // Preset Buttons
  if (btnPresetMengetahui) {
    btnPresetMengetahui.addEventListener('click', () => {
      btnPresetMengetahui.classList.add('active');
      if (btnPresetBawahKiri) btnPresetBawahKiri.classList.remove('active');
      inputX.value = 0;
      inputY.value = 0;
      scanPdfKeywordPositions();
    });
  }

  if (btnPresetBawahKiri) {
    btnPresetBawahKiri.addEventListener('click', () => {
      btnPresetBawahKiri.classList.add('active');
      if (btnPresetMengetahui) btnPresetMengetahui.classList.remove('active');
      inputX.value = -310;
      inputY.value = -10;
      inputCapSize.value = 95;
      inputSigW.value = 100;
      renderEmbedLivePreview();
    });
  }

  // Input Listeners
  [inputX, inputY, inputCapSize, inputSigW].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', () => {
        renderEmbedLivePreview();
      });
    }
  });

  if (pageSelect) {
    pageSelect.addEventListener('change', (e) => {
      embedCurrentPreviewPage = parseInt(e.target.value) || 1;
      renderEmbedLivePreview();
    });
  }

  // Browse Directory Location
  if (btnBrowseDir) {
    btnBrowseDir.addEventListener('click', async () => {
      try {
        const dirPath = await window.api.selectDirectory();
        if (dirPath) {
          embedOutputDir = dirPath;
          document.getElementById('embed-out-dir').value = embedOutputDir;
          updateEmbedUI();
          showToast('Folder Tujuan Dipilih', 'Lokasi penyimpanan diset.', 'success');
        }
      } catch (err) {
        showToast('Error', 'Gagal memilih folder: ' + err.message, 'error');
      }
    });
  }

  // Process Embed & Export
  if (btnProcess) {
    btnProcess.addEventListener('click', async () => {
      if (!embedPdfBytes || !embedOutputDir) return;

      const filenameInput = document.getElementById('embed-out-filename');
      let filename = filenameInput && filenameInput.value.trim() !== '' ? filenameInput.value.trim() : 'surat_rujuk_balik_embedded';
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
      }

      const deltaX = parseFloat(inputX.value) || 0;
      const deltaY = parseFloat(inputY.value) || 0;
      const capSize = parseFloat(inputCapSize.value) || 95;
      const sigW = parseFloat(inputSigW.value) || 100;
      const sigH = Math.round(sigW * 0.5);

      const outputPath = `${embedOutputDir}\\${filename}`;

      setEmbedWorkingState(true);

      try {
        const { PDFDocument } = PDFLib;
        // Re-read file bytes to guarantee 100% fresh buffer array
        const freshPdfBytes = await window.api.readFileBytes(embedPdfPath);
        const pdfDoc = await PDFDocument.load(freshPdfBytes);

        let capImgEmbed = null;
        if (embedCapBytes && embedCapBytes.length > 0) {
          capImgEmbed = await pdfDoc.embedPng(embedCapBytes);
        }

        let sigImgEmbed = null;
        if (embedSigBytes && embedSigBytes.length > 0) {
          sigImgEmbed = await pdfDoc.embedPng(embedSigBytes);
        }

        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const pageNum = i + 1;

          let baseCapX = 370;
          let baseCapY = 85;

          const pageKeyword = embedKeywordMap[pageNum];
          if (pageKeyword && pageKeyword.found) {
            baseCapX = pageKeyword.x;
            baseCapY = pageKeyword.y - capSize - 10;
          }

          const pageCapX = baseCapX + deltaX;
          const pageCapY = baseCapY + deltaY;

          const sigY = pageCapY + ((capSize - sigH) / 2);

          // 1. Draw Signature FIRST (dibawah Cap/Stempel)
          if (sigImgEmbed) {
            page.drawImage(sigImgEmbed, {
              x: pageCapX + 15,
              y: sigY,
              width: sigW,
              height: sigH,
              opacity: 1.0
            });
          }

          // 2. Draw Cap Stamp SECOND (di atas Tanda Tangan)
          if (capImgEmbed) {
            page.drawImage(capImgEmbed, {
              x: pageCapX - 15,
              y: pageCapY,
              width: capSize,
              height: capSize,
              opacity: 0.85
            });
          }
        }

        const modifiedBytes = await pdfDoc.save();
        await window.api.writeFileBytes(outputPath, modifiedBytes);

        showToast('Sukses Embed PDF!', `Berhasil meng-embed Cap & Tanda Tangan ke ${pages.length} halaman! Output: ${filename}`, 'success');
      } catch (err) {
        showToast('Gagal Embedding', err.message, 'error');
      } finally {
        setEmbedWorkingState(false);
      }
    });
  }
}

// Global Regex Keyword Detection Map
let embedKeywordMap = {};

// Scan PDF for Keyword Regex Positions on Every Page
async function scanPdfKeywordPositions() {
  if (!embedPdfDoc) return;

  const keywordInput = document.getElementById('embed-keyword-input');
  const statusEl = document.getElementById('embed-keyword-status');
  const keywordStr = keywordInput ? keywordInput.value.trim() : 'Mengetahui';

  if (!keywordStr) {
    if (statusEl) {
      statusEl.textContent = 'Parameter kata kunci kosong';
      statusEl.style.color = 'var(--text-muted)';
    }
    embedKeywordMap = {};
    return;
  }

  if (statusEl) {
    statusEl.textContent = `Memindai kata kunci "${keywordStr}"...`;
    statusEl.style.color = '#38bdf8';
  }

  let regex;
  try {
    regex = new RegExp(keywordStr, 'i');
  } catch (err) {
    regex = new RegExp(keywordStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  embedKeywordMap = {};
  let foundCount = 0;

  for (let p = 1; p <= embedPdfDoc.numPages; p++) {
    try {
      const page = await embedPdfDoc.getPage(p);
      const textContent = await page.getTextContent();

      let match = null;
      for (const item of textContent.items) {
        if (item.str && regex.test(item.str)) {
          match = {
            found: true,
            x: item.transform[4],
            y: item.transform[5],
            text: item.str
          };
          break;
        }
      }

      if (match) {
        embedKeywordMap[p] = match;
        foundCount++;
      } else {
        embedKeywordMap[p] = { found: false, x: 370, y: 85, text: '' };
      }
    } catch (err) {
      embedKeywordMap[p] = { found: false, x: 370, y: 85, text: '' };
    }
  }

  if (statusEl) {
    if (foundCount > 0) {
      statusEl.textContent = `✓ "${keywordStr}" ditemukan di ${foundCount} dari ${embedPdfDoc.numPages} halaman`;
      statusEl.style.color = '#4ade80';
    } else {
      statusEl.textContent = `⚠️ "${keywordStr}" tidak ditemukan (Menggunakan posisi fallback)`;
      statusEl.style.color = '#facc15';
    }
  }

  renderEmbedLivePreview();
}

// Live Preview Renderer
async function renderEmbedLivePreview() {
  if (!embedPdfDoc) {
    document.getElementById('embed-empty-state').style.display = 'flex';
    document.getElementById('embed-preview-stage').style.display = 'none';
    return;
  }

  document.getElementById('embed-empty-state').style.display = 'none';
  document.getElementById('embed-preview-stage').style.display = 'block';

  try {
    const page = await embedPdfDoc.getPage(embedCurrentPreviewPage);
    const viewport = page.getViewport({ scale: 1.0 });

    embedPageDimensions = { width: viewport.width, height: viewport.height };

    // Render Preview Canvas
    const previewCanvas = document.getElementById('embed-preview-canvas');
    const displayWidth = 480;
    const scale = displayWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    previewCanvas.width = scaledViewport.width;
    previewCanvas.height = scaledViewport.height;

    const ctx = previewCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    document.getElementById('embed-page-indicator').textContent = `(Halaman ${embedCurrentPreviewPage} dari ${embedPdfDoc.numPages})`;

    // Determine effective X & Y for preview page using Base Keyword Pos + Relative Delta Offsets
    const deltaX = parseFloat(document.getElementById('embed-pos-x').value) || 0;
    const deltaY = parseFloat(document.getElementById('embed-pos-y').value) || 0;
    const capSize = parseFloat(document.getElementById('embed-cap-size').value) || 95;
    const sigW = parseFloat(document.getElementById('embed-sig-w').value) || 100;
    const sigH = Math.round(sigW * 0.5);

    let baseCapX = 370;
    let baseCapY = 85;

    const pageKeyword = embedKeywordMap[embedCurrentPreviewPage];
    if (pageKeyword && pageKeyword.found) {
      baseCapX = pageKeyword.x;
      baseCapY = pageKeyword.y - capSize - 10;
    }

    const effectiveX = baseCapX + deltaX;
    const effectiveY = baseCapY + deltaY;

    const sigY = effectiveY + ((capSize - sigH) / 2);

    // Convert PDF Coordinates (0,0 at bottom-left) to Preview Canvas DOM Overlay Coordinates (0,0 at top-left)
    const overlayCap = document.getElementById('embed-overlay-cap');
    const overlaySig = document.getElementById('embed-overlay-sig');

    const domCapX = (effectiveX - 15) * scale;
    const domCapY = (viewport.height - effectiveY - capSize) * scale;
    const domCapSize = capSize * scale;

    const domSigX = (effectiveX + 15) * scale;
    const domSigY = (viewport.height - sigY - sigH) * scale;
    const domSigW = sigW * scale;
    const domSigH = sigH * scale;

    if (embedCapBytes) {
      overlayCap.style.display = 'block';
      overlayCap.style.left = `${domCapX}px`;
      overlayCap.style.top = `${domCapY}px`;
      overlayCap.style.width = `${domCapSize}px`;
      overlayCap.style.height = `${domCapSize}px`;
    }

    if (embedSigBytes) {
      overlaySig.style.display = 'block';
      overlaySig.style.left = `${domSigX}px`;
      overlaySig.style.top = `${domSigY}px`;
      overlaySig.style.width = `${domSigW}px`;
      overlaySig.style.height = `${domSigH}px`;
    }
  } catch (err) {
    console.error('Failed to render embed preview:', err);
  }
}

function updateEmbedUI() {
  const btnProcess = document.getElementById('btn-embed-process');
  const canProcess = embedPdfBytes !== null && (embedCapBytes !== null || embedSigBytes !== null) && embedOutputDir !== '';

  if (canProcess) {
    btnProcess.classList.remove('btn-disabled');
    btnProcess.removeAttribute('disabled');
  } else {
    btnProcess.classList.add('btn-disabled');
    btnProcess.setAttribute('disabled', 'true');
  }
}

function setEmbedWorkingState(isWorking) {
  const btnProcess = document.getElementById('btn-embed-process');
  if (isWorking) {
    btnProcess.classList.add('btn-disabled');
    btnProcess.setAttribute('disabled', 'true');
    btnProcess.innerHTML = `<span class="spinner"></span> Memproses Embedding ke ${embedPdfDoc ? embedPdfDoc.numPages : ''} Halaman...`;
  } else {
    btnProcess.innerHTML = `Embed Cap & Tanda Tangan ke Semua Halaman`;
    updateEmbedUI();
  }
}

// Setup Interactive Drag & Drop Overlay Engine for Cap & Signature
function setupEmbedOverlayDrag() {
  const stage = document.getElementById('embed-preview-stage');
  const overlayCap = document.getElementById('embed-overlay-cap');
  const overlaySig = document.getElementById('embed-overlay-sig');

  if (!stage || !overlayCap || !overlaySig) return;

  let activeOverlay = null;
  let overlayOffsetX = 0;
  let overlayOffsetY = 0;

  const initiateOverlayDrag = (e, overlay) => {
    e.stopPropagation();
    e.preventDefault();

    activeOverlay = overlay;
    const rect = overlay.getBoundingClientRect();
    overlayOffsetX = e.clientX - rect.left;
    overlayOffsetY = e.clientY - rect.top;
    document.body.style.cursor = 'move';
  };

  overlayCap.addEventListener('pointerdown', (e) => initiateOverlayDrag(e, overlayCap));
  overlaySig.addEventListener('pointerdown', (e) => initiateOverlayDrag(e, overlaySig));

  window.addEventListener('pointermove', (e) => {
    if (!activeOverlay || !embedPdfDoc) return;
    e.preventDefault();

    const stageRect = stage.getBoundingClientRect();
    const canvas = document.getElementById('embed-preview-canvas');
    if (!canvas) return;

    const scale = canvas.width / embedPageDimensions.width;

    let newLeft = e.clientX - stageRect.left - overlayOffsetX;
    let newTop = e.clientY - stageRect.top - overlayOffsetY;

    // Constrain within preview stage boundary
    newLeft = Math.max(0, Math.min(newLeft, stageRect.width - activeOverlay.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, stageRect.height - activeOverlay.offsetHeight));

    activeOverlay.style.left = `${newLeft}px`;
    activeOverlay.style.top = `${newTop}px`;

    // Convert DOM pixels to PDF point coordinates
    const inputX = document.getElementById('embed-pos-x');
    const inputY = document.getElementById('embed-pos-y');
    const capSize = parseFloat(document.getElementById('embed-cap-size').value) || 95;
    const sigW = parseFloat(document.getElementById('embed-sig-w').value) || 100;
    const sigH = Math.round(sigW * 0.5);

    let baseCapX = 370;
    let baseCapY = 85;
    const pageKeyword = embedKeywordMap[embedCurrentPreviewPage];
    if (pageKeyword && pageKeyword.found) {
      baseCapX = pageKeyword.x;
      baseCapY = pageKeyword.y - capSize - 10;
    }

    if (activeOverlay === overlayCap) {
      const pdfX = Math.round((newLeft / scale) + 15);
      const pdfY = Math.round(embedPageDimensions.height - (newTop / scale) - capSize);
      if (inputX) inputX.value = Math.round(pdfX - baseCapX);
      if (inputY) inputY.value = Math.round(pdfY - baseCapY);
    } else if (activeOverlay === overlaySig) {
      const pdfX = Math.round((newLeft / scale) - 15);
      const pdfY = Math.round(embedPageDimensions.height - (newTop / scale) - (capSize + sigH) / 2);
      if (inputX) inputX.value = Math.round(pdfX - baseCapX);
      if (inputY) inputY.value = Math.round(pdfY - baseCapY);
    }

    const btnPresetMengetahui = document.getElementById('btn-preset-mengetahui');
    const btnPresetBawahKiri = document.getElementById('btn-preset-bawah-kiri');
    if (btnPresetMengetahui) btnPresetMengetahui.classList.remove('active');
    if (btnPresetBawahKiri) btnPresetBawahKiri.classList.remove('active');
  });

  const stopOverlayDrag = () => {
    if (activeOverlay) {
      activeOverlay = null;
      document.body.style.cursor = '';
      renderEmbedLivePreview();
    }
  };

  window.addEventListener('pointerup', stopOverlayDrag);
  window.addEventListener('pointercancel', stopOverlayDrag);
}

// ==========================================
// FREE PLACEMENT (MULTI-GAMBAR) CONTROLLER
// ==========================================
let freePdfPath = null;
let freePdfBytes = null;
let freePdfDoc = null;
let freeOutputDir = '';
let freeCurrentPreviewPage = 1;
let freePageDimensions = { width: 612, height: 792 };
let freeZoomLevel = 1.0;

// Uploaded Asset Library
// { id, name, path, type, bytes, blobUrl, initW, initH }
let freeUploadedAssets = [];

// Placed Overlay Objects
// { id, assetId, name, path, type, bytes, blobUrl, page, pdfX, pdfY, pdfW, pdfH }
let freePlacedOverlays = [];

function initFreeEmbedTab() {
  const btnSelectPdf = document.getElementById('btn-free-select-pdf');
  const btnAddImages = document.getElementById('btn-free-add-images');
  const btnBrowseDir = document.getElementById('btn-free-browse-dir');
  const btnProcess = document.getElementById('btn-free-process');
  const pageSelect = document.getElementById('free-preview-page-select');

  const btnZoomIn = document.getElementById('btn-free-zoom-in');
  const btnZoomOut = document.getElementById('btn-free-zoom-out');
  const btnZoomReset = document.getElementById('btn-free-zoom-reset');

  // Zoom Controls
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      freeZoomLevel = Math.min(2.5, Math.round((freeZoomLevel + 0.15) * 100) / 100);
      updateZoomLabel();
      renderFreeEmbedLivePreview();
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      freeZoomLevel = Math.max(0.4, Math.round((freeZoomLevel - 0.15) * 100) / 100);
      updateZoomLabel();
      renderFreeEmbedLivePreview();
    });
  }

  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
      freeZoomLevel = 1.0;
      updateZoomLabel();
      renderFreeEmbedLivePreview();
    });
  }

  // 1. Select Main PDF File
  if (btnSelectPdf) {
    btnSelectPdf.addEventListener('click', async () => {
      try {
        const selected = await window.api.selectSinglePDF();
        if (selected) {
          freePdfPath = selected.path;
          freePdfBytes = await window.api.readFileBytes(selected.path);

          const loadingTask = pdfjsLib.getDocument({ data: freePdfBytes.slice() });
          freePdfDoc = await loadingTask.promise;

          document.getElementById('free-pdf-name').textContent = selected.name;
          document.getElementById('free-pdf-pages').textContent = `${freePdfDoc.numPages} pages`;
          document.getElementById('free-pdf-file-info').style.display = 'flex';

          // Populate page selector dropdown
          pageSelect.innerHTML = '';
          for (let p = 1; p <= freePdfDoc.numPages; p++) {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = `Page ${p}`;
            pageSelect.appendChild(opt);
          }

          freeCurrentPreviewPage = 1;
          renderFreeEmbedLivePreview();
          updateFreeEmbedUI();
          showToast('PDF Dimuat', `Berhasil membaca ${selected.name} (${freePdfDoc.numPages} halaman).`, 'success');
        }
      } catch (err) {
        showToast('Error', 'Gagal membaca file PDF: ' + err.message, 'error');
      }
    });
  }

  // 2. Select & Upload Multiple Images to Library
  if (btnAddImages) {
    btnAddImages.addEventListener('click', async () => {
      try {
        const selected = await window.api.selectImageFile();
        if (selected) {
          const imgBytes = await window.api.readFileBytes(selected.path);
          const ext = selected.name.substring(selected.name.lastIndexOf('.') + 1).toLowerCase();
          const type = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : 'png';
          const blob = new Blob([imgBytes], { type: `image/${type}` });
          const blobUrl = URL.createObjectURL(blob);

          const tempImg = new Image();
          tempImg.src = blobUrl;
          await tempImg.decode().catch(() => {});

          const initW = 100;
          const aspect = tempImg.naturalWidth && tempImg.naturalHeight ? tempImg.naturalHeight / tempImg.naturalWidth : 0.8;
          const initH = Math.round(initW * aspect);

          const assetItem = {
            id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            name: selected.name,
            path: selected.path,
            type,
            bytes: imgBytes,
            blobUrl,
            initW,
            initH
          };

          freeUploadedAssets.push(assetItem);

          // Automatically place one instance on current preview page
          addOverlayPlacementForAsset(assetItem, freeCurrentPreviewPage);

          renderFreeImagesList();
          renderFreeEmbedLivePreview();
          updateFreeEmbedUI();
          showToast('Gambar Ditambahkan', `${selected.name} ditambahkan ke Halaman ${freeCurrentPreviewPage}`, 'success');
        }
      } catch (err) {
        showToast('Error', 'Gagal membaca file gambar: ' + err.message, 'error');
      }
    });
  }

  // Page selector dropdown change
  if (pageSelect) {
    pageSelect.addEventListener('change', (e) => {
      freeCurrentPreviewPage = parseInt(e.target.value) || 1;
      renderFreeImagesList();
      renderFreeEmbedLivePreview();
    });
  }

  // Browse Directory Location
  if (btnBrowseDir) {
    btnBrowseDir.addEventListener('click', async () => {
      try {
        const dirPath = await window.api.selectDirectory();
        if (dirPath) {
          freeOutputDir = dirPath;
          document.getElementById('free-out-dir').value = freeOutputDir;
          updateFreeEmbedUI();
          showToast('Folder Tujuan Dipilih', 'Lokasi penyimpanan diset.', 'success');
        }
      } catch (err) {
        showToast('Error', 'Gagal memilih folder: ' + err.message, 'error');
      }
    });
  }

  // Process & Export PDF
  if (btnProcess) {
    btnProcess.addEventListener('click', async () => {
      if (!freePdfBytes || !freeOutputDir || freePlacedOverlays.length === 0) return;

      const filenameInput = document.getElementById('free-out-filename');
      let filename = filenameInput && filenameInput.value.trim() !== '' ? filenameInput.value.trim() : 'dokumen_posisi_bebas_embedded';
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
      }

      const outputPath = `${freeOutputDir}\\${filename}`;

      setFreeEmbedWorkingState(true);

      try {
        const { PDFDocument } = PDFLib;
        const freshPdfBytes = await window.api.readFileBytes(freePdfPath);
        const pdfDoc = await PDFDocument.load(freshPdfBytes);

        for (const item of freePlacedOverlays) {
          if (item.page <= pdfDoc.getPageCount()) {
            const pageObj = pdfDoc.getPages()[item.page - 1];
            let imgEmbed = null;
            if (item.type === 'jpeg') {
              imgEmbed = await pdfDoc.embedJpg(item.bytes);
            } else {
              imgEmbed = await pdfDoc.embedPng(item.bytes);
            }

            pageObj.drawImage(imgEmbed, {
              x: item.pdfX,
              y: item.pdfY,
              width: item.pdfW,
              height: item.pdfH,
              opacity: 1.0
            });
          }
        }

        const modifiedBytes = await pdfDoc.save();
        await window.api.writeFileBytes(outputPath, modifiedBytes);

        showToast('Sukses Export PDF!', `Berhasil menempelkan ${freePlacedOverlays.length} gambar ke PDF! Output: ${filename}`, 'success');
      } catch (err) {
        showToast('Gagal Export PDF', err.message, 'error');
      } finally {
        setFreeEmbedWorkingState(false);
      }
    });
  }
}

function updateZoomLabel() {
  const label = document.getElementById('free-zoom-label');
  if (label) {
    label.textContent = `${Math.round(freeZoomLevel * 100)}%`;
  }
}

// Add Placement Instance for an Asset onto a Page
function addOverlayPlacementForAsset(asset, targetPage) {
  const overlayItem = {
    id: `overlay_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    assetId: asset.id,
    name: asset.name,
    path: asset.path,
    type: asset.type,
    bytes: asset.bytes,
    blobUrl: asset.blobUrl,
    page: targetPage,
    pdfX: 150,
    pdfY: 300,
    pdfW: asset.initW || 100,
    pdfH: asset.initH || 80
  };
  freePlacedOverlays.push(overlayItem);
  return overlayItem;
}

// Render uploaded images asset list sidebar & page-specific overlays
function renderFreeImagesList() {
  const container = document.getElementById('free-images-list');
  if (!container) return;

  if (freeUploadedAssets.length === 0) {
    container.innerHTML = `
      <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; padding: 12px; border: 1px dashed var(--border-color); border-radius: 6px;">
        Belum ada gambar diupload. Klik tombol di atas untuk menambah gambar.
      </div>`;
    return;
  }

  container.innerHTML = '';

  // 1. Asset Library Section
  freeUploadedAssets.forEach((asset, aIndex) => {
    const assetCard = document.createElement('div');
    assetCard.style.cssText = 'display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--border-radius-md);';

    assetCard.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
          <img src="${asset.blobUrl}" style="width: 24px; height: 24px; object-fit: contain; background: #fff; border-radius: 3px;">
          <span style="font-weight: 600; font-size: 0.75rem; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px;" title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</span>
        </div>
        <button type="button" class="btn-del-asset-lib" style="background: none; border: none; color: #ef4444; font-size: 0.85rem; cursor: pointer; padding: 2px 4px;" title="Hapus Aset Ini & Semua Tempelannya">✕</button>
      </div>

      <div style="display: flex; gap: 4px; align-items: center; margin-top: 2px;">
        <button type="button" class="btn-add-to-curr-page btn-secondary" style="font-size: 0.68rem; padding: 3px 6px; flex: 1;">+ Tempel Hal ${freeCurrentPreviewPage}</button>
        <button type="button" class="btn-add-to-all-pages btn-secondary" style="font-size: 0.68rem; padding: 3px 6px; flex: 1;">+ Semua Hal</button>
      </div>
    `;

    // Delete entire asset and its placements
    assetCard.querySelector('.btn-del-asset-lib').addEventListener('click', () => {
      freeUploadedAssets.splice(aIndex, 1);
      freePlacedOverlays = freePlacedOverlays.filter(o => o.assetId !== asset.id);
      renderFreeImagesList();
      renderFreeEmbedLivePreview();
      updateFreeEmbedUI();
    });

    // Add to current page
    assetCard.querySelector('.btn-add-to-curr-page').addEventListener('click', () => {
      addOverlayPlacementForAsset(asset, freeCurrentPreviewPage);
      renderFreeImagesList();
      renderFreeEmbedLivePreview();
      updateFreeEmbedUI();
      showToast('Gambar Ditempel', `${asset.name} ditambahkan ke Halaman ${freeCurrentPreviewPage}`, 'success');
    });

    // Add to all pages
    assetCard.querySelector('.btn-add-to-all-pages').addEventListener('click', () => {
      const numPages = freePdfDoc ? freePdfDoc.numPages : 1;
      for (let p = 1; p <= numPages; p++) {
        addOverlayPlacementForAsset(asset, p);
      }
      renderFreeImagesList();
      renderFreeEmbedLivePreview();
      updateFreeEmbedUI();
      showToast('Gambar Ditempel', `${asset.name} ditambahkan ke semua ${numPages} halaman!`, 'success');
    });

    container.appendChild(assetCard);
  });

  // 2. Active Placements list on Current Page
  const pageOverlays = freePlacedOverlays.filter(o => o.page === freeCurrentPreviewPage);
  if (pageOverlays.length > 0) {
    const sectionTitle = document.createElement('div');
    sectionTitle.style.cssText = 'font-size: 0.7rem; font-weight: 600; color: #38bdf8; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px;';
    sectionTitle.textContent = `Aset di Halaman ${freeCurrentPreviewPage} (${pageOverlays.length}):`;
    container.appendChild(sectionTitle);

    pageOverlays.forEach((item) => {
      const itemCard = document.createElement('div');
      itemCard.style.cssText = 'display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; background: rgba(15, 23, 42, 0.4); border: 1px dashed var(--border-color); border-radius: var(--border-radius-md);';

      let pageOptions = '';
      const numPages = freePdfDoc ? freePdfDoc.numPages : 10;
      for (let p = 1; p <= numPages; p++) {
        pageOptions += `<option value="${p}" ${item.page === p ? 'selected' : ''}>Halaman ${p}</option>`;
      }

      itemCard.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <span style="font-weight: 500; font-size: 0.7rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <button type="button" class="btn-del-single-overlay" style="background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;" title="Hapus dari Halaman Ini Sahaja">✕</button>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <select class="overlay-page-select" style="font-size: 0.68rem; padding: 1px 3px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; flex: 1;">
            ${pageOptions}
          </select>
          <div style="display: flex; align-items: center; gap: 2px; font-size: 0.68rem; color: var(--text-muted);">
            <span>W:</span>
            <input type="number" class="overlay-w-input" value="${Math.round(item.pdfW)}" style="width: 38px; font-size: 0.68rem; padding: 1px 2px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px;">
          </div>
          <div style="display: flex; align-items: center; gap: 2px; font-size: 0.68rem; color: var(--text-muted);">
            <span>H:</span>
            <input type="number" class="overlay-h-input" value="${Math.round(item.pdfH)}" style="width: 38px; font-size: 0.68rem; padding: 1px 2px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px;">
          </div>
        </div>
      `;

      itemCard.querySelector('.btn-del-single-overlay').addEventListener('click', () => {
        freePlacedOverlays = freePlacedOverlays.filter(o => o.id !== item.id);
        renderFreeImagesList();
        renderFreeEmbedLivePreview();
        updateFreeEmbedUI();
      });

      itemCard.querySelector('.overlay-page-select').addEventListener('change', (e) => {
        item.page = parseInt(e.target.value) || 1;
        renderFreeImagesList();
        renderFreeEmbedLivePreview();
      });

      itemCard.querySelector('.overlay-w-input').addEventListener('input', (e) => {
        item.pdfW = Math.max(10, parseFloat(e.target.value) || 100);
        renderFreeEmbedLivePreview();
      });

      itemCard.querySelector('.overlay-h-input').addEventListener('input', (e) => {
        item.pdfH = Math.max(10, parseFloat(e.target.value) || 80);
        renderFreeEmbedLivePreview();
      });

      container.appendChild(itemCard);
    });
  }
}

// Render Free Embed Stage Canvas & Interactive Overlay Items with Drag & Corner Handles
async function renderFreeEmbedLivePreview() {
  if (!freePdfDoc) {
    document.getElementById('free-empty-state').style.display = 'flex';
    document.getElementById('free-preview-stage').style.display = 'none';
    return;
  }

  document.getElementById('free-empty-state').style.display = 'none';
  document.getElementById('free-preview-stage').style.display = 'block';

  try {
    const page = await freePdfDoc.getPage(freeCurrentPreviewPage);
    const viewport = page.getViewport({ scale: 1.0 });

    freePageDimensions = { width: viewport.width, height: viewport.height };

    const previewCanvas = document.getElementById('free-preview-canvas');
    const stageContainer = document.getElementById('free-preview-stage').parentElement;

    // Calculate dynamic base display width to fit workspace, scaled by freeZoomLevel
    const containerWidth = stageContainer ? stageContainer.clientWidth : 700;
    const baseDisplayWidth = Math.max(480, containerWidth - 60);
    const displayWidth = Math.round(baseDisplayWidth * freeZoomLevel);

    const scale = displayWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    previewCanvas.width = scaledViewport.width;
    previewCanvas.height = scaledViewport.height;

    const ctx = previewCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    document.getElementById('free-page-indicator').textContent = `(Halaman ${freeCurrentPreviewPage} dari ${freePdfDoc.numPages})`;

    // Render Overlay Items on current preview page
    const container = document.getElementById('free-overlays-container');
    container.innerHTML = '';

    const overlaysOnPage = freePlacedOverlays.filter(o => o.page === freeCurrentPreviewPage);

    overlaysOnPage.forEach((item) => {
      const domX = item.pdfX * scale;
      const domY = (viewport.height - item.pdfY - item.pdfH) * scale;
      const domW = item.pdfW * scale;
      const domH = item.pdfH * scale;

      const overlayEl = document.createElement('div');
      overlayEl.className = 'free-overlay-item';
      overlayEl.style.left = `${domX}px`;
      overlayEl.style.top = `${domY}px`;
      overlayEl.style.width = `${domW}px`;
      overlayEl.style.height = `${domH}px`;
      overlayEl.style.pointerEvents = 'auto';

      overlayEl.innerHTML = `
        <div class="free-overlay-header">
          <span>${escapeHtml(item.name)}</span>
          <span class="btn-del-overlay" title="Hapus Gambar dari Halaman Ini">✕</span>
        </div>
        <img src="${item.blobUrl}" style="width: 100%; height: 100%; object-fit: contain; pointer-events: none;">
        
        <!-- Corner Handles -->
        <div class="resize-handle nw" data-handle="nw"></div>
        <div class="resize-handle ne" data-handle="ne"></div>
        <div class="resize-handle sw" data-handle="sw"></div>
        <div class="resize-handle se" data-handle="se"></div>
      `;

      // Delete ONLY this specific page instance overlay button click
      overlayEl.querySelector('.btn-del-overlay').addEventListener('click', (e) => {
        e.stopPropagation();
        freePlacedOverlays = freePlacedOverlays.filter(o => o.id !== item.id);
        renderFreeImagesList();
        renderFreeEmbedLivePreview();
        updateFreeEmbedUI();
      });

      // Drag & Resize Pointer Handlers
      setupFreeOverlayItemInteractions(overlayEl, item, scale, viewport.height);

      container.appendChild(overlayEl);
    });
  } catch (err) {
    console.error('Failed to render free embed preview:', err);
  }
}

// Interaction Engine: Pointer Dragging & Corner Resizing
function setupFreeOverlayItemInteractions(overlayEl, item, scale, pageHeight) {
  let isDragging = false;
  let isResizing = false;
  let activeHandle = null;
  let startX = 0;
  let startY = 0;
  let startPdfX = 0;
  let startPdfY = 0;
  let startPdfW = 0;
  let startPdfH = 0;

  overlayEl.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('resize-handle')) {
      e.stopPropagation();
      e.preventDefault();
      isResizing = true;
      activeHandle = e.target.getAttribute('data-handle');
      startX = e.clientX;
      startY = e.clientY;
      startPdfX = item.pdfX;
      startPdfY = item.pdfY;
      startPdfW = item.pdfW;
      startPdfH = item.pdfH;
      document.body.style.cursor = e.target.style.cursor || 'nwse-resize';
      return;
    }

    if (e.target.closest('.free-overlay-header')) return;

    e.stopPropagation();
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startPdfX = item.pdfX;
    startPdfY = item.pdfY;
    document.body.style.cursor = 'move';
  });

  const onPointerMove = (e) => {
    if (isDragging) {
      e.preventDefault();
      const deltaClientX = e.clientX - startX;
      const deltaClientY = e.clientY - startY;

      const deltaPdfX = deltaClientX / scale;
      const deltaPdfY = - (deltaClientY / scale);

      item.pdfX = Math.round(startPdfX + deltaPdfX);
      item.pdfY = Math.round(startPdfY + deltaPdfY);

      const newDomX = item.pdfX * scale;
      const newDomY = (pageHeight - item.pdfY - item.pdfH) * scale;
      overlayEl.style.left = `${newDomX}px`;
      overlayEl.style.top = `${newDomY}px`;
    } else if (isResizing) {
      e.preventDefault();
      const deltaClientX = e.clientX - startX;
      const deltaClientY = e.clientY - startY;

      const deltaPdfX = deltaClientX / scale;
      const deltaPdfY = deltaClientY / scale;

      let newPdfW = startPdfW;
      let newPdfH = startPdfH;
      let newPdfX = startPdfX;
      let newPdfY = startPdfY;

      if (activeHandle === 'se') {
        newPdfW = Math.max(15, startPdfW + deltaPdfX);
        newPdfH = Math.max(15, startPdfH + deltaPdfY);
        newPdfY = startPdfY - (newPdfH - startPdfH);
      } else if (activeHandle === 'sw') {
        newPdfW = Math.max(15, startPdfW - deltaPdfX);
        newPdfH = Math.max(15, startPdfH + deltaPdfY);
        newPdfX = startPdfX + (startPdfW - newPdfW);
        newPdfY = startPdfY - (newPdfH - startPdfH);
      } else if (activeHandle === 'ne') {
        newPdfW = Math.max(15, startPdfW + deltaPdfX);
        newPdfH = Math.max(15, startPdfH - deltaPdfY);
      } else if (activeHandle === 'nw') {
        newPdfW = Math.max(15, startPdfW - deltaPdfX);
        newPdfH = Math.max(15, startPdfH - deltaPdfY);
        newPdfX = startPdfX + (startPdfW - newPdfW);
      }

      item.pdfX = Math.round(newPdfX);
      item.pdfY = Math.round(newPdfY);
      item.pdfW = Math.round(newPdfW);
      item.pdfH = Math.round(newPdfH);

      const newDomX = item.pdfX * scale;
      const newDomY = (pageHeight - item.pdfY - item.pdfH) * scale;
      const newDomW = item.pdfW * scale;
      const newDomH = item.pdfH * scale;

      overlayEl.style.left = `${newDomX}px`;
      overlayEl.style.top = `${newDomY}px`;
      overlayEl.style.width = `${newDomW}px`;
      overlayEl.style.height = `${newDomH}px`;
    }
  };

  const onPointerUp = () => {
    if (isDragging || isResizing) {
      isDragging = false;
      isResizing = false;
      activeHandle = null;
      document.body.style.cursor = '';
      renderFreeImagesList();
    }
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function updateFreeEmbedUI() {
  const btnProcess = document.getElementById('btn-free-process');
  if (!btnProcess) return;

  const canProcess = freePdfBytes !== null && freePlacedOverlays.length > 0 && freeOutputDir !== '';
  if (canProcess) {
    btnProcess.classList.remove('btn-disabled');
    btnProcess.removeAttribute('disabled');
  } else {
    btnProcess.classList.add('btn-disabled');
    btnProcess.setAttribute('disabled', 'true');
  }
}

function setFreeEmbedWorkingState(isWorking) {
  const btnProcess = document.getElementById('btn-free-process');
  if (!btnProcess) return;

  if (isWorking) {
    btnProcess.classList.add('btn-disabled');
    btnProcess.setAttribute('disabled', 'true');
    btnProcess.innerHTML = `<span class="spinner"></span> Memproses & Export PDF...`;
  } else {
    btnProcess.innerHTML = `Simpan & Export PDF (Posisi Bebas)`;
    updateFreeEmbedUI();
  }
}

