/**
 * Plugin de Exemplo: Discord Rich Presence / External Logger
 * * Coloque este ficheiro na pasta "plugins" dentro de userData (AppData/Roaming/nomedaapp/plugins)
 * ou ajuste os caminhos para o ambiente de desenvolvimento.
 */

class DummyRPCPlugin {
    onLoad() {
        console.log('[DummyRPC] Plugin inicializado. A aguardar eventos de media...');
        // Aqui poderia inicializar o client discord-rpc, por exemplo:
        // this.rpc = require('discord-rpc');
        // this.rpc.login({ clientId: 'SEU_CLIENT_ID' });
    }

    onMediaUpdate(data) {
        const { title, artist, status } = data;
        
        // Evita floodar logs para a mesma música/status se não for necessário
        if (this.lastTitle === title && this.lastStatus === status) return;
        
        this.lastTitle = title;
        this.lastStatus = status;

        if (status === 'Playing') {
            console.log(`[DummyRPC] Enviar Presença: A ouvir ${artist} - ${title} 🎵`);
            // this.rpc.setActivity({ details: title, state: artist, largeImageKey: 'icon' });
        } else {
            console.log(`[DummyRPC] Enviar Presença: Pausado ⏸️`);
            // this.rpc.clearActivity();
        }
    }
}

module.exports = DummyRPCPlugin;