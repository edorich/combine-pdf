use base64::{engine::general_purpose, Engine as _};
use lopdf::dictionary;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SinglePdfInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub pages: usize,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScannerInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub scanner_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ActionResult {
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ApplyEditsResult {
    pub success: bool,
    pub files: Option<Vec<String>>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScanPhysicalResult {
    pub success: bool,
    #[serde(rename = "filePath")]
    pub file_path: Option<String>,
    pub fallback: Option<bool>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PageEditInfo {
    #[serde(rename = "filePath")]
    pub file_path: String,
    #[serde(rename = "originalIndex")]
    pub original_index: usize,
    pub rotation: i64,
}

// Helper: Robustly load a PDF file, handling non-standard formatting in xref / trailer / startxref
fn load_pdf_robust<P: AsRef<Path>>(path: P) -> Result<lopdf::Document, String> {
    let path_ref = path.as_ref();
    let path_str = path_ref.to_string_lossy().to_string();

    let bytes = fs::read(path_ref).map_err(|e| format!("Failed to read PDF file {}: {}", path_str, e))?;

    // Fast path: try standard Document::load_mem directly
    if let Ok(doc) = lopdf::Document::load_mem(&bytes) {
        return Ok(doc);
    }

    // Fallback: Sanitize non-standard whitespace before EOL in xref, trailer, startxref, and %%EOF markers.
    // Certain legacy or third-party PDF generators (e.g. FPDF, FPDI) write spaces before newlines
    // (such as "startxref \n" or "xref \n"). In lopdf's strict nom parser, "tag(startxref), eol" fails
    // if a space precedes the newline. By replacing the space immediately preceding '\n' with '\r',
    // we produce a standard "\r\n" (CRLF) sequence without modifying the byte slice length or shifting offsets.
    let mut sanitized = bytes;
    let len = sanitized.len();
    let mut modified = false;

    for i in 0..len.saturating_sub(6) {
        if i + 7 <= len && &sanitized[i..i + 7] == b"xref \r\n" {
            sanitized[i + 4] = b'\r';
            modified = true;
        } else if i + 6 <= len && &sanitized[i..i + 6] == b"xref \n" {
            sanitized[i + 4] = b'\r';
            modified = true;
        }

        if i + 12 <= len && &sanitized[i..i + 12] == b"startxref \r\n" {
            sanitized[i + 9] = b'\r';
            modified = true;
        } else if i + 11 <= len && &sanitized[i..i + 11] == b"startxref \n" {
            sanitized[i + 9] = b'\r';
            modified = true;
        }

        if i + 10 <= len && &sanitized[i..i + 10] == b"trailer \r\n" {
            sanitized[i + 7] = b'\r';
            modified = true;
        } else if i + 9 <= len && &sanitized[i..i + 9] == b"trailer \n" {
            sanitized[i + 7] = b'\r';
            modified = true;
        }

        if i + 8 <= len && &sanitized[i..i + 8] == b"%%EOF \r\n" {
            sanitized[i + 5] = b'\r';
            modified = true;
        } else if i + 7 <= len && &sanitized[i..i + 7] == b"%%EOF \n" {
            sanitized[i + 5] = b'\r';
            modified = true;
        }
    }

    if modified {
        if let Ok(doc) = lopdf::Document::load_mem(&sanitized) {
            return Ok(doc);
        }
    }

    lopdf::Document::load_mem(&sanitized)
        .map_err(|e| format!("Failed to load PDF {}: {}", path_str, e))
}

// Helper: Merge PDF files using lopdf
fn merge_pdf_files(files: &[String], output_path: &str) -> Result<(), String> {
    let mut target_doc = lopdf::Document::with_version("1.5");
    let mut pages_obj_ids = Vec::new();
    let mut max_id = 1u32;

    let pages_id = (max_id, 0);
    max_id += 1;
    let catalog_id = (max_id, 0);
    max_id += 1;

    for file in files {
        let mut doc = match load_pdf_robust(file) {
            Ok(d) => d,
            Err(e) => return Err(e),
        };

        doc.renumber_objects_with(max_id);
        max_id = doc.max_id + 1;

        let pages = doc.get_pages();
        let mut sorted_pages: Vec<_> = pages.into_iter().collect();
        sorted_pages.sort_by_key(|(page_num, _)| *page_num);

        for (_page_num, page_id) in sorted_pages {
            pages_obj_ids.push(lopdf::Object::Reference(page_id));
            if let Ok(page_obj) = doc.get_object_mut(page_id) {
                if let lopdf::Object::Dictionary(ref mut dict) = page_obj {
                    dict.set("Parent", lopdf::Object::Reference(pages_id));
                }
            }
        }

        for (id, object) in doc.objects {
            target_doc.objects.insert(id, object);
        }
    }

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Count" => pages_obj_ids.len() as i64,
        "Kids" => pages_obj_ids,
    };
    target_doc.objects.insert(pages_id, lopdf::Object::Dictionary(pages_dict));

    let catalog_dict = dictionary! {
        "Type" => "Catalog",
        "Pages" => lopdf::Object::Reference(pages_id),
    };
    target_doc.objects.insert(catalog_id, lopdf::Object::Dictionary(catalog_dict));

    target_doc.max_id = max_id;
    target_doc.trailer.set("Root", lopdf::Object::Reference(catalog_id));

    target_doc
        .save(output_path)
        .map_err(|e| format!("Failed to save merged PDF: {}", e))?;
    Ok(())
}

// Helper: Convert image bytes (PNG/JPG) to single-page A4 PDF using lopdf & image
fn create_pdf_from_image_bytes(image_bytes: &[u8], output_pdf_path: &Path) -> Result<(), String> {
    let img = image::load_from_memory(image_bytes).map_err(|e| format!("Failed to decode image: {}", e))?;
    let (img_w, img_h) = (img.width(), img.height());

    let page_w = 595.27f64; // A4 width in points
    let page_h = 841.89f64; // A4 height in points

    let img_ratio = img_w as f64 / img_h as f64;
    let page_ratio = page_w / page_h;

    let (draw_w, draw_h) = if img_ratio > page_ratio {
        (page_w, page_w / img_ratio)
    } else {
        (page_h * img_ratio, page_h)
    };

    let x = (page_w - draw_w) / 2.0;
    let y = (page_h - draw_h) / 2.0;

    let mut jpeg_bytes: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut jpeg_bytes);
    img.write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode image to JPEG: {}", e))?;

    let mut doc = lopdf::Document::with_version("1.5");

    let image_stream = lopdf::Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => img_w as i64,
            "Height" => img_h as i64,
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => 8,
            "Filter" => "DCTDecode",
        },
        jpeg_bytes,
    );
    let image_id = doc.add_object(image_stream);

    let content_stream_data = format!(
        "q\n{:.2} 0 0 {:.2} {:.2} {:.2} cm\n/Im1 Do\nQ\n",
        draw_w, draw_h, x, y
    );
    let content_stream = lopdf::Stream::new(
        dictionary! {},
        content_stream_data.into_bytes(),
    );
    let content_id = doc.add_object(content_stream);

    let resources_dict = dictionary! {
        "XObject" => dictionary! {
            "Im1" => lopdf::Object::Reference(image_id),
        },
    };

    let page_dict = dictionary! {
        "Type" => "Page",
        "MediaBox" => vec![0.into(), 0.into(), page_w.into(), page_h.into()],
        "Contents" => lopdf::Object::Reference(content_id),
        "Resources" => resources_dict,
    };
    let page_id = doc.add_object(page_dict);

    let pages_dict = dictionary! {
        "Type" => "Pages",
        "Count" => 1,
        "Kids" => vec![lopdf::Object::Reference(page_id)],
    };
    let pages_id = doc.add_object(pages_dict);

    if let Ok(lopdf::Object::Dictionary(ref mut dict)) = doc.get_object_mut(page_id) {
        dict.set("Parent", lopdf::Object::Reference(pages_id));
    }

    let catalog_dict = dictionary! {
        "Type" => "Catalog",
        "Pages" => lopdf::Object::Reference(pages_id),
    };
    let catalog_id = doc.add_object(catalog_dict);

    doc.trailer.set("Root", lopdf::Object::Reference(catalog_id));
    doc.compress();

    doc.save(output_pdf_path).map_err(|e| format!("Failed to save PDF from image: {}", e))?;
    Ok(())
}

