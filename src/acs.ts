'use strict';

import { QuickPickItem, TextDocumentContentProvider, Uri, EventEmitter, Event, ProviderResult, CancellationToken } from 'vscode';
import { host } from './host';
import { shell } from './shell';
import { fs } from './fs';

export const uriScheme : string = "acsconfigure";

export function operationUri(operationId: string) : Uri {
    return Uri.parse(`${uriScheme}://operations/${operationId}`);
}

export function uiProvider() : TextDocumentContentProvider & Advanceable {
    return new UIProvider();
}

export interface Advanceable {
    start(operationId: string) : void;
    next(request: UIRequest): Promise<void>;
}

export interface Errorable<T> {
    readonly succeeded: boolean;
    readonly result: T;
    readonly error: string;
}

export interface UIRequest {
    readonly operationId: string;
    readonly requestData: any;
}

export interface OperationStatus {
    readonly stage: OperationStage;
    readonly lastActionDescription: string;
    readonly lastResult: Errorable<any>;
}

enum OperationStage {
    Initial,
    CheckedPrerequisites,
    PromptedForSubscription,
    PromptedForCluster,
    Complete,
}

class OperationMap {

    private operations: any = {};

    set(operationId: string, operationContext: OperationStatus) {
        this.operations[operationId] = operationContext;
    }

    get(operationId: string) : OperationStatus {
        return this.operations[operationId];
    }

}

class UIProvider implements TextDocumentContentProvider, Advanceable {

	private _onDidChange: EventEmitter<Uri> = new EventEmitter<Uri>();
    readonly onDidChange: Event<Uri> = this._onDidChange.event;

    private operations: OperationMap = new OperationMap;

    provideTextDocumentContent(uri: Uri, token: CancellationToken) : ProviderResult<string> {
        return uri.toString() + ' is at stage ' + this.operations.get(uri.path.substr(1)).stage;
    }

    start(operationId: string): void {
        this.operations.set(operationId, { stage: OperationStage.Initial, lastActionDescription: '', lastResult: { succeeded: true, result: null, error: '' } });
        this._onDidChange.fire(operationUri(operationId));
    }

    next(request: UIRequest): Promise<void> {
        this._onDidChange.fire(operationUri(request.operationId));
        return undefined;
    }
}

export function verifyPrerequisites(onSatisfied, onFailure) {
    const errors = new Array<String>();

    shell.exec('az --help').then(({code, stdout, stderr}) => {
        if (code != 0 || stderr) {
            errors.push('Azure CLI 2.0 not found - install Azure CLI 2.0 and log in');
        }

        prereqCheckSSHKeys(errors);

        if (errors.length === 0) {
            onSatisfied();
        } else {
            onFailure(errors);
        }
    });
}

function prereqCheckSSHKeys(errors: Array<String>) {
    const sshKeyFile = shell.combinePath(shell.home(), '.ssh/id_rsa');
    if (!fs.existsSync(sshKeyFile)) {
        errors.push('SSH keys not found - expected key file at ' + sshKeyFile);
    }
}

export function selectSubscription(onSelection, onNone, onError) {
    shell.exec("az account list --all --query [*].name -ojson").then(({code, stdout, stderr}) => {
        if (code === 0 && !stderr) {  // az account list returns exit code 0 even if not logged in
            const accountNames = JSON.parse(stdout);
            switch (accountNames.length) {
                case 0:
                    onNone();
                    break;
                case 1:
                    onSelection(accountNames[0]);
                    break;
                default:
                    // We avoid using the default subscription because if the
                    // user has just logged in then it will be set to the first
                    // one in the list.  As configuration is an infrequent operation,
                    // it's better to ask and be sure.
                    host.showQuickPick(accountNames, { placeHolder: "Select Azure subscription" }).then((subName) => {
                        if (!subName) {
                            return;
                        }

                        host.showWarningMessage('This will select ' + subName + ' for all Azure CLI operations.', 'OK').then((choice) => {
                            if (choice !== 'OK') {
                                return;
                            }

                            shell.exec('az account set --subscription "' + subName + '"').then(({code, stdout, stderr}) => {
                                if (code === 0 && !stderr) {
                                    onSelection(subName);
                                } else {
                                    onError(stderr);
                                }
                            });
                        });
                    });
            }
        } else {
            onError(stderr);
        }

    });
}

export function selectKubernetesClustersFromActiveSubscription(onSelection, onNone, onError) {
    let query = '[?orchestratorProfile.orchestratorType==`Kubernetes`].{name:name,resourceGroup:resourceGroup}';
    if (shell.isUnix()) {
        query = `'${query}'`;
    }
    shell.exec(`az acs list --query ${query} -ojson`).then(({code, stdout, stderr}) => {
        if (code === 0 && !stderr) {
            const clusters: Cluster[] = JSON.parse(stdout);
            switch (clusters.length) {
                case 0:
                    onNone();
                    break;
                case 1:
                    host.showInformationMessage(`This will configure Kubernetes to use cluster ${clusters[0].name}`, "OK").then((choice) => {
                        if (choice == 'OK') {
                            onSelection(clusters[0]);
                        }
                    });
                    break;
                default:
                    let items = clusters.map((cluster) => clusterQuickPick(cluster));
                    host.showQuickPick(items, { placeHolder: "Select Kubernetes cluster" }).then((item) => {
                        if (item) {
                            onSelection(item.cluster);
                        }
                    });
            }
        } else {
            onError(stderr);
        }
    });
}

export function installCli(onInstall, onError) {
    let installDir, installFile, cmd;
    const cmdCore = 'az acs kubernetes install-cli';
    const isWindows = shell.isWindows();
    if (isWindows) {
        // The default Windows install location requires admin permissions; install
        // into a user profile directory instead. We process the path explicitly
        // instead of using %LOCALAPPDATA% in the command, so that we can render the
        // physical path when notifying the user.
        const appDataDir = process.env['LOCALAPPDATA'];
        installDir = appDataDir + '\\kubectl';
        installFile = installDir + '\\kubectl.exe';
        cmd = `(if not exist "${installDir}" md "${installDir}") & ${cmdCore} --install-location="${installFile}"`;
    } else {
        // Bah, the default Linux install location requires admin permissions too!
        // Fortunately, $HOME/bin is on the path albeit not created by default.
        const homeDir = process.env['HOME'];
        installDir = homeDir + '/bin';
        installFile = installDir + '/kubectl';
        cmd = `mkdir -p "${installDir}" ; ${cmdCore} --install-location="${installFile}"`;
    }
    shell.exec(cmd).then(({code, stdout, stderr}) => {
        if (code === 0) {
            const onDefaultPath = !isWindows;
            onInstall(installFile, onDefaultPath);
        } else {
            onError(stderr);
        }
    });
}

export function getCredentials(cluster: Cluster, onSuccess, onError) {
    const cmd = 'az acs kubernetes get-credentials -n ' + cluster.name + ' -g ' + cluster.resourceGroup;
    shell.exec(cmd).then(({code, stdout, stderr}) => {
        if (code === 0 && !stderr) {
            onSuccess();
        } else {
            onError(stderr);
        }
    });

}

function clusterQuickPick(cluster): ClusterQuickPick {
    return new ClusterQuickPick(cluster);
}

interface Cluster {
    readonly name: string;
    readonly resourceGroup: string;
}

class ClusterQuickPick implements QuickPickItem {
    constructor(readonly cluster: Cluster) {
    }

    get label() { return this.cluster.name; }
    get description() { return 'Resource group ' + this.cluster.resourceGroup; }
}