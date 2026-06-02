# 🛠️ Technical Specification: NanoLyrics

This document details the software architecture, behavior patterns, API integrations, and code components of the **NanoLyrics** desktop widget.

---

## 1. Architectural Overview

NanoLyrics is structured as a **modular Electron application** designed for portability and low resource footprint. The application logic is divided into a main process that manages system integration and a renderer process for the user interface.

```mermaid
graph TD
    A[Electron Main Process] -->|Creates| B[Transparent Frameless BrowserWindow]
    A -->|Global Hotkey / Tray Click| C[Toggle Ignore Mouse Events]
    B -->|IPC Events| A
    A -->|IPC Track Updates| B
    A -->|Monitors / Workers| D[Active Media Players]
    D -->|Track & Timeline Data| A
    A -->|Local File Cache| E[AppData/LrcCache]
    A -->|LRCLIB API| F[Net lyric provider]
    A -->|Plugin Manager| G[External Plugins]
```

---

## 2. Window Management & Interactivity

To ensure a seamless aesthetic that does not obstruct background windows, NanoLyrics operates under two distinct window modes:

### A. Playback Mode (Default Locked State)
- **Visuals**: Frameless, completely transparent window background (`transparent: true`, `frame: false`).
- **Interactions**: Click-through is enabled using:
  ```javascript
  win.setIgnoreMouseEvents(true, { forwardToHTML: true });
  ```
  This permits mouse clicks, scrolls, and drag motions to pass straight through the lyric overlay onto background applications. Only specific DOM elements (like a tiny settings cog if hovered, or no elements at all) handle hovering events.

### B. Edit & Position Mode (Unlocked Configuration State)
- **Activation**: Triggered by hitting the global hotkey (`Ctrl+Shift+L` or `Cmd+Shift+L` on macOS) or by clicking the system tray icon.
- **Visuals**: A translucent dark overlay (`rgba(0, 0, 0, 0.65)`) sweeps across the widget, revealing boundary outlines, resizing corners, and configuration panels.
- **Interactions**: Click-through is completely disabled:
  ```javascript
  win.setIgnoreMouseEvents(false);
  ```
  The user is free to drag the widget, resize it via window edges, type into input fields, and adjust configuration settings (such as customizing the `.lrc` cache path).

---

## 3. Media Monitoring & Plugin System

To ensure broad compatibility, NanoLyrics employs a multi-layered monitoring strategy:

### A. Native OS Monitoring
1. **Windows (10/11)**: Uses a dedicated `smtc-worker.js` thread to query the **System Media Transport Controls (SMTC)** via NodeRT/PowerShell fallbacks.
2. **macOS**: Uses AppleScript to interface with Spotify and Apple Music.
3. **Linux**: Uses the MPRIS protocol (via `playerctl` or `dbus-send`).

### B. Plugin System
When native OS monitoring is insufficient (e.g., for apps that don't publish SMTC/MPRIS data), NanoLyrics uses a modular plugin system:
- **VLC Web Support**: Polls VLC's built-in Lua HTTP interface.
- **osu! Support**: Connects to **TOSU** (memory reader) for high-precision metadata including menu music.

### Timeline Drift Correction
If the underlying media player fails to provide timeline progress updates, or if the update rate is slow:
1. On **Track Transition Detection** (e.g. metadata title or artist changes), the internal millisecond timeline resets to `0.0`.
2. A high-accuracy local timer ticks up continuously:
   $$\text{CurrentTime} = \text{InitialPosition} + (t_{\text{now}} - t_{\text{last\_update}})$$
3. As soon as a fresh real progress timeline update arrives from the OS, the local timeline synchronizes, self-correcting any drift seamless to the user.

---

## 4. LRCLIB API & Lyric Parser

### A. LRC Fetch Workflow
1. The media monitor extracts the playing `Artist` and `Title`.
2. NanoLyrics checks the **Local LRC Cache** (e.g. `%APPDATA%/NanoLyrics/LrcCache/Artist - Title.lrc`). If present, it loads instantly.
3. If not found in the local cache, the app requests the **LRCLIB API**:
   - Primary: `GET https://lrclib.net/api/get?artist={Artist}&track={Title}`
   - Fallback Search: `GET https://lrclib.net/api/search?q={Artist} {Title}`
4. If a synced LRC block exists, the app writes it into the local cache directory and broadcasts the parsed lines to the Renderer window.

### B. LRC Parsing Algorithm
LRC files match the format `[minutes:seconds.hundredths] Lyric line text`.
1. The parser splits lines by linebreaks.
2. For each line, it scans for time tags using the regular expression `\[(\d+):(\d+)(?:\.(\d+))?\]`.
3. It converts the matched hours, minutes, seconds, and milliseconds into total seconds:
   $$\text{TotalSeconds} = (\text{Minutes} \times 60) + \text{Seconds} + \frac{\text{Milliseconds}}{100}$$
4. It compiles a sorted list of objects:
   ```json
   [
     { "time": 12.45, "text": "This is the first lyric line." },
     { "time": 15.80, "text": "This is the second line." }
   ]
   ```
5. The renderer keeps track of the active line by finding the largest index $i$ such that $\text{TotalSeconds}_{\text{player}} \geq \text{time}_i$.

---

## 5. Storage, Configuration & Cross-Platform Compilations

- **User Preferences**: Saved to `%USERPROFILE%/AppData/Roaming/NanoLyrics/config.json` (Windows) or `~/.config/NanoLyrics/config.json` (Linux/macOS). Holds options for font family, sizes, transparency levels, colors, and custom LRC storage path.
- **Packaging/Compilation**: Can be packaged into highly-compressed stand-alone binaries without external requirements using `electron-builder` or `electron-packer`.
