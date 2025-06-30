const Together = require('together-ai');
const Store = require('electron-store');

const DEFAULT_CATEGORIES = [
    'productivity', 'development', 'communication', 'social_media', 'entertainment', 'news', 'shopping', 'system', 'other'
];

class AIAnalyzer {
    constructor() {
        this.store = new Store();
        this.together = null;
        this.aiEnabled = this.store.get('aiEnabled', true);
        this.apiKey = this.store.get('togetherApiKey', '');
        this.categories = this.store.get('categories', DEFAULT_CATEGORIES);
        this.categoryDescriptions = this.store.get('categoryDescriptions', {});
        this.appOverrides = this.store.get('appOverrides', {});
        this.customCategorizationPrompt = this.store.get('customCategorizationPrompt', '');

        if (this.apiKey) {
            this.together = new Together({
                apiKey: this.apiKey
            });
        }
    }

    isEnabled() {
        return this.aiEnabled && this.apiKey;
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.store.set('togetherApiKey', apiKey);

        if (apiKey) {
            this.together = new Together({
                apiKey: apiKey
            });
        } else {
            this.together = null;
        }
    }

    setCategories(categories) {
        this.categories = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
        this.store.set('categories', this.categories);
    }

    setAppOverrides(overrides) {
        this.appOverrides = overrides || {};
        this.store.set('appOverrides', this.appOverrides);
    }

    setCustomCategorizationPrompt(prompt) {
        this.customCategorizationPrompt = prompt || '';
        this.store.set('customCategorizationPrompt', this.customCategorizationPrompt);
    }

    setCategoryDescriptions(descriptions) {
        this.categoryDescriptions = descriptions || {};
        this.store.set('categoryDescriptions', this.categoryDescriptions);
    }

    async analyzeActivity(activity) {
        if (!this.isEnabled() || !this.together) {
            return null;
        }

        try {
            const messages = [
                {
                    role: 'system',
                    content: 'You are an AI productivity assistant that analyzes user activity patterns and provides helpful insights. Be concise, actionable, and encouraging.'
                },
                {
                    role: 'user',
                    content: this.buildActivityPrompt(activity)
                }
            ];

            const response = await this.together.chat.completions.create({
                model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
                messages: messages,
                max_tokens: 150,
                temperature: 0.7,
                top_p: 0.9
            });

            return response.choices[0].message.content.trim();
        } catch (error) {
            console.error('Error analyzing activity with TogetherAI:', error);
            return null;
        }
    }

    buildActivityPrompt(activity) {
        const duration = Math.floor(activity.duration / 60); // Convert to minutes
        const timeString = new Date(activity.timestamp).toLocaleTimeString();

        return `Activity Analysis Request:
- Time: ${timeString}
- Application: ${activity.processName}
- Window Title: ${activity.windowTitle}
- Category: ${activity.category}
- Duration: ${duration} minutes
- URL: ${activity.url || 'N/A'}

Please provide a brief, actionable insight about this activity. Consider:
1. Is this productive time?
2. Any potential distractions?
3. Suggestions for optimization?
4. Positive reinforcement if it's good behavior

Keep the response under 100 words and be encouraging.`;
    }

