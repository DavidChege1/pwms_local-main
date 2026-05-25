# PWMS Desktop Notifier v2.0

> Real-time dispatch notification agent for the Optimized Production and Waste Management System.

A Windows desktop application that connects to the PWMS backend via WebSocket, receives dispatch signals in real-time, and presents interactive approval dialogs to SAP operators. Built with [CustomTkinter](https://github.com/TomSchimansky/CustomTkinter) for a modern dark-mode UI.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Building the Executable](#building-the-executable)
- [API Contract](#api-contract)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Desktop Notifier sits on each dispatch operator's PC and:

1. **Listens** for dispatch signals via a persistent WebSocket connection
2. **Alerts** the operator with a desktop notification + sound when new orders arrive
3. **Presents** an approval dialog where the operator can mark orders as `APPROVED` or `REJECTED`
4. **Syncs** status back to the server, which broadcasts the update to all connected clients
5. **Starts automatically** on Windows login via a registry entry

### Key Features

| Feature | Description |
|---|---|
| **Real-time Updates** | WebSocket connection with auto-reconnect and URL fallback |
| **Blind Spot Detection** | Detects PENDING orders that arrived while the app was offline |
| **Batch Processing** | Groups multiple items under the same SAP document for batch approval |
| **Single Instance** | Windows mutex prevents duplicate instances |
| **Auto-Start** | Registers in `HKCU\...\Run` for login startup |
| **System Tray** | Minimizes to tray with quick-access context menu |
| **Rotating Logs** | 10MB log files with 3 backups (max ~40MB) |
| **Dark Mode UI** | Modern CustomTkinter interface with card-based layout |

---

## Architecture

```
desktop_notifier/
├── notifier/                  # Python package
│   ├── __init__.py            # Package version & exports
│   ├── __main__.py            # Entry point (python -m notifier)
│   ├── config.py              # Configuration loading & constants
│   ├── logger.py              # Rotating file logger setup
│   ├── networking.py          # WebSocket + HTTP API (stateless)
│   ├── system.py              # Windows startup + single-instance mutex
│   ├── tray.py                # System tray icon management
│   ├── agent.py               # Orchestrator (wires everything together)
│   └── ui/                    # UI sub-package
│       ├── __init__.py
│       ├── app.py             # Root CTk window setup
│       ├── theme.py           # Color palette, fonts, spacing
│       ├── main_window.py     # Dispatch hub (card-based order list)
│       └── dialogs.py         # Approval/rejection dialog
│
├── notifier_agent.py          # Backwards-compatible shim
├── config.json                # Runtime configuration
├── requirements.txt           # Python dependencies
├── build_exe.py               # PyInstaller build script
└── PWMS_Notifier.spec         # PyInstaller spec file
```

### Data Flow

```
┌──────────────┐     WebSocket      ┌──────────────┐
│   PWMS       │ ◄────────────────► │   Notifier   │
│   Backend    │     HTTP REST      │   Agent      │
│   (FastAPI)  │ ◄────────────────► │              │
└──────────────┘                    └──────┬───────┘
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                         ┌────┴───┐  ┌─────┴────┐  ┌───┴───┐
                         │ Main   │  │ Approval  │  │ System│
                         │ Window │  │ Dialog    │  │ Tray  │
                         └────────┘  └──────────┘  └───────┘
```

### Module Dependency Graph

```
config.py ◄── logger.py ◄── system.py
    ▲              ▲            ▲
    │              │            │
    ├── networking.py           │
    │       ▲                   │
    │       │                   │
    └── agent.py ───────────────┘
            ▲
            │
        ┌───┴───┐
        │ tray  │
        │ ui/*  │
        └───────┘
```

---

## Prerequisites

- **OS**: Windows 10 / 11
- **Python**: 3.10 or later
- **Network**: Access to the PWMS backend server (default: `192.168.7.25:9092`)

---

## Installation

```bash
# Navigate to the desktop_notifier directory
cd desktop_notifier

# Install dependencies
pip install -r requirements.txt
```

### Dependencies

| Package | Purpose |
|---|---|
| `customtkinter` | Modern dark-mode UI widgets |
| `websockets` | WebSocket client for real-time events |
| `plyer` | Cross-platform desktop notifications |
| `pystray` | System tray icon |
| `requests` | HTTP API client |
| `Pillow` | Image creation for tray icon |
| `pywin32` | Windows mutex (single-instance) |
| `pyinstaller` | Build standalone executable |

---

## Configuration

Edit `config.json` in the same directory as the executable:

```json
{
    "server_ip": "192.168.7.25",
    "server_port": "9092",
    "app_name": "PWMS Dispatch Notifier"
}
```

| Key | Default | Description |
|---|---|---|
| `server_ip` | `192.168.7.25` | Backend server IP or hostname. Use `localhost` for development. |
| `server_port` | `9092` | Port the backend API listens on |
| `app_name` | `PWMS Dispatch Notifier` | Display name for notifications, tray, and registry |

> **Note**: When `server_ip` is set to `localhost`, the WebSocket URL automatically uses `127.0.0.1` to avoid DNS resolution issues on Windows.

---

## Usage

### Development Mode

```bash
# From the desktop_notifier directory
python notifier_agent.py
# or
python -m notifier
```

### What Happens on Launch

1. **Single-instance check** — If already running, shows a warning and exits
2. **Startup registration** — Adds itself to Windows auto-start
3. **WebSocket connection** — Attempts to connect with auto-reconnect
4. **History fetch** — Loads existing orders and detects missed PENDING ones
5. **Main window** — Opens the dispatch hub after 500ms delay
6. **System tray** — Icon appears with context menu

### System Tray Menu

| Option | Action |
|---|---|
| **Show Orders** | Opens / brings to front the main dispatch hub |
| **Open Dashboard (Web)** | Opens the web frontend in the default browser |
| **Archive All History** | Archives all dispatches (with confirmation prompt) |
| **Exit** | Shuts down the notifier completely |

### Main Window

- **Search**: Filter orders by document number, customer, product, or description
- **Sync**: Manual refresh from the server
- **Status Badge**: Shows ONLINE (green), CONNECTING (amber), or OFFLINE (red)
- **Order Cards**: Click any PENDING order to open the approval dialog
- **Details**: Expand multi-item groups to see individual line items

### Approval Dialog

- Review order details (Doc #, Customer, Product, Quantity)
- Add optional notes for the planner
- Click **Approve** or **Reject** to update the status in SAP

---

## Building the Executable

### Quick Build

```bash
python build_exe.py
```

This will:
1. Install all dependencies from `requirements.txt`
2. Locate the CustomTkinter asset directory
3. Build with PyInstaller in `--onedir` mode

### Output

```
dist/
└── PWMS_Notifier/
    ├── PWMS_Notifier.exe    ← Run this
    ├── customtkinter/       ← Theme assets
    └── ... (other bundled files)
```

### Deployment

1. Copy the entire `dist/PWMS_Notifier/` folder to the target PC
2. Run `PWMS_Notifier.exe` once — it auto-registers for startup
3. Create a desktop shortcut to the exe if desired
4. Place `config.json` next to the exe if the server IP differs

### Manual Build (Advanced)

```bash
pyinstaller PWMS_Notifier.spec
```

---

## API Contract

### HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notifications/dispatch` | Fetch all dispatch signals |
| `PATCH` | `/api/notifications/dispatch/{id}` | Update signal status |
| `POST` | `/api/notifications/archive` | Archive all dispatches |

### WebSocket Endpoints

Primary: `ws://<host>:<port>/api/notifications/ws/dispatch`
Fallback: `ws://<host>:<port>/ws/dispatch`

### WebSocket Message Types

| Type | Direction | Description |
|---|---|---|
| `NEW_ORDER` | Server → Client | Single new dispatch signal |
| `BULK_ORDER` | Server → Client | Batch of signals for one document |
| `STATUS_UPDATE` | Server → Client | Status change (or `REFRESH_ALL`) |
| `_CONNECTED` | Internal | WebSocket connected successfully |
| `_DISCONNECTED` | Internal | WebSocket connection lost |

---

## Troubleshooting

### Log File

Located at `notifier_debug.log` next to the executable (or source directory in dev mode).

```bash
# View recent log entries
Get-Content .\notifier_debug.log -Tail 50
```

### Common Issues

| Issue | Solution |
|---|---|
| **App won't start** | Check if another instance is running (system tray) |
| **"Already Running" popup** | Close the existing instance from the tray → Exit |
| **OFFLINE status** | Verify `config.json` IP/port, check backend is running |
| **No notifications** | Check Windows notification settings, ensure plyer is installed |
| **Build fails** | Run `pip install -r requirements.txt` first, ensure Python 3.10+ |
| **CustomTkinter missing in build** | Re-run `build_exe.py` — it auto-detects the package path |

### Resetting Auto-Start

To remove the auto-start entry:
1. Press `Win + R` → type `regedit`
2. Navigate to `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`
3. Delete the `PWMS Dispatch Notifier` value

---

## Version History

| Version | Date | Changes |
|---|---|---|
| **2.0.0** | 2026-05-13 | Complete rewrite: modular package, CustomTkinter UI, rotating logs |
| **1.0.0** | 2026-04 | Initial monolithic implementation |
