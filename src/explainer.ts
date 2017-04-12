'use strict';

import * as k8s from 'k8s';
import * as pluralize from 'pluralize';
import * as kubeconfig from './kubeconfig';

export function formatExplain(rawText) {
    if (!rawText) {
        return rawText;
    }

    var lines = rawText.replace(/\r\n/g, '\n').split('\n');

    if (rawText.startsWith('FIELD')) {
        return formatField(lines);
    }

    if (rawText.startsWith('DESCRIPTION')) {
        return formatDescription(lines);
    }

    if (rawText.startsWith('RESOURCE')) {
        return formatResource(lines);
    }

    return {
        'language': "json",
        'value': rawText
    };
}

function formatField(lines) {
    /*
    source:

    FIELD: name <type>

    DESCRIPTION:
        first line
        second line

    desired output:

    **FIELD:** name <type>

    **DESCRIPTION:**
    first line
    second line
    */

    var formattedLines = lines.map(function (line) {
        var formatted = emboldenPrefix(line);
        formatted = removeLeading(formatted);
        return formatted;
    }, this);

    return formattedLines.join('\n')
}

function formatDescription(lines) {
    /*
    source:

    DESCRIPTION:
    first line
    second line

    FIELDS:
        field1 <type>
        first line
        second line

        field2 <type>
        first line
        second line

    desired output:

    **DESCRIPTION:**
    first line
    second line

    **FIELDS:**

    **field1** <type>

    first line
    second line

    **field2** <type>

    first line
    second line
    */

    var parserState = 'init';
    var formattedLines = [];
    let formatted;

    while (lines.length > 0) {
        var line = lines.shift();
        switch (parserState) {
            case 'init':
                formatted = emboldenPrefix(line);
                formattedLines.push(formatted);
                if (formatted.startsWith('**FIELD')) {
                    formattedLines.push("");
                    parserState = 'fields-none';
                }
                break;
            case 'fields-none':
                formatted = removeLeading(line);
                formatted = emboldenFieldName(formatted);
                formattedLines.push(formatted);
                if (formatted.startsWith('**')) {
                    parserState = 'field-first';
                }
                break;
            case 'field-first':
                if (line.length === 0) {
                    break;
                }
                formatted = removeLeading(line);
                formattedLines.push("");
                formattedLines.push(formatted);
                parserState = 'field-rest';
                break;
            case 'field-rest':
                if (line.length === 0) {
                    parserState = 'fields-none';
                    formattedLines.push(line);
                    break;
                }
                formatted = removeLeading(line);
                formattedLines.push(formatted);
                break;
        }
    }

    return formattedLines.join('\n');
}

function formatResource(lines) {
    /*
    source:

    RESOURCE: name <type>

    DESCRIPTION:
         first summary line
         second summary line

        first line
        second line

    FIELDS:
       field1 <type>
         first line
         second line

       field2 <type>
         first line
         second line

    desired output:

    **RESOURCE:** name <type>

    **DESCRIPTION:**
    first summary line
    second summary line

    first line
    second line

    **FIELDS:**

    **field1** <type>

    first line
    second line

    **field2** <type>

    first line
    second line
    */

    var parserState = 'init';
    var formattedLines = [];
    let formatted;

    while (lines.length > 0) {
        var line = lines.shift();
        switch (parserState) {
            case 'init':
                formatted = emboldenPrefix(line);
                formattedLines.push(formatted);
                if (formatted.startsWith('**DESCRIPTION')) {
                    parserState = 'description-body';
                }
                if (formatted.startsWith('**FIELD')) {
                    formattedLines.push("");
                    parserState = 'fields-none';
                }
                break;
            case 'description-body':
                formatted = emboldenPrefix(line);
                formatted = removeLeading(formatted);
                formattedLines.push(formatted);
                if (formatted.startsWith('**FIELD')) {
                    formattedLines.push("");
                    parserState = 'fields-none';
                }
                break;
            case 'fields-none':
                formatted = removeLeading(line);
                formatted = emboldenFieldName(formatted);
                formattedLines.push(formatted);
                if (formatted.startsWith('**')) {
                    parserState = 'field-first';
                }
                break;
            case 'field-first':
                if (line.length === 0) {
                    break;
                }
                formatted = removeLeading(line);
                formattedLines.push("");
                formattedLines.push(formatted);
                parserState = 'field-rest';
                break;
            case 'field-rest':
                if (line.length === 0) {
                    parserState = 'fields-none';
                    formattedLines.push(line);
                    break;
                }
                formatted = removeLeading(line);
                formattedLines.push(formatted);
                break;
        }
    }

    return formattedLines.join('\n');
}

