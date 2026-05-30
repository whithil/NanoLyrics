const fs = require('fs');
const path = require('path');

class PluginManager {
    constructor(pluginsPaths, updateCallback) {
        this.pluginsPaths = Array.isArray(pluginsPaths) ? pluginsPaths : [pluginsPaths];
        this.updateCallback = updateCallback;
        this.plugins = [];
        this.init();
    }

    init() {
        for (const pluginsPath of this.pluginsPaths) {
            if (!fs.existsSync(pluginsPath)) {
                try {
                    fs.mkdirSync(pluginsPath, { recursive: true });
                    console.log(`[PluginManager] Diretório de plugins garantido em: ${pluginsPath}`);
                } catch (err) {
                    console.error(`[PluginManager] Erro ao criar diretório ${pluginsPath}:`, err);
                    continue;
                }
            }

            const files = fs.readdirSync(pluginsPath);
            for (const file of files) {
                if (file.endsWith('.js')) {
                    try {
                        const pluginModule = require(path.join(pluginsPath, file));
                        // Espera-se que o plugin exporte uma classe ou objeto com os métodos do ciclo de vida
                        const plugin = typeof pluginModule === 'function' ? new pluginModule() : pluginModule;
                        
                        if (plugin.onLoad) plugin.onLoad(this.updateCallback);
                        this.plugins.push({ name: file, instance: plugin });
                        console.log(`[PluginManager] Plugin carregado: ${file} (de ${pluginsPath})`);
                    } catch (e) {
                        console.error(`[PluginManager] Falha ao carregar plugin: ${file}`, e);
                    }
                }
            }
        }
    }

    /**
     * Permite que os plugins modifiquem os metadados antes de serem processados pela App.
     * Útil para limpar títulos de jogos ou formatos específicos.
     */
    processMetadata(data) {
        let transformed = { ...data };
        for (const pluginInfo of this.plugins) {
            try {
                if (pluginInfo.instance.onTransformMetadata) {
                    transformed = pluginInfo.instance.onTransformMetadata(transformed);
                }
            } catch (err) {
                console.error(`[PluginManager] Erro no plugin ${pluginInfo.name} ao transformar metadados:`, err);
            }
        }
        return transformed;
    }

    broadcastMediaUpdate(data) {
        // data = { title, artist, position, duration, status }
        for (const pluginInfo of this.plugins) {
            try {
                if (pluginInfo.instance.onMediaUpdate) {
                    pluginInfo.instance.onMediaUpdate(data);
                }
            } catch (err) {
                console.error(`[PluginManager] Erro no plugin ${pluginInfo.name} ao processar evento media-update:`, err);
            }
        }
    }
}

module.exports = PluginManager;