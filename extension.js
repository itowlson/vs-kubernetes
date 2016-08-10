// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');

var explainActive = false;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "vs-kubernetes" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementations of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
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

    disposable = vscode.commands.registerCommand('extension.vsKubernetesExplain', function () {
        explainActiveWindow();
    });
    context.subscriptions.push(disposable);

    vscode.languages.registerHoverProvider({ language: 'json', scheme: 'file' }, {
        provideHover(document, position, token) {
            if (!explainActive) {
                return null;
            }
            var body = document.getText();
            var obj = {};
            try {
                obj = JSON.parse(body);
            } catch(err) {
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
                'then': function(fn) {
                    explain(obj, field, function(msg) {
                        fn(new vscode.Hover(
                            {
                                'language': 'json',
                                'value': msg
                            }));
                    });
                }
            };
        }
    });
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
    kubectlInternal(' explain ' + ref, function(result, stdout, stderr) {
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

//function activate() {
//    
    /*var editor = vscode.window.activeTextEditor;
    var bar = initStatusBar(editor);
    if (!bar) { return; }
    var doc = editor.document;

    // Only update status if an MarkDown file
    if (doc.languageId === "json") {
        bar.show();
    }*/
//}

//function deactivate() {
//    vscode.window.showInformationMessage("KUbernetes API explain deactivated.");
/*    var editor = vscode.window.activeTextEditor;
    var bar = initStatusBar(editor);
    if (!bar) { return; }
    bar.hide();
    */
//}

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

function kubectlDone(result, stdout, stderr) {
    if (result != 0) {
        vscode.window.showErrorMessage("Create command failed: " + stderr);
        return;
    }
    vscode.window.showInformationMessage('output: ' + stdout);
};

function kubectl(command) {
    kubectlInternal(command, kubectlDone);
};

function kubectlInternal(command, handler) {
    var shell = require('shelljs');
    return shell.exec('kubectl ' + command, handler);
};

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;