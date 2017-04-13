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

function findKindModel(swagger, kindName : string) : TypeModel {
    var v1def = findProperty(swagger.definitions, 'v1.' + kindName);
    var v1beta1def = findProperty(swagger.definitions, 'v1beta1.' + kindName);
    var kindDef = v1def || v1beta1def;
    return kindDef;
}

function chaseFieldPath(swagger, currentProperty : TypeModel, currentPropertyName : string, fields : string[]) {

    // What are our scenarios?
    // 1. (ex: Deployment.[metadata]): We are at the end of the chain and
    //    are on a property with a $ref AND the $ref is of type 'object' and
    //    has a list of properties.  List the NAME and DESCRIPTION of the current property
    //    plus the DESCRIPTION of the type (e.g. 'Standard object metadata.\n\n
    //    ObjectMeta is metadata that...'), followed by a list of properties
    //    of the type (name + type + description).
    // 2. (ex: Deployment.[metadata].generation): We are in the midle of the chain,
    //    and are on a property with a $ref AND the $ref is of type 'object' and
    //    has a list of properties.  Locate the property in the $ref corresponding to the NEXT
    //    element in the chain, and move to that.
    // 2a. (ex: Deployment.[metadata].biscuits): We are in the middle of the chain,
    //    and are on a property with a $ref AND the $ref is of type 'object' and
    //    has a list of properties, BUT there is no property corresponding to the
    //    next element in the chain.  Report an error; the kubectl message is
    //    "field 'biscuits' does not exist"
    // 3. (ex: Deployment.metadata.[generation]): We are at the end of the chain
    //    and are on a property with a type and no $ref.  List the NAME, TYPE and
    //    DESCRIPTION of the current property.
    // 3a. (ex: Deployment.metadata.[generation].biscuits): We are NOT at the end of
    //    the chain, but are on a property with a type and no $ref.  Treat as #3 and
    //    do not traverse (this is what kubectl does).  Basically in #3 we are allowed
    //    to ignore the end-of-chain check.
    // 4. (ex: Deployment.metadata.[annotations].*): We are in the middle of the chain,
    //    and are on a property WITHOUT a $ref but of type 'object'.  This is an
    //    unstructured key-value store scenario.  List the NAME, TYPE and DESCRIPTION
    //    of the current property.
    // 5. (ex: Deployment.metadata.[creationTimestamp]): We are on a property with a $ref,
    //    BUT the type of the $ref is NOT 'object' and it does NOT have a list of properties.
    //    List the NAME of the property, the TYPE of the $ref and DESCRIPTION of the property.
    // 6. (ex: [Deployment].metadata): We are in the middle of the chain, and are on a property
    //    WITHOUT a $ref, BUT it DOES have a list of properties.  Locate the property in the list
    //    corresponding to the NEXT element in the chain, and move to that.
    // 7. (ex: [Deployment]): We are at the end of the chain, and are on a property
    //    WITHOUT a $ref, BUT it DOES have a list of properties.  List the NAME and DESCRIPTION
    //    of the current property, followed by a list of child properties.
    //
    // Algorithm:
    // Are we on a property with a $ref?
    //   If YES:
    //     Does the $ref have a list of properties?
    //     If YES:
    //       Are we at the end of the chain?
    //       If YES:
    //         Case 1: List the NAME and DESCRIPTION of the current property, and the DESCRIPTION and CHILD PROPERTIES of the $ref.
    //       If NO:
    //         Does the $ref contain a property that matches the NEXT element in our chain?
    //         If YES:
    //           Case 2: Traverse to that property and recurse.
    //         If NO:
    //           Case 2a: Error: field does not exist
    //     If NO:
    //        Case 5: List the NAME of the current property, the TYPE of the $ref, and the DESCRIPTION of the current property.
    //   If NO:
    //     Does the current property have a list of properties?
    //     If YES:
    //       Are we at the end of the chain?
    //       If YES:
    //         Case 1: List the NAME and DESCRIPTION of the current property, and the CHILD PROPERTIES.
    //       If NO:
    //         Does the property list contain a property that matches the NEXT element in our chain?
    //         If YES:
    //           Case 2: Traverse to that property and recurse.
    //         If NO:
    //           Case 2a: Error: field does not exist
    //     If NO:
    //       Is the property of type 'object'?
    //       If YES:
    //         Case 4: List the NAME, TYPE and DESCRIPTION of the current property.  (Ignore subsequent elements in the chain.)
    //       If NO:
    //         Case 3/3a: List the NAME, TYPE and DESCRIPTION of the current property.  (Ignore subsequent elements in the chain.)
    //       [So cases 3, 3a and 4 are all the same really.]

    var currentPropertyTypeRef = currentProperty.$ref || (currentProperty.items ? currentProperty.items.$ref : undefined);

    if (currentPropertyTypeRef) {
        var typeDefnPath : string[] = currentPropertyTypeRef.split('/');
        typeDefnPath.shift();
        var currentPropertyTypeInfo = findTypeDefinition(swagger, typeDefnPath);
        if (currentPropertyTypeInfo) {
            var typeRefProperties = currentPropertyTypeInfo.properties;
            if (typeRefProperties) {
                if (fields.length === 0) {
                    return explainComplex2(currentPropertyName, currentProperty.description, currentPropertyTypeInfo.description, typeRefProperties);
                } else {
                    var nextField = fields.shift();
                    var nextProperty = findProperty(typeRefProperties, nextField);
                    if (nextProperty) {
                        return chaseFieldPath(swagger, nextProperty, nextField, fields);
                    } else {
                        return explainError(nextField, 'field does not exist');
                    }
                }

            } else {
                return explainOne(currentPropertyName, typeDesc(currentPropertyTypeInfo), currentProperty.description);
            }
        } else {
            return explainError(currentPropertyTypeRef, 'unresolvable type reference');
        }

    } else {
        var properties = currentProperty.properties;
        if (properties) {
            if (fields.length === 0) {
                return explainComplex(currentPropertyName, currentProperty.description, properties);
            } else {
                var nextField = fields.shift();
                var nextProperty = findProperty(properties, nextField);
                if (nextProperty) {
                    return chaseFieldPath(swagger, nextProperty, nextField, fields);
                } else {
                    return explainError(nextField, 'field does not exist');
                }
            }
        } else {
            return explainOne(currentPropertyName, typeDesc(currentProperty), currentProperty.description);
        }
    }
}