mod commands {
    use super::*;

    // 1. select_files
    #[tauri::command]
    pub fn select_files() -> Vec<FileInfo> {
        let files = rfd::FileDialog::new()
            .add_filter("PDF Documents", &["pdf"])
            .pick_files();

        match files {
            Some(paths) => paths
                .into_iter()
                .map(|p| FileInfo {
                    name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                    path: p.to_string_lossy().to_string(),
                })
                .collect(),
            None => Vec::new(),
        }
    }

    // 2. select_scanned_files
    #[tauri::command]
    pub fn select_scanned_files() -> Vec<FileInfo> {
        let files = rfd::FileDialog::new()
            .add_filter("Scanned Documents & Images", &["png", "jpg", "jpeg", "pdf"])
            .pick_files();

        match files {
            Some(paths) => paths
                .into_iter()
                .map(|p| FileInfo {
                    name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                    path: p.to_string_lossy().to_string(),
                })
                .collect(),
            None => Vec::new(),
        }
    }

    // 3. select_folder
    #[tauri::command]
    pub fn select_folder() -> Vec<FileInfo> {
        let folder = rfd::FileDialog::new().pick_folder();

        if let Some(folder_path) = folder {
            if let Ok(entries) = fs::read_dir(&folder_path) {
                let mut pdf_files: Vec<FileInfo> = Vec::new();
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(ext) = path.extension() {
                            if ext.to_string_lossy().to_lowercase() == "pdf" {
                                pdf_files.push(FileInfo {
                                    name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                                    path: path.to_string_lossy().to_string(),
                                });
                            }
                        }
                    }
                }
                pdf_files.sort_by(|a, b| alphanumeric_sort::compare_str(&a.name, &b.name));
                return pdf_files;
            }
        }
        Vec::new()
    }

    // 4. select_output
    #[tauri::command]
    pub fn select_output() -> Option<String> {
        rfd::FileDialog::new()
            .add_filter("PDF Documents", &["pdf"])
            .set_file_name("combined.pdf")
            .save_file()
            .map(|p| p.to_string_lossy().to_string())
    }

    // 5. combine_pdfs
    #[tauri::command]
    pub fn combine_pdfs(files: Vec<String>, output_path: String) -> ActionResult {
        if files.is_empty() {
            return ActionResult {
                success: false,
                error: Some("No PDF files provided to combine.".into()),
            };
        }
        if output_path.is_empty() {
            return ActionResult {
                success: false,
                error: Some("Output path was not specified.".into()),
            };
        }

        match merge_pdf_files(&files, &output_path) {
            Ok(_) => ActionResult {
                success: true,
                error: None,
            },
            Err(e) => ActionResult {
                success: false,
                error: Some(e),
            },
        }
    }

    // 6. select_single_pdf
    #[tauri::command]
    pub fn select_single_pdf() -> Option<SinglePdfInfo> {
        let file = rfd::FileDialog::new()
            .add_filter("PDF Documents", &["pdf"])
            .pick_file();

        if let Some(path) = file {
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let path_str = path.to_string_lossy().to_string();
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            let pages = match load_pdf_robust(&path) {
                Ok(doc) => doc.get_pages().len(),
                Err(_) => 0,
            };
            return Some(SinglePdfInfo {
                name,
                path: path_str,
                size,
                pages,
            });
        }
        None
    }

    // 7. detect_scanners
    #[tauri::command]
    pub fn detect_scanners() -> Vec<ScannerInfo> {
        let mut scanners = Vec::new();

        #[cfg(target_os = "windows")]
        {
            let cmd = "powershell -Command \"Get-CimInstance -ClassName Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Image' -or $_.Name -like '*scanner*' -or $_.Name -like '*scan*' } | Select-Object Name | ConvertTo-Json\"";
            if let Ok(output) = Command::new("cmd").args(&["/C", cmd]).output() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    let devices = if parsed.is_array() {
                        parsed.as_array().cloned().unwrap_or_default()
                    } else if parsed.is_object() {
                        vec![parsed]
                    } else {
                        vec![]
                    };

                    let mut seen = std::collections::HashSet::new();
                    for dev in devices {
                        if let Some(name) = dev.get("Name").and_then(|n| n.as_str()) {
                            let trimmed = name.trim();
                            if !trimmed.is_empty() && !seen.contains(trimmed) {
                                seen.insert(trimmed.to_string());
                                scanners.push(ScannerInfo {
                                    name: trimmed.to_string(),
                                    scanner_type: "USB Scanner".into(),
                                });
                            }
                        }
                    }
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = Command::new("system_profiler")
                .args(&["SPUSBDataType", "SPPrintersDataType"])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let keywords = [
                    "scanner", "scan", "epson", "canon", "hp ", "fujitsu", "brother", "pixma",
                    "imageclass", "laserjet", "officejet",
                ];
                let mut seen = std::collections::HashSet::new();

                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("Product ID:")
                        || trimmed.starts_with("Vendor ID:")
                        || trimmed.starts_with("Serial Number:")
                    {
                        continue;
                    }
                    let lower = trimmed.to_lowercase();
                    for kw in &keywords {
                        if lower.contains(kw) {
                            let name = trimmed.trim_end_matches(':').trim().to_string();
                            if name.len() > 3 && name.len() < 50 && !seen.contains(&name) {
                                seen.insert(name.clone());
                                scanners.push(ScannerInfo {
                                    name,
                                    scanner_type: "USB Scanner".into(),
                                });
                            }
                            break;
                        }
                    }
                }
            }
        }

        scanners.push(ScannerInfo {
            name: "Virtual Scanner (Simulation Mode)".into(),
            scanner_type: "Virtual".into(),
        });

        scanners
    }

    // 8. open_image_capture
    #[tauri::command]
    pub fn open_image_capture() -> ActionResult {
        #[cfg(target_os = "macos")]
        {
            match Command::new("open").args(&["-a", "Image Capture"]).spawn() {
                Ok(_) => ActionResult {
                    success: true,
                    error: None,
                },
                Err(e) => ActionResult {
                    success: false,
                    error: Some(e.to_string()),
                },
            }
        }

        #[cfg(target_os = "windows")]
        {
            match Command::new("wiaacmgr.exe").spawn() {
                Ok(_) => ActionResult {
                    success: true,
                    error: None,
                },
                Err(e) => ActionResult {
                    success: false,
                    error: Some(e.to_string()),
                },
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            ActionResult {
                success: false,
                error: Some("Platform not supported for Image Capture launch".into()),
            }
        }
    }

    // 9. merge_scans
    #[tauri::command]
    pub fn merge_scans(
        base_pdf_path: String,
        scanned_images: Vec<String>,
        output_path: String,
    ) -> ActionResult {
        if base_pdf_path.is_empty() {
            return ActionResult {
                success: false,
                error: Some("Base PDF path is required.".into()),
            };
        }
        if scanned_images.is_empty() {
            return ActionResult {
                success: false,
                error: Some("No scanned pages provided.".into()),
            };
        }
        if output_path.is_empty() {
            return ActionResult {
                success: false,
                error: Some("Output path is required.".into()),
            };
        }

        let mut temp_files_to_clean: Vec<PathBuf> = Vec::new();
        let mut files_to_merge = vec![base_pdf_path.clone()];

        for (idx, page_item) in scanned_images.iter().enumerate() {
            if page_item.starts_with("data:") {
                if let Some(comma_pos) = page_item.find(',') {
                    let base64_str = &page_item[comma_pos + 1..];
                    if let Ok(bytes) = general_purpose::STANDARD.decode(base64_str) {
                        let temp_dir = std::env::temp_dir().join("pdf-combiner-scans");
                        let _ = fs::create_dir_all(&temp_dir);
                        let temp_pdf_path = temp_dir.join(format!("scan_data_{}_{}.pdf", std::process::id(), idx));
                        
                        if create_pdf_from_image_bytes(&bytes, &temp_pdf_path).is_ok() {
                            files_to_merge.push(temp_pdf_path.to_string_lossy().to_string());
                            temp_files_to_clean.push(temp_pdf_path);
                        }
                    }
                }
            } else {
                let path = Path::new(page_item);
                let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                if ext == "pdf" {
                    files_to_merge.push(page_item.clone());
                } else if ext == "png" || ext == "jpg" || ext == "jpeg" {
                    if let Ok(bytes) = fs::read(page_item) {
                        let temp_dir = std::env::temp_dir().join("pdf-combiner-scans");
                        let _ = fs::create_dir_all(&temp_dir);
                        let temp_pdf_path = temp_dir.join(format!("scan_img_{}_{}.pdf", std::process::id(), idx));

                        if create_pdf_from_image_bytes(&bytes, &temp_pdf_path).is_ok() {
                            files_to_merge.push(temp_pdf_path.to_string_lossy().to_string());
                            temp_files_to_clean.push(temp_pdf_path);
                        }
                    }
                }
            }
        }

        let result = match merge_pdf_files(&files_to_merge, &output_path) {
            Ok(_) => ActionResult {
                success: true,
                error: None,
            },
            Err(e) => ActionResult {
                success: false,
                error: Some(e),
            },
        };

        for temp_p in temp_files_to_clean {
            let _ = fs::remove_file(temp_p);
        }

        result
    }

    // 10. select_directory
    #[tauri::command]
    pub fn select_directory() -> Option<String> {
        rfd::FileDialog::new()
            .pick_folder()
            .map(|p| p.to_string_lossy().to_string())
    }

    // 14. select_image_file
    #[tauri::command]
    pub fn select_image_file() -> Option<SinglePdfInfo> {
        let file = rfd::FileDialog::new()
            .add_filter("Image Files (*.png, *.jpg, *.jpeg)", &["png", "jpg", "jpeg"])
            .pick_file()?;

        let path = file.to_string_lossy().to_string();
        let name = file.file_name()?.to_string_lossy().to_string();

        Some(SinglePdfInfo {
            path,
            name,
            size: file.metadata().map(|m| m.len()).unwrap_or(0),
            pages: 1,
        })
    }

    // 15. write_file_bytes
    #[tauri::command]
    pub fn write_file_bytes(file_path: String, bytes: Vec<u8>) -> Result<(), String> {
        fs::write(&file_path, bytes).map_err(|e| format!("Failed to write file {}: {}", file_path, e))
    }

    // 11. apply_page_edits
    #[tauri::command]
    pub fn apply_page_edits(
        pages: Vec<PageEditInfo>,
        split_points: Vec<usize>,
        output_dir: String,
        output_prefix: String,
    ) -> ApplyEditsResult {
        if pages.is_empty() {
            return ApplyEditsResult {
                success: false,
                files: None,
                error: Some("Pages structure is empty.".into()),
            };
        }
        if output_dir.is_empty() {
            return ApplyEditsResult {
                success: false,
                files: None,
                error: Some("Destination folder is required.".into()),
            };
        }

        let mut doc_cache: std::collections::HashMap<String, lopdf::Document> = std::collections::HashMap::new();

        let mut temp_doc = lopdf::Document::with_version("1.5");
        let mut temp_page_ids = Vec::new();
        let mut max_id = 1u32;

        let temp_pages_id = (max_id, 0);
        max_id += 1;

        for page_info in &pages {
            if !doc_cache.contains_key(&page_info.file_path) {
                match load_pdf_robust(&page_info.file_path) {
                    Ok(d) => { doc_cache.insert(page_info.file_path.clone(), d); }
                    Err(e) => {
                        return ApplyEditsResult {
                            success: false,
                            files: None,
                            error: Some(e),
                        };
                    }
                }
            }

            let source_doc = doc_cache.get(&page_info.file_path).unwrap();
            let source_pages = source_doc.get_pages();
            let mut sorted_src_pages: Vec<_> = source_pages.into_iter().collect();
            sorted_src_pages.sort_by_key(|(num, _)| *num);

            if page_info.original_index >= sorted_src_pages.len() {
                return ApplyEditsResult {
                    success: false,
                    files: None,
                    error: Some(format!("Invalid page index {} for file {}", page_info.original_index, page_info.file_path)),
                };
            }

            let (target_page_num, _) = sorted_src_pages[page_info.original_index];

            let mut single_page_doc = source_doc.clone();
            single_page_doc.renumber_objects_with(max_id);
            max_id = single_page_doc.max_id + 1;

            let renumbered_pages = single_page_doc.get_pages();
            let renumbered_page_id = match renumbered_pages.get(&target_page_num) {
                Some(&id) => id,
                None => continue,
            };

            if let Ok(page_obj) = single_page_doc.get_object_mut(renumbered_page_id) {
                if let lopdf::Object::Dictionary(ref mut dict) = page_obj {
                    dict.set("Parent", lopdf::Object::Reference(temp_pages_id));

                    let current_rot = dict
                        .get(b"Rotate")
                        .and_then(|r| r.as_i64())
                        .unwrap_or(0);
                    let final_rot = (current_rot + page_info.rotation) % 360;
                    dict.set("Rotate", lopdf::Object::Integer(final_rot));
                }
            }

            for (id, object) in single_page_doc.objects {
                temp_doc.objects.insert(id, object);
            }

            temp_page_ids.push(lopdf::Object::Reference(renumbered_page_id));
        }

        temp_doc.max_id = max_id;

        if temp_page_ids.is_empty() {
            return ApplyEditsResult {
                success: false,
                files: None,
                error: Some("No pages kept in final document.".into()),
            };
        }

        let mut parsed_splits = split_points.clone();
        parsed_splits.sort();

        let total_edited_pages = temp_page_ids.len();
        let mut segments = Vec::new();
        let mut start_idx = 0usize;

        for &pt in &parsed_splits {
            if pt >= start_idx && pt < total_edited_pages - 1 {
                segments.push((start_idx, pt));
                start_idx = pt + 1;
            }
        }
        segments.push((start_idx, total_edited_pages - 1));

        let clean_prefix = if output_prefix.trim().is_empty() {
            "combined_document".to_string()
        } else {
            let p = output_prefix.trim();
            if p.to_lowercase().ends_with(".pdf") {
                p[..p.len() - 4].to_string()
            } else {
                p.to_string()
            }
        };

        let mut output_files = Vec::new();

        for (i, (s_start, s_end)) in segments.iter().enumerate() {
            let mut seg_doc = temp_doc.clone();
            let seg_page_refs: Vec<_> = temp_page_ids[*s_start..=*s_end].to_vec();

            let seg_pages_id = seg_doc.add_object(dictionary! {
                "Type" => "Pages",
                "Count" => seg_page_refs.len() as i64,
                "Kids" => seg_page_refs.clone(),
            });

            for p_ref in &seg_page_refs {
                if let lopdf::Object::Reference(p_id) = p_ref {
                    if let Ok(lopdf::Object::Dictionary(ref mut dict)) = seg_doc.get_object_mut(*p_id) {
                        dict.set("Parent", lopdf::Object::Reference(seg_pages_id));
                    }
                }
            }

            let seg_catalog_id = seg_doc.add_object(dictionary! {
                "Type" => "Catalog",
                "Pages" => lopdf::Object::Reference(seg_pages_id),
            });

            seg_doc.trailer.set("Root", lopdf::Object::Reference(seg_catalog_id));
            seg_doc.compress();

            let out_name = if segments.len() == 1 {
                format!("{}.pdf", clean_prefix)
            } else {
                format!("{}_part_{}.pdf", clean_prefix, i + 1)
            };

            let out_path = Path::new(&output_dir).join(&out_name);
            let out_path_str = out_path.to_string_lossy().to_string();

            if let Err(e) = seg_doc.save(&out_path) {
                return ApplyEditsResult {
                    success: false,
                    files: None,
                    error: Some(format!("Failed to save segment PDF: {}", e)),
                };
            }

            output_files.push(out_path_str);
        }

        ApplyEditsResult {
            success: true,
            files: Some(output_files),
            error: None,
        }
    }

    // 12. read_file_bytes
    #[tauri::command]
    pub fn read_file_bytes(file_path: String) -> Result<Vec<u8>, String> {
        fs::read(&file_path).map_err(|e| e.to_string())
    }

    // 13. scan_from_physical_scanner
    #[tauri::command]
    pub fn scan_from_physical_scanner(scanner_name: String) -> ScanPhysicalResult {
        let temp_dir = std::env::temp_dir().join("pdf-combiner-scans");
        let _ = fs::create_dir_all(&temp_dir);

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let out_path = temp_dir.join(format!("scan_{}.jpg", timestamp));
        let out_path_str = out_path.to_string_lossy().to_string();

        #[cfg(target_os = "windows")]
        {
            let ps_script = format!(
                r#"
$ErrorActionPreference = "Stop"
try {{
    $deviceManager = New-Object -ComObject WIA.DeviceManager
    $targetDevice = $null
    
    $searchName = "{scanner_name}"
    for ($i = 1; $i -le $deviceManager.DeviceInfos.Count; $i++) {{
        $info = $deviceManager.DeviceInfos.Item($i)
        $name = $info.Properties.Item("Name").Value
        if ($name -like "*$searchName*" -or $name -like "*Epson*" -or $name -like "*DS-C330*") {{
            $targetDevice = $info
            break
        }}
    }}
    
    if ($targetDevice -eq $null -and $deviceManager.DeviceInfos.Count -gt 0) {{
        $targetDevice = $deviceManager.DeviceInfos.Item(1)
    }}
    
    if ($targetDevice -eq $null) {{
        throw "No physical scanners found in WIA Device Manager."
    }}
    
    $device = $targetDevice.Connect()
    
    foreach ($prop in $device.Properties) {{
        if ($prop.Name -eq "Document Handling Select") {{
            try {{ $prop.Value = 2 }} catch {{}}
        }}
    }}
    
    $item = $device.Items.Item(1)
    $formatId = "{{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}}"
    $image = $item.Transfer($formatId)
    
    if (Test-Path "{out_path}") {{ Remove-Item "{out_path}" -Force }}
    $image.SaveFile("{out_path}")
    Write-Output "SUCCESS:{out_path}"
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"#,
                scanner_name = scanner_name,
                out_path = out_path_str
            );

            let script_path = temp_dir.join("scan_script.ps1");
            if let Err(e) = fs::write(&script_path, ps_script) {
                return ScanPhysicalResult {
                    success: false,
                    file_path: None,
                    fallback: None,
                    error: Some(e.to_string()),
                };
            }

            let cmd_str = format!(
                "powershell -NoProfile -ExecutionPolicy Bypass -File \"{}\"",
                script_path.to_string_lossy()
            );
            match Command::new("cmd").args(&["/C", &cmd_str]).output() {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    if stdout.contains("SUCCESS:") {
                        let file_p = stdout.split("SUCCESS:").nth(1).unwrap_or("").trim().to_string();
                        ScanPhysicalResult {
                            success: true,
                            file_path: Some(file_p),
                            fallback: None,
                            error: None,
                        }
                    } else {
                        ScanPhysicalResult {
                            success: false,
                            file_path: None,
                            fallback: None,
                            error: Some(if !stderr.is_empty() { stderr.to_string() } else { stdout.to_string() }),
                        }
                    }
                }
                Err(e) => ScanPhysicalResult {
                    success: false,
                    file_path: None,
                    fallback: None,
                    error: Some(e.to_string()),
                },
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            ScanPhysicalResult {
                success: false,
                file_path: None,
                fallback: Some(true),
                error: Some("Direct scanning via WIA is only supported on Windows.".into()),
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::select_files,
            commands::select_scanned_files,
            commands::select_folder,
            commands::select_output,
            commands::combine_pdfs,
            commands::select_single_pdf,
            commands::detect_scanners,
            commands::open_image_capture,
            commands::merge_scans,
            commands::select_directory,
            commands::select_image_file,
            commands::write_file_bytes,
            commands::apply_page_edits,
            commands::read_file_bytes,
            commands::scan_from_physical_scanner,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_321_lab_pdf() {
        let path = "../input/321_lab.pdf";
        let doc = load_pdf_robust(path).expect("Should load 321_lab.pdf without xref error");
        assert_eq!(doc.get_pages().len(), 1);
    }

    #[test]
    fn test_combine_321_lab_pdf() {
        let files = vec![
            "../input/321_lab.pdf".to_string(),
            "../input/document_A.pdf".to_string(),
        ];
        let temp_out = std::env::temp_dir().join(format!("test_combine_out_{}.pdf", std::process::id()));
        let temp_out_str = temp_out.to_string_lossy().to_string();

        let result = commands::combine_pdfs(files, temp_out_str.clone());
        assert!(result.success, "Combine failed: {:?}", result.error);

        let merged_doc = load_pdf_robust(&temp_out_str).expect("Should load merged PDF");
        assert_eq!(merged_doc.get_pages().len(), 2);

        let _ = std::fs::remove_file(temp_out);
    }
}

