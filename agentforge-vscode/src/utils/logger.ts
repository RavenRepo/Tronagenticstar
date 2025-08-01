import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('AgentForge');
    }

    private log(level: string, message: string, ...args: any[]) {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${level}] ${message}`;
        
        if (args.length > 0) {
            console.log(formattedMessage, ...args);
            this.outputChannel.appendLine(`${formattedMessage} ${JSON.stringify(args)}`);
        } else {
            console.log(formattedMessage);
            this.outputChannel.appendLine(formattedMessage);
        }
    }

    debug(message: string, ...args: any[]) {
        this.log('DEBUG', message, ...args);
    }

    info(message: string, ...args: any[]) {
        this.log('INFO', message, ...args);
    }

    warn(message: string, ...args: any[]) {
        this.log('WARN', message, ...args);
    }

    error(message: string, ...args: any[]) {
        this.log('ERROR', message, ...args);
    }

    show() {
        this.outputChannel.show();
    }
}

export const logger = new Logger();
