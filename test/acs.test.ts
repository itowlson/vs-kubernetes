import * as assert from 'assert';
import * as textassert from './textassert';
import * as fakes from './fakes';

import * as acs from '../src/acs';

suite("acs tests", () => {

    suite("uiProvider method", () => {

        test("Can create UI provider", () => {
            const acsui = acs.uiProvider();
            assert.notEqual(acsui, undefined);
            assert.notEqual(acsui, null);
        });

    });

});