/**
 * NanoLyrics - Ultra-lightweight Synced Lyrics Overlay Widget
 * Reestruturado com JSON Plain-Text (Sem SQLite), Sistema de Plugins, e UI Modular.
 */

const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, screen, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const PluginManager = require('./plugins.js');

// --- [ CONSTANTS & DEFAULTS ] ---
const CONFIG_FILE = 'nanolyrics_config.json';
const DEFAULT_HOTKEYS = {
    toggleLock: 'CommandOrControl+Shift+L',
    advanceSync: 'CommandOrControl+Shift+Right',
    rewindSync: 'CommandOrControl+Shift+Left',
    toggleWidget: 'CommandOrControl+Shift+H',
    togglePuzzle: 'CommandOrControl+Shift+P'
};
const SYNC_ADJUST_STEP_SECONDS = 0.5;

// --- [ GLOBAL STATES ] ---
let mainWindow = null;
let settingsWindow = null;
let puzzleWindow = null;
let tray = null;
let pluginManager = null;

let isLocked = true;
let isWidgetHidden = false;
let appConfig = null;
let smtcWorker = null;
let terminalInterval = null;

// Media trackers
let lastTrackTitle = '';
let lastTrackArtist = '';
let lastTrackDuration = 0;
let simulatedTime = 0;
let lastSimulationTick = Date.now();
let lastOSPosition = -1;
let isPlayingTrack = false;
let currentLrcContent = '';
let activeFetchId = 0;

// --- [ PLAIN TEXT DATABASE SYSTEM ] ---
function getOverridesPath() {
    return path.join(appConfig.cachePath, 'overrides');
}

function getTrackMeta(artist, title) {
    const id = `${artist || 'unknown'} - ${title || 'unknown'}`.replace(/[^a-zA-Z0-9\s.\-_]/g, '').trim().toLowerCase();
    const filePath = path.join(getOverridesPath(), `${id}.json`);
    
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            console.error('Erro ao ler metadata da faixa:', e);
        }
    }
    return { id, original_artist: artist, original_title: title, override_query: null, sync_offset: 0 };
}

