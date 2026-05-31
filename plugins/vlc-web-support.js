/**
 * NanoLyrics Plugin: VLC Media Player Web Support
 * 
 * Provides metadata for VLC when SMTC is unavailable.
 * To use this, enable the VLC Web Interface:
 * 1. VLC -> Tools -> Preferences -> All (at bottom)
 * 2. Interface -> Main interfaces -> Check "Web"
 * 3. Interface -> Main interfaces -> Lua -> Set "Password" (default below is 'nanolyrics')
 */

const { net } = require('electron');

class VLCWebPlugin {
    constructor() {
        this.name = 'VLC Web Support';
        this.description = 'Fetch metadata from VLC Media Player via its built-in web interface.';
        this.instructions = '1. VLC -> Tools -> Preferences -> All\n2. Interface -> Main interfaces -> Check "Web"\n3. Interface -> Main interfaces -> Lua -> Set Password to "nanolyrics"\n4. Restart VLC.';
        this.password = 'nanolyrics';
        this.port = 8080;
        this.host = '127.0.0.1';
        this.pollIntervalId = null;
        this.lastTitle = '';
        this.updateApp = null;
    }

    onLoad(updateApp) {
        this.updateApp = updateApp;
        console.log('[VLC-Web] Plugin loaded. Polling VLC Web Interface...');
        this.startPolling(2000);
    }

    startPolling(interval) {
        if (this.pollIntervalId) clearInterval(this.pollIntervalId);
        this.pollIntervalId = setInterval(() => this.fetchVLCStatus(), interval);
    }

    fetchVLCStatus() {
        const url = `http://${this.host}:${this.port}/requests/status.json`;
        const auth = Buffer.from(`:${this.password}`).toString('base64');

        const request = net.request({
            method: 'GET',
            url: url
        });

        request.setHeader('Authorization', `Basic ${auth}`);

        request.on('response', (response) => {
            let body = '';
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    if (response.statusCode === 200) {
                        const data = JSON.parse(body);
                        this.processVLCData(data);
                    }
                } catch (e) {
                    // Silently fail if VLC is not running or JSON is malformed
                }
            });
        });

        request.on('error', () => {
            // VLC likely not running or web interface disabled
        });

        request.end();
    }

    processVLCData(data) {
        const meta = data?.information?.category?.meta;
        if (!meta) return;

        const title = meta.title || meta.filename || 'Unknown Title';
        const artist = meta.artist || 'Unknown Artist';
        const position = data.time || 0; // seconds
        const duration = data.length || 0; // seconds
        const state = data.state === 'playing' ? 'Playing' : 'Paused';

        // Only update if something changed to avoid spamming the app
        this.updateApp(title, artist, position, duration, state);
    }

    /**
     * Optional: Clean VLC specific metadata if needed
     */
    onTransformMetadata(data) {
        // VLC sometimes adds file extensions if no tags are present
        if (data.title) {
            data.title = data.title.replace(/\.(mp3|flac|wav|m4a|ogg|mkv|mp4|avi)$/i, '');
        }
        return data;
    }
}

module.exports = VLCWebPlugin;
