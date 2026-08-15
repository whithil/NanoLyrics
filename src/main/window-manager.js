const { BrowserWindow, screen, Tray, Menu, app, shell } = require('electron');
const path = require('path');
const configManager = require('./config-manager');
const i18n = require('./i18n');
const mediaMonitor = require('./media-monitor');

class WindowManager {
    constructor() {
        this.mainWindow = null;
        this.settingsWindow = null;
        this.titlePartsWindow = null;
        this.tray = null;
        this.isLocked = true;
        this.isWidgetHidden = false;
        this.saveTimeout = null;
    }

    createMainWindow() {
        if (this.mainWindow) return;

        const appConfig = configManager.getConfig();
        const display = screen.getPrimaryDisplay();
        
        // Calculate default center if no saved position exists
        const defaultX = (display.bounds.width / 2 - appConfig.width / 2);
        const defaultY = (display.bounds.height - appConfig.height - 80);

        this.mainWindow = new BrowserWindow({
            width: appConfig.width || 800,
            height: appConfig.height || 350,
            x: (appConfig.x !== null && appConfig.x !== undefined) ? appConfig.x : defaultX,
            y: (appConfig.y !== null && appConfig.y !== undefined) ? appConfig.y : defaultY,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        this.mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
        this.applyIgnoreMouseEvents(this.isLocked);

        const indexPath = path.join(__dirname, '../renderer/widget/index.html');
        this.mainWindow.loadFile(indexPath);

        // Silent persistence on movement/resize
        this.mainWindow.on('resize', () => this.debounceSavePosition());
        this.mainWindow.on('move', () => this.debounceSavePosition());
        
        this.mainWindow.on('closed', () => { this.mainWindow = null; });
    }

    applyIgnoreMouseEvents(ignore) {
        if (!this.mainWindow) return;
        // { forward: true } is only supported on Windows/macOS.
        // On Linux/KWin, passing { forward: true } causes setIgnoreMouseEvents to fail or be ignored.
        if (process.platform === 'win32' || process.platform === 'darwin') {
            this.mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
        } else {
            this.mainWindow.setIgnoreMouseEvents(ignore);
        }
    }

    debounceSavePosition() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveWindowPosition(), 1000);
    }

    saveWindowPosition() {
        if (!this.mainWindow) return;
        const bounds = this.mainWindow.getBounds();
        
        // Update config silently
        configManager.setConfig({
            width: bounds.width,
            height: bounds.height,
            x: bounds.x,
            y: bounds.y
        });
        console.log(`[WindowManager] Saved layout: ${bounds.width}x${bounds.height} at ${bounds.x},${bounds.y}`);
    }

    toggleLock() {
        this.isLocked = !this.isLocked;
        if (this.mainWindow) {
            this.applyIgnoreMouseEvents(this.isLocked);
            this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
            this.mainWindow.webContents.send('toggle-edit-mode', this.isLocked);
        }
        this.buildTray();
    }

    toggleWidgetVisibility() {
        if (!this.mainWindow) return;
        if (this.isWidgetHidden) {
            this.mainWindow.show();
            this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
            if (this.isLocked) this.applyIgnoreMouseEvents(true);
            this.isWidgetHidden = false;
        } else {
            this.mainWindow.hide();
            this.isWidgetHidden = true;
        }
        this.buildTray();
    }

    openSettingsWindow() {
        if (this.settingsWindow) {
            this.settingsWindow.focus();
            return;
        }

        this.settingsWindow = new BrowserWindow({
            width: 540,
            height: 680,
            resizable: true,
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            title: i18n.t('settings.title')
        });

        const indexPath = path.join(__dirname, '../renderer/settings/index.html');
        this.settingsWindow.loadFile(indexPath);
        this.settingsWindow.on('closed', () => { this.settingsWindow = null; });
    }

    toggleTitlePartsWindow(trackData) {
        if (this.titlePartsWindow) {
            this.titlePartsWindow.close();
            this.titlePartsWindow = null;
            return;
        }

        this.titlePartsWindow = new BrowserWindow({
            width: 800,
            height: 400,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        const indexPath = path.join(__dirname, '../renderer/title-parts/index.html');
        this.titlePartsWindow.loadFile(indexPath).then(() => {
            this.titlePartsWindow.webContents.send('load-title-parts', trackData);
        });

        this.titlePartsWindow.on('closed', () => { this.titlePartsWindow = null; });
    }

    closeTitlePartsWindow() {
        if (this.titlePartsWindow) {
            this.titlePartsWindow.close();
        }
    }

    buildTray() {
        if (!this.tray) {
            const iconPath = path.join(__dirname, '../../assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
            this.tray = new Tray(iconPath);
            this.tray.setToolTip('NanoLyrics');
            this.tray.on('click', () => this.toggleLock());
        }

        const contextMenu = Menu.buildFromTemplate([
            { label: this.isLocked ? i18n.t('tray.unlock') : i18n.t('tray.lock'), click: () => this.toggleLock() },
            { label: this.isWidgetHidden ? i18n.t('tray.show') : i18n.t('tray.hide'), click: () => this.toggleWidgetVisibility() },
            { label: i18n.t('tray.fix_title'), click: () => this.toggleTitlePartsWindow({ title: mediaMonitor.lastTrackTitle, artist: mediaMonitor.lastTrackArtist }) },
            { label: i18n.t('tray.settings'), click: () => this.openSettingsWindow() },
            { label: i18n.t('tray.help'), click: () => app.emit('open-help-request') },
            { type: 'separator' },
            { label: i18n.t('tray.quit'), click: () => app.quit() }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    sendToWidget(channel, data) {
        if (this.mainWindow) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    sendToSettings(channel, data) {
        if (this.settingsWindow) {
            this.settingsWindow.webContents.send(channel, data);
        }
    }
}

module.exports = new WindowManager();
