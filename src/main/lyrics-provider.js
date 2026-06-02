const { net } = require('electron');
const path = require('path');
const fs = require('fs');
const configManager = require('./config-manager');

class LyricsProvider {
    constructor() {
        this.activeFetchId = 0;
    }

    cleanMusicTitle(title) {
        if (!title) return '';
        return title
            .replace(/[^\w\s]*\s*(official\s+\w+|original\s+\w+|lyric\s+video|full\s+ver)\s*[^\w\s]*/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async fetchLyrics(title, artist, duration, customQuery = null) {
        if (!title && !customQuery) {
            return "[00:00.00] NanoLyrics: Pronto para música...\n";
        }

        const appConfig = configManager.getConfig();
        const cleanTitle = customQuery || this.cleanMusicTitle(title);
        const cleanArtist = artist ? artist.trim() : '';
        const cacheKey = customQuery ? `override_${customQuery}` : `${cleanArtist} - ${cleanTitle}`;
        const cacheFile = path.join(appConfig.cachePath, cacheKey.replace(/[^a-zA-Z0-9\s.\-_]/g, '').trim() + '.lrc');

        if (fs.existsSync(cacheFile)) {
            try {
                return fs.readFileSync(cacheFile, 'utf-8');
            } catch (err) {
                console.error('Error reading lyrics cache:', err);
            }
        }

        try {
            let data = null;
            if (customQuery) {
                const searchUrl = new URL('https://lrclib.net/api/search');
                searchUrl.searchParams.append('q', customQuery);
                const searchResponse = await net.fetch(searchUrl.toString());
                if (searchResponse.ok) {
                    const searchResults = await searchResponse.json();
                    if (searchResults && searchResults.length > 0) data = searchResults[0];
                }
            } else {
                const getUrl = new URL('https://lrclib.net/api/get');
                getUrl.searchParams.append('track_name', cleanTitle);
                if (cleanArtist) getUrl.searchParams.append('artist_name', cleanArtist);
                if (duration && duration > 0) getUrl.searchParams.append('duration', Math.round(duration));
                
                let response = await net.fetch(getUrl.toString());
                if (response.ok) {
                    data = await response.json();
                } else {
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
                else if (data.plainLyrics) lrcContent = `[00:00.00]`; // Placeholder for plain lyrics
                else if (data.instrumental) lrcContent = `[00:00.00]\n`;
            }

            if (lrcContent) {
                fs.writeFileSync(cacheFile, lrcContent, 'utf-8');
                return lrcContent;
            }
        } catch (err) {
            console.error('Error fetching lyrics from LRCLIB:', err);
        }
        return `[00:00.00]`;
    }

    getNextFetchId() {
        return ++this.activeFetchId;
    }
}

module.exports = new LyricsProvider();
