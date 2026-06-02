const { ipcRenderer } = require('electron');

let parsedLyrics = [];
let mediaTime = 0;
let syncOffset = 0;
let currentTimer = 0;
let lastUpdateTimestamp = performance.now();
let isPlaying = false;
let activeIndex = -1;
let showTimestamps = false;
let translations = {};
let appConfig = {};

function t(keyPath) {
    const keys = keyPath.split('.');
    let result = translations;
    for (const key of keys) {
        if (!result || result[key] === undefined) return keyPath;
        result = result[key];
    }
    return result;
}

function formatHotkey(hk) {
    if (!hk) return '';
    const mod = t('common.modifier') || 'Ctrl';
    return hk.replace(/CommandOrControl/g, mod);
}

function renderHotkeyHelper() {
    const container = document.getElementById('hotkey-helper');
    if (!container || !appConfig.hotkeys) return;
    
    container.innerHTML = '';
    const keys = [
        { name: t('widget.hk_lock'), key: appConfig.hotkeys.toggleLock },
        { name: t('widget.hk_sync'), key: appConfig.hotkeys.advanceSync },
        { name: t('widget.hk_vis'), key: appConfig.hotkeys.toggleWidget },
        { name: t('widget.hk_puz'), key: appConfig.hotkeys.toggleTitleParts }
    ];

    keys.forEach(k => {
        if (!k.key) return;
        const chip = document.createElement('div');
        chip.className = 'hk-chip';
        chip.innerHTML = `<span class="hk-name">${k.name}</span><span class="hk-key">${formatHotkey(k.key)}</span>`;
        container.appendChild(chip);
    });
}

function parseLRC(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const result = [];
    const timeRegex = /\[(\d{1,3}):(\d{2})(?:[\.,](\d{2,3}))?\]/g;
    
    for (let line of lines) {
        const cleanText = line.replace(/\[.*?\]/g, '').replace(/<.*?>/g, '').trim();
        let match;
        timeRegex.lastIndex = 0;
        while ((match = timeRegex.exec(line)) !== null) {
            const min = parseInt(match[1]);
            const sec = parseInt(match[2]);
            const ms = match[3] ? (match[3].length === 2 ? parseInt(match[3]) * 10 : parseInt(match[3])) : 0;
            result.push({
                time: min * 60 + sec + ms / 1000,
                text: cleanText,
                ts: `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}]`
            });
        }
    }
    return result.sort((a, b) => a.time - b.time);
}

function renderLyrics() {
    const container = document.getElementById('lyrics-container');
    container.innerHTML = '';
    
    if (parsedLyrics.length === 0) {
        container.innerHTML = `<div class="lyric-line active" id="lyric-0">${t('widget.awaiting_playback')}</div>`;
        return;
    }
    
    parsedLyrics.forEach((l, i) => {
        const d = document.createElement('div');
        d.className = 'lyric-line';
        d.id = 'lyric-' + i;
        d.innerText = (showTimestamps && l.ts ? l.ts + ' ' : '') + (l.text || '...');
        container.appendChild(d);
    });
}

function updateSync() {
    const now = performance.now();
    if (isPlaying) {
        mediaTime += (now - lastUpdateTimestamp) / 1000;
    }
    lastUpdateTimestamp = now;
    currentTimer = Math.max(0, mediaTime + syncOffset);
    
    let newIdx = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
        if (currentTimer >= parsedLyrics[i].time) {
            newIdx = i;
        } else {
            break;
        }
    }
    
    if (newIdx !== activeIndex) {
        activeIndex = newIdx;
        document.querySelectorAll('.lyric-line').forEach((el, i) => {
            el.classList.remove('active', 'past');
            if (i < activeIndex) el.classList.add('past');
            if (i === activeIndex) el.classList.add('active');
        });
        
        const target = document.getElementById('lyric-' + (activeIndex === -1 ? 0 : activeIndex));
        if (target) {
            const container = document.getElementById('lyrics-container');
            container.style.transform = `translateY(-${target.offsetTop + target.offsetHeight / 2}px)`;
        }
    }
    requestAnimationFrame(updateSync);
}

