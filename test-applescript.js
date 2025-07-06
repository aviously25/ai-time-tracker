const { AppleScriptTracker } = require('./src/utils/applescript-tracker');

async function testAppleScriptTracker() {
    console.log('Testing AppleScript Tracker...');

    const tracker = new AppleScriptTracker();

    console.log('Platform:', process.platform);
    console.log('Supported:', tracker.isSupported());

    if (!tracker.isSupported()) {
        console.log('AppleScript tracker is not supported on this platform');
        return;
    }

    try {
        console.log('\nTesting getActiveWindow()...');
        const activeWindow = await tracker.getActiveWindow();
        console.log('Active Window:', JSON.stringify(activeWindow, null, 2));

        if (!activeWindow) {
            console.log('\nTrying fallback method...');
            const fallbackWindow = await tracker.getSimpleActiveWindow();
            console.log('Fallback Window:', JSON.stringify(fallbackWindow, null, 2));
        }

    } catch (error) {
        console.error('Error testing AppleScript tracker:', error);
    }
}

testAppleScriptTracker(); 