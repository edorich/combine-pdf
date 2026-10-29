const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFiles: () => ipcRenderer.invoke('select-files'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectOutput: () => ipcRenderer.invoke('select-output'),
  combinePDFs: (files, outputPath) => ipcRenderer.invoke('combine-pdfs', files, outputPath),
  
  // New Scan & Merge IPC handlers
  selectSinglePDF: () => ipcRenderer.invoke('select-single-pdf'),
  detectScanners: () => ipcRenderer.invoke('detect-scanners'),
  openImageCapture: () => ipcRenderer.invoke('open-image-capture'),
  mergeScans: (basePdfPath, scannedImages, outputPath) => ipcRenderer.invoke('merge-scans', basePdfPath, scannedImages, outputPath),
  selectScannedFiles: () => ipcRenderer.invoke('select-scanned-files'),
  scanFromPhysicalScanner: (scannerName) => ipcRenderer.invoke('scan-from-physical-scanner', scannerName),

  // Page Organizer IPC handlers
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  applyPageEdits: (filePath, pages, splitPoints, outputDir) => ipcRenderer.invoke('apply-page-edits', filePath, pages, splitPoints, outputDir),
  readFileBytes: (filePath) => ipcRenderer.invoke('read-file-bytes', filePath)
});
