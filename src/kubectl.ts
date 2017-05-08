import { host } from './host';
import { fs } from './fs';
import { shell, ShellHandler } from './shell';

let kubectlFound = false;

type CheckPresentMessageMode = 'command' | 'activation';

export function checkPresent(errorMessageMode : CheckPresentMessageMode, handler? : () => void) : void {
    if (!kubectlFound) {
        checkForKubectlInternal(errorMessageMode, handler);
        return;
    }

    handler();
}

function checkForKubectlInternal(errorMessageMode : CheckPresentMessageMode, handler : () => void) : void {
    const
        contextMessage = getCheckKubectlContextMessage(errorMessageMode),
        bin = host.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];

    if (!bin) {
        findBinary('kubectl', (err, output) => {
            if (err || output.length === 0) {
                host.showErrorMessage('Could not find "kubectl" binary.' + contextMessage, 'Learn more').then(
                    (str) => {
                        if (str !== 'Learn more') {
                            return;
                        }

                        host.showInformationMessage('Add kubectl directory to path, or set "vs-kubernetes.kubectl-path" config to kubectl binary.');
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
        host.showErrorMessage(bin + ' does not exist!' + contextMessage);
        return;
    }

    handler();
}

function getCheckKubectlContextMessage(errorMessageMode : CheckPresentMessageMode) : string {
    if (errorMessageMode === 'activation') {
        return ' Kubernetes commands other than configuration will not function correctly.';
    } else if (errorMessageMode === 'command') {
        return ' Cannot execute command.';
    }
    return '';
}

export function invoke(command : string, handler? : ShellHandler) : void {
    kubectlInternal(command, handler || kubectlDone);
}

function kubectlInternal(command : string, handler : ShellHandler) : void {
    checkPresent('command', () => {
        const bin = baseKubectlPath();
        let cmd = bin + ' ' + command
        shell.exec(cmd).then(({code, stdout, stderr}) => handler(code, stdout, stderr));
    });
}

function kubectlDone(result : number, stdout : string, stderr : string) : void {
    if (result !== 0) {
        host.showErrorMessage('Kubectl command failed: ' + stderr);
        console.log(stderr);
        return;
    }

    host.showInformationMessage(stdout);
}

function baseKubectlPath() : string {
    let bin = host.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];
    if (!bin) {
        bin = 'kubectl';
    }
    return bin;
}

export function path() : string {
    let bin = baseKubectlPath();
    if (shell.isWindows() && !(bin.endsWith('.exe'))) {
        bin = bin + '.exe';
    }
    return bin;
}

function findBinary(binName : string, callback : (errno : number | null, text : string) => void) {
    let cmd = `which ${binName}`;

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

    shell.execCore(cmd, opts).then(({code, stdout, stderr}) => {
        if (code) {
            callback(code, stderr);
            return;
        }

        callback(null, stdout);
    });
}

