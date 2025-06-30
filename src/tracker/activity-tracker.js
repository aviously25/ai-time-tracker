const activeWin = require('active-win');
const cron = require('node-cron');
const { URL } = require('url');

class ActivityTracker {
    constructor(databaseManager, aiAnalyzer) {
        this.databaseManager = databaseManager;
        this.aiAnalyzer = aiAnalyzer;
        this.isTracking = false;
        this.trackingInterval = null;
        this.currentActivity = null;
        this.lastActivityTime = null;
    }

    startTracking() {
        if (this.isTracking) return;

        this.isTracking = true;
        console.log('Activity tracking started');

        // Track activity every 30 seconds
        this.trackingInterval = setInterval(async () => {
            await this.trackCurrentActivity();
        }, 30000);

        // Initial tracking
        this.trackCurrentActivity();
    }

    stopTracking() {
        if (!this.isTracking) return;

        this.isTracking = false;
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
        }

        // Save the last activity before stopping
        if (this.currentActivity) {
            this.saveActivity(this.currentActivity);
        }

        console.log('Activity tracking stopped');
    }

    async trackCurrentActivity() {
        try {
            const activeWindow = await activeWin();

            if (!activeWindow) {
                console.log('No active window detected');
                return;
            }

            const activity = this.parseActivity(activeWindow);

            // Check if activity has changed
            if (this.hasActivityChanged(activity)) {
                // Save previous activity
                if (this.currentActivity) {
                    this.saveActivity(this.currentActivity);
                }

                // Update current activity
                this.currentActivity = activity;
                this.lastActivityTime = new Date();
            }

        } catch (error) {
            console.error('Error tracking activity:', error);
        }
    }

    parseActivity(activeWindow) {
        const now = new Date();
        const { title, owner, processName, url } = activeWindow;

        let activity = {
            timestamp: now,
            processName: processName || owner?.name || 'Unknown',
            windowTitle: title || 'Unknown',
            url: null,
            domain: null,
            category: 'unknown',
            duration: 0
        };

        // Extract URL and domain if it's a browser
        if (url) {
            try {
                const parsedUrl = new URL(url);
                activity.url = url;
                activity.domain = parsedUrl.hostname;
                activity.category = this.categorizeWebsite(parsedUrl.hostname);
            } catch (error) {
                console.log('Invalid URL:', url);
            }
        } else {
            // Categorize application
            activity.category = this.categorizeApplication(processName || owner?.name);
        }

        return activity;
    }

    categorizeWebsite(domain) {
        const domainLower = domain.toLowerCase();

        // Social media
        if (domainLower.includes('facebook.com') || domainLower.includes('twitter.com') ||
            domainLower.includes('instagram.com') || domainLower.includes('linkedin.com') ||
            domainLower.includes('tiktok.com') || domainLower.includes('youtube.com')) {
            return 'social_media';
        }

        // Productivity
        if (domainLower.includes('gmail.com') || domainLower.includes('outlook.com') ||
            domainLower.includes('notion.so') || domainLower.includes('trello.com') ||
            domainLower.includes('asana.com') || domainLower.includes('slack.com')) {
            return 'productivity';
        }

        // Development
        if (domainLower.includes('github.com') || domainLower.includes('stackoverflow.com') ||
            domainLower.includes('gitlab.com') || domainLower.includes('bitbucket.org')) {
            return 'development';
        }

        // News
        if (domainLower.includes('news') || domainLower.includes('bbc') ||
            domainLower.includes('cnn') || domainLower.includes('reuters')) {
            return 'news';
        }

        // Shopping
        if (domainLower.includes('amazon') || domainLower.includes('ebay') ||
            domainLower.includes('shopify') || domainLower.includes('etsy')) {
            return 'shopping';
        }

        // Entertainment
        if (domainLower.includes('netflix') || domainLower.includes('spotify') ||
            domainLower.includes('twitch') || domainLower.includes('reddit')) {
            return 'entertainment';
        }

        return 'other';
    }

    categorizeApplication(appName) {
        const appLower = appName.toLowerCase();

        // Development tools
        if (appLower.includes('code') || appLower.includes('sublime') ||
            appLower.includes('webstorm') || appLower.includes('intellij') ||
            appLower.includes('xcode') || appLower.includes('android studio')) {
            return 'development';
        }

        // Productivity
        if (appLower.includes('chrome') || appLower.includes('firefox') ||
            appLower.includes('safari') || appLower.includes('edge') ||
            appLower.includes('word') || appLower.includes('excel') ||
            appLower.includes('powerpoint') || appLower.includes('notion')) {
            return 'productivity';
        }

        // Communication
        if (appLower.includes('slack') || appLower.includes('discord') ||
            appLower.includes('teams') || appLower.includes('zoom') ||
            appLower.includes('skype') || appLower.includes('whatsapp')) {
            return 'communication';
        }

        // Entertainment
        if (appLower.includes('spotify') || appLower.includes('itunes') ||
            appLower.includes('vlc') || appLower.includes('netflix')) {
            return 'entertainment';
        }

        // System
        if (appLower.includes('finder') || appLower.includes('explorer') ||
            appLower.includes('terminal') || appLower.includes('cmd')) {
            return 'system';
        }

        return 'other';
    }

    hasActivityChanged(newActivity) {
        if (!this.currentActivity) return true;

        return (
            newActivity.processName !== this.currentActivity.processName ||
            newActivity.windowTitle !== this.currentActivity.windowTitle ||
            newActivity.url !== this.currentActivity.url
        );
    }

    async saveActivity(activity) {
        try {
            // Calculate duration
            if (this.lastActivityTime) {
                activity.duration = Math.floor((new Date() - this.lastActivityTime) / 1000);
            }

            // Save to database
            await this.databaseManager.saveActivity(activity);

            // Get AI insights if enabled
            if (this.aiAnalyzer && this.aiAnalyzer.isEnabled()) {
                this.aiAnalyzer.analyzeActivity(activity);
            }

        } catch (error) {
            console.error('Error saving activity:', error);
        }
    }

    getCurrentActivity() {
        return this.currentActivity;
    }

    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            currentActivity: this.currentActivity,
            lastActivityTime: this.lastActivityTime
        };
    }
}

module.exports = { ActivityTracker }; 