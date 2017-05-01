import * as vscode from 'vscode';

export class ResourceKind implements vscode.QuickPickItem {
    constructor (readonly displayName : string, readonly abbreviation : string) {
    }

    get label() { return this.displayName; }
    get description() { return ''; }
}

export const allKinds = {
    deployment: new ResourceKind("Deployment", "deployment"),
    replicaSet: new ResourceKind("ReplicaSet", "rs"),
    replicationController: new ResourceKind("Replication Controller", "rc"),
    job: new ResourceKind("Job", "job"),
    pod: new ResourceKind("Pod", "pod"),
    service: new ResourceKind("Service", "service"),
}

export const commonKinds = [
    allKinds.deployment,
    allKinds.job,
    allKinds.pod,
    allKinds.service,
]

export const scaleableKinds = [
    allKinds.deployment,
    allKinds.replicaSet,
    allKinds.replicationController,
    allKinds.job,
]
