'use strict';

import * as vscode from 'vscode';
import * as shell from './shell';
import * as fs from 'fs';

export function verifyPrerequisites(onSatisfied, onFailure) {
    var errors = new Array<String>();

    shell.exec('az --help', function(code, stdout, stderr) {
        if (code != 0 || stderr) {
            errors.push('Azure CLI 2.0 not found - install Azure CLI 2.0 and log in');
        }

        prereqCheckSSHKeys(errors);

        if (errors.length === 0) {
            onSatisfied();
        } else {
            onFailure(errors);
        }
    });
}

function prereqCheckSSHKeys(errors : Array<String>) {
    var sshKeyFile = shell.combinePath(shell.home(), '.ssh/id_rsa');
    if (!fs.existsSync(sshKeyFile)) {
        errors.push('SSH keys not found - expected key file at ' + sshKeyFile);
    }
}

export function selectSubscription(onSelection, onNone, onError) {
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
    var query = '[?orchestratorProfile.orchestratorType==`Kubernetes`].{name:name,resourceGroup:resourceGroup}';
    if (shell.isUnix()) {
        query = `'${query}'`;
    }
    shell.exec(`az acs list --query ${query}`, function(code, stdout, stderr) {
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

export function installCli(onInstall, onError) {
    var installDir, installFile;
    var cmd;
    var cmdCore = 'az acs kubernetes install-cli';
    var isWindows = shell.isWindows();
    if (isWindows) {
        // The default Windows install location requires admin permissions; install
        // into a user profile directory instead. We process the path explicitly
        // instead of using %LOCALAPPDATA% in the command, so that we can render the
        // physical path when notifying the user.
        var appDataDir = process.env['LOCALAPPDATA'];
        installDir = appDataDir + '\\kubectl';
        installFile = installDir + '\\kubectl.exe';
        cmd = `(if not exist "${installDir}" md "${installDir}") & ${cmdCore} --install-location="${installFile}"`;
    } else {
        // Bah, the default Linux install location requires admin permissions too!
        // Fortunately, $HOME/bin is on the path albeit not created by default.
        var homeDir = process.env['HOME'];
        installDir = homeDir + '/bin';
        installFile = installDir + '/kubectl';
        cmd = `mkdir "${installDir}" ; ${cmdCore} --install-location="${installFile}"`;
    }
    shell.exec(cmd, function(code, stdout, stderr) {
        if (code === 0 && !stderr) {
            var onDefaultPath = !isWindows;
            onInstall(installFile, onDefaultPath);
        } else {
            onError(stderr);
        }
    });
}

export function getCredentials(cluster : Cluster, onSuccess, onError) {
    var cmd = 'az acs kubernetes get-credentials -n ' + cluster.name + ' -g ' + cluster.resourceGroup;
    shell.exec(cmd, function(code, stdout, stderr) {
        if (code === 0 && !stderr) {
            onSuccess();
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