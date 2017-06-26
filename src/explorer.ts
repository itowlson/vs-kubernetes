import * as vscode from 'vscode';
import * as shell from './shell';
import { Kubectl } from './kubectl';
import { Host } from './host';

export function create(kubectl : Kubectl, host : Host) : vscode.TreeDataProvider<KubernetesObject> {
    return new KubernetesExplorer(kubectl, host);
}

class KubernetesExplorer implements vscode.TreeDataProvider<KubernetesObject> {

    constructor(private readonly kubectl : Kubectl, private readonly host : Host) {}

    getTreeItem(element: KubernetesObject) : vscode.TreeItem | Thenable<vscode.TreeItem> {
        const collapsibleState = isKind(element) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None ;
        return new vscode.TreeItem(element.id, collapsibleState);
    }

    getChildren(parent? : KubernetesObject) : vscode.ProviderResult<KubernetesObject[]> {
        if (parent) {
            return getChildren(parent, this.kubectl, this.host);
        }
        return [
            new KubernetesKind("Deployments"),
            new KubernetesKind("Jobs"),
            new KubernetesKind("Pods")
        ];
    }
}

function isKind(obj: KubernetesObject) : obj is KubernetesKind {
    return !!(<KubernetesKind>obj).kind;
}

async function getChildren(parent : KubernetesObject, kubectl: Kubectl, host: Host) : Promise<KubernetesObject[]> {
    if (isKind(parent)) {
        const childrenLines = await kubectl.asLines("get " + parent.kind.toLowerCase());
        if (shell.isShellResult(childrenLines)) {
            host.showErrorMessage(childrenLines.stderr);
            return [ { id: "Error" } ];
        }
        return childrenLines.map((l) => parse(l));
    }
    return [];
}

function parse(kubeLine : string) : KubernetesObject {
    const bits = kubeLine.split(' ');
    return { id: bits[0] };
}

interface KubernetesObject {
    readonly id : string;
}

class KubernetesKind implements KubernetesObject {
    readonly id: string;
    constructor(readonly kind: string) {
        this.id = kind;
    }
}