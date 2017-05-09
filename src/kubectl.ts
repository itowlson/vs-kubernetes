import { Host } from './host';
import { FS } from './fs';
import { Shell, ShellHandler } from './shell';

export interface Kubectl {
    checkPresent(errorMessageMode : CheckPresentMessageMode, handler? : () => void) : void;
    invoke(command : string, handler? : ShellHandler) : void;
    path() : string;
}

interface Context {
    readonly host : Host;
    readonly fs : FS;
    readonly shell : Shell;
}

class KubectlImpl implements Kubectl {
    constructor(host : Host, fs : FS, shell : Shell) {
        this.context = { host : host, fs : fs, shell : shell };
    }

    private readonly context : Context;

    checkPresent(errorMessageMode : CheckPresentMessageMode, handler? : () => void) : void {
        return checkPresent(this.context, errorMessageMode, handler);
    }
    invoke(command : string, handler? : ShellHandler) : void {
        return invoke(this.context, command, handler);
    }
    path() : string {
        return path(this.context);
    }
}

export function create(host : Host, fs : FS, shell : Shell) : Kubectl {
    return new KubectlImpl(host, fs, shell);
}

let kubectlFound = false;

type CheckPresentMessageMode = 'command' | 'activation';

function checkPresent(context : Context, errorMessageMode : CheckPresentMessageMode, handler? : () => void) : void {
    if (!kubectlFound) {
        checkForKubectlInternal(context, errorMessageMode, handler);
        return;
    }

    handler();
}

function checkForKubectlInternal(context : Context, errorMessageMode : CheckPresentMessageMode, handler : () => void) : void {
    const
        contextMessage = getCheckKubectlContextMessage(errorMessageMode),
        bin = context.host.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];

    if (!bin) {
        findBinary(context, 'kubectl', (err, output) => {
            if (err || output.length === 0) {
                context.host.showErrorMessage('Could not find "kubectl" binary.' + contextMessage, 'Learn more').then(
                    (str) => {
                        if (str !== 'Learn more') {
                            return;
                        }

                        context.host.showInformationMessage('Add kubectl directory to path, or set "vs-kubernetes.kubectl-path" config to kubectl binary.');
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

    kubectlFound = context.fs.existsSync(bin);
    if (!kubectlFound) {
        context.host.showErrorMessage(bin + ' does not exist!' + contextMessage);
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

function invoke(context : Context, command : string, handler? : ShellHandler) : void {
    kubectlInternal(context, command, handler || kubectlDone(context));
}

function kubectlInternal(context : Context, command : string, handler : ShellHandler) : void {
    checkPresent(context, 'command', () => {
        const bin = baseKubectlPath(context);
        let cmd = bin + ' ' + command
        context.shell.exec(cmd).then(({code, stdout, stderr}) => handler(code, stdout, stderr));
    });
}

function kubectlDone(context : Context) : ShellHandler {
    return (result : number, stdout : string, stderr : string) => {
        if (result !== 0) {
            context.host.showErrorMessage('Kubectl command failed: ' + stderr);
            console.log(stderr);
            return;
        }

        context.host.showInformationMessage(stdout);
    };
}

function baseKubectlPath(context : Context) : string {
    let bin = context.host.getConfiguration('vs-kubernetes')['vs-kubernetes.kubectl-path'];
    if (!bin) {
        bin = 'kubectl';
    }
    return bin;
}

function path(context : Context) : string {
    let bin = baseKubectlPath(context);
    if (context.shell.isWindows() && !(bin.endsWith('.exe'))) {
        bin = bin + '.exe';
    }
    return bin;
}

function findBinary(context : Context, binName : string, callback : (errno : number | null, text : string) => void) {
    let cmd = `which ${binName}`;

    if (context.shell.isWindows()) {
        cmd = `where.exe ${binName}.exe`;
    }

    const opts = {
        async: true,
        env: {
            HOME: process.env.HOME,
            PATH: process.env.PATH
        }
    }

    context.shell.execCore(cmd, opts).then(({code, stdout, stderr}) => {
        if (code) {
            callback(code, stderr);
            return;
        }

        callback(null, stdout);
    });
}

