const { app, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const configManager = require('./config-manager');
const mediaMonitor = require('./media-monitor');
const lyricsProvider = require('./lyrics-provider');
const windowManager = require('./window-manager');
const PluginManager = require('./plugin-manager');
const i18n = require('./i18n');

let pluginManager = null;
let currentLyrics = '';

// --- [ APP LIFECYCLE ] ---

app.whenReady().then(() => {
    // Initialize Plugins
    pluginManager = new PluginManager(
        [
            path.join(app.getAppPath(), 'plugins'), // Internal plugins
            path.join(app.getPath('userData'), 'plugins') // User plugins
        ],
        (title, artist, pos, dur, status) => handleMediaUpdate(title, artist, pos, dur, status)
    );
    pluginManager.init();

    // Setup Window Manager
    windowManager.createMainWindow();
    windowManager.buildTray();

    // Register Hotkeys
    registerHotkeys();

    // Start Monitoring
    mediaMonitor.init();
    
    // Listen to media monitor events
    mediaMonitor.on('track-change', (data) => handleMediaUpdate(data.title, data.artist, data.position, data.duration, data.status));
    mediaMonitor.on('position-update', (data) => handleMediaPositionUpdate(data));

    app.on('activate', () => {
        if (windowManager.mainWindow === null) windowManager.createMainWindow();
    });
});

app.on('open-help-request', () => {
    shell.openExternal('https://github.com/whithil/NanoLyrics#readme');
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    mediaMonitor.stop();
    globalShortcut.unregisterAll();
});

// --- [ MEDIA HANDLING ] ---

async function handleMediaUpdate(rawTitle, rawArtist, position, duration, status) {
    let data = { title: rawTitle || '', artist: rawArtist || '', position, duration, status };
    if (pluginManager) data = pluginManager.processMetadata(data);
    const { title, artist } = data;
    const isPlaying = (status === 'Playing' || status === 'playing');
    if (pluginManager) pluginManager.broadcastMediaUpdate(data);
    const trackMeta = configManager.getTrackMeta(artist, title);
    windowManager.sendToWidget('media-update', { title, artist, isPlaying, currentTime: position, savedOffset: trackMeta.sync_offset });
    windowManager.sendToWidget('lyrics-update', '[00:00.00] ...');

    if (windowManager.isWidgetHidden) return;

    const fetchId = lyricsProvider.getNextFetchId();
    setTimeout(async () => {
        if (fetchId !== lyricsProvider.activeFetchId) return;
        const queryToUse = trackMeta.override_query || null;
        try {
            const lyrics = await lyricsProvider.fetchLyrics(title, artist, duration, queryToUse);
            if (fetchId !== lyricsProvider.activeFetchId) return;
            currentLyrics = lyrics;
            windowManager.sendToWidget('lyrics-update', currentLyrics);
        } catch (err) { console.error('[Main] Error fetching lyrics:', err); }
    }, 1500);
}

function handleMediaPositionUpdate(data) {
    const isPlaying = (data.status === 'Playing' || data.status === 'playing');
    windowManager.sendToWidget('media-update', { title: data.title, artist: data.artist, isPlaying, currentTime: data.position });
    if (pluginManager) pluginManager.broadcastMediaUpdate({ ...data, position: data.position });
}

// --- [ HOTKEYS ] ---

function registerHotkeys() {
    globalShortcut.unregisterAll();
    const config = configManager.getConfig();
    const hotkeys = config.hotkeys;

    const bind = (key, action, name) => {
        if (!key) return;
        try {
            if (!globalShortcut.register(key, action)) console.error(`[Main] Failed to register: ${name} (${key})`);
        } catch (e) { console.error(`[Main] Hotkey error: ${name} (${key})`); }
    };

    bind(hotkeys.toggleLock, () => windowManager.toggleLock(), 'Toggle Lock');
    bind(hotkeys.advanceSync, () => adjustSync(0.5), 'Advance Sync');
    bind(hotkeys.rewindSync, () => adjustSync(-0.5), 'Rewind Sync');
    bind(hotkeys.toggleWidget, () => windowManager.toggleWidgetVisibility(), 'Toggle Widget');
    bind(hotkeys.togglePuzzle, () => windowManager.togglePuzzleWindow({ title: mediaMonitor.lastTrackTitle, artist: mediaMonitor.lastTrackArtist }), 'Toggle Puzzle');
}

function adjustSync(delta) {
    const title = mediaMonitor.lastTrackTitle;
    const artist = mediaMonitor.lastTrackArtist;
    if (!title) return;
    const meta = configManager.getTrackMeta(artist, title);
    meta.sync_offset += parseFloat(delta);
    configManager.saveTrackMeta(meta);
    windowManager.sendToWidget('sync-adjust', meta.sync_offset);
}

// --- [ IPC HANDLING ] ---

ipcMain.on('toggle-lock-request', () => windowManager.toggleLock());
ipcMain.on('open-settings', () => windowManager.openSettingsWindow());
ipcMain.on('close-puzzle', () => windowManager.closePuzzleWindow());
ipcMain.on('open-external', (event, url) => shell.openExternal(url));
ipcMain.on('open-help', () => shell.openExternal('https://github.com/whithil/NanoLyrics#readme'));

ipcMain.on('open-file-dialog', async (event) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Images', extensions: ['jpg', 'png', 'gif', 'svg', 'webp', 'bmp'] }
        ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        event.reply('selected-file', result.filePaths[0]);
    }
});

