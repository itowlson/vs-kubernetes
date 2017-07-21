'use strict';

import { TextDocumentContentProvider, Uri, EventEmitter, Event, ProviderResult, CancellationToken } from 'vscode';
import { Shell } from './shell';
import { FS } from './fs';

export const uriScheme : string = "acsconfigure";

export function operationUri(operationId: string) : Uri {
    return Uri.parse(`${uriScheme}://operations/${operationId}`);
}

export function uiProvider(fs: FS, shell: Shell) : TextDocumentContentProvider & Advanceable {
    return new UIProvider(fs, shell);
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
    readonly requestData: string;
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

interface Context {
    readonly fs: FS;
    readonly shell: Shell;
}

class UIProvider implements TextDocumentContentProvider, Advanceable {

    private readonly context;

    constructor(fs: FS, shell: Shell) {
        this.context = { fs: fs, shell: shell };
    }

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
        const result = await next(this.context, sourceState, request.requestData);
        this.operations.set(operationId, result);
        this._onDidChange.fire(operationUri(operationId));
    }
}

async function next(context: Context, sourceState: OperationState, requestData: string) : Promise<OperationState> {
    switch (sourceState.stage) {
        case OperationStage.Initial:
            return {
                last: await getSubscriptionList(context),
                stage: OperationStage.PromptForSubscription
            };
        case OperationStage.PromptForSubscription:
            const selectedSubscription : string = requestData;
            return {
                last: await getClusterList(context, selectedSubscription),
                stage: OperationStage.PromptForCluster
            };
        case OperationStage.PromptForCluster:
            const selectedCluster = parseCluster(requestData);
            return {
                last: await configureCluster(context, selectedCluster.name, selectedCluster.resourceGroup),
                stage: OperationStage.Complete
            };
        default:
            return {
                stage: sourceState.stage,
                last: sourceState.last
            };
    }
}

function parseCluster(encoded: string) {
    if (!encoded) {
        return { resourceGroup: '', name: '' };  // TODO: this should never happen - fix tests to make it so it doesn't!
    }
    const delimiterPos = encoded.indexOf('/');
    return {
        resourceGroup: encoded.substr(0, delimiterPos),
        name: encoded.substr(delimiterPos + 1)
    };
}

async function getSubscriptionList(context: Context) : Promise<StageData> {
    // check for prerequisites
    const prerequisiteErrors = await verifyPrerequisitesAsync(context);
    if (prerequisiteErrors.length > 0) {
        return {
            actionDescription: 'checking prerequisites',
            result: { succeeded: false, result: false, error: prerequisiteErrors }
        }
    }

    // list subs
    const subscriptions = await listSubscriptionsAsync(context);
    return {
        actionDescription: 'listing subscriptions',
        result: subscriptions
    };
}

async function getClusterList(context: Context, subscription: string) : Promise<StageData> {
    // log in
    const login = await loginAsync(context, subscription);
    if (!login.succeeded) {
        return {
            actionDescription: 'logging into subscriptin',
            result: login
        };
    }

    // list clusters
    const clusters = await listClustersAsync(context);
    return {
        actionDescription: 'listing clusters',
        result: clusters
    };
}

async function configureCluster(context: Context, clusterName: string, clusterGroup: string) : Promise<StageData> {
    const downloadCliPromise = downloadCli(context);
    const getCredentialsPromise = getCredentials(context, clusterName, clusterGroup);

    const [cliResult, credsResult] = await Promise.all([downloadCliPromise, getCredentialsPromise]);

    const result = {
        gotCli: cliResult.succeeded,
        cliInstallDir: cliResult.installFile,
        cliOnDefaultPath: cliResult.onDefaultPath,
        cliError: cliResult.error,
        gotCredentials: credsResult.succeeded,
        credentialsError: credsResult.error
    };
    
    return {
        actionDescription: 'configuring Kubernetes',
        result: { succeeded: cliResult.succeeded && credsResult.succeeded, result: result, error: [] }  // TODO: this ends up not fitting our structure very well - fix?
    };
}

