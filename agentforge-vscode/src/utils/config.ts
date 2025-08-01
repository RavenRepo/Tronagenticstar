import * as vscode from 'vscode';

export class Config {
    private readonly section = 'agentforge';

    get<T>(key: string, defaultValue?: T): T {
        const config = vscode.workspace.getConfiguration(this.section);
        return config.get<T>(key, defaultValue as T);
    }

    async set(key: string, value: any, target?: vscode.ConfigurationTarget) {
        const config = vscode.workspace.getConfiguration(this.section);
        await config.update(key, value, target || vscode.ConfigurationTarget.Global);
    }

    getOrchestratorUrl(): string {
        return this.get('orchestratorUrl', 'http://localhost:3000');
    }

    getApiKey(): string | undefined {
        return this.get('apiKey');
    }

    isRealTimeUpdatesEnabled(): boolean {
        return this.get('enableRealTimeUpdates', true);
    }

    getLogLevel(): string {
        return this.get('logLevel', 'info');
    }

    async setOrchestratorUrl(url: string) {
        await this.set('orchestratorUrl', url);
    }

    async setApiKey(apiKey: string) {
        await this.set('apiKey', apiKey);
    }

    async setRealTimeUpdates(enabled: boolean) {
        await this.set('enableRealTimeUpdates', enabled);
    }

    async setLogLevel(level: string) {
        await this.set('logLevel', level);
    }
}
