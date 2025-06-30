const path = require('path');
const { DatabaseManager } = require('../src/database/database-manager');
const { AIAnalyzer } = require('../src/ai/ai-analyzer');
const { startOfDay, endOfDay, subDays } = require('date-fns');

// Parse command line args
const args = process.argv.slice(2);
let range = 'all';
args.forEach(arg => {
    if (arg.startsWith('--range=')) {
        range = arg.split('=')[1];
    }
});

function getDateRange(range) {
    const now = new Date();
    switch (range) {
        case 'day':
        case 'today':
            return [startOfDay(now), endOfDay(now)];
        case 'week':
            return [startOfDay(subDays(now, 7)), endOfDay(now)];
        case 'month':
            return [startOfDay(subDays(now, 30)), endOfDay(now)];
        case 'all':
        default:
            return [null, null];
    }
}

(async () => {
    const db = new DatabaseManager();
    await db.initialize();
    const ai = new AIAnalyzer();

    // Manually enable AI if settings exist
    const Store = require('electron-store');
    const storePath = '/Users/aviudash/Library/Application Support/ai-time-tracker';
    const store = new Store({ cwd: storePath });
    const storedApiKey = store.get('togetherApiKey', '');
    const storedAiEnabled = store.get('aiEnabled', true);

    if (storedApiKey) {
        ai.setApiKey(storedApiKey);
        ai.aiEnabled = storedAiEnabled;
    }

    const [start, end] = getDateRange(range);
    let activities;
    if (start && end) {
        activities = await db.getActivityData({ start, end });
    } else {
        // Fetch all
        activities = await db.getActivityData('all');
    }

    let updated = 0;
    let total = activities.length;
    console.log(`Re-categorizing ${total} activities in range: ${range}`);

    for (const activity of activities) {
        const oldCategory = activity.category;
        const newCategory = await ai.categorizeActivity(activity);
        console.log(`[CHECK] ${activity.window_title} (${activity.process_name}) ${oldCategory} -> ${newCategory}`);
        if (newCategory && newCategory !== oldCategory) {
            await db.updateActivityCategory(activity.id, newCategory);
            updated++;
            console.log(`[UPDATED] ${activity.window_title} (${activity.process_name}) ${oldCategory} -> ${newCategory}`);
        }
    }

    console.log(`Done! Updated ${updated} of ${total} activities.`);
    db.close();
})(); 