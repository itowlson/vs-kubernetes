'use strict';

import * as vscode from 'vscode';
import * as shelljs from 'shelljs';

export function isWindows() : boolean {
    return (process.platform == 'win32');
}

export function isUnix() : boolean {
    return !isWindows();
}

export function execOpts() {
    var env = process.env;
    if (isWindows()) {
        var home = process.env['USERPROFILE'];
        env = Object.assign({ }, env, { 'HOME': home });
    }
    var opts = {
        'cwd': vscode.workspace.rootPath,
        'env': env,
        'async': true
    };
    return opts;
}

export function exec(cmd, handler) {
    try {
        execCore(cmd, execOpts(), handler);
    } catch (ex) {
        vscode.window.showErrorMessage(ex);
    }
}

export function execCore(cmd, opts, handler) {
    shelljs.exec(cmd, opts, handler);
}
