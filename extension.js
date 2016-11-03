// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');

// Standard node imports
var path = require('path');
var fs = require('fs');

// External dependencies
var yaml = require('js-yaml');
var dockerfileParse = require('dockerfile-parse');
var shellLib = null;
function shell() {
    if (shellLib == null) {
        shellLib = require('shelljs');
    }
    return shellLib;
};

var explainActive = false;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    var disposable = vscode.commands.registerCommand('extension.vsKubernetesCreate', function () {
        maybeRunKubernetesCommandForActiveWindow('create -f ');
    });
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesDelete', function () {
        findKindNameOrPrompt().then(function(kindName) {
            kubectl('delete ' + kindName);
        });
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

    disposable = vscode.commands.registerCommand('extension.vsKubernetesLogs', logsKubernetes);
    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.vsKubernetesExpose', exposeKubernetes);
    context.subscriptions.push(disposable);

    vscode.languages.registerHoverProvider({ language: 'json', scheme: 'file' }, {
        provideHover: provideHover
    });
    vscode.languages.registerHoverProvider({ language: 'yaml', scheme: 'file' }, {
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
        return false; // No open text editor
    }
    if (editor.selection) {
        var text = editor.document.getText(editor.selection);
        if (text.length > 0) {
            var proc = kubectl(command + "-");
            proc.stdin.write(text);
            proc.stdin.end();
            return true;
        }
    }
    if (editor.document.isUntitled) {
        var text = editor.document.getText();
        if (text.length > 0) {
            var proc = kubectl(command + "-");
            proc.stdin.write(text);
            proc.stdin.end();
            return true;
        }
        return false;
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
    return true;
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
            var filename = value.replace('/', '-');
            var filepath = path.join(vscode.workspace.rootPath, filename + '.json');
            vscode.workspace.openTextDocument(vscode.Uri.parse('untitled:' + filepath)).then(doc => {
                console.log(doc);
                var start = new vscode.Position(0, 0);
                var end = new vscode.Position(0, 0);
                var range = new vscode.Range(start, end);
                var edit = new vscode.TextEdit(range, stdout);

                var wsEdit = new vscode.WorkspaceEdit();
                wsEdit.set(doc.uri, [edit]);
                vscode.workspace.applyEdit(wsEdit);
                vscode.window.showTextDocument(doc);
            });
        })
    });
}

function kubectlDone(result, stdout, stderr) {
    if (result != 0) {
        vscode.window.showErrorMessage("Kubectl command failed: " + stderr);
        return;
    }
    vscode.window.showInformationMessage(stdout);
};

function exposeKubernetes() {
    var kindName = findKindName();
    if (!kindName) {
        vscode.window.showErrorMessage("couldn't find a relevant type to expose.");
        return;
    }
    var cmd = "expose " + kindName;
    var ports = getPorts();
    if (ports && ports.length > 0) {
        cmd += " --port=" + ports[0]
    }

    kubectl(cmd);
}

function kubectl(command) {
    kubectlInternal(command, kubectlDone);
};

function kubectlInternal(command, handler) {
    try {
        var home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME']
        var opts = {
            'cwd': vscode.workspace.rootPath,
            'env': {
                'HOME': home
            }
        }
        var cmd = 'kubectl ' + command
        console.log(cmd);
        return shell().exec(cmd, opts, handler);
    } catch (ex) {
        vscode.window.showErrorMessage(ex);
    }
};

function getKubernetes() {
    var kindName = findKindName();
    if (kindName) {
        maybeRunKubernetesCommandForActiveWindow('get --no-headers -o wide -f ');
        return;
    }
    vscode.window.showInputBox({
        prompt: "What resource do you want to get?",
    }).then(function(value) {
        kubectl(" get " + value + " -o wide --no-headers");
    });
};

