// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');

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
            var range = document.getWordRangeAtPosition(position);
            var txt = document.getText(range);

            var line = document.lineAt(position.line);
            var ix = line.text.indexOf(":");
            var property = line.text.substring(line.firstNonWhitespaceCharacterIndex, ix);
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
            var body = document.getText();
            return {
                'then': function(fn) {
                    explain(body, field, function(msg) {
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

function explain(text, field, fn) {
    var obj = JSON.parse(text);
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
    if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return; // No open text editor
    }
    var text = editor.document.getText();
    if (text.length == 0) {
        return;
    }
    explain(text, '', function(msg) {
        vscode.window.showInformationMessage(msg);
    });
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