function saveTrackMeta(meta) {
    const overridesDir = getOverridesPath();
    if (!fs.existsSync(overridesDir)) fs.mkdirSync(overridesDir, { recursive: true });
    
    const filePath = path.join(overridesDir, `${meta.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(meta, null, 4), 'utf-8');
}

// --- [ CONFIGURATION SYSTEM ] ---
function loadConfig() {
    const configPath = path.join(app.getPath('userData'), CONFIG_FILE);
    const defaultConfig = {
        hotkeys: DEFAULT_HOTKEYS,
        fontFamily: 'Outfit',
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: 0,
        activeColor: '#39FF14',
        inactiveColor: '#FFFFFF',
        cachePath: path.join(app.getPath('userData'), 'LrcCache'),
        showTimestamps: false,
        width: 800, height: 350, x: null, y: null
    };

    if (fs.existsSync(configPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            appConfig = { ...defaultConfig, ...parsed, hotkeys: { ...defaultConfig.hotkeys, ...(parsed.hotkeys || {}) } };
        } catch (e) { appConfig = defaultConfig; }
    } else {
        appConfig = defaultConfig;
        saveConfig();
    }

    if (!fs.existsSync(appConfig.cachePath)) fs.mkdirSync(appConfig.cachePath, { recursive: true });
    if (!fs.existsSync(getOverridesPath())) fs.mkdirSync(getOverridesPath(), { recursive: true });
}

function saveConfig() {
    const configPath = path.join(app.getPath('userData'), CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 4), 'utf-8');
}

function registerHotkeys() {
    globalShortcut.unregisterAll();
    
    const bind = (key, action, name) => {
        if (!key) return;
        try {
            if (!globalShortcut.register(key, action)) console.error(`Falha ao registar atalho: ${name} (${key})`);
        } catch (e) { console.error(`Erro sintaxe no atalho: ${name} (${key})`); }
    };

    bind(appConfig.hotkeys.toggleLock, () => toggleLock(), 'Toggle Lock');
    bind(appConfig.hotkeys.advanceSync, () => sendSyncAdjustment(SYNC_ADJUST_STEP_SECONDS), 'Advance Sync');
    bind(appConfig.hotkeys.rewindSync, () => sendSyncAdjustment(-SYNC_ADJUST_STEP_SECONDS), 'Rewind Sync');
    bind(appConfig.hotkeys.toggleWidget, () => toggleWidgetVisibility(), 'Toggle Widget');
    bind(appConfig.hotkeys.togglePuzzle, () => togglePuzzleWindow(), 'Toggle Puzzle');
}

// --- [ UTILS & LRCLIB ] ---
function getFolderSize(folderPath, ext = null) {
    if (!fs.existsSync(folderPath)) return '0 B';
    let total = 0;
    try {
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            const fullPath = path.join(folderPath, file);
            if (fs.statSync(fullPath).isFile()) {
                if (!ext || file.endsWith(ext)) total += fs.statSync(fullPath).size;
            }
        }
    } catch (e) {}
    
    if (total === 0) return 'Vazio';
    if (total < 1024) return total + ' B';
    if (total < 1024 * 1024) return (total / 1024).toFixed(2) + ' KB';
    return (total / (1024 * 1024)).toFixed(2) + ' MB';
}

function cleanMusicTitle(title) {
    if (!title) return '';
    return title
        .replace(/[^\w\s]*\s*(official\s+\w+|original\s+\w+|lyric\s+video|full\s+ver)\s*[^\w\s]*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatTime(secs) {
    if (isNaN(secs) || secs < 0) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function drawTerminalStatus() {
    if (!lastTrackTitle) {
        process.stdout.write('\r\x1b[33m[IDLE]\x1b[0m A aguardar reprodução...\x1b[K');
        return;
    }
    const trackInfo = `${lastTrackArtist ? lastTrackArtist + ' - ' : ''}${lastTrackTitle}`;
    const timeline = `${formatTime(simulatedTime)} / ${formatTime(lastTrackDuration)}`;
    process.stdout.write(`\r\x1b[K${trackInfo} (${timeline})`);
}

function startTerminalRefresher() {
    if (terminalInterval) clearInterval(terminalInterval);
    terminalInterval = setInterval(() => {
        if (isPlayingTrack) {
            simulatedTime += (Date.now() - lastSimulationTick) / 1000;
            lastSimulationTick = Date.now();
        } else {
            lastSimulationTick = Date.now();
        }
        drawTerminalStatus();
    }, 500);
}

async function fetchLyrics(title, artist, duration, customQuery = null) {
    if (!title && !customQuery) return "[00:00.00] NanoLyrics: Pronto para música...\n";

    const cleanTitle = customQuery || cleanMusicTitle(title);
    const cleanArtist = artist ? artist.trim() : '';
    const cacheKey = customQuery ? `override_${customQuery}` : `${cleanArtist} - ${cleanTitle}`;
    const cacheFile = path.join(appConfig.cachePath, cacheKey.replace(/[^a-zA-Z0-9\s.\-_]/g, '').trim() + '.lrc');

    if (fs.existsSync(cacheFile)) {
        try { return fs.readFileSync(cacheFile, 'utf-8'); } catch (err) {}
    }

    try {
        let data = null;
        if (customQuery) {
            // Se houver query personalizado do Puzzle, usamos search
            const searchUrl = new URL('https://lrclib.net/api/search');
            searchUrl.searchParams.append('q', customQuery);
            const searchResponse = await net.fetch(searchUrl.toString());
            if (searchResponse.ok) {
                const searchResults = await searchResponse.json();
                if (searchResults && searchResults.length > 0) data = searchResults[0];
            }
        } else {
            // Busca normal
            const getUrl = new URL('https://lrclib.net/api/get');
            getUrl.searchParams.append('track_name', cleanTitle);
            if (cleanArtist) getUrl.searchParams.append('artist_name', cleanArtist);
            if (duration && duration > 0) getUrl.searchParams.append('duration', Math.round(duration));
            
            let response = await net.fetch(getUrl.toString());
            if (response.ok) data = await response.json();
            else {
                const searchUrl = new URL('https://lrclib.net/api/search');
                searchUrl.searchParams.append('q', `${cleanArtist} ${cleanTitle}`.trim());
                const searchResponse = await net.fetch(searchUrl.toString());
                if (searchResponse.ok) {
                    const searchResults = await searchResponse.json();
                    if (searchResults && searchResults.length > 0) data = searchResults[0];
                }
            }
        }

        let lrcContent = '';
        if (data) {
            if (data.syncedLyrics) lrcContent = data.syncedLyrics;
            else if (data.plainLyrics) lrcContent = `[00:00.00]`;
            else if (data.instrumental) lrcContent = `[00:00.00]\n`;
        }

        if (lrcContent) {
            fs.writeFileSync(cacheFile, lrcContent, 'utf-8');
            return lrcContent;
        }
    } catch (err) {}
    return `[00:00.00]`;
}

function handleMediaUpdate(rawTitle, rawArtist, position, duration, status) {
    let data = { title: rawTitle || '', artist: rawArtist || '', position, duration, status };
    
    // Aplicar transformações de plugins (ex: limpeza específica de jogos)
    if (pluginManager) data = pluginManager.processMetadata(data);

    const now = Date.now();
    const isPlaying = (data.status === 'Playing' || data.status === 'playing');
    let { title, artist } = data;

    // Fallback: Se o artista estiver vazio, tenta extrair de "Artista - Título" (comum em alguns players/Sessões Web)
    if (!artist && title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
    }

    if (title !== lastTrackTitle || artist !== lastTrackArtist) {
        lastTrackTitle = title;
        lastTrackArtist = artist;
        lastTrackDuration = data.duration || 0;
        simulatedTime = data.position || 0;
        lastOSPosition = data.position;

        // Recuperar metadados dos ficheiros de Cache/overrides (Plain-text)
        const trackMeta = getTrackMeta(artist, title);

        if (mainWindow) {
            mainWindow.webContents.send('media-update', {
                title, artist, isPlaying, currentTime: simulatedTime, savedOffset: trackMeta.sync_offset
            });
            mainWindow.webContents.send('lyrics-update', `[00:00.00]`); // Loading state
        }
        
        // Notificar Plugins
        if (pluginManager) pluginManager.broadcastMediaUpdate(data);

        activeFetchId++;
        const currentFetchId = activeFetchId;

        setTimeout(() => {
            if (currentFetchId !== activeFetchId) return;
            const queryToUse = trackMeta.override_query || null;
            fetchLyrics(title, artist, data.duration, queryToUse).then((lyrics) => {
                if (currentFetchId !== activeFetchId) return; 
                currentLrcContent = lyrics;
                if (mainWindow) mainWindow.webContents.send('lyrics-update', currentLrcContent);
            }).catch(() => {});
        }, 1500);

    } else {
        if (data.duration && data.duration > 0) lastTrackDuration = data.duration;
        if (data.position !== lastOSPosition) {
            lastOSPosition = data.position;
            const timeDiff = Math.abs(simulatedTime - data.position);
            if (timeDiff > 1.5 || !isPlaying) simulatedTime = data.position; 
            else if (timeDiff > 0.1) simulatedTime = (simulatedTime + position) / 2; 
        }
        if (isPlaying) simulatedTime += (now - lastSimulationTick) / 1000;

        if (mainWindow) {
            mainWindow.webContents.send('media-update', {
                title, artist, isPlaying, currentTime: simulatedTime
            });
        }
        if (pluginManager) pluginManager.broadcastMediaUpdate({ 
            ...data, 
            position: simulatedTime 
        });
    }

    isPlayingTrack = isPlaying;
    lastSimulationTick = now;
}

function initWindowsSMTCMonitor() {
    if (process.platform !== 'win32') return false;
    try {
        const workerPath = path.join(__dirname, 'smtc-worker.js');
        if (!fs.existsSync(workerPath)) return false;
        
        console.log('[App] A iniciar SMTC Background Worker...');
        smtcWorker = new Worker(workerPath);
        
        smtcWorker.on('message', (message) => {
            if (message && message.type === 'media-change') {
                const { title, artist, position, duration, status } = message.data;
                handleMediaUpdate(title, artist, position, duration, status);
            }
        });

        smtcWorker.on('error', (err) => console.error('[App] Erro no SMTC Worker:', err));
        smtcWorker.on('exit', (code) => console.warn(`[App] SMTC Worker terminou com código ${code}`));
        
        return true;
    } catch (err) { return false; }
}

// --- [ HTML UI BUILDERS ] ---

function buildWidgetUI() {
    return `<!DOCTYPE html>
    <html lang="pt">
    <head>
        <meta charset="UTF-8">
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --active-color: ${appConfig.activeColor};
                --inactive-color: ${appConfig.inactiveColor};
                --font-size: ${appConfig.fontSize}px;
                --font-family: ${appConfig.fontFamily}, 'Outfit', sans-serif;
                --font-weight: ${appConfig.fontWeight};
                --letter-spacing: ${appConfig.letterSpacing}px;
                --shadow: 0 2px 4px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.5);
            }
            body { margin: 0; overflow: hidden; font-family: var(--font-family); background: transparent; user-select: none; height: 100vh; width: 100vw; }
            #lyrics-viewport { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
            #lyrics-container { position: absolute; width: 100%; top: 50%; left: 0; text-align: center; transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94); will-change: transform; }
            .lyric-line { font-size: var(--font-size); font-weight: 400; color: var(--inactive-color); text-shadow: var(--shadow); padding: 8px 20px; margin: 0; opacity: 0.55; transition: all 0.3s ease; min-height: 38px; line-height: 1.5; filter: blur(0.5px); letter-spacing: var(--letter-spacing); }
            .lyric-line.active { font-size: calc(var(--font-size) * 1.25); font-weight: var(--font-weight); color: var(--active-color); opacity: 1; filter: none; transform: scale(1.04); text-shadow: 0 0 15px rgba(255, 255, 255, 0.2), var(--shadow); }
            .lyric-line.past { opacity: 0.25; }
            
            #edit-overlay { position: absolute; inset: 0; background: rgba(10, 10, 15, 0.4); backdrop-filter: blur(4px); border: 2px dashed rgba(255, 255, 255, 0.4); border-radius: 8px; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white; opacity: 0; pointer-events: none; transition: opacity 0.3s ease; z-index: 10000; -webkit-app-region: drag; }
            body.edit-mode #edit-overlay { opacity: 1; pointer-events: auto; }
            .btn { background: rgba(255, 255, 255, 0.15); color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; -webkit-app-region: no-drag; margin: 5px; }
            .btn:hover { background: rgba(255, 255, 255, 0.25); }
        </style>
    </head>
    <body>
        <div id="lyrics-viewport"><div id="lyrics-container"><div class="lyric-line active" id="lyric-0">A aguardar reprodução...</div></div></div>
        <div id="edit-overlay">
            <h3 style="margin-bottom: 20px; text-shadow: 0 2px 4px #000;">Modo de Edição (Arraste para Mover)</h3>
            <div>
                <button class="btn" onclick="require('electron').ipcRenderer.send('open-settings')">⚙️ Definições</button>
                <button class="btn" style="background: var(--active-color); color: #000;" onclick="require('electron').ipcRenderer.send('toggle-lock-request')">🔒 Trancar</button>
            </div>
        </div>
        <script>
            const { ipcRenderer } = require('electron');
            let parsedLyrics = [], mediaTime = 0, syncOffset = 0, currentTimer = 0, lastUpdateTimestamp = performance.now(), isPlaying = false, activeIndex = -1;
            let showTimestamps = ${appConfig.showTimestamps};

            function parseLRC(text) {
                if(!text) return [];
                const lines = text.split('\\n'), result = [], timeRegex = /\\[(\\d{1,3}):(\\d{2})(?:[\\.,](\\d{2,3}))?\\]/g;
                for(let line of lines) {
                    const cleanText = line.replace(/\\[.*?\\]/g, '').replace(/<.*?>/g, '').trim();
                    let match; timeRegex.lastIndex = 0;
                    while((match = timeRegex.exec(line)) !== null) {
                        const min = parseInt(match[1]), sec = parseInt(match[2]), ms = match[3] ? (match[3].length===2 ? parseInt(match[3])*10 : parseInt(match[3])) : 0;
                        result.push({time: min*60 + sec + ms/1000, text: cleanText, ts: \`[\${String(min).padStart(2,'0')}:\${String(sec).padStart(2,'0')}]\`});
                    }
                }
                return result.sort((a,b) => a.time - b.time);
            }

            function renderLyrics() {
                const c = document.getElementById('lyrics-container'); c.innerHTML = '';
                if(parsedLyrics.length === 0) { c.innerHTML = '<div class="lyric-line active" id="lyric-0">Sem Letras</div>'; return; }
                parsedLyrics.forEach((l, i) => {
                    const d = document.createElement('div'); d.className = 'lyric-line'; d.id = 'lyric-'+i;
                    d.innerText = (showTimestamps && l.ts ? l.ts+' ' : '') + (l.text||'...'); c.appendChild(d);
                });
            }

            function updateSync() {
                const now = performance.now();
                if(isPlaying) mediaTime += (now - lastUpdateTimestamp)/1000;
                lastUpdateTimestamp = now;
                currentTimer = Math.max(0, mediaTime + syncOffset);
                let newIdx = -1;
                for(let i=0; i<parsedLyrics.length; i++) { if(currentTimer >= parsedLyrics[i].time) newIdx = i; else break; }
                if(newIdx !== activeIndex) {
                    activeIndex = newIdx;
                    document.querySelectorAll('.lyric-line').forEach((el, i) => {
                        el.classList.remove('active', 'past');
                        if(i < activeIndex) el.classList.add('past');
                        if(i === activeIndex) el.classList.add('active');
                    });
                    const target = document.getElementById('lyric-'+(activeIndex===-1?0:activeIndex));
                    if(target) document.getElementById('lyrics-container').style.transform = \`translateY(-\${target.offsetTop + target.offsetHeight/2}px)\`;
                }
                requestAnimationFrame(updateSync);
            }

            ipcRenderer.on('media-update', (e, d) => {
                isPlaying = d.isPlaying;
                const drift = Math.abs(mediaTime - d.currentTime);
                if(drift > 1.5 || !isPlaying) mediaTime = d.currentTime; else if(drift>0.1) mediaTime = (mediaTime+d.currentTime)/2;
                if(d.savedOffset !== undefined) syncOffset = d.savedOffset;
            });
            ipcRenderer.on('lyrics-update', (e, lrc) => { parsedLyrics = parseLRC(lrc); activeIndex = -1; renderLyrics(); });
            ipcRenderer.on('sync-adjust', (e, offset) => { syncOffset = offset; currentTimer = Math.max(0, mediaTime+syncOffset); lastUpdateTimestamp=performance.now(); });
            ipcRenderer.on('toggle-edit-mode', (e, locked) => { document.body.classList.toggle('edit-mode', !locked); });
            
            requestAnimationFrame(updateSync);
        </script>
    </body>
    </html>`;
}

function buildSettingsUI() {
    return `<!DOCTYPE html>
    <html lang="pt">
    <head>
        <meta charset="UTF-8">
        <title>Definições NanoLyrics</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Outfit', sans-serif; background: #1a1a24; color: #fff; padding: 20px; margin: 0; }
            h2 { border-bottom: 2px solid #333; padding-bottom: 10px; margin-top: 0; font-size: 20px; }
            h3 { font-size: 14px; margin-top: 0; color: #ccc; }
            .section { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 15px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
            label { display: block; font-size: 11px; text-transform: uppercase; color: #aaa; margin-bottom: 5px; font-weight: bold; }
            input[type="text"], input[type="number"] { width: 100%; box-sizing: border-box; background: #0f0f15; border: 1px solid #444; color: white; padding: 8px; border-radius: 4px; font-family: inherit;}
            input[type="text"]:focus, input[type="number"]:focus { outline: none; border-color: #39FF14; }
            .color-row { display: flex; align-items: center; gap: 10px; }
            input[type="color"] { background: none; border: none; height: 30px; width: 30px; cursor: pointer; padding: 0; }
            .hotkey-input { cursor: pointer; text-align: center; font-weight: bold; caret-color: transparent; }
            .recording { border-color: #39FF14 !important; background: rgba(57, 255, 20, 0.1) !important; color: #39FF14 !important; }
            input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
            input[type="color"]::-webkit-color-swatch { border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; }
            button { background: #39FF14; color: black; border: none; padding: 10px 20px; font-weight: bold; border-radius: 5px; cursor: pointer; transition: all 0.2s; }
            button:hover { filter: brightness(1.2); }
            .btn-danger { background: #ff4757; color: white; padding: 6px 12px; font-size: 12px; border-radius: 4px; border: none; cursor: pointer; font-weight: bold; }
            .btn-danger:hover { background: #ff6b81; }
            .cache-row { display: flex; justify-content: space-between; align-items: center; background: #0f0f15; padding: 10px 12px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #333; }
        </style>
    </head>
    <body>
        <h2>Definições do Widget</h2>
        
        <div class="grid">
            <div class="section">
                <h3>Tipografia & Cores</h3>
                <label>Fonte (Sistema ou Web)</label><input type="text" id="fontFamily" value="${appConfig.fontFamily}">
                <div class="grid" style="margin-top: 10px;">
                    <div><label>Peso (ex: 400, 700)</label><input type="number" id="fontWeight" value="${appConfig.fontWeight}"></div>
                    <div><label>Tamanho (px)</label><input type="number" id="fontSize" value="${appConfig.fontSize}"></div>
                    <div style="grid-column: span 2;"><label>Espaçamento entre letras (px)</label><input type="number" id="letterSpacing" value="${appConfig.letterSpacing}"></div>
                </div>
                <div style="margin-top: 10px;">
                    <label>Cor Letra Ativa</label>
                    <div class="color-row"><input type="color" id="activeColorPicker" value="${appConfig.activeColor}"><input type="text" id="activeColor" value="${appConfig.activeColor}"></div>
                </div>
                <div style="margin-top: 10px;">
                    <label>Cor Letra Inativa</label>
                    <div class="color-row"><input type="color" id="inactiveColorPicker" value="${appConfig.inactiveColor}"><input type="text" id="inactiveColor" value="${appConfig.inactiveColor}"></div>
                </div>
            </div>

            <div class="section">
                <h3>Atalhos (Keybinds)</h3>
                <label>Trancar/Destrancar Widget</label><input type="text" id="hk_lock" class="hotkey-input" readonly value="${appConfig.hotkeys.toggleLock}">
                <label style="margin-top: 10px;">Avançar Sincronização</label><input type="text" id="hk_adv" class="hotkey-input" readonly value="${appConfig.hotkeys.advanceSync}">
                <label style="margin-top: 10px;">Atrasar Sincronização</label><input type="text" id="hk_rew" class="hotkey-input" readonly value="${appConfig.hotkeys.rewindSync}">
                <label style="margin-top: 10px;">Mostrar/Esconder Widget</label><input type="text" id="hk_vis" class="hotkey-input" readonly value="${appConfig.hotkeys.toggleWidget}">
                <label style="margin-top: 10px;">🧩 Abrir Seletor de Partes do título</label><input type="text" id="hk_puz" class="hotkey-input" readonly value="${appConfig.hotkeys.togglePuzzle}">
                <p style="font-size:10px; color:#888; margin-top: 8px; line-height: 1.4;">Use modificadores: CommandOrControl, Shift, Alt. Ex: "CommandOrControl+Shift+P".</p>
            </div>
        </div>

        <div class="section">
            <h3>Gestão de Cache e Ficheiros Locais</h3>
            <div class="cache-row">
                <div>
                    <div style="font-weight: bold; font-size: 13px;">Letras Sincronizadas (.lrc)</div>
                    <div style="font-size: 11px; color: #888;" id="lrcSizeLabel">A calcular...</div>
                </div>
                <button class="btn-danger" id="clearLrcBtn">Limpar Cache .lrc</button>
            </div>
            <div class="cache-row">
                <div>
                    <div style="font-weight: bold; font-size: 13px;">Overrides do Puzzle & Sincronização (.json)</div>
                    <div style="font-size: 11px; color: #888;" id="overridesSizeLabel">A calcular...</div>
                </div>
                <button class="btn-danger" id="clearOverridesBtn">Limpar Overrides</button>
            </div>
            <p style="font-size:11px; color:#888; margin-top: 8px;">Os ficheiros são gravados nativamente em texto no diretório de dados do utilizador. Nenhuma base de dados pesada é necessária.</p>
        </div>

        <button id="saveBtn" style="width: 100%; margin-top: 5px;">Guardar & Aplicar</button>

        <script>
            const { ipcRenderer } = require('electron');
            
            document.getElementById('activeColorPicker').oninput = e => document.getElementById('activeColor').value = e.target.value;
            document.getElementById('inactiveColorPicker').oninput = e => document.getElementById('inactiveColor').value = e.target.value;

            let recordingEl = null;
            document.querySelectorAll('.hotkey-input').forEach(el => {
                el.onclick = () => {
                    if (recordingEl) recordingEl.classList.remove('recording');
                    recordingEl = el;
                    el.classList.add('recording');
                    el.value = 'A gravar...';
                };
            });

            window.addEventListener('keydown', (e) => {
                if (!recordingEl) return;
                e.preventDefault();
                e.stopPropagation();

                const modifiers = ['Control', 'Shift', 'Alt', 'Meta'];
                if (modifiers.includes(e.key)) return;

                let parts = [];
                if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
                if (e.altKey) parts.push('Alt');
                if (e.shiftKey) parts.push('Shift');

                let key = e.key;
                if (key === ' ') key = 'Space';
                if (key.length === 1) key = key.toUpperCase();
                
                const keyMap = { 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'Escape': 'Esc' };
                if (keyMap[key]) key = keyMap[key];

                parts.push(key);
                recordingEl.value = parts.join('+');
                recordingEl.classList.remove('recording');
                recordingEl = null;
            });

            // Pedir tamanhos de ficheiros ao abrir o modal
            ipcRenderer.send('request-cache-info');
            ipcRenderer.on('cache-info', (e, info) => {
                document.getElementById('lrcSizeLabel').innerText = 'Espaço ocupado: ' + info.lrcSize;
                document.getElementById('overridesSizeLabel').innerText = 'Espaço ocupado: ' + info.overridesSize;
            });

            // Funcionalidade dos botões de limpeza c/ feedback visual imediato
            function handleClear(type, btnId) {
                ipcRenderer.send('clear-cache', type);
                const btn = document.getElementById(btnId);
                const originalText = btn.innerText;
                btn.innerText = 'Apagado!';
                btn.style.backgroundColor = '#555';
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.style.backgroundColor = '';
                }, 2000);
            }

            document.getElementById('clearLrcBtn').onclick = () => handleClear('lrc', 'clearLrcBtn');
            document.getElementById('clearOverridesBtn').onclick = () => handleClear('overrides', 'clearOverridesBtn');

            document.getElementById('saveBtn').onclick = () => {
                const config = {
                    fontFamily: document.getElementById('fontFamily').value,
                    fontWeight: parseInt(document.getElementById('fontWeight').value),
                    fontSize: parseInt(document.getElementById('fontSize').value),
                    letterSpacing: parseInt(document.getElementById('letterSpacing').value),
                    activeColor: document.getElementById('activeColor').value,
                    inactiveColor: document.getElementById('inactiveColor').value,
                    hotkeys: {
                        toggleLock: document.getElementById('hk_lock').value,
                        advanceSync: document.getElementById('hk_adv').value,
                        rewindSync: document.getElementById('hk_rew').value,
                        toggleWidget: document.getElementById('hk_vis').value,
                        togglePuzzle: document.getElementById('hk_puz').value
                    }
                };
                ipcRenderer.send('save-settings', config);
            };
        </script>
    </body>
    </html>`;
}

function buildPuzzleUI() {
    return `<!DOCTYPE html>
    <html lang="pt">
    <head>
        <meta charset="UTF-8">
        <style>
            body { margin: 0; display:flex; justify-content:center; align-items:flex-end; height: 100vh; background: transparent; overflow: hidden; font-family: sans-serif; }
            #puzzle-box { background: rgba(20,20,25,0.95); border: 2px solid #39FF14; border-radius: 12px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); width: 80%; max-width: 600px; margin-bottom: 40px; text-align: center; }
            h3 { color: white; margin: 0 0 15px 0; font-size: 16px; }
            #chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 20px; }
            .chip { background: #333; color: white; padding: 8px 12px; border-radius: 6px; cursor: pointer; user-select: none; font-weight: bold; transition: all 0.2s; border: 2px solid transparent; }
            .chip.active { background: #39FF14; color: black; border-color: white; transform: scale(1.05); }
            button { background: white; color: black; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; margin: 0 5px;}
            button.primary { background: #39FF14; }
        </style>
    </head>
    <body>
        <div id="puzzle-box">
            <h3>🧩 Partes do Título (Selecione as partes a pesquisar)</h3>
            <div id="chips"></div>
            <div>
                <button onclick="require('electron').ipcRenderer.send('close-puzzle')">Cancelar</button>
                <button class="primary" onclick="submitPuzzle()">Pesquisar Música</button>
            </div>
        </div>
        <script>
            const { ipcRenderer } = require('electron');
            let words = [];
            ipcRenderer.on('load-puzzle', (e, {title, artist}) => {
                const fullString = \`\${artist} \${title}\`.replace(/\\s+/g, ' ').trim();
                words = fullString.split(' ');
                const container = document.getElementById('chips');
                container.innerHTML = '';
                words.forEach((w, i) => {
                    const div = document.createElement('div');
                    div.className = 'chip active'; // Todas ativas por predefinição
                    div.innerText = w;
                    div.onclick = () => div.classList.toggle('active');
                    container.appendChild(div);
                });
            });

            function submitPuzzle() {
                const activeChips = Array.from(document.querySelectorAll('.chip.active')).map(el => el.innerText);
                const query = activeChips.join(' ');
                ipcRenderer.send('puzzle-search', query);
            }
        </script>
    </body>
    </html>`;
}

// --- [ WINDOW MANAGEMENT ] ---
function toggleLock() {
    isLocked = !isLocked;
    if (mainWindow) {
        mainWindow.setIgnoreMouseEvents(isLocked, { forward: true });
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.webContents.send('toggle-edit-mode', isLocked);
    }
    buildTray();
}

function toggleWidgetVisibility() {
    if (!mainWindow) return;
    if (isWidgetHidden) {
        mainWindow.show(); mainWindow.setAlwaysOnTop(true, 'screen-saver');
        if (isLocked) mainWindow.setIgnoreMouseEvents(true, { forward: true });
        isWidgetHidden = false;
    } else { mainWindow.hide(); isWidgetHidden = true; }
}

function togglePuzzleWindow() {
    if (puzzleWindow) {
        puzzleWindow.close();
        puzzleWindow = null;
        return;
    }
    
    puzzleWindow = new BrowserWindow({
        width: 800, height: 400, transparent: true, frame: false, alwaysOnTop: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    
    const uiPath = path.join(app.getPath('userData'), 'puzzle_ui.html');
    fs.writeFileSync(uiPath, buildPuzzleUI(), 'utf-8');
    puzzleWindow.loadFile(uiPath).then(() => {
        puzzleWindow.webContents.send('load-puzzle', { title: lastTrackTitle, artist: lastTrackArtist });
    });
    
    puzzleWindow.on('closed', () => puzzleWindow = null);
}

function openSettingsWindow() {
    if (settingsWindow) { settingsWindow.focus(); return; }
    settingsWindow = new BrowserWindow({
        width: 540, height: 680, resizable: false, autoHideMenuBar: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false },
        title: "Definições NanoLyrics"
    });
    const uiPath = path.join(app.getPath('userData'), 'settings_ui.html');
    fs.writeFileSync(uiPath, buildSettingsUI(), 'utf-8');
    settingsWindow.loadFile(uiPath);
    settingsWindow.on('closed', () => settingsWindow = null);
}

function sendSyncAdjustment(deltaSeconds) {
    if (!mainWindow || !lastTrackTitle) return;
    const meta = getTrackMeta(lastTrackArtist, lastTrackTitle);
    meta.sync_offset += parseFloat(deltaSeconds);
    saveTrackMeta(meta);
    mainWindow.webContents.send('sync-adjust', meta.sync_offset);
}

function buildTray() {
    if (!tray) {
        const iconPath = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
        const finalIcon = fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'assets', 'icon.png');
        tray = new Tray(finalIcon); tray.setToolTip('NanoLyrics');
        tray.on('click', () => toggleLock());
    }
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: isLocked ? '🔓 Destrancar Widget' : '🔒 Trancar Widget', click: () => toggleLock() },
        { label: '⚙️ Definições', click: () => openSettingsWindow() },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() }
    ]));
}

