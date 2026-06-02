const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_FILE = 'nanolyrics_config.json';
const DEFAULT_HOTKEYS = {
    toggleLock: 'CommandOrControl+Shift+L',
    advanceSync: 'CommandOrControl+Shift+Right',
    rewindSync: 'CommandOrControl+Shift+Left',
    toggleWidget: 'CommandOrControl+Shift+H',
    toggleTitleParts: 'CommandOrControl+Shift+P'
};

class ConfigManager {
    constructor() {
        this.configPath = path.join(app.getPath('userData'), CONFIG_FILE);
        this.appConfig = null;
        this.defaultConfig = {
            hotkeys: DEFAULT_HOTKEYS,
            fontFamily: 'Outfit',
            fontWeight: 700,
            fontSize: 25,
            letterSpacing: 0,
            activeColor: '#14ff30',
            inactiveColor: '#FFFFFF',
            cachePath: path.join(app.getPath('userData'), 'LrcCache'),
            showTimestamps: false,
            width: 800,
            height: 350,
            x: null,
            y: null,
            // Text Appearance
            outlineColor: '#050505',
            outlineSize: 2,
            shadowColor: '#7411ee',
            shadowBlur: 15,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            // Widget Styling
            boxedMode: false,
            boxColor: '#000000',
            boxOpacity: 1.0,
            widgetOpacity: 1.0,
            backgroundImage: '',
            borderImage: '',
            disabledPlugins: [],
            language: null // null means auto-detect
        };
        this.loadConfig();
    }

    loadConfig() {
        if (fs.existsSync(this.configPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
                this.appConfig = { 
                    ...this.defaultConfig, 
                    ...parsed, 
                    hotkeys: { ...this.defaultConfig.hotkeys, ...(parsed.hotkeys || {}) } 
                };
            } catch (e) {
                console.error('Error loading config:', e);
                this.appConfig = { ...this.defaultConfig };
            }
        } else {
            this.appConfig = { ...this.defaultConfig };
            this.saveConfig();
        }

        if (!fs.existsSync(this.appConfig.cachePath)) {
            fs.mkdirSync(this.appConfig.cachePath, { recursive: true });
        }
        if (!fs.existsSync(this.getOverridesPath())) {
            fs.mkdirSync(this.getOverridesPath(), { recursive: true });
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.appConfig, null, 4), 'utf-8');
        } catch (e) {
            console.error('Error saving config:', e);
        }
    }

    getConfig() {
        return this.appConfig;
    }

    setConfig(newConfig) {
        Object.assign(this.appConfig, newConfig);
        this.saveConfig();
    }

    getOverridesPath() {
        return path.join(this.appConfig.cachePath, 'title_parts_overrides');
    }

    getTrackMeta(artist, title) {
        const id = `${artist || 'unknown'} - ${title || 'unknown'}`.replace(/[^a-zA-Z0-9\s.\-_]/g, '').trim().toLowerCase();
        const filePath = path.join(this.getOverridesPath(), `${id}.json`);
        
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            } catch (e) {
                console.error('Error reading track metadata:', e);
            }
        }
        return { id, original_artist: artist, original_title: title, override_query: null, sync_offset: 0 };
    }

    saveTrackMeta(meta) {
        const overridesDir = this.getOverridesPath();
        if (!fs.existsSync(overridesDir)) {
            fs.mkdirSync(overridesDir, { recursive: true });
        }
        
        const filePath = path.join(overridesDir, `${meta.id}.json`);
        try {
            fs.writeFileSync(filePath, JSON.stringify(meta, null, 4), 'utf-8');
        } catch (e) {
            console.error('Error saving track metadata:', e);
        }
    }
}

module.exports = new ConfigManager();
