const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { PDFDocument, degrees } = require('pdf-lib');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

function createWindow() {
  const win = new BrowserWindow({
    width: 950,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset', // Gives a sleek macOS feel if run on macOS
    backgroundColor: '#0f172a' // slate-900 background to prevent flash
  });

  win.loadFile('index.html');
  
  // Optional: Open DevTools for troubleshooting if needed during dev
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler to select multiple PDF files
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select PDF Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'PDF Documents', extensions: ['pdf'] }
    ]
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths.map(filePath => ({
    name: path.basename(filePath),
    path: filePath
  }));
});

// IPC Handler to select multiple scanned image or PDF files
ipcMain.handle('select-scanned-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Scanned Pages / Images / PDFs',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Scanned Documents & Images', extensions: ['png', 'jpg', 'jpeg', 'pdf'] }
    ]
  });

  if (result.canceled) {
    return [];
  }

  return result.filePaths.map(filePath => ({
    name: path.basename(filePath),
    path: filePath
  }));
});

// IPC Handler to select a folder containing PDFs
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Folder containing PDFs',
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const folderPath = result.filePaths[0];
  try {
    const files = await fs.promises.readdir(folderPath);
    const pdfFiles = [];

    for (const file of files) {
      if (file.toLowerCase().endsWith('.pdf')) {
        const fullPath = path.join(folderPath, file);
        const stat = await fs.promises.stat(fullPath);
        if (stat.isFile()) {
          pdfFiles.push({
            name: file,
            path: fullPath
          });
        }
      }
    }
    
    // Sort files alphabetically by name by default
    pdfFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    return pdfFiles;
  } catch (error) {
    console.error('Error reading directory:', error);
    throw error;
  }
});

// IPC Handler to select destination output path
ipcMain.handle('select-output', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Select Output Combined PDF',
    defaultPath: 'combined.pdf',
    filters: [
      { name: 'PDF Documents', extensions: ['pdf'] }
    ]
  });

  if (result.canceled) {
    return null;
  }

  return result.filePath;
});