async function downloadCli(context: Context) : Promise<any> {
    const cliInfo = installCliInfo(context);

    const sr = await context.shell.exec(cliInfo.commandLine);
    if (sr.code === 0) {
        return {
            succeeded: true,
            installFile: cliInfo.installFile,
            onDefaultPath: !context.shell.isWindows()
        };
    } else {
        return {
            succeeded: false,
            error: sr.stderr
        }
    }
}

async function getCredentials(context: Context, clusterName: string, clusterGroup: string) : Promise<any> {
    const cmd = 'az acs kubernetes get-credentials -n ' + clusterName + ' -g ' + clusterGroup;
    const sr = await context.shell.exec(cmd);

    if (sr.code === 0 && !sr.stderr) {
        return {
            succeeded: true
        };
    } else {
        return {
            succeeded: false,
            error: sr.stderr
        }
    }
}

function installCliInfo(context: Context) {
    const cmdCore = 'az acs kubernetes install-cli';
    const isWindows = context.shell.isWindows();
    if (isWindows) {
        // The default Windows install location requires admin permissions; install
        // into a user profile directory instead. We process the path explicitly
        // instead of using %LOCALAPPDATA% in the command, so that we can render the
        // physical path when notifying the user.
        const appDataDir = process.env['LOCALAPPDATA'];
        const installDir = appDataDir + '\\kubectl';
        const installFile = installDir + '\\kubectl.exe';
        const cmd = `(if not exist "${installDir}" md "${installDir}") & ${cmdCore} --install-location="${installFile}"`;
        return { installFile: installFile, commandLine: cmd };
    } else {
        // Bah, the default Linux install location requires admin permissions too!
        // Fortunately, $HOME/bin is on the path albeit not created by default.
        const homeDir = process.env['HOME'];
        const installDir = homeDir + '/bin';
        const installFile = installDir + '/kubectl';
        const cmd = `mkdir -p "${installDir}" ; ${cmdCore} --install-location="${installFile}"`;
        return { installFile: installFile, commandLine: cmd };
    }
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
    if (!last.result.succeeded) {
        return `<!-- PromptForSubscription -->
                <h1>Error ${last.actionDescription}</h1>
                <p><span class='error'>The Azure command line failed.</span>  See below for the error message.  You may need to:</p>
                <ul>
                <li>Log into the Azure CLI (run az login in the terminal)</li>
                <li>Install the Azure CLI <a href='https://docs.microsoft.com/cli/azure/install-azure-cli'>(see the instructions for your operating system)</a></li>
                <li>Configure Kubernetes from the command line using the az acs command</li>
                </ul>
                <p><b>Details</b></p>
                <p>${last.result.error}</p>`;
    }
    const subscriptions : string[] = last.result.result;
    const initialUri = advanceUri(operationId, subscriptions[0]);
    const options = subscriptions.map((s) => `<option value=${s}>${s}</option>`).join('\n');
    return `<!-- PromptForSubscription -->
            <h1 id='h'>Choose subscription</h1>
            ${styles()}
            ${waitScript('Listing clusters')}
            ${selectionChangedScript(operationId)}
            <div id='content'>
            <p>
            Azure subscription: <select id='subsel' onchange='selchanged()'>
            ${options}
            </select>
            </p>

            <p>
            <a id='nextlink' href='${initialUri}' onclick='promptWait()'>Next &gt;</a>
            </p>
            </div>`;
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
    return `
<h1>Internal extension error</h1>
${styles()}
<p>An internal error occurred in the vs-kubernetes extension.</p>
<p>This is not an Azure or Kubernetes issue.  Please report error text '${error}' to the extension authors.</p>
`
}

function styles() : string {
    return `
<style>
.vscode-light a {
    color: navy;
}

.vscode-dark a {
    color: azure;
}

.vscode-light .error {
    color: red;
    font-weight: bold;
}

.vscode-dark .error {
    color: red;
    font-weight: bold;
}

.vscode-light .success {
    color: green;
    font-weight: bold;
}

.vscode-dark .success {
    color: darkseagreen;
    font-weight: bold;
}
</style>
`;
}

function script(text: string) : string {
    return `
<script>
${text}
</script>
`;
}

function waitScript(title: string) : string {
    const js = `
function promptWait() {
    document.getElementById('h').innerText = '${title}';
    document.getElementById('content').innerText = '';
}
`
    return script(js);
}

