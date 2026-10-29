# 🚀 Combine PDF Pro

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="PDF Combiner Pro Logo" width="96" height="96" />
</p>

<p align="center">
  <strong>Aplikasi Desktop Modern Pengolahan Dokumen PDF Lengkap, Cepat, dan Presisi</strong><br />
  Dibangun dengan <strong>Tauri v2 (Rust)</strong> + <strong>Vanilla HTML5/CSS3/JavaScript</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.2-blue.svg?style=flat-square" alt="Version 1.0.2" />
  <img src="https://img.shields.io/badge/framework-Tauri%20v2-orange.svg?style=flat-square" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/backend-Rust-red.svg?style=flat-square" alt="Rust" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/license-ISC-green.svg?style=flat-square" alt="License" />
</p>

---

## 📖 Tentang Aplikasi

**Combine PDF Pro** adalah aplikasi desktop modern berperforma tinggi yang dirancang khusus untuk mempermudah pengelolaan dokumen PDF skala besar maupun harian. Aplikasi ini menggabungkan kecepatan pemrosesan native **Rust** dengan antarmuka web modern yang responsif dan interaktif.

Aplikasi ini sangat ideal untuk instansi medis, perkantoran, dan profesional yang membutuhkan penggabungan berkas, pengorganisasian lembar dokumen, pemindaian terintegrasi, serta otomatisasi penyematan cap/stempel dan tanda tangan dokter/pejabat pada ratusan halaman dokumen secara instan.

---

## ✨ Fitur Utama

### 1. 📄 Merge PDF (Penggabungan Dokumen)
- **Drag & Drop Berkas**: Memasukkan file PDF langsung ke antarmuka aplikasi dengan penyeretan mouse.
- **Interactive Queue Reorder**: Pengurutan urutan dokumen secara visual dengan animasi ghost & placeholder pointer mouse.
- **Kustomisasi Output**: Menentukan lokasi folder dan nama file dokumen gabungan secara bebas.

### 2. 🗂️ Page Organizer & Splitter (Organisasi Halaman)
- **Multi-Document Loading**: Memuat beberapa dokumen PDF sekaligus dalam satu grid visual terpadu.
- **Visual Card Preview**: Halaman disajikan dalam bentuk thumbnail card dengan badge warna penanda dokumen asalnya.
- **Rotasi Halaman**: Rotasi 90° Searah Jarum Jam (CW) per halaman individual atau batch rotasi seluruh halaman sekaligus.
- **Hapus / Sembunyikan Halaman**: Mengecualikan lembaran yang tidak diperlukan sebelum diexport.
- **Split Points (Gunting Pemisah)**: Menandai titik pemecahan (*split*) untuk memecah PDF besar menjadi beberapa file baru secara otomatis berdasarkan segmen penanda.

### 3. 🖋️ PDF Embedded (Auto-Detect Cap & Tanda Tangan)
Modul khusus untuk otomatisasi pembubuhan **Cap/Stempel** dan **Tanda Tangan** pada dokumen PDF multi-halaman (seperti Surat Rujuk Balik / Surat Keterangan Medis):
- **Deteksi Kata Kunci Otomatis (Regex / Text)**: Memindai posisi kata kunci (default: `Mengetahui`) pada setiap halaman secara real-time menggunakan `PDF.js` untuk mengekstrak titik koordinat baseline X dan Y.
- **Universal Relative Offset**: Mengatur pergeseran jarak horizontal (`Offset X`) dan vertikal (`Offset Y`) dalam satuan point (`pt`) yang berlaku secara konsisten di seluruh halaman sekaligus.
- **Interactive Drag & Drop Preview**: Menggeser posisi objek Cap atau Tanda Tangan langsung di layar preview, yang otomatis memperbarui nilai offset koordinat.
- **Layering & Alinyemen Presisi**: Tanda Tangan berada di layer bawah dengan alinyemen tengah vertikal terhadap Cap, dan Cap berada di layer atas dengan transparansi (opacity 85%).

### 4. 🖼️ Posisi Bebas (Multi Gambar)
- **Multi-Asset Upload**: Fleksibilitas mengunggah banyak aset gambar (PNG / JPEG) seperti stempel, tanda tangan, logo, atau watermark.
- **Interactive Drag & Drop**: Setiap gambar dapat digeser secara bebas ke posisi mana pun di atas dokumen PDF.
- **4 Corner Resizing**: Mengubah ukuran gambar langsung di layar preview dengan menarik titik sudut (*handles* `nw`, `ne`, `sw`, `se`) dengan batas minimum 15 pt.
- **Per-Asset Page Assignment**: Mengatur kemunculan setiap aset gambar pada nomor halaman tertentu melalui dropdown selector.
- **PDF Export Engine**: Mengonversi koordinat visual kembali ke sistem koordinat bottom-left PDF secara presisi (`PDF-Lib`).

