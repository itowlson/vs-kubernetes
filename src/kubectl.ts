import * as vscode from 'vscode';
import * as fs from 'fs';
import { shell, ShellHandler } from './shell';

export type CheckMode = 'activation' | 'command';

export interface Kubectl {
    invoke(command : string, handler? : ShellHandler) : void;
    path() : string;
    checkPresent(checkMode : CheckMode, handler : () => void) : void;
}

export const kubectl : Kubectl = new KubectlImpl();

class KubectlImpl implements Kubectl {
    private kubectlFound = false;

    invoke(command : string, handler? : (result : number, stdout : string, stderr : string) => void) : void {
        this.kubectlInternal(command, handler || this.kubectlDone);
    }

    path() : string {
        return this.kubectlPath();
    }

    checkPresent(checkMode : CheckMode, handler : () => void) : void {
        this.checkForKubectl(checkMode, handler);
    }

    private kubectlDone(result : number, stdout : string, stderr : string) : void {
        if (result !== 0) {
            vscode.window.showErrorMessage("Kubectl command failed: " + stderr);
            console.log(stderr);
            return;
        }
        vscode.window.showInformationMessage(stdout);
    }

    private kubectlInternal(command : string, handler : (result : number, stdout : string, stderr : string) => void) : void {
        this.checkForKubectl('command', function () {
            var bin = this.baseKubectlPath();
            var cmd = bin + ' ' + command
            shell.exec(cmd, handler);
        });
    }

    private baseKubectlPath() : string {
        var bin = vscode.workspace.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];
        if (!bin) {
            bin = 'kubectl';
        }
        return bin;
    }

    private kubectlPath() : string {
        var bin = this.baseKubectlPath();
        if (shell.isWindows() && !(bin.endsWith('.exe'))) {
            bin = bin + '.exe';
        }
        return bin;
    }

    private checkForKubectl(errorMessageMode : CheckMode, handler : () => void) : void {
        if (this.kubectlFound) {
            handler();
            return;
        }
        this.checkForKubectlInternal(errorMessageMode, handler);
    }

    private checkForKubectlInternal(errorMessageMode : CheckMode, handler : () => void) {
        var contextMessage = this.getCheckKubectlContextMessage(errorMessageMode);
        var bin = vscode.workspace.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];
        if (!bin) {
            this.findBinary('kubectl', function (err, output) {
                if (err || output.length === 0) {
                    vscode.window.showErrorMessage('Could not find "kubectl" binary.' + contextMessage, 'Learn more').then(
                        function (str) {
                            if (str === 'Learn more') {
                                vscode.window.showInformationMessage('Add kubectl directory to path, or set "vs-kubernetes.kubectl-path" config to kubectl binary.');
                            }
                        }
                    );
                } else {
                    this.kubectlFound = true;
                    handler();
                }
            });
        } else {
            this.kubectlFound = fs.existsSync(bin);
            if (this.kubectlFound) {
                handler();
            } else {
                vscode.window.showErrorMessage(bin + ' does not exist!' + contextMessage);
            }
        }
    }

    private findBinary(binName : string, callback : (exitCode : number | null, output : string) => void) {
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

    private getCheckKubectlContextMessage(errorMessageMode : CheckMode) : string {
        if (errorMessageMode === 'activation') {
            return ' Kubernetes commands other than configuration will not function correctly.';
        } else if (errorMessageMode === 'command') {
            return ' Cannot execute command.';
        }
        return '';
    }
}
