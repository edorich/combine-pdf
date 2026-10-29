# Context & Documentation: Combine PDF Pro

Aplikasi **Combine PDF Pro** adalah aplikasi desktop berbasis **Tauri 2 (Rust + HTML/JS/CSS)** yang dirancang untuk pengolahan dokumen PDF lengkap. Aplikasi mencakup fitur penggabungan (merge), pengorganisasian halaman (organize/split/rotate), pemindaian (scan & merge), serta otomatisasi penyematan Cap & Tanda Tangan digital berbasis deteksi kata kunci/Regex (**PDF Embedded**).

---

## 🚀 Arsitektur & Teknologi

- **Framework**: Tauri v2 (Rust Backend + Web Frontend)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+ Modules)
- **PDF Engines**:
  - `PDF.js` (`pdfjs-dist`): Digunakan untuk rendering preview visual halaman PDF dan ekstraksi teks/koordinat kata kunci (`getTextContent`).
  - `PDF-Lib` (`pdf-lib`): Digunakan untuk manipulasi fisik PDF (penyusunan ulang halaman, rotasi, pembagian/split, serta pembentukan dokumen baru dengan gambaran gambar PNG).
- **Backend**: Rust (`src-tauri/src/lib.rs`) untuk dialog file OS native, operasi I/O file, dan IPC Tauri commands.
- **Window Management**: Default aplikasi terbuka dalam mode **Maximized** (`"maximized": true`).

---

## 🛠️ Fitur Utama & Modul Aplikasi

### 1. Merge PDF (Penggabungan Dokumen)
- **Drag & Drop**: Mendukung drag & drop file PDF secara langsung ke antarmuka aplikasi.
- **Queue Engine**: Pengurutan antrean dokumen secara interaktif menggunakan penyeretan pointer mouse (Ghost & Placeholder strategy).
- **Output Target**: Memilih folder dan nama file output pengganti secara bebas.

### 2. Page Organizer (Pengorganisasian Halaman & Split)
- **Multi-Document Loading**: Memuat beberapa dokumen PDF sekaligus ke dalam satu workspace visual.
- **Visual Grid**: Setiap halaman ditampilkan dalam bentuk kartu *card preview* dengan warna badge sesuai dokumen asalnya.
- **Modifikasi Halaman**:
  - **Rotasi**: Rotasi 90° Searah Jarum Jam (CW) per halaman atau batch rotasi seluruh halaman sekaligus.
  - **Hapus/Eksklusi**: Menghapus/menyembunyikan halaman yang tidak diperlukan.
  - **Drag & Drop Grid**: Memindahkan urutan posisi halaman antar dokumen secara acak.
  - **Split Separator (Gunting)**: Menandai batas pemisahan dokumen (*split points*) untuk memecah PDF menjadi beberapa file terpisah saat diexport.

### 3. PDF Embedded (Auto-Detect Cap & Tanda Tangan Berbasis Regex)
Modul khusus untuk otomatisasi pembubuhan **Cap/Stempel** dan **Tanda Tangan** pada dokumen PDF multi-halaman (misalnya Surat Rujuk Balik/Surat Medis):

1. **Auto-Detect Kata Kunci (Regex)**:
   - Kolom parameter kata kunci default: **`Mengetahui`** (bisa diubah sesuai kebutuhan atau menggunakan Regex).
   - Memindai setiap halaman secara *real-time* menggunakan `PDF.js` untuk mengekstrak titik koordinat baseline **X-axis** dan **Y-axis** dari kata kunci tersebut pada masing-masing halaman.
   - Menampilkan status deteksi per halaman (contoh: `✓ "Mengetahui" ditemukan di 292 dari 292 halaman`).

2. **Pengaturan Offset Relatif (Pergeseran X & Y)**:
   - **`Offset X (+/- Pergeseran pt)`** & **`Offset Y (+/- Pergeseran pt)`** bertindak sebagai pergeseran relatif universal terhadap posisi kata kunci pada **seluruh halaman sekaligus**.
   - Mengubah nilai Offset Y secara otomatis menggeser posisi Cap dan Tanda Tangan pada seluruh halaman tanpa menghapus koordinat dasar per halaman.

