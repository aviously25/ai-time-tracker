const Together = require('together-ai');
const Store = require('electron-store');

const model = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

class AIAnalyzer {
    constructor() {
        this.store = new Store();
        this.together = null;
        this.aiEnabled = this.store.get('aiEnabled', true);
        this.apiKey = this.store.get('togetherApiKey', '');

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
                model: model,
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

    async getInsights(dateRange = 'today') {
        if (!this.isEnabled() || !this.together) {
            return this.getDefaultInsights();
        }

        try {
            const messages = [
                {
                    role: 'system',
                    content: 'You are an AI productivity coach that analyzes time tracking data and provides actionable insights to improve productivity and work-life balance.'
                },
                {
                    role: 'user',
                    content: this.buildInsightsPrompt(dateRange)
                }
            ];

            const response = await this.together.chat.completions.create({
                model: model,
                messages: messages,
                max_tokens: 300,
                temperature: 0.7,
                top_p: 0.9
            });

            return {
                insights: response.choices[0].message.content.trim(),
                generated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting TogetherAI insights:', error);
            return this.getDefaultInsights();
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

    buildInsightsPrompt(dateRange) {
        return `Daily Productivity Analysis Request:
- Date Range: ${dateRange}
- Context: User is tracking their computer activity to improve productivity

Please provide a comprehensive analysis including:
1. Overall productivity assessment
2. Potential time-wasting activities
3. Suggestions for improvement
4. Positive patterns to reinforce
5. Specific actionable recommendations

Focus on being helpful, encouraging, and practical. Keep it under 200 words.`;
    }

    getDefaultInsights() {
        const insights = [
            "Great job tracking your time! This is the first step toward better productivity awareness.",
            "Consider setting specific goals for each work session to maximize your productivity.",
            "Try using the Pomodoro Technique: 25 minutes of focused work followed by a 5-minute break.",
            "Review your most productive hours and schedule important tasks during those times.",
            "Take regular breaks to maintain focus and prevent burnout."
        ];

        return {
            insights: insights[Math.floor(Math.random() * insights.length)],
            generated: new Date().toISOString(),
            isDefault: true
        };
    }

    async categorizeActivity(activity) {
        if (!this.isEnabled() || !this.together) {
            return activity.category;
        }

        try {
            const messages = [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that categorizes computer activities. Respond with only the category name.'
                },
                {
                    role: 'user',
                    content: `Categorize this activity into one of these categories:
- productivity: Work-related tasks, email, documents, coding
- development: Programming, technical work, learning
- communication: Chat apps, video calls, messaging
- social_media: Social networking sites
- entertainment: Games, videos, music
- news: Reading news, current events
- shopping: Online shopping, e-commerce
- system: File management, system tools
- other: Everything else

Activity: ${activity.processName} - ${activity.windowTitle}
Current category: ${activity.category}

Respond with only the category name.`
                }
            ];

            const response = await this.together.chat.completions.create({
                model: model,
                messages: messages,
                max_tokens: 20,
                temperature: 0.3,
                top_p: 0.9
            });

            const category = response.choices[0].message.content.trim().toLowerCase();
            return category || activity.category;
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
                    content: `Based on these activities, provide a productivity score from 1-10 and brief explanation:

${activitySummary}

Respond in JSON format: {"score": number, "explanation": "string"}`
                }
            ];

            const response = await this.together.chat.completions.create({
                model: model,
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
        const categoryWeights = {
            productivity: 1.0,
            development: 1.0,
            communication: 0.7,
            news: 0.5,
            social_media: 0.3,
            entertainment: 0.2,
            shopping: 0.3,
            system: 0.5,
            other: 0.5
        };

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