import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

import * as kuberesources from './kuberesources';
import * as kubectl from './kubectl';

export function findKindName() {
    var editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return null; // No open text editor
    }
    var text = editor.document.getText();
    return findKindNameForText(text);
}

export function findKindNameForText(text : string) {
    try {
        var obj = yaml.safeLoad(text);
        if (!obj || !obj.kind) {
            return null;
        }
        if (!obj.metadata || !obj.metadata.name) {
            return null;
        }
        return obj.kind.toLowerCase() + '/' + obj.metadata.name;
    } catch (ex) {
        console.log(ex);
        return null;
    }
}

export function findKindNameOrPrompt(resourceKinds : kuberesources.ResourceKind[], descriptionVerb : string, opts : ResourcePromptOptions, handler : (kindName : string) => void) {
    var kindName = findKindName();
    if (kindName === null) {
        promptKindName(resourceKinds, descriptionVerb, opts, handler);
    } else {
        handler(kindName);
    }
}

export function promptKindName(resourceKinds : kuberesources.ResourceKind[], descriptionVerb : string, opts : ResourcePromptOptions, handler : (resource : string) => void) {
    vscode.window.showInputBox({ prompt: "What resource do you want to " + descriptionVerb + "?", placeHolder: 'Empty string to be prompted' }).then(function (resource) {
        if (resource === '') {
            quickPickKindName(resourceKinds, opts, handler);
        } else if (resource === undefined) {
            return;
        } else {
            handler(resource);
        }
    });
}

function quickPickKindName(resourceKinds : kuberesources.ResourceKind[], opts : ResourcePromptOptions, handler : (kindName : string) => void) {
    vscode.window.showQuickPick(resourceKinds).then(function (resourceKind) {
        if (resourceKind) {
            let kind = resourceKind.abbreviation;
            kubectl.invoke("get " + kind, function (code, stdout, stderr) {
                if (code === 0) {
                    var names = parseNamesFromKubectlLines(stdout);
                    if (names.length > 0) {
                        if (opts && opts.nameOptional) {
                            names.push('(all)');
                            vscode.window.showQuickPick(names).then(function (name) {
                                if (name) {
                                    var kindName;
                                    if (name === '(all)') {
                                        kindName = kind;
                                    } else {
                                        kindName = kind + '/' + name;
                                    }
                                    handler(kindName);
                                }
                            });
                        } else {
                            vscode.window.showQuickPick(names).then(function (name) {
                                if (name) {
                                    var kindName = kind + '/' + name;
                                    handler(kindName);
                                }
                            });
                        }
                    } else {
                        vscode.window.showInformationMessage("No resources of type " + resourceKind.displayName + " in cluster");
                    }
                } else {
                    vscode.window.showErrorMessage(stderr);
                }
            });
        }
    });
}

function parseNamesFromKubectlLines(text : string) {
    var lines = text.split('\n');
    lines.shift();

    var names = lines.filter((line) => {
        return line.length > 0;
    }).map((line) => {
        return parseName(line);
    });

    return names;
}

function parseName(line : string) {
    return line.split(' ')[0];
}

export interface ResourcePromptOptions {
    readonly nameOptional? : boolean;
}