    async categorizeActivity(activity) {
        // Check app overrides first
        const appOverride = this.appOverrides[activity.processName];
        if (appOverride && appOverride.category) {
            return appOverride.category;
        }

        if (!this.isEnabled() || !this.together) {
            return activity.category;
        }

        try {
            // Use only categories from settings
            const categoriesList = this.categories && this.categories.length > 0 ? this.categories : DEFAULT_CATEGORIES;

            // Build categories list with descriptions if available
            const categoriesWithDescriptions = categoriesList.map(cat => {
                const description = this.categoryDescriptions[cat];
                return description ? `- ${cat}: ${description}` : `- ${cat}`;
            }).join('\n');

            // Use custom prompt if available, otherwise use default
            let prompt;
            if (this.customCategorizationPrompt && this.customCategorizationPrompt.trim()) {
                prompt = this.customCategorizationPrompt
                    .replace('{categories}', categoriesWithDescriptions)
                    .replace('{appName}', activity.processName)
                    .replace('{windowTitle}', activity.windowTitle)
                    .replace('{currentCategory}', activity.category);
            } else {
                prompt = `Categorize this activity into one of these categories:\n${categoriesWithDescriptions}\n\nActivity: ${activity.processName} - ${activity.windowTitle}\nCurrent category: ${activity.category}\n\nRespond with only the category name.`;
            }

            const messages = [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that categorizes computer activities. Respond with only the category name.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ];

            const response = await this.together.chat.completions.create({
                model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
                messages: messages,
                max_tokens: 20,
                temperature: 0.3,
                top_p: 0.9
            });

            const category = response.choices[0].message.content.trim().toLowerCase();
            return categoriesList.includes(category) ? category : activity.category;
        } catch (error) {
            console.error('Error categorizing activity with TogetherAI:', error);
            return activity.category;
        }
    }

    async getProductivityScore(activities) {
        if (!this.isEnabled() || !this.together) {
            return this.calculateBasicScore(activities);
        }

        try {
            const activitySummary = activities.map(a =>
                `${a.processName} (${a.category}): ${Math.floor(a.duration / 60)}min`
            ).join('\n');

            const messages = [
                {
                    role: 'system',
                    content: 'You are a productivity coach. Respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content: `Based on these activities, provide a productivity score from 1-10 and brief explanation:\n\n${activitySummary}\n\nRespond in JSON format: {"score": number, "explanation": "string"}`
                }
            ];

            const response = await this.together.chat.completions.create({
                model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
                messages: messages,
                max_tokens: 100,
                temperature: 0.5,
                top_p: 0.9
            });

            const responseText = response.choices[0].message.content.trim();
            const jsonMatch = responseText.match(/\{.*\}/);

            if (jsonMatch) {
                const response = JSON.parse(jsonMatch[0]);
                return {
                    score: response.score,
                    explanation: response.explanation
                };
            } else {
                return this.calculateBasicScore(activities);
            }
        } catch (error) {
            console.error('Error getting TogetherAI productivity score:', error);
            return this.calculateBasicScore(activities);
        }
    }

    calculateBasicScore(activities) {
        const categoriesList = this.categories && this.categories.length > 0 ? this.categories : DEFAULT_CATEGORIES;
        const categoryWeights = Object.fromEntries(categoriesList.map(cat => [cat, 0.5]));
        // Give some defaults for common categories
        if (categoryWeights.productivity !== undefined) categoryWeights.productivity = 1.0;
        if (categoryWeights.development !== undefined) categoryWeights.development = 1.0;
        if (categoryWeights.communication !== undefined) categoryWeights.communication = 0.7;
        if (categoryWeights.news !== undefined) categoryWeights.news = 0.5;
        if (categoryWeights.social_media !== undefined) categoryWeights.social_media = 0.3;
        if (categoryWeights.entertainment !== undefined) categoryWeights.entertainment = 0.2;
        if (categoryWeights.shopping !== undefined) categoryWeights.shopping = 0.3;
        if (categoryWeights.system !== undefined) categoryWeights.system = 0.5;
        if (categoryWeights.other !== undefined) categoryWeights.other = 0.5;

        let totalTime = 0;
        let weightedTime = 0;

        activities.forEach(activity => {
            const duration = activity.duration || 0;
            totalTime += duration;
            weightedTime += duration * (categoryWeights[activity.category] || 0.5);
        });

        const score = totalTime > 0 ? Math.round((weightedTime / totalTime) * 10) : 5;

        return {
            score: Math.min(10, Math.max(1, score)),
            explanation: `Based on activity categorization, your productivity score is ${score}/10.`
        };
    }
}

module.exports = { AIAnalyzer }; 