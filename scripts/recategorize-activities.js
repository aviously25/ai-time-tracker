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

// Group activities by process name to reduce API calls
function groupActivitiesByProcess(activities) {
    const groups = {};

    activities.forEach(activity => {
        const key = activity.process_name;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(activity);
    });

    return groups;
}

// Create a batch prompt for multiple activities from the same process
function createBatchPrompt(processName, activities, categories) {
    const activityList = activities.map((activity, index) =>
        `${index + 1}. ${activity.window_title}`
    ).join('\n');

    return `Categorize these activities from "${processName}" into one of these categories:
${categories.map(cat => `- ${cat}`).join('\n')}

Activities:
${activityList}

Examples of correct responses:
For activities: "1. Google Search", "2. GitHub", "3. YouTube"
Response: productivity, development, entertainment

For activities: "1. Gmail", "2. Slack", "3. Zoom"
Response: communication, communication, communication

Respond with only the category names, separated by commas, in the same order as the activities above. Do not include numbers or any other formatting.`;
}

(async () => {
    const db = new DatabaseManager();
    await db.initialize();
    const ai = new AIAnalyzer();

    // Manually enable AI if settings exist
    const Store = require('electron-store');
    const store = new Store();
    const storePath = '/Users/aviudash/Library/Application Support/ai-time-tracker';
    const store2 = new Store({ cwd: storePath });
    const storedApiKey = store2.get('togetherApiKey', '');
    const storedAiEnabled = store2.get('aiEnabled', true);
    const storedCategories = store2.get('categories', []);

    console.log('[SETTINGS LOADED]', {
        hasApiKey: !!storedApiKey,
        aiEnabled: storedAiEnabled,
        categories: storedCategories
    });

    if (storedApiKey) {
        ai.setApiKey(storedApiKey);
        ai.aiEnabled = storedAiEnabled;
        // Set the categories from settings
        ai.setCategories(storedCategories);
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

    // Group activities by process name
    const activityGroups = groupActivitiesByProcess(activities);
    // Use the categories from settings, not hardcoded defaults
    const categories = storedCategories && storedCategories.length > 0 ? storedCategories : ai.categories;

    console.log(`Using categories:`, categories);
    console.log(`Grouped into ${Object.keys(activityGroups).length} process groups for efficient processing`);

    for (const [processName, processActivities] of Object.entries(activityGroups)) {
        try {
            console.log(`Processing ${processActivities.length} activities from "${processName}"...`);

            // Create batch prompt
            const prompt = createBatchPrompt(processName, processActivities, categories);

            // Make single API call for all activities from this process
            const messages = [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that categorizes computer activities. Respond with only category names, one per line.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const response = await ai.together.chat.completions.create({
                model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
                messages: messages,
                max_tokens: 1000,
                temperature: 0.3,
                top_p: 0.9
            });

            const responseText = response.choices[0].message.content.trim();
            // Parse comma-separated categories and clean up any numbering or extra formatting
            const suggestedCategories = responseText
                .split(/[,\n]/) // Split by comma or newline
                .map(cat => cat.trim().toLowerCase())
                .map(cat => cat.replace(/^\d+\.\s*/, '')) // Remove numbering like "1. " or "2. "
                .filter(cat => cat && categories.includes(cat)); // Only keep valid categories

            console.log(`AI response for "${processName}":`, suggestedCategories);

            // Update activities with new categories
            for (let i = 0; i < processActivities.length && i < suggestedCategories.length; i++) {
                const activity = processActivities[i];
                const suggestedCategory = suggestedCategories[i];

                // Validate category is in our list
                if (categories.includes(suggestedCategory) && suggestedCategory !== activity.category) {
                    await db.updateActivityCategory(activity.id, suggestedCategory);
                    updated++;
                    console.log(`[UPDATED] ${activity.window_title} (${activity.process_name}) ${activity.category} -> ${suggestedCategory}`);
                }
            }

            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
            console.error(`Error processing "${processName}":`, error);
            // Continue with next group instead of failing completely
        }
    }

    console.log(`Done! Updated ${updated} of ${total} activities.`);
    console.log(`Made ${Object.keys(activityGroups).length} API calls instead of ${total} individual calls.`);
    db.close();
})(); 