const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class I18nManager {
    constructor() {
        this.localesPath = path.join(app.getAppPath(), 'locales');
        this.currentLocale = 'en-US';
        this.translations = {};
        this.init();
    }

    init() {
        // Detect system locale
        const systemLocale = app.getLocale();
        console.log(`[i18n] System locale detected: ${systemLocale}`);

        // Map system locale to supported locales
        if (systemLocale.startsWith('pt')) this.currentLocale = 'pt-BR';
        else if (systemLocale.startsWith('fr')) this.currentLocale = 'fr-FR';
        else this.currentLocale = 'en-US';

        this.loadTranslations(this.currentLocale);
        this.addPlatformStrings();
    }

    addPlatformStrings() {
        // Tricked from detected OS
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'Command' : 'Ctrl';
        
        // Inject into translations dynamically if not already there
        if (!this.translations.common) this.translations.common = {};
        this.translations.common.modifier = modifier;
    }

    loadTranslations(locale) {
        const filePath = path.join(this.localesPath, `${locale}.json`);
        if (fs.existsSync(filePath)) {
            try {
                this.translations = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                this.currentLocale = locale;
                console.log(`[i18n] Loaded translations for: ${locale}`);
            } catch (err) {
                console.error(`[i18n] Error loading locale file ${locale}:`, err);
                // Fallback to en-US if not already there
                if (locale !== 'en-US') this.loadTranslations('en-US');
            }
        } else if (locale !== 'en-US') {
            console.warn(`[i18n] Locale file for ${locale} not found. Falling back to en-US.`);
            this.loadTranslations('en-US');
        }
    }

    t(keyPath) {
        const keys = keyPath.split('.');
        let result = this.translations;
        for (const key of keys) {
            if (result[key] === undefined) {
                console.warn(`[i18n] Translation key not found: ${keyPath}`);
                return keyPath;
            }
            result = result[key];
        }
        return result;
    }

    getTranslations() {
        return this.translations;
    }
}

module.exports = new I18nManager();