// This is duplicated from vs-docker, find a way to re-use
function findVersion() {
    // No .git dir, use 'latest'
    // TODO: use 'git rev-parse' to detect upstream directories
    if (!fs.existsSync(path.join(vscode.workspace.rootPath, ".git"))) {
        return 'latest';
    }

    var execOpts = { cwd: vscode.workspace.rootPath};
    var result = shell().exec('git describe --always --dirty', execOpts);
    if (result.code != 0) {
        vscode.window.showErrorMessage('git log returned: ' + result.code);
        return 'error';
    }
    version = result.stdout;
    return version;
}

function findPods(labelQuery, callback) {
    kubectlInternal(' get pods -o json -l ' + labelQuery, function(result, stdout, stderr) {
        if (result != 0) {
            vscode.window.showErrorMessage("Kubectl command failed: " + stderr);
            return;
        }
        try {
            var podList = JSON.parse(stdout);
            callback(podList);
        } catch (ex) {
            console.log(ex);
            vscode.window.showErrorMessage('unexpected error: ' + ex);
        }
    });
}

function findPodsForApp(callback) {
    var appName = path.basename(vscode.workspace.rootPath);
    findPods('run=' + appName, callback);
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

function findKindName() {
    var editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return null; // No open text editor
    }
    var text = editor.document.getText();
    try {
        var obj = yaml.safeLoad(text);
        if (!obj.kind) {
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
};

function findKindNameOrPrompt() {
    var kindName = findKindName();
    if (kindName != null) {
        return {
            'then': function(fn) {
                fn(kindName)
            }
        }
    }
    return vscode.window.showInputBox({ prompt: "What resource do you want to load?",});
}

function curry(fn, arg) {
    return function() {
        var args = Array.prototype.slice.call(arguments, 0);
        args.push(arg);
        return fn.apply(null, args);
    }
}

function findPod(callback) {
    var editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return null; // No open text editor
    }
    var text = editor.document.getText();
    try {
        var obj = yaml.safeLoad(text);
        if (obj.kind == 'Pod') {
            callback({
                'name': obj.metadata.name,
                'namespace': obj.metadata.namespace
            });
            return;
        }
    } catch (ex) {
        // pass
    }
    findPodsForApp(function(podList){
        if (podList.items.length == 0) {
            vscode.window.showErrorMessage("Couldn't find any relevant pods.");
        }
        var names = [];
        for (var i = 0; i < podList.items.length; i++) {
            // TODO: handle namespaces here...
            names.push(podList.items[i].metadata.namespace + '/' + podList.items[i].metadata.name);
        }
        vscode.window.showQuickPick(names).then(function(value){
            var ix = value.indexOf('/');
            callback({
                'namespace': value.substring(0, ix),
                'name': value.substring(ix + 1)
            });
        });
    });

}

function logsKubernetes() {
    findPod(getLogs);
}

function getLogs(pod) {
    if (!pod) {
        vscode.window.showErrorMessage("Can't find a pod!");
        return;
    }
    // TODO: Support multiple containers here!

    var cmd = ' logs ' + pod.name;
    if (pod.namespace && pod.namespace.length > 0) {
        cmd += ' --namespace=' + pod.namespace;
    }
    console.log(cmd);
    var fn = curry(kubectlOutput, pod.name + "-output");
    kubectlInternal(cmd, fn);
}

function kubectlOutput(result, stdout, stderr, name) {
    if (result != 0) {
        vscode.window.showErrorMessage("Command failed: " + stderr);
        return;
    }
    var channel = vscode.window.createOutputChannel(name)
    channel.append(stdout);
    channel.show();
};

function getPorts() {
    var file = vscode.workspace.rootPath + '/Dockerfile';
    if (!fs.existsSync(file)) {
        return null;
    }
    try {
        var data = fs.readFileSync(file, 'utf-8');
        var obj = dockerfileParse(data);
        return obj.expose;
    } catch (ex) {
        console.log(ex);
        return null;
    }
};

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;