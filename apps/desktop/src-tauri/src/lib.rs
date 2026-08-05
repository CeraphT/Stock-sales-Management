use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

use serde::Serialize;
use serialport::SerialPortType;
use tauri_plugin_sql::{Migration, MigrationKind};

/// A printer the app found, ready to auto-connect. `target` is what the
/// transport actually uses (a COM port); `label` is a human name to show.
#[derive(Serialize)]
struct DetectedPrinter {
    target: String,
    label: String,
}

/// A friendly, jargon-free name for a serial port, derived from what Windows
/// knows about the device (USB product name, Bluetooth, etc.).
fn friendly_label(p: &serialport::SerialPortInfo) -> String {
    let name = match &p.port_type {
        SerialPortType::UsbPort(info) => info
            .product
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| info.manufacturer.clone().filter(|s| !s.trim().is_empty()))
            .unwrap_or_else(|| "USB printer".to_string()),
        SerialPortType::BluetoothPort => "Bluetooth printer".to_string(),
        SerialPortType::PciPort => "Serial printer".to_string(),
        SerialPortType::Unknown => "Serial device".to_string(),
    };
    format!("{name} ({})", p.port_name)
}

/// Auto-detect connected thermal printers: every serial/USB/Bluetooth port the
/// OS can see, with a friendly label. The UI connects to one automatically when
/// there's a single match, or offers a simple pick when there are several — no
/// COM-port / baud-rate knowledge needed.
#[tauri::command]
fn detect_printers() -> Vec<DetectedPrinter> {
    serialport::available_ports()
        .map(|ports| {
            ports
                .into_iter()
                .map(|p| DetectedPrinter {
                    label: friendly_label(&p),
                    target: p.port_name,
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Send raw ESC/POS bytes straight to a thermal printer — no OS print dialog.
/// `kind` is "serial" (target = COM port, e.g. "COM3") or "network"
/// (target = "host:port", e.g. "192.168.1.50:9100").
#[tauri::command]
fn print_bytes(kind: String, target: String, baud: Option<u32>, bytes: Vec<u8>) -> Result<(), String> {
    match kind.as_str() {
        "serial" => {
            let mut port = serialport::new(&target, baud.unwrap_or(9600))
                .timeout(Duration::from_secs(5))
                .open()
                .map_err(|e| format!("Could not open {target}: {e}"))?;
            port.write_all(&bytes).map_err(|e| format!("Write failed: {e}"))?;
            port.flush().map_err(|e| format!("Flush failed: {e}"))?;
            Ok(())
        }
        "network" => {
            let mut stream = TcpStream::connect(&target)
                .map_err(|e| format!("Could not connect to {target}: {e}"))?;
            stream.write_all(&bytes).map_err(|e| format!("Write failed: {e}"))?;
            stream.flush().map_err(|e| format!("Flush failed: {e}"))?;
            Ok(())
        }
        other => Err(format!("Unknown printer connection: {other}")),
    }
}

/// Check a printer is reachable without printing — open the serial port or the
/// TCP socket and close it. Used for the connection-status indicator.
#[tauri::command]
fn probe_printer(kind: String, target: String, baud: Option<u32>) -> Result<(), String> {
    match kind.as_str() {
        "serial" => {
            serialport::new(&target, baud.unwrap_or(9600))
                .timeout(Duration::from_secs(3))
                .open()
                .map(|_| ())
                .map_err(|e| format!("{target} not reachable: {e}"))
        }
        "network" => TcpStream::connect(&target)
            .map(|_| ())
            .map_err(|e| format!("{target} not reachable: {e}")),
        other => Err(format!("Unknown printer connection: {other}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Same DDL the browser (sql.js) path runs — single source of truth in
    // apps/desktop/src/lib/db/schema.sql. Mirrors @stockflow/core's schema.
    let migrations = vec![
        Migration {
            version: 1,
            description: "init local schema",
            sql: include_str!("../../src/lib/db/schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "b2b customers + vat added on top",
            sql: include_str!("../../src/lib/db/migrations/002_b2b.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pharmastock.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![detect_printers, print_bytes, probe_printer])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
