import * as vscode from 'vscode';
import { shell } from './shell';
//import * as acs from './acs';

export class DocMe implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
        return this.getContent(uri.toString());
    }

    private async getContent(uri : string) : Promise<string> {
        const subs = await acsSubs();
        switch (uri) {
            case "biscotti://1":
                return await miracleHtml(subs, 'biscotti://2');
            case "biscotti://2":
                return await miracleHtml(subs, 'biscotti://3');
            case "biscotti://3":
                return await miracleHtml(subs, 'biscotti://none', "command:extension.vsKubernetesLoad", "wobwib");
                
        }
    }
}

async function acsSubs() : Promise<string[]> {
    return ['a', 'b', 'c'];
    // const sr = await shell.exec("az account list --all --query [*].name -ojson")
    // if (sr.code === 0 && !sr.stderr) {
    //     const accountNames = JSON.parse(sr.stdout);
    //     return accountNames;
    // } else {
    //     throw sr.stderr;
    // }
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