function emboldenPrefix(line) {
    if (!line) {
        return line;
    }
    var prefixes = ['FIELD:', 'FIELDS:', 'DESCRIPTION:', 'RESOURCE:'];
    prefixes.forEach(function (prefix) {
        if (line.startsWith(prefix)) {
            line = '**' + prefix + '**' + line.substring(prefix.length);
        }
    });
    return line;
}

function emboldenFieldName(line) {
    if (!line) {
        return line;
    }
    var parse = line.match(/^(\w+)\s+\<(\[\])?\w+\>(\s+-required-)?$/);
    if (parse) {
        line = '**' + parse[1] + '**' + line.substring(parse[1].length)
        if (parse[3]) {
            line = line.replace('-required-', '**[required]**')
        }
    }
    return line;
}

function removeLeading(line) {
    if (!line) {
        return line;
    }
    return line.replace(/^\s+/, '')
}

export function readSwagger() {
    return kubeconfig.readKubectlConfig().then(kc => readSwaggerCore(kc));
}

function readSwaggerCore(kc : kubeconfig.KubeConfig) {
    return new Promise(function (resolve, reject) {
        var kapi = k8s.api(apiCredentials(kc));
        kapi.get('swagger.json', function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

export function readExplanation(swagger, fieldsPath : string) {
    var fields = fieldsPath.split('.');
    var kindName = fields.shift();
    var kindDef = findKindModel(swagger, kindName);
    var text = chaseFieldPath(swagger, kindDef, kindName, fields);
    return text;
}

function findKindModel(swagger, kindName : string) {
    var v1def = findProperty(swagger.definitions, 'v1.' + kindName);
    var v1beta1def = findProperty(swagger.definitions, 'v1beta1.' + kindName);
    var kindDef = v1def || v1beta1def;
    return kindDef;
}

function chaseFieldPath(swagger, startingFrom, name : string, fields : string[]) {
    if (fields.length === 0) {
        // startingFrom is the definition of the field - dump it
        // (it may be a simple or complex type)
        var props = startingFrom.properties;
        if (props) {
            var ph = '';
            for (var p in props) {
                ph = ph + `**${p}** (${typeDesc(props[p])})\n\n${props[p].description}\n\n`;
            }
            return `${name}: ${startingFrom.description}\n\n${ph}`;
        } else {
            return "PRIMITIVE: " + JSON.stringify(startingFrom);
        }
    } else {
        // we are at an interim stage of the chain: chase
        // to the type of the next field in the traversal
        var fieldName = fields.shift();
        var props = startingFrom.properties;
        var fieldDefn = findProperty(props, fieldName);
        var fieldType = underlyingFieldType(fieldDefn);

        if (fieldType) {
            var typeDefnPath : string[] = fieldType.split('/');
            typeDefnPath.shift();
            var typeDefn = findTypeDefinition(swagger, typeDefnPath);
            return chaseFieldPath(swagger, typeDefn, fieldName, fields);
        } else {
            if (fields.length === 0) {
                return `**${fieldName}** (${fieldDefn.type})\n\n${fieldDefn.description}`;
            } else {
                // we're at a primitive type, but still have a path to
                // traverse - error
                // TODO: this can happen when you point to an element in
                // a KVP collection (as those can be dynamic)
                return `ERROR: terminal type ${startingFrom.name} with outstanding path from ${fieldName}`;
            }
        }
    }
}

function typeDesc(p) {
    var baseType = p.type || 'object';
    if (baseType == 'array') {
        return typeDesc(p.items) + '[]';
    }
    return baseType;
}

function apiCredentials(kc : kubeconfig.KubeConfig) {
    return {
        endpoint: kc.endpoint,
        auth: {
            clientCert: kc.clientCertificateData,
            clientKey: kc.clientKeyData,
            caCert: kc.certificateAuthorityData
        },
        version: '/'
    }
}

function singularizeVersionedName(name : string) {
    var bits = name.split('.');
    var lastBit = bits.pop();
    lastBit = pluralize.singular(lastBit);
    bits.push(lastBit);
    return bits.join('.');
}

function findProperty(obj, name) {
    var n = (name + "").toLowerCase();
    for (var p in obj) {
        if ((p + "").toLowerCase() == n) {
            return obj[p];
        }
    }
    var singname = singularizeVersionedName(name);
    if (singname == name) {
        return undefined;
    } else {
        return findProperty(obj, singname);
    }
}

function findTypeDefinition(swagger, typeDefnPath : string[]) {
    var m = swagger;
    for (var p of typeDefnPath) {
        m = findProperty(m, p);
        if (!m) {
            throw { errorCategory: 'unresolvableTypePath', message: `ERROR: undefined at ${m.name}->${p}` };
        }
    }
    return m;
}

function underlyingFieldType(fieldDefn) {
    if (fieldDefn.type == 'array') {
        return fieldDefn['items']['$ref'];
    } else {
        return fieldDefn['$ref'];
    }
}