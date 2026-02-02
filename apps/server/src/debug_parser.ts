
import axios from 'axios';
import * as cheerio from 'cheerio';

const url = 'https://auto.ria.com/uk/auto_bmw_x5_36566666.html'; // Example URL (might need a real active one)
// Using a generic valid URL if that one is dead, or let's try a major site like google or github first to verify logic
const targetUrl = process.argv[2] || 'https://www.google.com';

const extract = (html: string) => {
    const $ = cheerio.load(html);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content');
    return { title, image };
};

const run = async () => {
    console.log(`Testing URL: ${targetUrl}`);

    // 1. Without UA
    try {
        console.log('--- Request 1: No User-Agent ---');
        const res1 = await axios.get(targetUrl, { validateStatus: () => true });
        console.log(`Status: ${res1.status}`);
        console.log('Extracted:', extract(res1.data));
    } catch (e: any) {
        console.log('Error 1:', e.message);
    }

    // 2. With UA
    try {
        console.log('\n--- Request 2: With User-Agent ---');
        const res2 = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            validateStatus: () => true
        });
        console.log(`Status: ${res2.status}`);
        console.log('Extracted:', extract(res2.data));
    } catch (e: any) {
        console.log('Error 2:', e.message);
    }
};

run();
