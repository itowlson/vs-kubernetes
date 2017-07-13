import * as vscode from 'vscode';

import * as assert from 'assert';
import * as textassert from './textassert';
import * as fakes from './fakes';

import * as acs from '../src/acs';

const cancellationToken = new vscode.CancellationTokenSource().token;

suite("acs tests", () => {

    suite("uiProvider method", () => {

        test("Can create UI provider", () => {
            const acsui = acs.uiProvider();
            assert.notEqual(acsui, undefined);
            assert.notEqual(acsui, null);
        });

        test("Initiating an operation puts it at the initial stage", () => {
            const acsui = acs.uiProvider();
            acsui.start('foo');
            const text = acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            assert.equal('foo is at stage 0', text);
        });

        test("Advancing an operation puts it through the stages", async () => {
            const acsui = acs.uiProvider();
            acsui.start('foo');
            await acsui.next({ operationId: 'foo', requestData: null });
            const text1 = acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            assert.equal('foo is at stage 1', text1);
            await acsui.next({ operationId: 'foo', requestData: null });
            const text2 = acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            assert.equal('foo is at stage 2', text2);
        });

        test("Advancing an operation does not affect other operations", async () => {
            const acsui = acs.uiProvider();
            acsui.start('foo');
            acsui.start('bar');
            await acsui.next({ operationId: 'bar', requestData: null });
            await acsui.next({ operationId: 'bar', requestData: null });
            const text = acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            assert.equal('foo is at stage 0', text);
        });

    });

});