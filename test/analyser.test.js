// The module 'assert' provides assertion methods from node
var assert = require('assert');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
var vscode = require('vscode');
var analyser = require('../analyser');

// Defines a Mocha test suite to group tests of similar kind together
suite("Analyser Tests", function() {

    test("Analyser identifies Node.js dockerfiles", function() {
        var analysis = analyser.analyse("FROM node:6.9.2\nEXPOSE 8080\nCOPY server.js .\nCMD node server.js");
        assert.equal('node', analysis.runtime);
    });

    test("Analyser identifies Python dockerfiles", function() {
        var analysis = analyser.analyse('FROM  python:3\nEXPOSE  80\nCMD ["python", "-m", "http.server"]');
        assert.equal('python', analysis.runtime);
    });

    test("Analyser identifies Ruby dockerfiles", function() {
        var analysis = analyser.analyse('FROM  ruby:2.1-onbuild\nCMD ["./script.rb"]');
        assert.equal('ruby', analysis.runtime);
    });

    test("Analyser does not identify unknown runtimes", function() {
        var analysis = analyser.analyse('FROM befunge:0.1.0\nCMD befunge clever.bf');
        assert.equal(false, analysis.succeeded);
    });

    test("Analyser identifies exposed Web service", function() {
        var analysis = analyser.analyse("FROM node:6.9.2\nEXPOSE 8080\nCOPY server.js .\nCMD node server.js");
        assert.equal(true, analysis.exposesService);
    });

    test("Analyser identifies non-exposed commands", function() {
        var analysis = analyser.analyse("FROM node:6.9.2\nCOPY service.js .\nCMD node service.js");
        assert.equal(false, analysis.exposesService);
    });

    test("Analyser infers runtime from ENTRYPOINT (exec style)", function() {
        var analysis = analyser.analyse('FROM node:6.9.2\nEXPOSE 8080\nCOPY server.js .\nENTRYPOINT ["node", "server.js"]');
        assert.equal('node', analysis.runtime);
    });

    test("Analyser infers runtime from ENTRYPOINT (shell style)", function() {
        var analysis = analyser.analyse('FROM node:6.9.2\nEXPOSE 8080\nCOPY server.js .\nENTRYPOINT node server.js');
        assert.equal('node', analysis.runtime);
    });

    test("Analyser infers runtime from ENTRYPOINT and ignores CMD default args", function() {
        var analysis = analyser.analyse('FROM node:6.9.2\nEXPOSE 8080\nCOPY server.js .\nENTRYPOINT node\nCMD ["python"]');
        assert.equal('node', analysis.runtime);
    });
});