'use strict';

import * as vscode from 'vscode';
import * as shell from './shell';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export function readKubectlConfig() : Promise<KubeConfig> {
    return new Promise(function (resolve, reject) {
        var kubeConfig = shell.combinePath(shell.home(), ".kube/config")
        fs.readFile(kubeConfig, 'utf8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            var kcconfigf = data;
            var kcconfig = yaml.safeLoad(kcconfigf);
            var apiVersion = kcconfig['apiVersion'];
            var currentContextName = kcconfig['current-context'];
            var currentContextDef = kcconfig['contexts'].find(c => c['name'] === currentContextName);
            if (!currentContextDef) {
                reject({ kubectlError: 'noCurrentContext', message: 'No current context in .kube/config' });
                return;
            }
            var currentContext = currentContextDef['context'];
            var currentClusterDef = kcconfig['clusters'].find(c => c['name'] === currentContext['cluster']);
            if (!currentClusterDef) {
                reject({ kubectlError: 'noCluster', message: 'Invalid cluster in current context in .kube/config' });
                return;
            }
            var currentCluster = currentClusterDef['cluster'];
            var endpoint = currentCluster['server'];
            var cadata = currentCluster['certificate-authority-data'];
            var currentUserDef = kcconfig['users'].find(u => u['name'] === currentContext['user']);
            if (!currentUserDef) {
                reject({ kubectlError: 'noUser', message: 'Invalid user in current context in .kube/config' });
                return;
            }
            var currentUser = currentUserDef['user'];
            var clientCertData = currentUser['client-certificate-data'];
            var clientKeyData = currentUser['client-key-data'];

            resolve({
                endpoint: endpoint,
                clientCertificateData: Buffer.from(clientCertData, 'base64'),
                clientKeyData: Buffer.from(clientKeyData, 'base64'),
                certificateAuthorityData: Buffer.from(cadata, 'base64')
            })
        });
    });
}

export interface KubeConfig {
    readonly endpoint : string;
    readonly clientCertificateData : Buffer;
    readonly clientKeyData : Buffer;
    readonly certificateAuthorityData : Buffer;
}