### 5. 📠 Scan & Merge (Integrasi Pemindai & Kamera)
- **Deteksi Scanner USB Fisik**: Otomatis mendeteksi perangkat pemindai dokumen USB via WIA native Windows / Image Capture macOS.
- **Live Camera / Document Cam**: Pemindaian dokumen via webcam dengan filter citra otomatis (Black & White Monochrome / High Contrast).
- **Virtual Simulator**: Mode simulasi scanning untuk keperluan demonstrasi atau pengujian tanpa scanner fisik.
- **Auto-Merge**: Menggabungkan hasil scan baru langsung ke dalam dokumen PDF dasar.

### 6. 🛡️ Robust PDF Engine (Toleran Format Legacy / Non-Standard)
- Dilengkapi mekanisme normalisasi in-memory canggih yang mampu membaca dan menggabungkan PDF non-standar (misalnya hasil export dari PHP FPDF, FPDI, atau sistem lab/medis lawas) yang memiliki karakter spasi ekstra pada cross-reference table (`xref`, `startxref`, `trailer`) tanpa menimbulkan error `invalid cross-reference table`.

---

## 🛠️ Arsitektur & Teknologi

| Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Framework Core** | **Tauri v2** | Desktop framework berbasis Rust, menghasilkan binary kecil dan konsumsi RAM sangat hemat. |
| **Backend** | **Rust** (`src-tauri/`) | File I/O native, dialog OS, eksekusi scanner WIA, dan parsing/merge PDF berkecepatan tinggi via `lopdf`. |
| **Frontend UI** | **Vanilla HTML5, CSS3, JS** | Tanpa overhead bundle framework, styling modern Glassmorphism Dark Mode yang responsif. |
| **PDF Rendering** | **PDF.js** (`pdfjs-dist`) | Rendering visual halaman thumbnail preview dan ekstraksi koordinat teks kata kunci. |
| **PDF Manipulation**| **PDF-Lib** + **lopdf** | Pemrosesan manipulasi halaman, rotasi, splitting, dan penggabungan dokumen PDF. |

---

## 📂 Struktur Direktori

```text
combine_pdf/
├── src-tauri/                  # Tauri Rust Backend
│   ├── src/
│   │   ├── main.rs             # Entry point Tauri
│   │   └── lib.rs              # Logika IPC, merge_pdf_files, & load_pdf_robust
│   ├── Cargo.toml              # Dependensi Rust (lopdf, image, rfd, dll.)
│   └── tauri.conf.json         # Konfigurasi Window, Identifier, & Versi
├── ui/                         # Aset Frontend Produksi (Tauri frontendDist)
│   ├── index.html              # Layout antarmuka utama
│   ├── renderer.js             # Logika interaktif antarmuka aplikasi
│   ├── styles.css              # Desain antarmuka & design tokens
│   ├── tauri-bridge.js         # Bridge adapter IPC window.api
│   └── pdf.min.js              # Bundle engine PDF.js
├── build_tauri.bat             # Skrip otomatis build Windows (Tauri v2)
├── package.json                # Project dependencies & scripts
├── context.MD                  # Dokumentasi teknis & konteks arsitektur
└── README.md                   # Dokumentasi resmi proyek
```

---

## ⚙️ Cara Menjalankan & Membangun Aplikasi

### Persyaratan Sistem (Prerequisites)
Pastikan lingkungan pengembangan Anda telah terpasang:
1. **Node.js** (v18 atau lebih baru) & **npm**
2. **Rust** & **Cargo** (instal melalui [rustup.rs](https://rustup.rs))
3. **C++ Build Tools** (Visual Studio Build Tools untuk pengguna Windows)

---

### 1. Mode Pengembangan (Development)

Untuk mengunduh dependensi dan menjalankan aplikasi secara lokal dengan live reload:

```bash
# Instal dependensi JavaScript
npm install

# Jalankan aplikasi Tauri mode development
npm run tauri:dev
```

---

### 2. Membangun Installer Aplikasi (Production Build)

Untuk mengompilasi aplikasi menjadi installer `.exe` / `.msi` siap pakai:

```bash
# Melalui script npm
npm run tauri:build
```
*Atau cukup klik ganda file:* **`build_tauri.bat`**

Setelah proses build selesai, installer yang siap didistribusikan akan berada di direktori:
```text
src-tauri/target/release/bundle/nsis/pdf-combiner-pro_1.0.2_x64-setup.exe
```

---

## 📄 Lisensi

Proyek ini dirilis di bawah lisensi [ISC License](LICENSE).
Dikembangkan untuk kebutuhan manajemen dan otomatisasi berkas PDF yang andal dan efisien.
