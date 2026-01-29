import { ParsingService } from '../src/modules/Integrations/parsing/parsing.service';

const SAMPLE_TEXT = `
Listing ID: 12345
Make: BMW
Model: X5
Price: $35,000 USD
Fuel: Diesel
Year: 2018
Description: Great car.
`;

const TEMPLATE = {
    name: "Standard List",
    rules: {
        "price": { method: 'REGEX', pattern: 'Price:\\s*([$0-9,]+)', groupIndex: 1 },
        "make": { method: 'KEYWORD_AFTER', keyword: 'Make:' },
        "year": { method: 'LINE_INDEX', lineIndex: 5 }, // "Year: 2018" is line 5
        // actually split('\n') might create empty first line if template starts with newline
        // Let's rely on robust counting or TRIM
    }
} as any;

function run() {
    console.log("🧪 Testing Parsing Service...");

    const result = ParsingService.extract(SAMPLE_TEXT.trim(), TEMPLATE);
    console.log("Result:", result);

    if (result.make === 'BMW' && (result.price === 35000 || result.price === '$35,000') && (result.year === 2018 || result.year === 'Year: 2018')) {
        console.log("✅ Basic Extraction Passed");
    } else {
        console.log("❌ Extraction Failed");
        process.exit(1);
    }
}

run();