function explainOne(name : string, type : string, description : string) {
    return `**${name}** (${type})\n\n${description}`;
}

function explainComplex(name : string, description : string, children : any) {
    var ph = '';
    for (var p in children) {
        ph = ph + `**${p}** (${typeDesc(children[p])})\n\n${children[p].description}\n\n`;
    }
    return `${name}: ${description}\n\n${ph}`;
}

function explainComplex2(name : string, description : string, typeDescription : string, children : any) {
    var ph = '';
    for (var p in children) {
        ph = ph + `**${p}** (${typeDesc(children[p])})\n\n${children[p].description}\n\n`;
    }
    return `${name}: ${description}\n\n${typeDescription}\n\n${ph}`;
}

function explainError(header : string, error : string) {
    return `**${header}:** ${error}`;
}

function chaseFieldPath_old(swagger, startingFrom, name : string, fields : string[]) {
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
            // EXAMPLE: Deployment.metadata.creationTimestamp
            // (but not generation oddly enough)
            // LOOKS LIKE: $ref where the ref has { type: string } etc.
            // instead of { properties : [...] }
            var type = typeDesc(startingFrom);
            return `**${name}** (${type})\n\n${startingFrom.description} BUT OH NO LOST MY CONTEXT WANT TO DESCRIBE PROPERTY NOT TYPE`;
            //return "PRIMITIVE: " + JSON.stringify(startingFrom);
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
            return chaseFieldPath_old(swagger, typeDefn, fieldName, fields);
        } else {
            if (fields.length === 0) {
                return `**${fieldName}** (${fieldDefn.type})\n\n${fieldDefn.description}`;
            } else {
                // we're at a primitive type, but still have a path to
                // traverse - error
                // TODO: this can happen when you point to an element in
                // a KVP collection (as those can be dynamic)
                // this can be determined as type=object but no $ref
                // EXAMPLE: Deployment.metadata.annotations.*
                return `ERROR: terminal type ${startingFrom.name} with outstanding path from ${fieldName}`;
            }
        }
    }
}

function typeDesc(p : Typed) {
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

function findTypeDefinition(swagger, typeDefnPath : string[]) : TypeModel {
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

interface Typed {
    readonly type? : string;
    readonly items? : Typed;
    readonly $ref : string;
}

// TODO: this isn't really a type model - it can be a type model (description + properties) *or* a property model (description + [type|$ref])
interface TypeModel extends Typed {
    readonly description? : string;
    readonly properties? : any;
}
