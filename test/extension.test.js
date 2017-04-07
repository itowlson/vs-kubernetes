/* global suite, test */

//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
var assert = require('assert');

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// var vscode = require('vscode');
// var extension = require('../extension');
var explainer = require('../explainer');

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
});