function selectionChangedScript(operationId: string) : string {
    const js = `
function selectionChanged() {
    var selectCtrl = document.getElementById('selector');
    var selection = selectCtrl.options[selectCtrl.selectedIndex].value;
    var request = '{"operationId":"${operationId}", "requestData":"' + selection + '"}';
    document.getElementById('nextlink').href = encodeURI('command:extension.vsKubernetesConfigureFromAcs?' + request);
}
`;

    return script(js);
}

function advanceUri(operationId: string, requestData: string) : string {
    const request : UIRequest = {
        operationId: operationId,
        requestData: requestData
    };
    const uri = encodeURI("command:extension.vsKubernetesConfigureFromAcs?" + JSON.stringify(request));
    return uri;
}

async function verifyPrerequisitesAsync(context: Context) : Promise<string[]> {
    const errors = new Array<string>();
    
    const sr = await context.shell.exec('az --help');
    if (sr.code !== 0 || sr.stderr) {
        errors.push('Azure CLI 2.0 not found - install Azure CLI 2.0 and log in');
    }

    prereqCheckSSHKeys(context, errors);

    return errors;
}

async function listSubscriptionsAsync(context: Context) : Promise<Errorable<string[]>> {
    const sr = await context.shell.exec("az account list --all --query [*].name -ojson");
    
    if (sr.code === 0 && !sr.stderr) {  // az account list returns exit code 0 even if not logged in
        const accountNames : string[] = JSON.parse(sr.stdout);
        return { succeeded: true, result: accountNames, error: [] };
    } else {
        return { succeeded: false, result: [], error: [sr.stderr] };
    }
}

async function loginAsync(context: Context, subscription: string) : Promise<Errorable<void>> {
    const sr = await context.shell.exec(`az account set --subscription "${subscription}"`);

    if (sr.code === 0 && !sr.stderr) {
        return { succeeded: true, result: null, error: [] };
    } else {
        return { succeeded: false, result: null, error: [sr.stderr] };
    }
}

async function listClustersAsync(context: Context) : Promise<Errorable<string[]>> {
    let query = '[?orchestratorProfile.orchestratorType==`Kubernetes`].{name:name,resourceGroup:resourceGroup}';
    if (context.shell.isUnix()) {
        query = `'${query}'`;
    }
    const sr = await context.shell.exec(`az acs list --query ${query} -ojson`);

    if (sr.code === 0 && !sr.stderr) {
        const clusters : string[] = JSON.parse(sr.stdout);
        return { succeeded: true, result: clusters, error: [] };
    } else {
        return { succeeded: false, result: [], error: [sr.stderr] };
    }

}

// export function verifyPrerequisites(onSatisfied, onFailure) {
//     const errors = new Array<String>();

//     shell.exec('az --help').then(({code, stdout, stderr}) => {
//         if (code != 0 || stderr) {
//             errors.push('Azure CLI 2.0 not found - install Azure CLI 2.0 and log in');
//         }

//         prereqCheckSSHKeys(errors);

//         if (errors.length === 0) {
//             onSatisfied();
//         } else {
//             onFailure(errors);
//         }
//     });
// }

function prereqCheckSSHKeys(context: Context, errors: Array<String>) {
    const sshKeyFile = context.shell.combinePath(context.shell.home(), '.ssh/id_rsa');
    if (!context.fs.existsSync(sshKeyFile)) {
        errors.push('SSH keys not found - expected key file at ' + sshKeyFile);
    }
}

// export function selectSubscription(onSelection, onNone, onError) {
//     shell.exec("az account list --all --query [*].name -ojson").then(({code, stdout, stderr}) => {
//         if (code === 0 && !stderr) {  // az account list returns exit code 0 even if not logged in
//             const accountNames = JSON.parse(stdout);
//             switch (accountNames.length) {
//                 case 0:
//                     onNone();
//                     break;
//                 case 1:
//                     onSelection(accountNames[0]);
//                     break;
//                 default:
//                     // We avoid using the default subscription because if the
//                     // user has just logged in then it will be set to the first
//                     // one in the list.  As configuration is an infrequent operation,
//                     // it's better to ask and be sure.
//                     host.showQuickPick(accountNames, { placeHolder: "Select Azure subscription" }).then((subName) => {
//                         if (!subName) {
//                             return;
//                         }