3. **Drag & Drop Interactive Preview**:
   - Pengguna dapat menggeser objek Cap atau Tanda Tangan langsung pada layar preview visual.
   - Posisi hasil geseran langsung memperbarui nilai `Offset X` dan `Offset Y`.

4. **Hierarki Layer & Alinyemen Presisi**:
   - **Ukuran Default Tanda Tangan**: Set ke `100 pt`.
   - **Alinyemen Vertikal**: Tanda Tangan secara otomatis diposisikan tepat di **tengah vertikal (center)** dari Cap Stempel.
   - **Urutan Layer**:
     - Layer 1 (Bawah): **Tanda Tangan** digambar terlebih dahulu.
     - Layer 2 (Atas): **Cap Stempel** digambar di atas Tanda Tangan dengan transparansi opacity 85%.

### 4. Posisi Bebas (Multi Gambar)
Tab khusus untuk fleksibilitas penempatan dan penyesuaian ukuran gambar secara manual pada halaman PDF:
1. **Multi-Image Upload**: Pengguna dapat mengunggah file PDF utama serta mengunggah banyak file aset gambar (PNG / JPEG) seperti tanda tangan, cap/stempel, logo, atau watermark.
2. **Interactive Drag & Drop**: Setiap objek gambar pada preview halaman dapat digeser (*drag*) secara terpisah ke posisi mana pun di atas dokumen PDF.
3. **Corner Handle Resizing**: Pengguna dapat mengubah ukuran (*resize*) setiap gambar secara langsung pada preview visual dengan menarik salah satu dari 4 titik sudut (*handles* `nw`, `ne`, `sw`, `se`). Minimum batas ukuran diset `15 pt`.
4. **Halaman & Dimensi Per-Asset**: Setiap gambar dapat diatur kemunculannya pada halaman tertentu (dropdown selector) serta diubah ukuran `W` (width) dan `H` (height) secara presisi melalui form di panel navigasi aset.
5. **PDF Export Engine**: Mengonversi koordinat visual preview DOM kembali ke sistem koordinat bottom-left PDF titik presisi (`PDF-Lib`), lalu menyimpan dokumen PDF yang telah disematkan gambar ke direktori tujuan.

### 5. Scan & Merge (Integrasi Pemindai & Kamera)
- **Physical USB Scanner**: Deteksi perangkat pemindai USB fisikal via WIA/Tauri IPC.
- **Live Camera / Document Cam**: Pemindaian via webcam dengan filter citra (Black & White Monochrome / High Contrast).
- **Virtual Simulator**: Mode simulasi pemindaian untuk testing.
- **Import Scans**: Menggabungkan hasil scan lembaran ke dalam dokumen PDF dasar.

---

## 📁 Struktur Direktori Utama

```
combine_pdf/
├── context.MD                  # Dokumentasi & Ringkasan Konteks Aplikasi
├── index.html                  # Main UI Layout HTML
├── renderer.js                 # Main Application Frontend Controller Logic
├── styles.css                  # Design System & UI Styling
├── ui/                         # Standalone UI Web Assets & Duplicates
│   ├── index.html
│   ├── renderer.js
│   ├── styles.css
│   └── pdf.min.js
├── src-tauri/                  # Tauri Rust Core Project
│   ├── Cargo.toml
│   ├── tauri.conf.json         # Konfigurasi Window (Maximized) & Build
│   └── src/
│       ├── main.rs
│       └── lib.rs              # Rust Native IPC Commands & File Dialogs
└── package.json                # Project Scripts & Dependencies
```

---

## ⚙️ Cara Menjalankan Aplikasi (Development)

Untuk menjalankan aplikasi dalam mode pengembang:

```powershell
npm run tauri:dev
```

Untuk melakukan build installer aplikasi:

```powershell
npm run tauri:build
```