function createWindow() {
    const display = screen.getPrimaryDisplay();
    mainWindow = new BrowserWindow({
        width: appConfig.width, height: appConfig.height,
        x: appConfig.x || (display.bounds.width/2 - appConfig.width/2),
        y: appConfig.y || (display.bounds.height - appConfig.height - 80),
        transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    const uiPath = path.join(app.getPath('userData'), 'NanoLyrics_ui.html');
    fs.writeFileSync(uiPath, buildWidgetUI(), 'utf-8');
    mainWindow.loadFile(uiPath);

    mainWindow.on('resized', saveWindowPosition);
    mainWindow.on('moved', saveWindowPosition);
    mainWindow.on('closed', () => { mainWindow = null; });
}

function saveWindowPosition() {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    Object.assign(appConfig, {width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y});
    saveConfig();
}

// --- [ IPC MAIN ] ---
ipcMain.on('toggle-lock-request', () => toggleLock());
ipcMain.on('open-settings', () => openSettingsWindow());
ipcMain.on('close-puzzle', () => { if(puzzleWindow) puzzleWindow.close(); });

// Responder ao pedido de tamanho do cache
ipcMain.on('request-cache-info', (event) => {
    const lrcSize = getFolderSize(appConfig.cachePath, '.lrc');
    const overridesSize = getFolderSize(getOverridesPath(), '.json');
    event.reply('cache-info', { lrcSize, overridesSize });
});

// Ação para apagar ficheiros do cache a partir da UI
ipcMain.on('clear-cache', (event, type) => {
    try {
        if (type === 'lrc' || type === 'all') {
            if (fs.existsSync(appConfig.cachePath)) {
                fs.readdirSync(appConfig.cachePath).forEach(file => {
                    if (file.endsWith('.lrc')) fs.unlinkSync(path.join(appConfig.cachePath, file));
                });
            }
        }
        if (type === 'overrides' || type === 'all') {
            const ovPath = getOverridesPath();
            if (fs.existsSync(ovPath)) {
                fs.readdirSync(ovPath).forEach(file => {
                    if (file.endsWith('.json')) fs.unlinkSync(path.join(ovPath, file));
                });
            }
        }
    } catch (e) { console.error('Erro ao limpar cache:', e); }

    // Enviar novos tamanhos atualizados para a UI
    const lrcSize = getFolderSize(appConfig.cachePath, '.lrc');
    const overridesSize = getFolderSize(getOverridesPath(), '.json');
    event.reply('cache-info', { lrcSize, overridesSize });
});

ipcMain.on('save-settings', (event, settings) => {
    Object.assign(appConfig, settings);
    saveConfig();
    registerHotkeys();
    
    // Atualiza a UI do Widget em tempo real regenerando o HTML
    const uiPath = path.join(app.getPath('userData'), 'NanoLyrics_ui.html');
    fs.writeFileSync(uiPath, buildWidgetUI(), 'utf-8');
    if (mainWindow) {
        mainWindow.loadFile(uiPath).then(() => {
            mainWindow.webContents.send('lyrics-update', currentLrcContent);
            mainWindow.webContents.send('toggle-edit-mode', isLocked);
        });
    }
    if (settingsWindow) settingsWindow.close();
});

ipcMain.on('puzzle-search', async (event, customQuery) => {
    if (puzzleWindow) puzzleWindow.close();
    if (!lastTrackTitle) return;
    
    const meta = getTrackMeta(lastTrackArtist, lastTrackTitle);
    meta.override_query = customQuery;
    saveTrackMeta(meta); // Guarda a string customizada no ficheiro plain-text json
    
    currentLrcContent = await fetchLyrics(lastTrackTitle, lastTrackArtist, lastTrackDuration, customQuery);
    if (mainWindow) mainWindow.webContents.send('lyrics-update', currentLrcContent);
});

// --- [ APP LIFECYCLE ] ---
app.whenReady().then(() => {
    pluginManager = new PluginManager(
        [
            path.join(__dirname, 'plugins'), // Pasta interna (bundled com a app)
            path.join(app.getPath('userData'), 'plugins') // Pasta do utilizador
        ],
        (title, artist, pos, dur, status) => handleMediaUpdate(title, artist, pos, dur, status)
    );
    
    loadConfig();
    createWindow();
    buildTray();
    registerHotkeys();
    startTerminalRefresher();
    initWindowsSMTCMonitor();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => {
    if (terminalInterval) clearInterval(terminalInterval);
    if (smtcWorker) smtcWorker.terminate();
    globalShortcut.unregisterAll();
});