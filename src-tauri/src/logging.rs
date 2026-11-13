//! Minimal append-only file logging and a "Copy diagnostics" payload.
//!
//! The app deliberately has no telemetry: logs stay on the user's machine and
//! are only read back when the user clicks "Copy diagnostics" in Settings. The
//! sink is best-effort by design — logging must never take the app down, so
//! every failure falls back to stderr and is reported in the diagnostics text
//! instead of panicking.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// Rotate once the log file passes this size. Two files (current + `.1`) keep
/// disk use bounded without a logging dependency.
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

/// A single frontend message is capped so a huge error object cannot bloat the
/// log file.
const MAX_MESSAGE_CHARS: usize = 4_000;

const LOG_FILE_NAME: &str = "ai-application-support.log";

/// Diagnostics include at most this many recent log lines.
const DIAGNOSTIC_LOG_LINES: usize = 200;

struct LogSink {
    path: Option<PathBuf>,
    file: Option<File>,
    init_error: Option<String>,
}

static SINK: OnceLock<Mutex<LogSink>> = OnceLock::new();

/// Open (or rotate) the log file and install a panic hook.
///
/// Called once from Tauri's `setup`, so the app data/log directory exists by
/// the time the first line is written.
pub fn init(app: &tauri::AppHandle) {
    let path = app
        .path()
        .app_log_dir()
        .map(|dir| dir.join(LOG_FILE_NAME))
        .ok();
    let (file, init_error) = match path.as_deref() {
        Some(path) => match open_log_file(path) {
            Ok(file) => (Some(file), None),
            Err(err) => (None, Some(err)),
        },
        None => (
            None,
            Some("could not resolve the app log directory".to_string()),
        ),
    };

    let _ = SINK.set(Mutex::new(LogSink {
        path,
        file,
        init_error,
    }));

    // Record panics before the default hook (which prints to stderr, invisible
    // in a packaged desktop app) runs.
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!(" at {}:{}", l.file(), l.line()))
            .unwrap_or_default();
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic payload".to_string());
        record("ERROR", "panic", &format!("{payload}{location}"));
        default_hook(info);
    }));

    record(
        "INFO",
        "app",
        &format!(
            "Started AI Application Support {} (Tauri {}, {} {})",
            app.package_info().version,
            tauri::VERSION,
            std::env::consts::OS,
            std::env::consts::ARCH
        ),
    );
    if let Some(err) = sink_init_error() {
        record("ERROR", "logging", &err);
    }
}

fn sink_init_error() -> Option<String> {
    let sink = SINK.get()?.lock().ok()?;
    sink.init_error.clone()
}

fn open_log_file(path: &Path) -> Result<File, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("could not create {}: {e}", parent.display()))?;
    }
    if path
        .metadata()
        .map(|m| m.len() > MAX_LOG_BYTES)
        .unwrap_or(false)
    {
        let rotated = path.with_extension("log.1");
        let _ = fs::remove_file(&rotated);
        let _ = fs::rename(path, &rotated);
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("could not open {}: {e}", path.display()))
}

/// Append one line. Safe to call from any thread and at any time after `init`.
pub fn record(level: &str, target: &str, message: &str) {
    let message = sanitize_message(message);
    let line = format!(
        "{} {:<5} {}: {}\n",
        utc_timestamp(),
        level.to_uppercase(),
        target,
        message
    );

    let Some(sink) = SINK.get() else {
        eprint!("{line}");
        return;
    };
    let Ok(mut sink) = sink.lock() else {
        return;
    };
    match sink.file.as_mut() {
        Some(file) => {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
        None => eprint!("{line}"),
    }
}

/// Keep one entry per line so the tail stays readable and `grep`-able.
fn sanitize_message(message: &str) -> String {
    let flattened = message.replace('\r', "").replace('\n', " ⏎ ");
    flattened.chars().take(MAX_MESSAGE_CHARS).collect()
}

fn utc_timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    utc_timestamp_at(secs)
}

/// Format a UNIX timestamp as `YYYY-MM-DDTHH:MM:SSZ` (UTC).
fn utc_timestamp_at(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let in_day = secs % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        in_day / 3_600,
        (in_day % 3_600) / 60,
        in_day % 60
    )
}

/// Howard Hinnant's `civil_from_days`: days since 1970-01-01 to a Gregorian
/// date, valid for the whole range this app will ever log.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

fn human_size(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    let b = bytes as f64;
    if b >= MB {
        format!("{:.1} MB", b / MB)
    } else if b >= KB {
        format!("{:.1} KB", b / KB)
    } else {
        format!("{bytes} B")
    }
}

fn data_file_entries(dir: &Path) -> Result<Vec<(String, u64)>, String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut files: Vec<(String, u64)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_file() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.ends_with(".json") {
                return None;
            }
            Some((name, entry.metadata().map(|m| m.len()).unwrap_or(0)))
        })
        .collect();
    files.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(files)
}

