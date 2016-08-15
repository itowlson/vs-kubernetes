// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var path = require('path');
var fs = require('fs');

var explainActive = false;

var shellLib = null;
function shell() {
    if (shellLib == null) {
        shellLib = require('shelljs');
    }
    return shellLib;
};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    var disposable = vscode.commands.registerCommand('extension.vsKubernetesCreate', function () {
        maybeRunKubernetesCommandForActiveWindow('create -f ');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesDelete', function () {
        maybeRunKubernetesCommandForActiveWindow('delete -f ');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesApply', function () {
        maybeRunKubernetesCommandForActiveWindow('apply -f ');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesExplain', explainActiveWindow);
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesLoad', loadKubernetes);
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesGet', getKubernetes);
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesRun', runKubernetes);
    context.subscriptions.push(disposable);

    vscode.languages.registerHoverProvider({ language: 'json', scheme: 'file' }, {
        provideHover: provideHover
    });
}

function provideHover(document, position, token) {
    if (!explainActive) {
        return null;
    }
    var body = document.getText();
    var obj = {};
    try {
        obj = JSON.parse(body);
    } catch (err) {
        // Bad JSON
        return null;
    }
    // Not a k8s object.
    if (!obj.kind) {
        return null;
    }
    var property = findProperty(document.lineAt(position.line));
    var field = JSON.parse(property);

    var parentLine = findParent(document, position.line - 1);
    while (parentLine != -1) {
        var parentProperty = findProperty(document.lineAt(parentLine));
        field = JSON.parse(parentProperty) + '.' + field;
        parentLine = findParent(document, parentLine - 1);
    }

    if (field == 'kind') {
        field = '';
    }
    return {
        'then': function (fn) {
            explain(obj, field, function (msg) {
                fn(new vscode.Hover(
                    {
                        'language': 'json',
                        'value': msg
                    }));
            });
        }
    };
}

function findProperty(line) {
    var ix = line.text.indexOf(":");
    return line.text.substring(line.firstNonWhitespaceCharacterIndex, ix);
};

function findParent(document, line) {
    var count = 1;
    while (line >= 0) {
        var txt = document.lineAt(line);
        if (txt.text.indexOf('}') != -1) {
            count = count + 1;
        }
        if (txt.text.indexOf('{') != -1) {
            count = count - 1;
            if (count == 0) {
                break;
            }
        }
        line = line - 1;
    }
    while (line >= 0) {
        var txt = document.lineAt(line);
        if (txt.text.indexOf(':') != -1) {
            return line;
        }
        line = line - 1;
    }
    return line;
};

function explain(obj, field, fn) {
    if (!obj.kind) {
        vscode.window.showErrorMessage("Not a Kubernetes API Object!");
        return;
    }
    var ref = obj.kind;
    if (field && field.length > 0) {
        ref = ref + "." + field;
    }
    kubectlInternal(' explain ' + ref, function (result, stdout, stderr) {
        if (result != 0) {
            vscode.window.showErrorMessage("Failed to run explain: " + stderr);
            return;
        }
        fn(stdout);
    });
}

function explainActiveWindow() {
    var editor = vscode.window.activeTextEditor;
    var bar = initStatusBar(editor);
    if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        bar.hide();
        return; // No open text editor
    }
    explainActive = !explainActive;
    if (explainActive) {
        vscode.window.showInformationMessage("Kubernetes API explain activated.");
        bar.show();
    } else {
        vscode.window.showInformationMessage("Kubernetes API explain deactivated.");
        bar.hide();
    }
};


var statusBarItem;

function initStatusBar(editor) {
    if (!statusBarItem) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBarItem.text = "kubernetes-api-explain";
    }

    return statusBarItem;
}

// Runs a command for the text in the active window.
// Expects that it can append a filename to 'command' to create a complete kubectl command.
//
// @parameter command string The command to run
function maybeRunKubernetesCommandForActiveWindow(command) {
    var editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return; // No open text editor
    }
    if (editor.selection) {
        var text = editor.document.getText(editor.selection);
        if (text.length > 0) {
            var proc = kubectl(command + "-");
            proc.stdin.write(text);
            proc.stdin.end();
            return;
        }
    }
    if (editor.document.isUntitled) {
        // TODO: Support create without saving
        vscode.window.showErrorMessage("You need to save this as a file somewhere");
        return;
    }
    if (editor.document.isDirty) {
        // TODO: I18n this?
        var confirm = "Save";
        var promise = vscode.window.showWarningMessage("You have unsaved changes!", confirm);
        promise.then(function (value) {
            if (value && value == confirm) {
                editor.document.save().then(function (ok) {
                    if (!ok) {
                        vscode.window.showErrorMessage("Save failed.");
                        return;
                    }
                    kubectl(command + editor.document.fileName);
                });
            }
        });
    } else {
        kubectl(command + editor.document.fileName);
    }
}

function loadKubernetes() {
    vscode.window.showInputBox({
        prompt: "What resource do you want to load?",
    }).then(function(value) {
        kubectlInternal(" -o json get " + value, function(result, stdout, stderr) {
            console.log(stdout);
            if (result != 0) {
                vscode.window.showErrorMessage("Get command failed: " + stderr);
                return;
            }
            vscode.window.showTextDocument(stdout);
        })
    });
}

function kubectlDone(result, stdout, stderr) {
    if (result != 0) {
        vscode.window.showErrorMessage("Create command failed: " + stderr);
        return;
    }
    vscode.window.showInformationMessage('Output: ' + stdout);
};

function kubectl(command) {
    kubectlInternal(command, kubectlDone);
};

function kubectlInternal(command, handler) {
    return shell().exec('kubectl ' + command, handler);
};

function getKubernetes() {
    maybeRunKubernetesCommandForActiveWindow('get -f ');
};

// This is duplicated from vs-docker, find a way to re-use
function findVersion() {
    // No .git dir, use 'latest'
    // TODO: use 'git rev-parse' to detect upstream directories
    if (!fs.existsSync(path.join(vscode.workspace.rootPath, ".git"))) {
        return 'latest';
    }

    var execOpts = { cwd: vscode.workspace.rootPath};
    var result = shell().exec('git log --pretty=format:\'%h\' -n 1', execOpts);
    if (result.code != 0) {
        vscode.window.showErrorMessage('git log returned: ' + result.code);
        return 'error';
    }
    version = result.stdout;

    result = shell().exec('git status --porcelain', execOpts);
    if (result.code != 0) {
        vscode.window.showErrorMessage('git status returned: ' + result.code);
        return 'error';
    }
    if (result.stdout != '') {
        version += '-dirty';
    }
    return version;
}

function runKubernetes() {
    var name = path.basename(vscode.workspace.rootPath);
    var version = findVersion();
    var image = name + ":" + version;
    var user = vscode.workspace.getConfiguration().get("vsdocker.imageUser", null);
    if (user) {
        image = user + '/' + image;
    }
    kubectlInternal(' run ' + name + ' --image=' + image, kubectlDone);
};

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;