/**
 * NanoLyrics Plugin: osu!lazer Metadata Enhancer
 * Professionalized for v0.2.0
 */

const { net } = require('electron');
const { exec } = require('child_process');

class OsuLazerPlugin {
    constructor() {
        this.name = 'osu! (Stable/Lazer) Support';
        this.description = 'High-precision metadata for osu! (Stable/Lazer). Supports menu music tracking via TOSU.';
        this.instructions = 'To track menu music and gameplay accurately without needing to enter a match, download and run <b>TOSU</b> from <a href="https://github.com/tosuapp/tosu">GitHub</a>. NanoLyrics will automatically connect to TOSU\'s local API.';
    }

    onLoad(updateApp) {
        this.updateApp = updateApp;
        this.lastTitle = '';
        this.isOsuActive = false;
        this.pollIntervalId = null;

        console.log('[osu! Support] Plugin loaded.');
        
        this.startPolling(2000); // Start with default 2-second polling
    }

    startPolling(interval) {
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
        }
        this.pollIntervalId = setInterval(() => this.pollOsuData(), interval);
        console.log(`[osu! Support] Polling started with ${interval}ms interval.`);
    }

    pollOsuData() {
        // 1. Try gosuMemory API (Priority: High precision)
        const request = net.request('http://127.0.0.1:24050/json');
        
        request.on('response', (response) => {
            let body = '';
            
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    if (response.statusCode !== 200) throw new Error(`Status ${response.statusCode}`);
                    const data = JSON.parse(body);
                    
                    const title = data?.menu?.bm?.metadata?.title;
                    const artist = data?.menu?.bm?.metadata?.artist;
                    const pos = (data?.menu?.bm?.time?.current || 0) / 1000;
                    const dur = (data?.menu?.bm?.time?.full || 0) / 1000;
                    const status = data?.menu?.state === 2 ? 'Playing' : 'Paused';

                    if (title !== undefined && title !== null) {
                        this.isOsuActive = true;
                        this.updateApp(title || 'Unknown Title', artist || 'Unknown Artist', pos, dur, status);
                    } else {
                        this.sniffWindowTitle();
                    }
                } catch (e) { 
                    this.sniffWindowTitle();
                }
            });
        });

        request.on('error', () => {
            this.sniffWindowTitle();
        });

        request.end();
    }

    sniffWindowTitle() {
        // PowerShell command to get the main window title of an osu! process
        const cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -Name *osu* -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -like \'osu!*\'} | Select-Object -ExpandProperty MainWindowTitle"';
        exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) {
                this.isOsuActive = false;
                return;
            }

            const lines = stdout.trim().split(/\r?\n/);
            const rawTitle = lines[lines.length - 1].trim();
            
            // Regex match for: osu! [Artist - Title [Difficulty]]
            const lazerMatch = rawTitle.match(/osu!\s+\[(.+?)\s-\s(.+?)\s\[.+?\]\]/);
            
            if (lazerMatch) {
                const artist = lazerMatch[1].trim();
                const title = lazerMatch[2].trim();
                
                if (title !== this.lastTitle) {
                    this.lastTitle = title;
                    this.isOsuActive = true;
                    // Window title doesn't provide real progress, reporting 0
                    this.updateApp(title, artist, 0, 0, 'Playing');
                }
            }
        });
    }

    /**
     * Intercepts metadata and removes osu!-specific elements that might hinder lyrics searching.
     */
    onTransformMetadata(data) {
        if (data.title) {
            data.title = data.title
                .replace(/\[[^\]]*\]\s*$/g, '') 
                .replace(/\s*\([^)]*\)\s*$/g, '')
                .replace(/\s*\([^)]*\)\s*$/g, '') 
                .replace(/^[-\s]+|[-\s]+$/g, '') 
                .trim();
        }
        return data;
    }

    onMediaUpdate(data) {
        // Metadata processing hook
    }
}

module.exports = OsuLazerPlugin;
