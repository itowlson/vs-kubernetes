import * as vscode from 'vscode';
import * as fs from 'fs';
import * as shell from './shell';

let kubectlFound = false;

export function checkPresent(errorMessageMode, handler) {
    if (kubectlFound) {
        handler();
        return;
    }
    checkPresentInternal(errorMessageMode, handler);
}

function checkPresentInternal(errorMessageMode, handler) {
    var contextMessage = getCheckKubectlContextMessage(errorMessageMode);
    var bin = vscode.workspace.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];
    if (!bin) {
        findBinary('kubectl', function (err, output) {
            if (err || output.length === 0) {
                vscode.window.showErrorMessage('Could not find "kubectl" binary.' + contextMessage, 'Learn more').then(
                    function (str) {
                        if (str === 'Learn more') {
                            vscode.window.showInformationMessage('Add kubectl directory to path, or set "vs-kubernetes.kubectl-path" config to kubectl binary.');
                        }
                    }
                );
            } else {
                kubectlFound = true;
                handler();
            }
        });
    } else {
        kubectlFound = fs.existsSync(bin);
        if (kubectlFound) {
            handler();
        } else {
            vscode.window.showErrorMessage(bin + ' does not exist!' + contextMessage);
        }
    }
}

function getCheckKubectlContextMessage(errorMessageMode) {
    if (errorMessageMode === 'activation') {
        return ' Kubernetes commands other than configuration will not function correctly.';
    } else if (errorMessageMode === 'command') {
        return ' Cannot execute command.';
    }
    return '';
}

function kubectlDone(result, stdout, stderr) {
    if (result !== 0) {
        vscode.window.showErrorMessage("Kubectl command failed: " + stderr);
        console.log(stderr);
        return;
    }
    vscode.window.showInformationMessage(stdout);
}

export function invoke(command : string, callback? : (result : number, stdout : string, stderr : string) => void) {
    invokeInternal(command, callback || kubectlDone);
}

function invokeInternal(command : string, handler : (result : number, stdout : string, stderr : string) => void) {
    checkPresent('command', function () {
        var bin = baseKubectlPath();
        var cmd = bin + ' ' + command;
        shell.exec(cmd, handler);
    });
}

function baseKubectlPath() {
    var bin = vscode.workspace.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];
    if (!bin) {
        bin = 'kubectl';
    }
    return bin;
}

export function kubectlPath() {
    var bin = baseKubectlPath();
    if (process.platform == 'win32' && !(bin.endsWith('.exe'))) {
        bin = bin + '.exe';
    }
    return bin;
}

function findBinary(binName, callback) {
    let cmd = `which ${binName}`

    if (shell.isWindows()) {
        cmd = `where.exe ${binName}.exe`;
    }

    const opts = {
        'async': true,
        'env': {
            'HOME': process.env.HOME,
            'PATH': process.env.PATH
        }
    }

    shell.execCore(cmd, opts, function (code, stdout, stderr) {
        if (code) {
            callback(code, stderr);
        } else {
            callback(null, stdout);
        }
    });
}
