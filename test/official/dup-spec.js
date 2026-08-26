import { symbols } from "../../dist/katex.esm.js";
import { macros } from "../../dist/katex.esm.js";

describe("Symbols and macros", () => {
    for (const macro in macros) {
        if (!macros.hasOwnProperty(macro)) {
            continue;
        }
        it(`macro ${macro} should not shadow a symbol`, () => {
            for (const kind in symbols) {
                if (!symbols.hasOwnProperty(kind)) {
                    continue;
                }
                expect(symbols[kind][macro]).toBeFalsy();
            }
        });
    }
});
