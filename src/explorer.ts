import * as vscode from 'vscode';
import * as shell from './shell';
import { Kubectl } from './kubectl';
import { Host } from './host';

export function create(kubectl : Kubectl, host : Host) : vscode.TreeDataProvider<KubernetesObject> {
    return new KubernetesExplorer(kubectl, host);
}

export interface ResourceNode {
    readonly resourceId : string;
}

class KubernetesExplorer implements vscode.TreeDataProvider<KubernetesObject> {

    constructor(private readonly kubectl : Kubectl, private readonly host : Host) {}

    getTreeItem(element: KubernetesObject) : vscode.TreeItem | Thenable<vscode.TreeItem> {
        const collapsibleState = isKind(element) ? vscode.TreeItemCollapsibleState.Collapsed: vscode.TreeItemCollapsibleState.None;
        let treeItem = new vscode.TreeItem(element.id, collapsibleState);
        if (isResource(element)) {
            treeItem.command = {
                command: "extension.vsKubernetesLoad",
                title: "Load",
                arguments: [ element ]
            };
            treeItem.contextValue = "vsKubernetes.resource";
        }
        return treeItem;
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

function isResource(obj: KubernetesObject) : obj is KubernetesResource {
    return !!(<KubernetesResource>obj).resourceId;
}

async function getChildren(parent : KubernetesObject, kubectl: Kubectl, host: Host) : Promise<KubernetesObject[]> {
    if (isKind(parent)) {
        const childrenLines = await kubectl.asLines("get " + parent.kind.toLowerCase());
        if (shell.isShellResult(childrenLines)) {
            host.showErrorMessage(childrenLines.stderr);
            return [ { id: "Error" } ];
        }
        return childrenLines.map((l) => parse(parent.kind, l));
    }
    return [];
}

function parse(kind : string, kubeLine : string) : KubernetesObject {
    const bits = kubeLine.split(' ');
    return new KubernetesResource(kind, bits[0]);
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

class KubernetesResource implements KubernetesObject, ResourceNode {
    readonly resourceId: string;
    constructor(kind: string, readonly id: string) {
        this.resourceId = kind.toLowerCase() + '/' + id;
    }
}