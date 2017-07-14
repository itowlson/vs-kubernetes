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

interface Errorable<T> {
    readonly succeeded: boolean;
    readonly result: T;
    readonly error: string[];
}

export interface UIRequest {
    readonly operationId: string;
    readonly requestData: any;
}

interface StageData {
    readonly actionDescription: string;
    readonly result: Errorable<any>;
}

interface OperationState {
    readonly stage: OperationStage;
    readonly last: StageData;
}

enum OperationStage {
    Initial,
    PromptForSubscription,
    PromptForCluster,
    Complete,
}

class OperationMap {

    private operations: any = {};

    set(operationId: string, operationState: OperationState) {
        this.operations[operationId] = operationState;
    }

    get(operationId: string) : OperationState {
        return this.operations[operationId];
    }

}

class UIProvider implements TextDocumentContentProvider, Advanceable {

	private _onDidChange: EventEmitter<Uri> = new EventEmitter<Uri>();
    readonly onDidChange: Event<Uri> = this._onDidChange.event;

    private operations: OperationMap = new OperationMap;

    provideTextDocumentContent(uri: Uri, token: CancellationToken) : ProviderResult<string> {
        const operationId = uri.path.substr(1);
        const operationState = this.operations.get(operationId);
        return render(operationId, operationState);
    }

    start(operationId: string): void {
        const initialStage = {
            stage: OperationStage.Initial,
            last: {
                actionDescription: '',
                result: { succeeded: true, result: null, error: [] }
            }
        };
        this.operations.set(operationId, initialStage);
        this._onDidChange.fire(operationUri(operationId));
    }

    async next(request: UIRequest): Promise<void> {
        const operationId = request.operationId;
        const sourceState = this.operations.get(operationId);
        const result = await next(sourceState);
        this.operations.set(operationId, result);
        this._onDidChange.fire(operationUri(operationId));
    }
}

async function next(sourceState: OperationState) : Promise<OperationState> {
    switch (sourceState.stage) {
        case OperationStage.Initial:
            return {
                last: await getSubscriptionList(),
                stage: OperationStage.PromptForSubscription
            };
        case OperationStage.PromptForSubscription:
            return {
                last: await getClusterList(),
                stage: OperationStage.PromptForCluster
            };
        case OperationStage.PromptForCluster:
            return {
                last: await configureCluster(),
                stage: OperationStage.Complete
            };
        default:
            return {
                stage: sourceState.stage,
                last: sourceState.last
            };
    }
}

async function getSubscriptionList() : Promise<StageData> {
    // check for prerequisites
    // TODO: need to inject shell or this will foul up my unit tests
    // const prerequisiteErrors = await verifyPrerequisitesAsync();
    // if (prerequisiteErrors.length > 0) {
    //     return {
    //         actionDescription: 'checking prerequisites',
    //         result: { succeeded: false, result: false, error: prerequisiteErrors }
    //     }
    // }

    // list subs
    return {
        actionDescription: 'listing subscriptions',
        result: { succeeded: true, result: [ 'Sub1', 'Sub2' ], error: [] }
    };
}

async function getClusterList() : Promise<StageData> {
    // check login status
    // list clusters
    return {
        actionDescription: 'listing clusters',
        result: { succeeded: true, result: [ 'Clus1', 'Clus2' ], error: [] }
    };
}

async function configureCluster() : Promise<StageData> {
    // download kubectl
    // get credentials
    return {
        actionDescription: 'configuring Kubernetes',
        result: { succeeded: true, result: '', error: [] }
    };
}

function render(operationId: string, state: OperationState) : string {
    switch (state.stage) {
        case OperationStage.Initial:
             return renderInitial();
        case OperationStage.PromptForSubscription:
            return renderPromptForSubscription(operationId, state.last);
        case OperationStage.PromptForCluster:
            return renderPromptForCluster(operationId, state.last);
        case OperationStage.Complete:
            return renderComplete(state.last);
        default:
            return internalError(`Unknown operation stage ${state.stage}`);
    }
}

// TODO: Using HTML comments to test that the correct rendering was invoked.
// Would be 'purer' to allow the tests to inject fake rendering methods, as this
// would also allow us to check the data being passed into the rendering method...

function renderInitial() : string {
    return '<!-- Initial --><h1>Listing subscriptions</h1><p>Please wait...</p>';
}

function renderPromptForSubscription(operationId: string, last: StageData) : string {
    if (last.result.succeeded) {
        const subscriptions : string[] = last.result.result;
        return `<!-- PromptForSubscription --><h1>Choose subscription</h1><p>${subscriptions.join(",")}</p><p><a href="${advanceUri(operationId, '')}">Next</a></p>`;
    }
    return `<!-- PromptForSubscription --><h1>Error ${last.actionDescription}</h1><p>${last.result.error}</p>`;
}

function renderPromptForCluster(operationId: string, last: StageData) : string {
    if (last.result.succeeded) {
        const clusters : string[] = last.result.result;
        return `<!-- PromptForCluster --><h1>Choose cluster</h1><p>${clusters.join(",")}</p><p><a href="${advanceUri(operationId, '')}">Next</a></p>`;
    }
    return `<!-- PromptForCluster --><h1>Error ${last.actionDescription}</h1><p>${last.result.error}</p>`;
}

function renderComplete(last: StageData) : string {
    if (last.result.succeeded) {
        return `<!-- Complete --><h1>Configuration complete</h1><p>More info here</p>`;
    }
    return `<!-- Complete --><h1>Error ${last.actionDescription}</h1><p>${last.result.error}</p>`;
}

function internalError(error: string) : string {
    return `<h1>Internal extension error</h1><p>An internal error occurred in the vs-kubernetes extension.  This is not an Azure or Kubernetes issue.  Please report error text '${error}' to the extension authors.</p>`
}

function advanceUri(operationId: string, requestData: any) : string {
    const request : UIRequest = {
        operationId: operationId,
        requestData: requestData
    };
    const uri = encodeURI("command:extension.vsKubernetesConfigureFromAcs?" + JSON.stringify(request));
    return uri;
}

async function verifyPrerequisitesAsync() : Promise<string[]> {
    const errors = new Array<string>();
    
    const sr = await shell.exec('az --help');
    if (sr.code !== 0 || sr.stderr) {
        errors.push('Azure CLI 2.0 not found - install Azure CLI 2.0 and log in');
    }

    prereqCheckSSHKeys(errors);

    return errors;
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