fn recent_log_lines(lines: usize) -> String {
    let Some(sink) = SINK.get().and_then(|sink| sink.lock().ok()) else {
        return "(logging is not initialised)".to_string();
    };
    let Some(path) = sink.path.as_ref() else {
        return "(no log file available)".to_string();
    };
    match fs::read_to_string(path) {
        Ok(text) => {
            let all: Vec<&str> = text.lines().collect();
            if all.is_empty() {
                "(log is empty)".to_string()
            } else {
                let start = all.len().saturating_sub(lines);
                all[start..].join("\n")
            }
        }
        Err(err) => format!("(could not read the log file: {err})"),
    }
}

/// Log a message sent from the frontend. Unknown levels are recorded as DEBUG
/// rather than rejected so a typo never loses the message.
#[tauri::command]
pub fn frontend_log(level: String, message: String) {
    let level = match level.as_str() {
        "error" => "ERROR",
        "warn" => "WARN",
        "info" => "INFO",
        _ => "DEBUG",
    };
    record(level, "frontend", &message);
}

/// Build the text copied by "Copy diagnostics" in Settings. Contains versions,
/// paths, file names/sizes and the recent log tail — never file contents, API
/// keys or chat messages.
#[tauri::command]
pub fn get_diagnostics(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve the data directory: {e}"))?;

    let mut out = String::new();
    out.push_str("AI Application Support diagnostics\n");
    out.push_str(&format!("generated: {}\n", utc_timestamp()));
    out.push_str(&format!("version: {}\n", app.package_info().version));
    out.push_str(&format!("tauri: {}\n", tauri::VERSION));
    out.push_str(&format!(
        "os: {} ({})\n",
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    out.push_str(&format!("data dir: {}\n", data_dir.display()));

    let log_status = SINK.get().and_then(|sink| {
        let sink = sink.lock().ok()?;
        Some((
            sink.path
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "(unavailable)".to_string()),
            sink.init_error.clone(),
            sink.file.is_some(),
        ))
    });
    match log_status {
        Some((path, error, file_open)) => {
            out.push_str(&format!("log file: {path}\n"));
            if !file_open {
                out.push_str(&format!(
                    "log status: unavailable ({})\n",
                    error.as_deref().unwrap_or("unknown error")
                ));
            }
        }
        None => out.push_str("log file: (logging is not initialised)\n"),
    }

    match data_file_entries(&data_dir) {
        Ok(files) => {
            out.push_str(&format!("data files ({}):\n", files.len()));
            if files.is_empty() {
                out.push_str("  (no data files yet)\n");
            }
            for (name, size) in files {
                out.push_str(&format!("  {name} ({})\n", human_size(size)));
            }
        }
        Err(err) => out.push_str(&format!(
            "data files: (could not read the data directory: {err})\n"
        )),
    }

    out.push_str(&format!(
        "\n--- last {DIAGNOSTIC_LOG_LINES} log lines ---\n"
    ));
    out.push_str(&recent_log_lines(DIAGNOSTIC_LOG_LINES));
    out.push('\n');
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_timestamp_formats_known_epochs() {
        assert_eq!(utc_timestamp_at(0), "1970-01-01T00:00:00Z");
        assert_eq!(utc_timestamp_at(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(utc_timestamp_at(1_808_000_000), "2027-04-17T22:13:20Z");
    }

    #[test]
    fn messages_are_kept_on_one_line_and_capped() {
        assert_eq!(sanitize_message("a\nb\r\nc"), "a ⏎ b ⏎ c");
        let long = "x".repeat(MAX_MESSAGE_CHARS + 10);
        assert_eq!(sanitize_message(&long).chars().count(), MAX_MESSAGE_CHARS);
    }

    #[test]
    fn human_sizes_are_readable() {
        assert_eq!(human_size(512), "512 B");
        assert_eq!(human_size(2_048), "2.0 KB");
        assert_eq!(human_size(5 * 1024 * 1024), "5.0 MB");
    }

    #[test]
    fn data_file_entries_lists_only_json_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("aas-logging-test-{unique}"));
        fs::create_dir_all(dir.join("folder.json")).unwrap();
        fs::write(dir.join("applications.json"), b"{}").unwrap();
        fs::write(dir.join("notes.txt"), b"not json").unwrap();

        let files = data_file_entries(&dir).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].0, "applications.json");
        assert_eq!(files[0].1, 2);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn log_file_appends_and_rotates_once_full() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("aas-log-sink-test-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("app.log");

        let mut file = open_log_file(&path).unwrap();
        file.write_all(b"first\n").unwrap();
        drop(file);
        // Re-opening appends rather than truncating the session history.
        let mut file = open_log_file(&path).unwrap();
        file.write_all(b"second\n").unwrap();
        drop(file);
        assert_eq!(fs::read_to_string(&path).unwrap(), "first\nsecond\n");

        fs::write(&path, vec![b'x'; (MAX_LOG_BYTES + 1) as usize]).unwrap();
        let _file = open_log_file(&path).unwrap();
        assert_eq!(fs::metadata(&path).unwrap().len(), 0);
        let rotated = path.with_extension("log.1");
        assert_eq!(fs::metadata(&rotated).unwrap().len(), MAX_LOG_BYTES + 1);

        let _ = fs::remove_dir_all(&dir);
    }
}