// IPC Handler to combine PDF files
ipcMain.handle('combine-pdfs', async (event, filePaths, outputPath) => {
  try {
    if (!filePaths || filePaths.length === 0) {
      throw new Error('No PDF files provided to combine.');
    }
    if (!outputPath) {
      throw new Error('Output path was not specified.');
    }

    const mergedPdf = await PDFDocument.create();

    for (const filePath of filePaths) {
      const pdfBytes = await fs.promises.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    await fs.promises.writeFile(outputPath, mergedPdfBytes);
    return { success: true };
  } catch (error) {
    console.error('Error combining PDFs:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler to select a single base PDF file
ipcMain.handle('select-single-pdf', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Base PDF File',
    properties: ['openFile'],
    filters: [
      { name: 'PDF Documents', extensions: ['pdf'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const stats = await fs.promises.stat(filePath);
  
  let pageCount = 0;
  try {
    const pdfBytes = await fs.promises.readFile(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pageCount = pdfDoc.getPageCount();
  } catch (e) {
    console.error('Error reading PDF pages:', e);
  }

  return {
    name: path.basename(filePath),
    path: filePath,
    size: stats.size,
    pages: pageCount
  };
});

// IPC Handler to detect connected USB scanners
ipcMain.handle('detect-scanners', async () => {
  const scanners = [];
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execPromise('system_profiler SPUSBDataType SPPrintersDataType');
      const lines = stdout.split('\n');
      const seenDevices = new Set();
      const keywords = ['scanner', 'scan', 'epson', 'canon', 'hp ', 'fujitsu', 'brother', 'pixma', 'imageclass', 'laserjet', 'officejet'];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Product ID:') || trimmed.startsWith('Vendor ID:') || trimmed.startsWith('Serial Number:')) continue;
        const lower = trimmed.toLowerCase();
        for (const kw of keywords) {
          if (lower.includes(kw)) {
            let name = trimmed.replace(/:$/, '').trim();
            if (name.length > 3 && name.length < 50 && !seenDevices.has(name)) {
              seenDevices.add(name);
              scanners.push({ name, type: 'USB Scanner' });
            }
            break;
          }
        }
      }
    } else if (process.platform === 'win32') {
      const cmd = `powershell -Command "Get-CimInstance -ClassName Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Image' -or $_.Name -like '*scanner*' -or $_.Name -like '*scan*' } | Select-Object Name | ConvertTo-Json"`;
      const { stdout } = await execPromise(cmd);
      if (stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout);
          const devices = Array.isArray(parsed) ? parsed : [parsed];
          const seenDevices = new Set();
          for (const dev of devices) {
            if (dev && dev.Name) {
              const name = dev.Name.trim();
              if (name && !seenDevices.has(name)) {
                seenDevices.add(name);
                scanners.push({ name, type: 'USB Scanner' });
              }
            }
          }
        } catch (e) {
          const matches = stdout.match(/"Name":\s*"(.*?)"/g);
          if (matches) {
            for (const m of matches) {
              const name = m.replace(/"Name":\s*"/, '').replace(/"$/, '').trim();
              if (name) {
                scanners.push({ name, type: 'USB Scanner' });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error detecting scanners:', err);
  }

  scanners.push({ name: 'Virtual Scanner (Simulation Mode)', type: 'Virtual' });
  return scanners;
});

// IPC Handler to open Image Capture (macOS) or WIA Scanner Manager (Windows)
ipcMain.handle('open-image-capture', async () => {
  try {
    if (process.platform === 'darwin') {
      await execPromise('open -a "Image Capture"');
      return { success: true };
    } else if (process.platform === 'win32') {
      exec('wiaacmgr.exe');
      return { success: true };
    } else {
      throw new Error('Platform not supported for Image Capture launch');
    }
  } catch (err) {
    console.error('Error opening image capture utility:', err);
    return { success: false, error: err.message };
  }
});

// IPC Handler to merge base PDF and scanned pages (images/PDFs)
ipcMain.handle('merge-scans', async (event, basePdfPath, scannedPages, outputPath) => {
  try {
    if (!basePdfPath) {
      throw new Error('Base PDF path is required.');
    }
    if (!scannedPages || scannedPages.length === 0) {
      throw new Error('No scanned pages provided.');
    }
    if (!outputPath) {
      throw new Error('Output path is required.');
    }

    // Load base PDF
    const baseBytes = await fs.promises.readFile(basePdfPath);
    const mergedPdf = await PDFDocument.load(baseBytes);

    for (const pageItem of scannedPages) {
      let fileBytes;
      let contentType = '';

      if (pageItem.startsWith('data:')) {
        const matches = pageItem.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          throw new Error('Invalid scanned image data URL.');
        }
        contentType = matches[1];
        fileBytes = Buffer.from(matches[2], 'base64');
      } else {
        // Assume file path
        fileBytes = await fs.promises.readFile(pageItem);
        const ext = path.extname(pageItem).toLowerCase();
        if (ext === '.pdf') {
          contentType = 'application/pdf';
        } else if (ext === '.png') {
          contentType = 'image/png';
        } else if (ext === '.jpg' || ext === '.jpeg') {
          contentType = 'image/jpeg';
        }
      }

      if (contentType === 'application/pdf') {
        const scanPdfDoc = await PDFDocument.load(fileBytes);
        const copiedPages = await mergedPdf.copyPages(scanPdfDoc, scanPdfDoc.getPageIndices());
        copiedPages.forEach((p) => mergedPdf.addPage(p));
      } else {
        // Embed image (PNG or JPG)
        let embeddedImage;
        if (contentType === 'image/png') {
          embeddedImage = await mergedPdf.embedPng(fileBytes);
        } else {
          // Fallback to jpeg
          embeddedImage = await mergedPdf.embedJpg(fileBytes);
        }

        const pageWidth = 595.27; // A4 width in points
        const pageHeight = 841.89; // A4 height in points
        
        // Calculate fitting dimensions (maintaining aspect ratio)
        const imgRatio = embeddedImage.width / embeddedImage.height;
        const pageRatio = pageWidth / pageHeight;
        let drawWidth = pageWidth;
        let drawHeight = pageHeight;
        
        if (imgRatio > pageRatio) {
          drawHeight = pageWidth / imgRatio;
        } else {
          drawWidth = pageHeight * imgRatio;
        }
        
        const x = (pageWidth - drawWidth) / 2;
        const y = (pageHeight - drawHeight) / 2;

        const newPage = mergedPdf.addPage([pageWidth, pageHeight]);
        newPage.drawImage(embeddedImage, {
          x: x,
          y: y,
          width: drawWidth,
          height: drawHeight
        });
      }
    }

    const mergedPdfBytes = await mergedPdf.save();
    await fs.promises.writeFile(outputPath, mergedPdfBytes);
    return { success: true };
  } catch (error) {
    console.error('Error in merge-scans handler:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler to select output directory for splits/edits
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Destination Folder',
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// IPC Handler to rotate, delete, and split pages of a PDF
ipcMain.handle('apply-page-edits', async (event, filePath, pages, splitPoints, outputDir) => {
  try {
    if (!filePath) throw new Error('Source file path is required.');
    if (!pages || pages.length === 0) throw new Error('Pages structure is empty.');
    if (!outputDir) throw new Error('Destination folder is required.');

    // 1. Read source PDF
    const fileBytes = await fs.promises.readFile(filePath);
    const sourceDoc = await PDFDocument.load(fileBytes);
    const originalPagesCount = sourceDoc.getPageCount();

    // 2. Copy and rotate pages
    const tempDoc = await PDFDocument.create();
    
    for (const pageObj of pages) {
      const { originalIndex, rotation } = pageObj;
      if (originalIndex < 0 || originalIndex >= originalPagesCount) {
        throw new Error(`Invalid page index: ${originalIndex}`);
      }
      
      const [copiedPage] = await tempDoc.copyPages(sourceDoc, [originalIndex]);
      
      const currentRotation = copiedPage.getRotation().angle;
      const finalRotation = (currentRotation + rotation) % 360;
      copiedPage.setRotation(degrees(finalRotation));
      
      tempDoc.addPage(copiedPage);
    }

    const tempDocPagesCount = tempDoc.getPageCount();
    if (tempDocPagesCount === 0) {
      throw new Error('No pages kept in final document.');
    }

    // 3. Perform splits
    const parsedSplitPoints = Array.isArray(splitPoints) ? splitPoints : [];
    parsedSplitPoints.sort((a, b) => a - b);

    const segments = [];
    let startIdx = 0;
    for (const pt of parsedSplitPoints) {
      if (pt >= startIdx && pt < tempDocPagesCount - 1) {
        segments.push({ start: startIdx, end: pt });
        startIdx = pt + 1;
      }
    }
    segments.push({ start: startIdx, end: tempDocPagesCount - 1 });

    // 4. Save segments into separate files
    const sourceBasename = path.basename(filePath, path.extname(filePath));
    const outputFiles = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const newDoc = await PDFDocument.create();
      
      const indices = [];
      for (let j = segment.start; j <= segment.end; j++) {
        indices.push(j);
      }
      
      const copiedPages = await newDoc.copyPages(tempDoc, indices);
      copiedPages.forEach(p => newDoc.addPage(p));
      
      let outName;
      if (segments.length === 1) {
        outName = `${sourceBasename}_edited.pdf`;
      } else {
        outName = `${sourceBasename}_part_${i + 1}.pdf`;
      }
      
      const outPath = path.join(outputDir, outName);
      const newBytes = await newDoc.save();
      await fs.promises.writeFile(outPath, newBytes);
      outputFiles.push(outPath);
    }

    return { success: true, files: outputFiles };
  } catch (error) {
    console.error('Error applying page edits:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler to read file bytes (for PDF.js rendering in renderer)
ipcMain.handle('read-file-bytes', async (event, filePath) => {
  try {
    const bytes = await fs.promises.readFile(filePath);
    return bytes;
  } catch (error) {
    console.error('Error reading file bytes:', error);
    throw error;
  }
});

// IPC Handler to scan directly from physical WIA-compatible scanner
ipcMain.handle('scan-from-physical-scanner', async (event, scannerName) => {
  try {
    const tempDir = path.join(app.getPath('temp'), 'pdf-combiner-scans');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const outPath = path.join(tempDir, `scan_${Date.now()}.jpg`);

    if (process.platform === 'win32') {
      const psScript = `
$ErrorActionPreference = "Stop"
try {
    $deviceManager = New-Object -ComObject WIA.DeviceManager
    $targetDevice = $null
    
    $searchName = "${scannerName}"
    for ($i = 1; $i -le $deviceManager.DeviceInfos.Count; $i++) {
        $info = $deviceManager.DeviceInfos.Item($i)
        $name = $info.Properties.Item("Name").Value
        if ($name -like "*$searchName*" -or $name -like "*Epson*" -or $name -like "*DS-C330*") {
            $targetDevice = $info
            break
        }
    }
    
    if ($targetDevice -eq $null -and $deviceManager.DeviceInfos.Count -gt 0) {
        $targetDevice = $deviceManager.DeviceInfos.Item(1)
    }
    
    if ($targetDevice -eq $null) {
        throw "No physical scanners found in WIA Device Manager."
    }
    
    $device = $targetDevice.Connect()
    
    foreach ($prop in $device.Properties) {
        if ($prop.Name -eq "Document Handling Select") {
            try { $prop.Value = 2 } catch {}
        }
    }
    
    $item = $device.Items.Item(1)
    $formatId = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"
    $image = $item.Transfer($formatId)
    
    if (Test-Path "${outPath}") { Remove-Item "${outPath}" -Force }
    $image.SaveFile("${outPath}")
    Write-Output "SUCCESS:${outPath}"
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
`;

      const scriptPath = path.join(tempDir, 'scan_script.ps1');
      await fs.promises.writeFile(scriptPath, psScript, 'utf8');

      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
      const { stdout, stderr } = await execPromise(cmd);
      
      if (stdout.includes('SUCCESS:')) {
        const filePath = stdout.split('SUCCESS:')[1].trim();
        return { success: true, filePath };
      } else {
        throw new Error(stderr || stdout || 'Unknown WIA scanning error');
      }
    } else {
      return { success: false, fallback: true, error: 'Direct scanning via WIA is only supported on Windows.' };
    }
  } catch (error) {
    console.error('Error during WIA direct scan:', error);
    return { success: false, error: error.message };
  }
});
