import { MTProtoService } from '../src/modules/Integrations/mtproto/mtproto.service';

const SAMPLES = [
    {
        name: "Audi A5 Simple",
        text: `Audi A5 2013 year
2.0 benzin
12000$
Kiev
0991234567`,
        expected: { make: 'Audi', year: 2013, price: 12000, mileage: 0 }
    },
    {
        name: "BMW X5 Complex",
        text: `Продам BMW X5 f15
2015 год, 3.0 дизель
Пробег 145 тыс км
Цена 35 500 $
Торг`,
        expected: { make: 'BMW', year: 2015, price: 35500, mileage: 145000 }
    },
    {
        name: "Mercedes Clean",
        text: `Mercedes-Benz C300 4matic
2017
80k miles
$18,900
No accidents`,
        expected: { make: 'Mercedes-Benz', year: 2017, price: 18900, mileage: 128747 } // approx 80k miles -> km
    },
    {
        name: "Toyota Rogue",
        text: `Toyota Camry 70
2019 р
2.5 hybrid
55t km
21000 usd`,
        expected: { make: 'Toyota', year: 2019, price: 21000, mileage: 55000 }
    }
];

function runTests() {
    console.log("🧪 Testing Parser...");
    let passed = 0;

    for (const sample of SAMPLES) {
        console.log(`\n--- [${sample.name}] ---`);
        const result = MTProtoService.parseMessageToInventory(sample.text);

        // Validation
        const e = sample.expected;
        let p = true; // pass

        // Check Make
        if (result.title.includes(e.make)) console.log(`✅ Make found in title: ${e.make}`);
        else { console.log(`❌ Make missing. Title: "${result.title}"`); p = false; }

        // Check Price
        if (result.price === e.price) console.log(`✅ Price: ${result.price}`);
        else { console.log(`❌ Price info wrong: Got ${result.price}, Expected ${e.price}`); p = false; }

        // Check Mileage (Not yet implemented in parser)
        if (result.mileage === undefined) {
            console.log(`⚠️ Mileage not implemented yet.`);
        } else {
            if (result.mileage === e.mileage) console.log(`✅ Mileage: ${result.mileage}`);
            else { console.log(`❌ Mileage wrong: Got ${result.mileage}, Expected ${e.mileage}`); p = false; }
        }

        if (p) passed++;
    }

    console.log(`\n📊 Passed: ${passed}/${SAMPLES.length}`);
}

runTests();