//                         host.showWarningMessage('This will select ' + subName + ' for all Azure CLI operations.', 'OK').then((choice) => {
//                             if (choice !== 'OK') {
//                                 return;
//                             }

//                             shell.exec('az account set --subscription "' + subName + '"').then(({code, stdout, stderr}) => {
//                                 if (code === 0 && !stderr) {
//                                     onSelection(subName);
//                                 } else {
//                                     onError(stderr);
//                                 }
//                             });
//                         });
//                     });
//             }
//         } else {
//             onError(stderr);
//         }

//     });
// }

// export function selectKubernetesClustersFromActiveSubscription(onSelection, onNone, onError) {
//     let query = '[?orchestratorProfile.orchestratorType==`Kubernetes`].{name:name,resourceGroup:resourceGroup}';
//     if (shell.isUnix()) {
//         query = `'${query}'`;
//     }
//     shell.exec(`az acs list --query ${query} -ojson`).then(({code, stdout, stderr}) => {
//         if (code === 0 && !stderr) {
//             const clusters: Cluster[] = JSON.parse(stdout);
//             switch (clusters.length) {
//                 case 0:
//                     onNone();
//                     break;
//                 case 1:
//                     host.showInformationMessage(`This will configure Kubernetes to use cluster ${clusters[0].name}`, "OK").then((choice) => {
//                         if (choice == 'OK') {
//                             onSelection(clusters[0]);
//                         }
//                     });
//                     break;
//                 default:
//                     let items = clusters.map((cluster) => clusterQuickPick(cluster));
//                     host.showQuickPick(items, { placeHolder: "Select Kubernetes cluster" }).then((item) => {
//                         if (item) {
//                             onSelection(item.cluster);
//                         }
//                     });
//             }
//         } else {
//             onError(stderr);
//         }
//     });
// }

// export function installCli(onInstall, onError) {
//     let installDir, installFile, cmd;
//     const cmdCore = 'az acs kubernetes install-cli';
//     const isWindows = shell.isWindows();
//     if (isWindows) {
//         // The default Windows install location requires admin permissions; install
//         // into a user profile directory instead. We process the path explicitly
//         // instead of using %LOCALAPPDATA% in the command, so that we can render the
//         // physical path when notifying the user.
//         const appDataDir = process.env['LOCALAPPDATA'];
//         installDir = appDataDir + '\\kubectl';
//         installFile = installDir + '\\kubectl.exe';
//         cmd = `(if not exist "${installDir}" md "${installDir}") & ${cmdCore} --install-location="${installFile}"`;
//     } else {
//         // Bah, the default Linux install location requires admin permissions too!
//         // Fortunately, $HOME/bin is on the path albeit not created by default.
//         const homeDir = process.env['HOME'];
//         installDir = homeDir + '/bin';
//         installFile = installDir + '/kubectl';
//         cmd = `mkdir -p "${installDir}" ; ${cmdCore} --install-location="${installFile}"`;
//     }
//     shell.exec(cmd).then(({code, stdout, stderr}) => {
//         if (code === 0) {
//             const onDefaultPath = !isWindows;
//             onInstall(installFile, onDefaultPath);
//         } else {
//             onError(stderr);
//         }
//     });
// }

// export function getCredentials(cluster: Cluster, onSuccess, onError) {
//     const cmd = 'az acs kubernetes get-credentials -n ' + cluster.name + ' -g ' + cluster.resourceGroup;
//     shell.exec(cmd).then(({code, stdout, stderr}) => {
//         if (code === 0 && !stderr) {
//             onSuccess();
//         } else {
//             onError(stderr);
//         }
//     });

// }

// function clusterQuickPick(cluster): ClusterQuickPick {
//     return new ClusterQuickPick(cluster);
// }

// interface Cluster {
//     readonly name: string;
//     readonly resourceGroup: string;
// }

// class ClusterQuickPick implements QuickPickItem {
//     constructor(readonly cluster: Cluster) {
//     }

//     get label() { return this.cluster.name; }
//     get description() { return 'Resource group ' + this.cluster.resourceGroup; }
// }