function applyConfig(config) {
    appConfig = config;
    const root = document.documentElement;
    root.style.setProperty('--active-color', config.activeColor);
    root.style.setProperty('--inactive-color', config.inactiveColor);
    root.style.setProperty('--font-size', config.fontSize + 'px');
    root.style.setProperty('--font-family', `${config.fontFamily}, 'Outfit', sans-serif`);
    root.style.setProperty('--font-weight', config.fontWeight);
    root.style.setProperty('--letter-spacing', config.letterSpacing + 'px');
    
    // Text Appearance
    root.style.setProperty('--outline-color', config.outlineColor);
    root.style.setProperty('--outline-size', config.outlineSize + 'px');
    root.style.setProperty('--shadow-color', config.shadowColor);
    root.style.setProperty('--shadow-blur', config.shadowBlur + 'px');
    root.style.setProperty('--shadow-offset-x', config.shadowOffsetX + 'px');
    root.style.setProperty('--shadow-offset-y', config.shadowOffsetY + 'px');

    // Widget Styling
    document.body.classList.toggle('boxed-mode', config.boxedMode);
    root.style.setProperty('--box-color', hexToRgba(config.boxColor, config.boxOpacity));
    root.style.setProperty('--widget-opacity', config.widgetOpacity);
    root.style.setProperty('--bg-image', config.backgroundImage ? `url("${config.backgroundImage.replace(/\\/g, '/')}")` : 'none');
    root.style.setProperty('--border-image', config.borderImage || 'none');

    showTimestamps = config.showTimestamps;
    renderLyrics();
    renderHotkeyHelper();
}

function hexToRgba(hex, opacity) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex[1] + hex[2], 16);
        g = parseInt(hex[3] + hex[4], 16);
        b = parseInt(hex[5] + hex[6], 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function applyTranslations(data) {
    translations = data;
    document.getElementById('edit-mode-title').innerText = t('widget.edit_mode_title');
    document.getElementById('btn-settings').innerText = '⚙️ ' + t('widget.settings');
    document.getElementById('btn-lock').innerText = '🔒 ' + t('widget.lock');
    document.getElementById('btn-help').title = t('settings.help');
    
    renderHotkeyHelper();

    const awaitingEl = document.getElementById('lyric-0');
    if (awaitingEl && parsedLyrics.length === 0) {
        awaitingEl.innerText = t('widget.awaiting_playback');
    }
}

// IPC Listeners
ipcRenderer.on('media-update', (e, d) => {
    isPlaying = d.isPlaying;
    const drift = Math.abs(mediaTime - d.currentTime);
    if (drift > 1.5 || !isPlaying) {
        mediaTime = d.currentTime;
    } else if (drift > 0.1) {
        mediaTime = (mediaTime + d.currentTime) / 2;
    }
    if (d.savedOffset !== undefined) {
        syncOffset = d.savedOffset;
    }
});

ipcRenderer.on('lyrics-update', (e, lrc) => {
    parsedLyrics = parseLRC(lrc);
    activeIndex = -1;
    renderLyrics();
});

ipcRenderer.on('sync-adjust', (e, offset) => {
    syncOffset = offset;
    currentTimer = Math.max(0, mediaTime + syncOffset);
    lastUpdateTimestamp = performance.now();
});

ipcRenderer.on('toggle-edit-mode', (e, locked) => {
    document.body.classList.toggle('edit-mode', !locked);
});

ipcRenderer.on('apply-config', (e, config) => {
    applyConfig(config);
});

ipcRenderer.on('apply-translations', (e, data) => {
    applyTranslations(data);
});

// Initial Setup
document.getElementById('btn-settings').onclick = () => ipcRenderer.send('open-settings');
document.getElementById('btn-lock').onclick = () => ipcRenderer.send('toggle-lock-request');
document.getElementById('btn-help').onclick = () => ipcRenderer.send('open-help');

requestAnimationFrame(updateSync);

// Request initial config
ipcRenderer.send('request-widget-config');
