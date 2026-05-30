/**
 * NanoLyrics Plugin: osu!lazer Metadata Enhancer
 */

const { net } = require('electron');
const { exec } = require('child_process');

class OsuLazerPlugin {
    onLoad(updateApp) {
        this.updateApp = updateApp;
        this.lastTitle = '';
        this.isOsuActive = false;
        this.pollIntervalId = null; // To store the interval ID

        console.log('[osu!lazer] Plugin carregado.');
        
        this.startPolling(2000); // Start with default 2-second polling
    }

    startPolling(interval) {
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
        }
        this.pollIntervalId = setInterval(() => this.pollOsuData(), interval);
        console.log(`[osu!lazer] Polling iniciado com intervalo de ${interval}ms.`);
    }

    pollOsuData() {
        // 1. Tentar gosuMemory API (Prioridade: Alta precisão)
        const request = net.request('http://127.0.0.1:24050/json');
        
        request.on('response', (response) => {
            let body = '';
            
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    if (response.statusCode !== 200) throw new Error(`Status ${response.statusCode}`);
                    const data = JSON.parse(body);
                    
                    // Defensive check for nested properties
                    const title = data?.menu?.bm?.metadata?.title;
                    const artist = data?.menu?.bm?.metadata?.artist;
                    const pos = (data?.menu?.bm?.time?.current || 0) / 1000;
                    const dur = (data?.menu?.bm?.time?.full || 0) / 1000;
                    const status = data?.menu?.state === 2 ? 'Playing' : 'Paused';

                    if (this.debugPollingActive) {
                        console.log(`[osu!lazer] [DEBUG] API Sincronizada: ${artist} - ${title} [${status}]`);
                    }

                    if (title !== undefined && title !== null) {
                        this.isOsuActive = true;
                        this.updateApp(title || 'Unknown Title', artist || 'Unknown Artist', pos, dur, status);
                    } else if (this.debugPollingActive) {
                        console.warn('[osu!lazer] [DEBUG] JSON recebido mas "title" está ausente.');
                    }
                } catch (e) { 
                    if (this.debugPollingActive) console.warn('[osu!lazer] [DEBUG] Erro no processamento:', e.message);
                    this.sniffWindowTitle();
                }
            });
        });

        request.on('error', (err) => {
            if (this.debugPollingActive) {
                console.log(`[osu!lazer] [DEBUG] API indisponível (${err.message}). Tentando Window Sniffing...`);
            }
            this.sniffWindowTitle();
        });

        request.end();
    }

    sniffWindowTitle() {
        if (this.debugPollingActive) {
            console.log('[osu!lazer] [DEBUG] Consultando título da janela via PowerShell...');
        }
        const cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -Name *osu* -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -like \'osu!*\'} | Select-Object -ExpandProperty MainWindowTitle"';
        exec(cmd, (err, stdout) => {
            if (err || !stdout.trim()) {
                if (err && this.debugPollingActive) console.error('[osu!lazer] [DEBUG] PowerShell falhou:', err.message);
                this.isOsuActive = false;
                return;
            }

            const lines = stdout.trim().split(/\r?\n/);
            const rawTitle = lines[lines.length - 1].trim();
            
            // Regex: osu! [Artist - Title [Difficulty]]
            const lazerMatch = rawTitle.match(/osu!\s+\[(.+?)\s-\s(.+?)\s\[.+?\]\]/);
            
            if (lazerMatch) {
                const artist = lazerMatch[1].trim();
                const title = lazerMatch[2].trim();
                
                if (title !== this.lastTitle) {
                    this.lastTitle = title;
                    this.isOsuActive = true;
                    // Window title não dá progresso real, reportamos como 0
                    this.updateApp(title, artist, 0, 0, 'Playing');
                }
            }
        });
    }

    /**
     * Intercepta os metadados e remove elementos específicos do osu! que atrapalham a busca de letras.
     */
    onTransformMetadata(data) {
        if (data.title) {
            // Remove elementos específicos do osu! que aparecem no RPC/Título da Janela
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
        // Exemplo: Logging do mapper se ainda estiver presente nos dados originais
        // (Aqui 'data' já passou pelo transformMetadata na app principal)
    }
}

module.exports = OsuLazerPlugin;