ipcMain.on('request-widget-config', (event) => {
    event.reply('apply-config', configManager.getConfig());
    event.reply('apply-translations', i18n.getTranslations());
});

ipcMain.on('request-settings-config', (event) => {
    event.reply('apply-config', configManager.getConfig());
    event.reply('apply-translations', i18n.getTranslations());
});

ipcMain.on('request-puzzle-translations', (event) => {
    event.reply('apply-translations', i18n.getTranslations());
});

ipcMain.on('request-plugins', (event) => {
    if (pluginManager) event.reply('apply-plugins', pluginManager.getAvailablePlugins());
});

ipcMain.on('request-system-fonts', (event) => {
    const platform = process.platform;
    let cmd = '';
    if (platform === 'win32') cmd = 'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /s';
    else if (platform === 'darwin') cmd = 'system_profiler SPFontsDataType | grep "Full Name" | cut -d ":" -f 2';
    else cmd = 'fc-list : family | cut -d "," -f 1 | sort | uniq';

    const { exec } = require('child_process');
    exec(cmd, (err, stdout) => {
        if (err) { event.reply('apply-system-fonts', []); return; }
        let fonts = [];
        if (platform === 'win32') {
            const lines = stdout.split('\n');
            for (let line of lines) {
                const match = line.match(/^\s+([^(]+)\s+\(/);
                if (match) fonts.push(match[1].trim());
            }
        } else { fonts = stdout.split('\n').map(f => f.trim()).filter(f => f); }
        event.reply('apply-system-fonts', [...new Set(fonts)].sort());
    });
});

ipcMain.on('request-cache-info', (event) => {
    const appConfig = configManager.getConfig();
    const lrcSize = getFolderSize(appConfig.cachePath, '.lrc');
    const overridesSize = getFolderSize(configManager.getOverridesPath(), '.json');
    event.reply('cache-info', { lrcSize, overridesSize });
});

ipcMain.on('clear-cache', (event, type) => {
    const appConfig = configManager.getConfig();
    try {
        if (type === 'lrc' || type === 'all') {
            if (fs.existsSync(appConfig.cachePath)) {
                fs.readdirSync(appConfig.cachePath).forEach(file => { if (file.endsWith('.lrc')) fs.unlinkSync(path.join(appConfig.cachePath, file)); });
            }
        }
        if (type === 'overrides' || type === 'all') {
            const ovPath = configManager.getOverridesPath();
            if (fs.existsSync(ovPath)) {
                fs.readdirSync(ovPath).forEach(file => { if (file.endsWith('.json')) fs.unlinkSync(path.join(ovPath, file)); });
            }
        }
    } catch (e) { console.error('[Main] Error clearing cache:', e); }
    const lrcSize = getFolderSize(appConfig.cachePath, '.lrc');
    const overridesSize = getFolderSize(configManager.getOverridesPath(), '.json');
    event.reply('cache-info', { lrcSize, overridesSize });
});

ipcMain.on('save-settings', (event, settings) => {
    configManager.setConfig(settings);
    registerHotkeys();
    if (pluginManager) pluginManager.init();
    windowManager.sendToWidget('apply-config', configManager.getConfig());
    if (windowManager.settingsWindow) windowManager.settingsWindow.close();
});

ipcMain.on('puzzle-search', async (event, customQuery) => {
    windowManager.closePuzzleWindow();
    const title = mediaMonitor.lastTrackTitle;
    const artist = mediaMonitor.lastTrackArtist;
    if (!title) return;
    const meta = configManager.getTrackMeta(artist, title);
    meta.override_query = customQuery;
    configManager.saveTrackMeta(meta);
    const lyrics = await lyricsProvider.fetchLyrics(title, artist, mediaMonitor.lastTrackDuration, customQuery);
    currentLyrics = lyrics;
    windowManager.sendToWidget('lyrics-update', currentLyrics);
});

function getFolderSize(folderPath, ext = null) {
    if (!fs.existsSync(folderPath)) return '0 B';
    let total = 0;
    try {
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            const fullPath = path.join(folderPath, file);
            if (fs.statSync(fullPath).isFile()) { if (!ext || file.endsWith(ext)) total += fs.statSync(fullPath).size; }
        }
    } catch (e) {}
    if (total === 0) return 'Empty';
    if (total < 1024) return total + ' B';
    if (total < 1024 * 1024) return (total / 1024).toFixed(2) + ' KB';
    return (total / (1024 * 1024)).toFixed(2) + ' MB';
}
