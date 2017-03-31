'use strict';

import * as vscode from 'vscode';
import * as shell from './shell';

export function selectSubscription(onSelection, onNone, onError) {
    // prereq: az login
    //   -- how and when can we detect if not logged in - think account set fails but not account list?
    shell.exec("az account list --query [*].name", function(code, stdout, stderr) {
        if (code === 0 && !stderr) {  // az account list returns exit code 0 even if not logged in
            var accountNames = JSON.parse(stdout);
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
                    vscode.window.showQuickPick(accountNames, { placeHolder: "Select Azure subscription" }).then(subName =>
                    {
                        if (subName) {
                            vscode.window.showWarningMessage('This will select ' + subName + ' for all Azure CLI operations.', 'OK').then(choice =>{
                                if (choice == 'OK') {
                                    shell.exec('az account set --subscription "' + subName + '"', function (code, stdout, stderr) {
                                        if (code === 0 && !stderr) {
                                            onSelection(subName);
                                        } else {
                                            onError(stderr);
                                        }
                                    });
                                }
                            });
                        }
                    });
            }
        } else {
            onError(stderr);
        }

    });
}

export function selectKubernetesClustersFromActiveSubscription(onSelection, onNone, onError) {
    shell.exec("az acs list --query [?orchestratorProfile.orchestratorType==`Kubernetes`].{name:name,resourceGroup:resourceGroup}", function(code, stdout, stderr) {
        if (code === 0 && !stderr) {
            var clusters : Cluster[] = JSON.parse(stdout);
            switch (clusters.length) {
                case 0:
                    onNone();
                    break;
                case 1:
                    vscode.window.showInformationMessage('This will configure Kubernetes to use cluster ' + clusters[0].name, "OK").then(choice =>
                    {
                        if (choice == 'OK') {
                            onSelection(choice);
                        }
                    });
                    break;
                default:
                    let items = clusters.map(c => clusterQuickPick(c));
                    vscode.window.showQuickPick(items, { placeHolder: "Select Kubernetes cluster"}).then(item =>
                    {
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

function clusterQuickPick(cluster) : ClusterQuickPick {
    return new ClusterQuickPick(cluster);
}

interface Cluster {
    readonly name : string;
    readonly resourceGroup : string;
}

class ClusterQuickPick implements vscode.QuickPickItem {
    constructor (readonly cluster: Cluster) {
    }

    get label() { return this.cluster.name; }
    get description() { return 'Resource group ' + this.cluster.resourceGroup; }
}