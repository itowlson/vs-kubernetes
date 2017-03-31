'use strict';

import * as vscode from 'vscode';
import * as shelljs from 'shelljs';

export function execOpts() {
    var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    var opts = {
        'cwd': vscode.workspace.rootPath,
        'env': {
            'HOME': home
        },
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
