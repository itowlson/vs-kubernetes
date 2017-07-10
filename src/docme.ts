import * as vscode from 'vscode';
import { shell } from './shell';
//import * as acs from './acs';

export class DocMe implements vscode.TextDocumentContentProvider {
	private _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange: vscode.Event<vscode.Uri> = this._onDidChange.event;

    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
        //console.log('PTDC ' + uri.path);
        return this.getContent(uri.path.substr(1));
    }

    pokeyPokey(request : any) {
        //console.log('PP ' + opid);
        advance(request);
        this._onDidChange.fire(vscode.Uri.parse("acsconfigure://operations/" + request.opid));  // okay so the URL needs to be the same (this is saying "the doc at URL blah has changed," not "refresh the document with the content of URL blah")
                                                        // so we need to figure out where state lives and how to pass it around
    }

    private async getContent(opid : string) : Promise<string> {
        //console.log('GC ' + opid);

        // the acs* calls should probably happen during pokeyPokey - getContent should only render the current state
        // as it may be called again when reloading the window
        switch (trackedops[opid].stage) {
            case OpStage.PromptForSubs:
                const subs = await acsSubs();
                if (subs.succeeded) {
                    return await promptForSubs(opid, subs.result);
                } else {
                    return notifyError("listing subscriptions", subs.error);
                }
            case OpStage.PromptForCluster:
                const l = await login(trackedops[opid].sub);
                if (l.succeeded) {
                    const clusters = await acsClusters();
                    if (clusters.succeeded) {
                        return await promptForCluster(opid, clusters.result);
                    } else {
                        return notifyError("listing clusters", clusters.error);
                    }
                } else {
                    return notifyError("logging into subscription", l.error);
                }
            case OpStage.Done:
                const clusInfo : string = trackedops[opid].cluster;
                const parsept = clusInfo.indexOf('/');
                const rg = clusInfo.substr(0, parsept);
                const clusname = clusInfo.substr(parsept + 1);
                const result = await acsGetAllTheThings(clusname, rg);
                return notifyResult(result);
        }
    }
}

async function login(sub : string) : Promise<Errorable<boolean>> {
    //console.log('connecting to ' + sub);
    const sr = await shell.exec('az account set --subscription "' + sub + '"');
    if (sr.code === 0 && !sr.stderr) {
        return { succeeded: true, result: true, error: '' };        
    }
    return { succeeded: false, result: false, error: sr.stderr };        
}

function advance(request: any) {
    const opid : string = request.opid;
    let currentOp = trackedops[opid];
    //console.log(currentStage || "NEW NEW NEW");
    if (currentOp) {
        let currentStage = currentOp.stage;
        switch (currentStage) {
            case OpStage.PromptForSubs:
                trackedops[opid].sub = request.sub;
                currentStage = OpStage.PromptForCluster;
                break;
            case OpStage.PromptForCluster:
                trackedops[opid].cluster = request.cluster;  // in form rg/clus
                currentStage = OpStage.Done;
                break;
            case OpStage.Done:
                throw "shouldn't have gone past here";
        }
        trackedops[opid].stage = currentStage;
    } else {
        trackedops[opid] = { stage: OpStage.PromptForSubs };
    }

    //console.log(currentStage);
}

enum OpStage {
    PromptForSubs = 1,  // don't start at 0 because it's falsy
    PromptForCluster = 2,
    Done = 3
}

let trackedops : any = {};

// TODO: deduplicate with acs module
// actually don't need to dedupe as this would replace the acs module
async function acsSubs() : Promise<Errorable<string[]>> {
    const sr = await shell.exec("az account list --all --query [*].name -ojson")
    if (sr.code === 0 && !sr.stderr) {
        const accountNames = JSON.parse(sr.stdout);
        return {succeeded: true, result: accountNames, error: '' };
    } else {
        return { succeeded: false, result: undefined, error: sr.stderr };
    }
}

async function acsClusters() : Promise<Errorable<any[]>> {
    let query = '[?orchestratorProfile.orchestratorType==`Kubernetes`].{name:name,resourceGroup:resourceGroup}';
    if (shell.isUnix()) {
        query = `'${query}'`;
    }
    const sr = await shell.exec(`az acs list --query ${query} -ojson`);
    if (sr.code === 0 && !sr.stderr) {
        const clusters = JSON.parse(sr.stdout);
        return { succeeded: true, result: clusters, error: '' };
    } else {
        return { succeeded: false, result: undefined, error: sr.stderr };
    }
}

interface Errorable<T> {
    succeeded : boolean;
    result : T;
    error : string;
}

async function acsGetAllTheThings(clusterName : string, clusterGroup : string) : Promise<any> {
    let installDir, installFile, cmd;
    let result : any = {};
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
    const sr = await shell.exec(cmd);
    
    if (sr.code === 0) {
        const onDefaultPath = !isWindows;
        result.gotCli = true;
        result.installFile = installFile;
        result.onDefaultPath = onDefaultPath;
    } else {
        result.gotCli = false;
        result.getCliError = sr.stderr;
    }

    const cmd2 = 'az acs kubernetes get-credentials -n ' + clusterName + ' -g ' + clusterGroup;
    const sr2 = await shell.exec(cmd2);

    if (sr2.code === 0 && !sr2.stderr) {
        result.gotCreds = true;
    } else {
        result.gotCreds = false;
        result.getCredsError = sr2.stderr;
    }

    return result;
}

