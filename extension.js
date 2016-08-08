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
}

function maybeRunKubernetesCommandForActiveWindow(command) {
    var editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor!");
        return; // No open text editor
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
    var shell = require('shelljs');
    var result = shell.exec('kubectl ' + command, kubectlDone);
};

exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
}
exports.deactivate = deactivate;