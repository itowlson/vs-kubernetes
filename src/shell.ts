'use strict';

import * as vscode from 'vscode';
import * as shelljs from 'shelljs';

const WINDOWS = 'win32';

export type ShellHandler = (code : number, stdout : string, stderr : string) => void;

export interface Shell {
    isWindows() : boolean;
    isUnix() : boolean;
    home() : string;
    combinePath(basePath : string, relativePath : string) : string;
    execOpts() : any;
    exec(cmd : string, handler : ShellHandler) : void;
    execCore(cmd : string, opts : any, handler : ShellHandler) : void;
}

export const shell : Shell = new ShellImpl();

class ShellImpl implements Shell {
    isWindows() : boolean {
        return (process.platform === WINDOWS);
    }

    isUnix() : boolean {
        return !this.isWindows();
    }

    home() : string {
        var homeVar = this.isWindows() ? 'USERPROFILE' : 'HOME';
        return process.env[homeVar];
    }

    combinePath(basePath : string, relativePath : string) : string {
        var separator = '/';
        if (this.isWindows()) {
            relativePath = relativePath.replace(/\//g, '\\');
            separator = '\\';
        }
        return basePath + separator + relativePath;
    }

    execOpts() : any {
        var env = process.env;
        if (this.isWindows()) {
            env = Object.assign({ }, env, { 'HOME': this.home() });
        }
        var opts = {
            'cwd': vscode.workspace.rootPath,
            'env': env,
            'async': true
        };
        return opts;
    }

    exec(cmd : string, handler : ShellHandler) : void {
        try {
            this.execCore(cmd, this.execOpts(), handler);
        } catch (ex) {
            vscode.window.showErrorMessage(ex);
        }
    }

    execCore(cmd : string, opts : any, handler : ShellHandler) {
        shelljs.exec(cmd, opts, handler);
    }
}
