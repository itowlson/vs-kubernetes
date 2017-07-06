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

        switch (trackedops[opid].stage) {
            case OpStage.PromptForSubs:
                const subs = await acsSubs();
                return await promptForSubs(opid, subs);
            case OpStage.PromptForCluster:
                await login(trackedops[opid].sub);
                const clusters = await acsClusters();
                return await promptForCluster(opid, clusters);
            case OpStage.Done:
                const clusInfo : string = trackedops[opid].cluster;
                const parsept = clusInfo.indexOf('/');
                const rg = clusInfo.substr(0, parsept);
                const clusname = clusInfo.substr(parsept + 1);
                return `<h1>Completed</h1><p>You selected ${clusname} in resource group ${rg}</p>`;
        }
    }
}

async function login(sub : string) {
    console.log('connecting to ' + sub);
    await shell.exec('az account set --subscription "' + sub + '"');
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
async function acsSubs() : Promise<string[]> {
    const sr = await shell.exec("az account list --all --query [*].name -ojson")
    if (sr.code === 0 && !sr.stderr) {
        const accountNames = JSON.parse(sr.stdout);
        return accountNames;
    } else {
        throw sr.stderr;
    }
}

async function acsClusters() : Promise<any[]> {
    let query = '[?orchestratorProfile.orchestratorType==`Kubernetes`].{name:name,resourceGroup:resourceGroup}';
    if (shell.isUnix()) {
        query = `'${query}'`;
    }
    const sr = await shell.exec(`az acs list --query ${query} -ojson`);
    if (sr.code === 0 && !sr.stderr) {
        const clusters = JSON.parse(sr.stdout);
        return clusters;
    } else {
        throw sr.stderr;
    }
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
