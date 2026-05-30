# 🎵 NanoLyrics

> A modern, zero-dependency, ultra-lightweight synced lyrics overlay widget built on Electron. Features a transparent, always-on-top, click-through window that seamlessly displays synced lyrics fetched from **LRCLIB** by monitoring your system's active media player.

---

## ✨ Features

- **🪟 Seamless Floating Widget**: A borderless, fully transparent window that floats on top of all other applications.
- **🖱️ Click-Through Mode**: In normal playback mode, the window ignores mouse clicks, allowing you to click, scroll, and drag windows behind the lyrics without obstruction.
- **⚙️ Lock / Edit Toggle**:
  - **Global Hotkey** (`Ctrl+Shift+L` or customize) or **System Tray Icon** toggles **Edit Mode**.
  - **Edit Mode** disables click-through and shows a sleek, semi-transparent overlay where you can reposition, resize, and configure the widget.
- **🔊 Zero-Dependency Media Monitoring**:
  - **Windows**: Seamlessly queries Windows Runtime (SMTC) via lightweight background PowerShell calls—no heavy native C++ modules to compile.
  - **macOS**: Communicates via AppleScript with Spotify and Apple Music.
  - **Linux**: Interacts via `dbus` / MPRIS interfaces.
- **⏱️ Seamless Timing & Simulation**: If a player doesn't expose active progress, NanoLyrics automatically starts a local millisecond-accurate timer from the moment a new track starts. It syncs automatically whenever active progress updates are available.
- **🌐 LRCLIB Integration**: Fetches synced `.lrc` files automatically based on the artist and track title, falling back to instant search.
- **📂 Local Caching**: Saves `.lrc` files to a custom cache directory (defaulting to safe user folders inside AppData / local storage) so you can enjoy offline lyrics without administrative privileges.

---

## 🛠️ Installation & Execution

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### 2. Install Dependencies
Run the following command in the project directory:
```bash
npm install
```

### 3. Run NanoLyrics
Launch the application locally:
```bash
npm start
```

### 4. Build Executables
To package the app into a single standalone `.exe` or executable for your platform:
```bash
npm run build
```

---

## 🎹 Hotkeys & Controls

| Action | Shortcut (Windows/Linux) | Shortcut (macOS) | Description |
| :--- | :--- | :--- | :--- |
| **Toggle Edit Mode** | `Ctrl + Shift + L` | `Cmd + Shift + L` | Locks/unlocks the widget for resizing and positioning. |
| **Close App** | Tray Menu -> Quit | Tray Menu -> Quit | Safely exits the background process. |

---

## 📂 Project Structure

```
NanoLyrics/
├── app.js          # Core Single-File Electron codebase (Auto-generates index.html)
├── package.json    # Project metadata, scripts, and dependencies
└── README.md       # Project overview and usage guidelines
```

---

## 📝 License

This project is licensed under the MIT License.
