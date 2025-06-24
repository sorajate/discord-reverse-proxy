const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const ENDPOINT = '/discord1';
const TARGET_URL = `${BASE_URL}${ENDPOINT}`;

const COLORS = {
    RESET: "\x1b[0m",
    GREEN: "\x1b[32m",
    RED: "\x1b[31m",
    YELLOW: "\x1b[33m",
};

async function runTest(name, testFunction) {
    process.stdout.write(`- ${name}: `);
    try {
        const result = await testFunction();
        if (result) {
            console.log(`${COLORS.GREEN}PASS${COLORS.RESET}`);
        } else {
            console.log(`${COLORS.RED}FAIL${COLORS.RESET}`);
        }
    } catch (error) {
        console.log(`${COLORS.RED}FAIL (Error: ${error.message})${COLORS.RESET}`);
    }
}

// Test 1: Block Simple GET Request
async function testBlockSimpleGet() {
    const response = await fetch(TARGET_URL);
    return response.status === 405;
}

// Test 2: Filter GET Request with Parameters
async function testFilterGetWithParams() {
    const response = await fetch(`${TARGET_URL}?wait=true`);
    const body = await response.text();
    return response.status === 204 && body.length === 0;
}

// Test 3: Block PATCH Request
async function testBlockPatch() {
    const response = await fetch(TARGET_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Webhook Name' }),
    });
    return response.status === 405;
}

// Test 4: Block DELETE Request
async function testBlockDelete() {
    const response = await fetch(TARGET_URL, { method: 'DELETE' });
    return response.status === 405;
}

// Main test runner
async function main() {
    console.log(`${COLORS.YELLOW}===================================${COLORS.RESET}`);
    console.log(`${COLORS.YELLOW} Running Discord Proxy Test Suite${COLORS.RESET}`);
    console.log(`${COLORS.YELLOW}===================================${COLORS.RESET}`);
    console.log('');

    await runTest('Block Simple GET Request', testBlockSimpleGet);
    await runTest('Filter GET Request with Parameters', testFilterGetWithParams);
    await runTest('Block PATCH Request', testBlockPatch);
    await runTest('Block DELETE Request', testBlockDelete);

    console.log('');
    console.log(`${COLORS.YELLOW}===================================${COLORS.RESET}`);
    console.log(`${COLORS.YELLOW}         Tests Complete${COLORS.RESET}`);
    console.log(`${COLORS.YELLOW}===================================${COLORS.RESET}`);
}

main().catch(err => {
    console.error(`${COLORS.RED}A critical error occurred during testing:`, err, COLORS.RESET);
});