function notifyError(actionDescription: string, error: string) : string {
    return `
<h1>Error ${actionDescription}</h1>

<style>
.vscode-light .error {
    color: red;
    font-weight: bold;
}

.vscode-dark .error {
    color: red;
    font-weight: bold;
}

.vscode-light a {
    color: navy;
}

.vscode-dark a {
    color: azure;
}
</style>

<p><span class='error'>The Azure command line failed.</span>  See below for the error message.  You may need to:</p>
<ul>
<li>Log into the Azure CLI (run az login in the terminal)</li>
<li>Install the Azure CLI <a href='https://docs.microsoft.com/cli/azure/install-azure-cli'>(see the instructions for your operating system)</a></li>
<li>Configure Kubernetes from the command line using the az acs command</li>
</ul>

<p><b>Details</b></p>

<p>${error}</p>
`;
}

function promptForSubs(opid: string, subs: string[]) : string {
    const subopts = subs.map((s) => `<option>${s}</option>`).join('\n');
    const uri = encodeURI("command:extension.vsKubernetesPreviewAllTheThings?" + JSON.stringify({opid: opid, sub: subs[0]}));

    return `
<h1 id='h'>Choose subscription</h1>

<style>
.vscode-light #nextlink {
    color: navy;
}

.vscode-dark #nextlink {
    color: azure;
}
</style>

<script>
function promptWait() {
    document.getElementById('h').innerText = 'Please wait...';
    document.getElementById('content').innerText = '';
}
function selchanged() {
    var ss = document.getElementById('subsel');
    var sel = ss.options[ss.selectedIndex].text;
    document.getElementById('nextlink').href = encodeURI('command:extension.vsKubernetesPreviewAllTheThings?{"opid":"${opid}","sub":"' + sel + '"}');
    //document.getElementById('h').innerText = document.getElementById('nextlink').href;
}
</script>

<div id='content'>
<p>
Azure subscription: <select id='subsel' onchange='selchanged()'>
${subopts}
</select>
</p>

<p>
<a id='nextlink' href='${uri}' onclick='promptWait()'>Next &gt;</a>
</p>
</div>
`;
}

function promptForCluster(opid: string, clusters: any[]) : string {
    const clusopts = clusters.map((c) => `<option value="${c.resourceGroup}/${c.name}">${c.name} (${c.resourceGroup})</option>`).join('\n');
    const uri = encodeURI("command:extension.vsKubernetesPreviewAllTheThings?" + JSON.stringify({opid: opid, cluster: `${clusters[0].resourceGroup}/${clusters[0].name}`}));
    return `
<h1 id='h'>Choose cluster</h1>

<style>
.vscode-light #nextlink {
    color: navy;
}

.vscode-dark #nextlink {
    color: azure;
}
</style>

<script>
function promptWait() {
    document.getElementById('h').innerText = 'Please wait...';
    document.getElementById('content').innerText = '';
}
function selchanged() {
    var ss = document.getElementById('clussel');
    var sel = ss.options[ss.selectedIndex].value;
    document.getElementById('nextlink').href = encodeURI('command:extension.vsKubernetesPreviewAllTheThings?{"opid":"${opid}","cluster":"' + sel + '"}');
    //document.getElementById('h').innerText = document.getElementById('nextlink').href;
}
</script>

<div id='content'>
<p>
Azure Container Service cluster: <select id='clussel' onchange='selchanged()'>
${clusopts}
</select>
</p>

<p>
<a id='nextlink' href='${uri}' onclick='promptWait()'>Configure!</a>
</p>
</div>
`;
}

function notifyResult(result : any) : string {
    const succeeded = result.gotCli && result.gotCreds;
    const getCliResultHtml = result.gotCli ? `
<p class='success'>kubectl installed at ${result.installFile}</p>

${result.onDefaultPath ? '' : '<p>This location is not on your system PATH. Add this directory to your path, or set the VS Code <b>vs-kubernetes.kubectl-path</b> config setting.</p>'}
` : `
<p class='error'>An error occurred while downloading kubectl.</p>
<p><b>Details</b></p>
<p>${result.getCliError}</p>
`;

    const getCredsResultHtml = result.gotCreds ? `<p class='success'>Successfully configured kubectl with Azure Container Service cluster credentials.</p>` : `
<p class='error'>An error occurred while getting Azure Container Service cluster credentials.</p>
<p><b>Details</b></p>
<p>${result.getCredsError}</p>
`;

    return `
<h1 id='h'>${succeeded ? "Configuration completed" : "Configuration error"}</h1>

<style>
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

<div id='content'>
${getCliResultHtml}
${getCredsResultHtml}
</div>
`;
}

// function miracleHtml(subs: string[], someUriStr: string, cmd?: string, argstr?: string) : string {
//     const subopts = subs.map((s) => `<option>${s}</option>`);
//     const someUri = vscode.Uri.parse(someUriStr);
//     const argex = argstr ? ('?' + JSON.stringify(argstr)) : '';
//     const nextUri = cmd ?
//         encodeURI(cmd + argex) : //encodeURI(cmd) <- not necessary I think unless it has args that need encoding :
//         encodeURI('command:vscode.previewHtml?' + JSON.stringify(someUri));  // TODO: this spawns a new preview window
//     return `
// <h1 id='h'>We're on the way to ${someUriStr}</h1>

// <script>
// /*
// function fie() {
//     //document.getElementById('h').innerText = 'Fie-ing';
//     window.location.href = '${nextUri}';
//     //document.getElementById('h').innerText = window.location.href;
// }
// */
// </script>

// <p>
// Azure subscription: <select>
// ${subopts}
// </select>
// </p>

// <p>
// <a href='${nextUri}'>ACS ME!!!</a>
// <!-- doesn't seem to work: <input type='button' value='ACS Me' onclick='fie()'> -->
// </p>
// `;
// }
