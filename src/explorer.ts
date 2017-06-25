import * as vscode from 'vscode';
import * as shell from './shell';
import { Kubectl } from './kubectl';
import { Host } from './host';

export class KubernetesExplorer implements vscode.TreeDataProvider<KubernetesObject> {

    constructor(private readonly kubectl : Kubectl, private readonly host : Host) {}

    getTreeItem(element: KubernetesObject) : vscode.TreeItem | Thenable<vscode.TreeItem> {
        return new vscode.TreeItem(element.id, element.isLeaf ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
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
            return [ { id: "Error", isLeaf: true } ];
        }
        return childrenLines.map((l) => parse(l));
    }
    return [];
}

function parse(kubeLine : string) : KubernetesObject {
    const bits = kubeLine.split(' ');
    return { id: bits[0], isLeaf: true };
}

interface KubernetesObject {
    readonly id : string;
    readonly isLeaf : boolean;
}

class KubernetesKind implements KubernetesObject {
    readonly id: string;
    constructor(readonly kind: string) {
        this.id = kind;
    }
    readonly isLeaf = false;
}