
import { parseCarData } from '../services/enhanced-parsing.utils.js';

if (process.env.ALLOW_DEPRECATED !== '1') {
    console.error('[DEPRECATED] mtproto_qa.ts is legacy QA helper. Set ALLOW_DEPRECATED=1 to run intentionally.');
    process.exit(1);
}

const TEST_CASES = [
    {
        name: "Standard Labeled",
        text: "Price: 15,000$\nYear: 2020\nMileage: 50,000 km\nVolkswagen Passat",
        expected: { price: 15000, currency: 'USD', year: 2020, mileage: 50000 }
    },
    {
        name: "Russian Labeled",
        text: "Цена 12 500 $\nГод выпуска 2018\nПробег 120 тыс км",
        expected: { price: 12500, currency: 'USD', year: 2018, mileage: 120000 }
    },
    {
        name: "Symbol First",
        text: "$10,500\n2015 BMW 328i\n100k miles",
        expected: { price: 10500, currency: 'USD', year: 2015, mileage: 100000 }
    },
    {
        name: "Suffix Price",
        text: "15.5k$ Only today!\n2019 Toyota Camry",
        expected: { price: 15500, currency: 'USD', year: 2019, mileage: undefined }
    },
    {
        name: "Euro Price",
        text: "25000€\nAudi A6 2021",
        expected: { price: 25000, currency: 'EUR', year: 2021, mileage: undefined }
    },
    {
        name: "UAH Price",
        text: "400 000 грн\nLanos 2008", // Common typo 'грн' handled by detection?
        expected: { price: 400000, currency: 'UAH', year: 2008, mileage: undefined }
    },
    {
        name: "Mixed Line format",
        text: "Passat B8 2.0 TDI 2017\n$14000\n180tkm",
        expected: { price: 14000, currency: 'USD', year: 2017, mileage: 180000 }
    }
];

async function run() {
    console.log("=== MTProto Parser QA Run ===");
    console.log(`running ${TEST_CASES.length} tests...\n`);

    let passed = 0;
    const results = [];

    for (const test of TEST_CASES) {
        const result = parseCarData(test.text);

        const errors: string[] = [];
        if (test.expected.price !== undefined && result.price !== test.expected.price) errors.push(`Price: ${result.price} != ${test.expected.price}`);
        if (test.expected.currency !== undefined && result.currency !== test.expected.currency) errors.push(`Currency: ${result.currency} != ${test.expected.currency}`);
        if (test.expected.year !== undefined && result.year !== test.expected.year) errors.push(`Year: ${result.year} != ${test.expected.year}`);
        if (test.expected.mileage !== undefined && result.mileage !== test.expected.mileage) errors.push(`Mileage: ${result.mileage} != ${test.expected.mileage}`);

        const isPass = errors.length === 0;
        if (isPass) passed++;

        results.push({
            name: test.name,
            pass: isPass,
            errors,
            parsed: result
        });
    }

    // Print Table
    console.table(results.map(r => ({
        Name: r.name,
        Pass: r.pass ? '✅' : '❌',
        Errors: r.errors.join(', ')
    })));

    console.log(`\nResult: ${passed}/${TEST_CASES.length} passed.`);
}

run().catch(console.error);
