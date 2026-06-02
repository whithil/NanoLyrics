# 🎵 NanoLyrics

> A modern, zero-dependency, ultra-lightweight synced lyrics overlay widget built on Electron.

---

**⚠️ Disclaimer:** *NanoLyrics is an independent, open-source project created for personal enjoyment and fun. It is **not** sponsored by, affiliated with, or endorsed by LRCLIB or any media player mentioned herein. We simply utilize the excellent and free LRCLIB API to bring lyrics to your desktop.*

---

## ✨ Features

- **🪟 Seamless Floating Widget**: A borderless, fully transparent window that floats on top of all other applications.
- **🖱️ Click-Through Mode**: In normal playback mode, the window ignores mouse clicks, allowing you to click, scroll, and drag windows behind the lyrics without obstruction.
- **⚙️ Lock / Edit Toggle**:
  - **Global Hotkey** or **System Tray Icon** toggles **Edit Mode**.
  - **Edit Mode** disables click-through and shows a sleek, semi-transparent overlay where you can reposition, resize, and configure the widget.
- **🔊 Multi-Platform Media Monitoring**:
  - **Windows**: Queries SMTC via a background worker thread.
  - **macOS**: Communicates via AppleScript with Spotify and Apple Music.
  - **Linux**: Interacts via MPRIS (`playerctl`).
- **🌐 Internationalization (i18n)**: Support for English (en-US), Portuguese (pt-BR), and French (fr-FR). Automatically detects system language.
- **🎨 Advanced Customization**:
  - **Text Appearance**: Customize font family, weight, size, active/inactive colors, outlines, and shadows.
  - **YouTube-Style Box**: Optional "Boxed Mode" for better readability on busy backgrounds.
  - **Widget Styling**: Adjust overall opacity and even set custom background images with CSS border-image support.
- **🧩 Title Parts Selector**: If lyrics aren't found automatically, use the Title Parts Selector to pick specific parts of the artist/title to refine the search.
- **🎬 VLC & osu! Support**: Dedicated plugins to fetch metadata from VLC Media Player and osu! (Stable/Lazer) even when standard system monitoring is unavailable.

---

## ❤️ Support LRCLIB

NanoLyrics relies on the fantastic and freely available **[LRCLIB API](https://lrclib.net)** to provide high-quality synced lyrics. We are a humble effort to make good use of their service. 

If you enjoy this app, please consider supporting and donating to the official LRCLIB project to help keep their servers running for everyone.

---

## 🎬 Plugin Usage

### VLC Media Player
To use NanoLyrics with VLC, you must enable its Web Interface:
1. Open VLC -> **Tools** -> **Preferences**.
2. At the bottom, under **Show settings**, select **All**.
3. Go to **Interface** -> **Main interfaces** and check **Web**.
4. Go to **Interface** -> **Main interfaces** -> **Lua** and set a **Password** (default is `nanolyrics`).
5. Restart VLC.

### osu! (Stable & Lazer)
To track menu music and gameplay accurately:
1. Download and run **[TOSU](https://github.com/tosuapp/tosu)**.
2. NanoLyrics will automatically connect to TOSU's local API to fetch high-precision metadata.


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
To package the app into a single standalone executable:
```bash
npm run build-win
```

---

## 📂 Project Structure

```
NanoLyrics/
├── src/
│   ├── main/          # Main process logic (Config, Media, i18n, etc.)
│   ├── renderer/      # UI components (Widget, Settings, Title Parts)
│   └── monitors/      # Platform-specific media monitors
├── locales/           # i18n language files (JSON)
├── docs/              # Technical documentation and Architecture
├── assets/            # App icons and internal assets
├── package.json       # Project metadata and scripts
└── README.md          # Project overview
```

---

## 📝 License

This project is licensed under the MIT License.
