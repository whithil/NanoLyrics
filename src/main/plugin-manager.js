const fs = require('fs');
const path = require('path');
const configManager = require('./config-manager');

class PluginManager {
    constructor(pluginsPaths, updateCallback) {
        this.pluginsPaths = Array.isArray(pluginsPaths) ? pluginsPaths : [pluginsPaths];
        this.updateCallback = updateCallback;
        this.plugins = []; // Loaded plugins
        this.availablePlugins = []; // Metadata of all discovered plugins
    }

    init() {
        const config = configManager.getConfig();
        const disabled = config.disabledPlugins || [];

        this.plugins = [];
        this.availablePlugins = [];

        for (const pluginsPath of this.pluginsPaths) {
            if (!fs.existsSync(pluginsPath)) continue;

            const files = fs.readdirSync(pluginsPath);
            for (const file of files) {
                if (file.endsWith('.js')) {
                    const pluginPath = path.resolve(path.join(pluginsPath, file));
                    try {
                        delete require.cache[pluginPath];
                        const pluginModule = require(pluginPath);
                        const plugin = typeof pluginModule === 'function' ? new pluginModule() : pluginModule;
                        
                        const metadata = {
                            id: file,
                            name: plugin.name || file,
                            description: plugin.description || '',
                            instructions: plugin.instructions || '',
                            enabled: !disabled.includes(file)
                        };

                        this.availablePlugins.push(metadata);

                        if (metadata.enabled) {
                            if (plugin.onLoad) {
                                plugin.onLoad(this.updateCallback);
                            }
                            this.plugins.push({ name: file, instance: plugin });
                            console.log(`[PluginManager] Loaded: ${file}`);
                        } else {
                            console.log(`[PluginManager] Skipped (Disabled): ${file}`);
                        }
                    } catch (e) {
                        console.error(`[PluginManager] Error loading ${file}:`, e);
                    }
                }
            }
        }
    }

    getAvailablePlugins() {
        return this.availablePlugins;
    }

    processMetadata(data) {
        let transformed = { ...data };
        for (const pluginInfo of this.plugins) {
            try {
                if (pluginInfo.instance.onTransformMetadata) {
                    transformed = pluginInfo.instance.onTransformMetadata(transformed);
                }
            } catch (err) {
                console.error(`[PluginManager] Error in plugin ${pluginInfo.name}:`, err);
            }
        }
        return transformed;
    }

    broadcastMediaUpdate(data) {
        for (const pluginInfo of this.plugins) {
            try {
                if (pluginInfo.instance.onMediaUpdate) {
                    pluginInfo.instance.onMediaUpdate(data);
                }
            } catch (err) {
                console.error(`[PluginManager] Error in plugin ${pluginInfo.name}:`, err);
            }
        }
    }
}

module.exports = PluginManager;
