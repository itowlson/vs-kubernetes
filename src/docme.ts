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

    pokeyPokey(opid : string) {
        //console.log('PP ' + opid);
        advance(opid);
        this._onDidChange.fire(vscode.Uri.parse("acsconfigure://operations/" + opid));  // okay so the URL needs to be the same (this is saying "the doc at URL blah has changed," not "refresh the document with the content of URL blah")
                                                        // so we need to figure out where state lives and how to pass it around
    }

    private async getContent(opid : string) : Promise<string> {
        //console.log('GC ' + opid);

        switch (trackedops[opid].stage) {
            case OpStage.PromptForSubs:
                const subs = await acsSubs();
                return await promptForSubs(opid, subs);
            case OpStage.PromptForAccount:
                const accts = await acsAccts();
                return await promptForAccount(opid, accts);
            case OpStage.PromptForCluster:
                const clusters = await acsClusters();
                return await promptForCluster(opid, clusters);
            case OpStage.Done:
                return "<h1>Completed</h1>";
        }
    }
}

function advance(opid: string) {
    let currentOp = trackedops[opid];
    //console.log(currentStage || "NEW NEW NEW");
    if (currentOp) {
        let currentStage = currentOp.stage;
        switch (currentStage) {
            case OpStage.PromptForSubs:
                currentStage = OpStage.PromptForAccount;
                break;
            case OpStage.PromptForAccount:
                currentStage = OpStage.PromptForCluster;
                break;
            case OpStage.PromptForCluster:
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
    PromptForAccount = 2,
    PromptForCluster = 3,
    Done = 4
}

let trackedops : any = {};

async function acsSubs() : Promise<string[]> {
    //return ['Sub1', 'Sub2', 'Sub3'];
    const sr = await shell.exec("az account list --all --query [*].name -ojson")
    if (sr.code === 0 && !sr.stderr) {
        const accountNames = JSON.parse(sr.stdout);
        return accountNames;
    } else {
        throw sr.stderr;
    }
}

async function acsAccts() : Promise<string[]> {
    return ['Acct4', 'Acct5', 'Acct6'];
}

async function acsClusters() : Promise<string[]> {
    return ['Clus7', 'Clus8', 'Clus9'];
}

function promptForSubs(opid: string, subs: string[]) : string {
    const subopts = subs.map((s) => `<option>${s}</option>`);
    const uri = encodeURI("command:extension.vsKubernetesPreviewAllTheThings?" + JSON.stringify(opid));

    return `
<h1 id='h'>Choose subscription</h1>

<p>
Azure subscription: <select>
${subopts}
</select>
</p>

<p>
<a href='${uri}'>ACS ME!!!</a>
</p>
`;
}

function promptForAccount(opid: string, accts: string[]) : string {
    const acctopts = accts.map((s) => `<option>${s}</option>`);
    const uri = encodeURI("command:extension.vsKubernetesPreviewAllTheThings?" + JSON.stringify(opid));
    return `
<h1 id='h'>Choose Batch account</h1>

<p>
Azure Batch account: <select>
${acctopts}
</select>
</p>

<p>
<a href='${uri}'>ACS ME!!!</a>
</p>
`;
}

function promptForCluster(opid: string, clusters: string[]) : string {
    const clusopts = clusters.map((s) => `<option>${s}</option>`);
    const uri = encodeURI("command:extension.vsKubernetesPreviewAllTheThings?" + JSON.stringify(opid));
    return `
<h1 id='h'>Choose cluster</h1>

<p>
Azure Container Service cluster: <select>
${clusopts}
</select>
</p>

<p>
<a href='${uri}'>ACS ME!!!</a>
</p>
`;
}

function miracleHtml(subs: string[], someUriStr: string, cmd?: string, argstr?: string) : string {
    const subopts = subs.map((s) => `<option>${s}</option>`);
    const someUri = vscode.Uri.parse(someUriStr);
    const argex = argstr ? ('?' + JSON.stringify(argstr)) : '';
    const nextUri = cmd ?
        encodeURI(cmd + argex) : //encodeURI(cmd) <- not necessary I think unless it has args that need encoding :
        encodeURI('command:vscode.previewHtml?' + JSON.stringify(someUri));  // TODO: this spawns a new preview window
    return `
<h1 id='h'>We're on the way to ${someUriStr}</h1>

<script>
/*
function fie() {
    //document.getElementById('h').innerText = 'Fie-ing';
    window.location.href = '${nextUri}';
    //document.getElementById('h').innerText = window.location.href;
}
*/
</script>

<p>
Azure subscription: <select>
${subopts}
</select>
</p>

<p>
<a href='${nextUri}'>ACS ME!!!</a>
<!-- doesn't seem to work: <input type='button' value='ACS Me' onclick='fie()'> -->
</p>
`;
}
