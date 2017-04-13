/* global suite, test */

//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
var assert = require('assert');
var fs = require('fs');
var path = require('path');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// var vscode = require('vscode');
// var extension = require('../extension');
var explainer = require('../out/src/explainer');  // TODO: TyyyypppeeScriippptt!!!
var textassert = require('../out/test/textassert');

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", function() {
    test("Fields are transformed correctly", function() {
        assert.equal("**FIELD:** apiVersion", explainer.formatExplain("FIELD: apiVersion"));
        assert.equal("**FIELD:** apiVersion\n\n**DESCRIPTION:**\nThe version\nof the API", explainer.formatExplain("FIELD: apiVersion\n\nDESCRIPTION:\n    The version\n    of the API"));
    });

    test("Descriptions are transformed correctly", function() {
        assert.equal("**DESCRIPTION:**\nKind does thing", explainer.formatExplain("DESCRIPTION:\nKind does thing"));
        assert.equal("**DESCRIPTION:**\nKind does thing\n\n**FIELDS:**\n\n**apiVersion** <string>\n\nThe version\nof the API", explainer.formatExplain("DESCRIPTION:\nKind does thing\n\nFIELDS:\n  apiVersion <string>\n    The version\n    of the API"));
        assert.equal("**DESCRIPTION:**\nKind does\nthing\n\n**FIELDS:**\n\n**apiVersion** <string>\n\nThe version\nof the API\n\n**kind** <string>\n\nKind is kind", explainer.formatExplain("DESCRIPTION:\nKind does\nthing\n\nFIELDS:\n  apiVersion <string>\n    The version\n    of the API\n\n  kind <string>\n    Kind is kind"));
    });

    test("Resources are transformed correctly", function() {
        assert.equal("**RESOURCE:** spec <object>\n\n**DESCRIPTION:**\nThis is\na description\n\nAnd this is a less indented\npart of the description\n\n**FIELDS:**\n\n**apiVersion** <string>\n\nThe version\nof the API\n\n**volumes** <[]object>\n\nVolumes are voluminous", explainer.formatExplain("RESOURCE: spec <object>\n\nDESCRIPTION:\n     This is\n     a description\n\n    And this is a less indented\n    part of the description\n\nFIELDS:\n   apiVersion <string>\n     The version\n     of the API\n\n   volumes <[]object>\n     Volumes are voluminous"));
    });

    test("Windows line breaks are handled correctly", function() {
        assert.equal("**RESOURCE:** spec <object>\n\n**DESCRIPTION:**\nThis is\na description\n\nAnd this is a less indented\npart of the description\n\n**FIELDS:**\n\n**apiVersion** <string>\n\nThe version\nof the API\n\n**volumes** <[]object>\n\nVolumes are voluminous", explainer.formatExplain("RESOURCE: spec <object>\r\n\r\nDESCRIPTION:\r\n     This is\r\n     a description\r\n\r\n    And this is a less indented\r\n    part of the description\r\n\r\nFIELDS:\r\n   apiVersion <string>\r\n     The version\r\n     of the API\r\n\r\n   volumes <[]object>\r\n     Volumes are voluminous"));
    });

    test("Required fields are emphasised", function() {
        assert.equal("**RESOURCE:** spec <object>\n\n**DESCRIPTION:**\nFoo\n\n**FIELDS:**\n\n**containers** <[]Object>  **[required]**\n\nSome containers", explainer.formatExplain("RESOURCE: spec <object>\n\nDESCRIPTION:\n     Foo\n\nFIELDS:\n   containers <[]Object>  -required-\n     Some containers"));
    });

    var swaggerJson = fs.readFileSync(path.join(__dirname, 'kube-swagger.json'), 'utf8');
    var swagger = JSON.parse(swaggerJson);

    test("Kind documentation includes kind name - Deployment", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment');
        textassert.startsWith('Deployment:', expl);
    });

    test("Kind documentation includes description - Deployment", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment');
        textassert.includes('Deployment enables declarative updates for Pods and ReplicaSets', expl);
    });

    test("Kind documentation includes properties - Deployment", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment');
        textassert.includes('**apiVersion** (string)', expl);
        textassert.includes('APIVersion defines the versioned schema', expl);
        textassert.includes('**spec** (object)', expl);
        textassert.includes('Standard object metadata', expl);
    });

    test("Property search ignores kind case", function() {
        var expl = explainer.readExplanation(swagger, 'deployment.metadata');
        textassert.startsWith('metadata:', expl);
    });

    test("Nonterminal documentation includes title - Deployment.metadata", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata');
        textassert.startsWith('metadata:', expl);
    });

    test("Nonterminal documentation includes description - Deployment.metadata", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata');
        textassert.includes('Standard object metadata', expl);
    });

    test("Nonterminal documentation includes type description - Deployment.metadata", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata');
        textassert.includes('ObjectMeta is metadata that all persisted resources must have', expl);
    });

    test("Nonterminal documentation includes properties - Deployment.metadata", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata');
        textassert.includes('**finalizers** (string[])', expl);
        textassert.includes('Must be empty before the object is deleted from the registry', expl);
        textassert.includes('**uid** (string)', expl);
        textassert.includes('UID is the unique in time and space value for this object', expl);
    });

    test("Terminal primitive documentation includes title - Deployment.metadata.generation", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata.generation');
        textassert.startsWith('**generation** (integer)', expl);
    });

    test("Terminal primitive documentation includes description - Deployment.metadata.generation", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata.generation');
        textassert.includes('A sequence number representing', expl);
    });

    test("Terminal ref-to-primitive documentation includes title - Deployment.metadata.creationTimestamp", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata.creationTimestamp');
        textassert.startsWith('**creationTimestamp** (string)', expl);
    });

    test("Terminal ref-to-primitive documentation includes description - Deployment.metadata.creationTimestamp", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata.creationTimestamp');
        textassert.includes('CreationTimestamp is a timestamp representing the server time', expl);
    });

    test("KVP documentation reflects KVP collection - Deployment.metadata.annotations.deployment.kubernetes.io/revision", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata.annotations.deployment.kubernetes.io/revision');
        textassert.startsWith('**annotations** (object)', expl);
        textassert.includes('Annotations is an unstructured key value map', expl);
    });

    test("Nonexistent field on rich type reports error - Deployment.metadata.biscuits", function() {
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata.biscuits');
        textassert.startsWith("**biscuits:** field does not exist", expl);
    });

    test("Nonexistent field on primitive type is treated as parent - Deployment.metadata.generation.biscuits", function() {
        // This may seem odd but it's the way kubectl does it!
        var expl = explainer.readExplanation(swagger, 'Deployment.metadata.generation.biscuits');
        textassert.startsWith('**generation** (integer)', expl);
        textassert.includes('A sequence number representing', expl);
    });

});