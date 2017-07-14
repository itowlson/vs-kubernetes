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

    });

    suite("UIProvider class", () => {

        test("UI provider raises change event on start", () => {
            const acsui = acs.uiProvider();
            let uris : vscode.Uri[] = [];
            acsui.onDidChange((uri) => uris.push(uri));
            acsui.start('foo');
            assert.equal(1, uris.length);
            assert.equal('acsconfigure://operations/foo', uris[0].toString());
        });

        test("UI provider raises change event on next", async () => {
            const acsui = acs.uiProvider();
            let uris : vscode.Uri[] = [];
            acsui.start('bar');
            acsui.onDidChange((uri) => uris.push(uri));
            await acsui.next({ operationId: 'bar', requestData: null });
            assert.equal(1, uris.length);
            assert.equal('acsconfigure://operations/bar', uris[0].toString());
        });

        test("Initiating an operation puts it at the initial stage", async () => {
            const acsui = acs.uiProvider();
            acsui.start('foo');
            const text = await acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            textassert.startsWith('<!-- Initial -->', text);
        });

        test("Advancing an operation puts it through the stages", async () => {
            const acsui = acs.uiProvider();
            acsui.start('foo');
            await acsui.next({ operationId: 'foo', requestData: null });
            const text1 = await acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            textassert.startsWith('<!-- PromptForSubscription -->', text1);
            await acsui.next({ operationId: 'foo', requestData: null });
            const text2 = await acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            textassert.startsWith('<!-- PromptForCluster -->', text2);
            await acsui.next({ operationId: 'foo', requestData: null });
            const text3 = await acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            textassert.startsWith('<!-- Complete -->', text3);
        });

        test("Advancing an operation does not affect other operations", async () => {
            const acsui = acs.uiProvider();
            acsui.start('foo');
            acsui.start('bar');
            await acsui.next({ operationId: 'bar', requestData: null });
            await acsui.next({ operationId: 'bar', requestData: null });
            const text = await acsui.provideTextDocumentContent(acs.operationUri('foo'), cancellationToken);
            textassert.startsWith('<!-- Initial -->', text);
        });

    });

});