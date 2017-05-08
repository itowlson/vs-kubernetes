import * as vscode from 'vscode';
import * as fs from 'fs';
import * as shell from './shell';

let kubectlFound = false;

export function checkPresent(errorMessageMode, handler?) {
    if (!kubectlFound) {
        checkForKubectlInternal(errorMessageMode, handler);
        return;
    }

    handler();
}

function checkForKubectlInternal(errorMessageMode, handler) {
    const
        contextMessage = getCheckKubectlContextMessage(errorMessageMode),
        bin = vscode.workspace.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];

    if (!bin) {
        findBinary('kubectl', (err, output) => {
            if (err || output.length === 0) {
                vscode.window.showErrorMessage('Could not find "kubectl" binary.' + contextMessage, 'Learn more').then(
                    (str) => {
                        if (str !== 'Learn more') {
                            return;
                        }

                        vscode.window.showInformationMessage('Add kubectl directory to path, or set "vs-kubernetes.kubectl-path" config to kubectl binary.');
                    }
                );

                return;
            }

            kubectlFound = true;

            if (handler) {
                handler();
            }
        });

        return;
    }

    kubectlFound = fs.existsSync(bin);
    if (!kubectlFound) {
        vscode.window.showErrorMessage(bin + ' does not exist!' + contextMessage);
        return;
    }

    handler();
}

function getCheckKubectlContextMessage(errorMessageMode) {
    if (errorMessageMode === 'activation') {
        return ' Kubernetes commands other than configuration will not function correctly.';
    } else if (errorMessageMode === 'command') {
        return ' Cannot execute command.';
    }
    return '';
}

export function invoke(command, handler?) {
    kubectlInternal(command, handler || kubectlDone);
}

function kubectlInternal(command, handler) {
    checkPresent('command', () => {
        const bin = baseKubectlPath();
        let cmd = bin + ' ' + command
        shell.exec(cmd, handler);
    });
}

function kubectlDone(result, stdout, stderr) {
    if (result !== 0) {
        vscode.window.showErrorMessage('Kubectl command failed: ' + stderr);
        console.log(stderr);
        return;
    }

    vscode.window.showInformationMessage(stdout);
}

function baseKubectlPath() {
    let bin = vscode.workspace.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];
    if (!bin) {
        bin = 'kubectl';
    }
    return bin;
}

export function path() {
    let bin = baseKubectlPath();
    if (shell.isWindows() && !(bin.endsWith('.exe'))) {
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
        async: true,
        env: {
            HOME: process.env.HOME,
            PATH: process.env.PATH
        }
    }

    shell.execCore(cmd, opts, (code, stdout, stderr) => {
        if (code) {
            callback(code, stderr);
            return;
        }

        callback(null, stdout);
    });
}

