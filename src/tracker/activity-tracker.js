const { AppleScriptTracker } = require('../utils/applescript-tracker');
const cron = require('node-cron');
const { URL } = require('url');
const { IconExtractor } = require('../utils/icon-extractor');

class ActivityTracker {
    constructor(databaseManager, aiAnalyzer) {
        this.databaseManager = databaseManager;
        this.aiAnalyzer = aiAnalyzer;
        this.iconExtractor = new IconExtractor();
        this.appleScriptTracker = new AppleScriptTracker();
        this.isTracking = false;
        this.trackingInterval = null;
        this.currentActivity = null;
        this.lastActivityTime = null;
        this.ignoredApps = ["loginwindow"];
        this.isSystemSleeping = false;
        this.sleepStartTime = null;
    }

    startTracking() {
        if (this.isTracking) {
            console.log('Tracking already in progress, ignoring start request');
            return;
        }

        console.log('Starting activity tracking...');
        this.isTracking = true;

        // Get tracking interval from settings or default to 30 seconds
        let intervalSeconds = 30;
        if (this.databaseManager && this.databaseManager.store) {
            intervalSeconds = this.databaseManager.store.get('trackingInterval', 30);
        } else if (this.aiAnalyzer && this.aiAnalyzer.store) {
            intervalSeconds = this.aiAnalyzer.store.get('trackingInterval', 30);
        }
        if (typeof intervalSeconds !== 'number' || intervalSeconds < 5) intervalSeconds = 30;

        console.log(`Tracking interval set to ${intervalSeconds} seconds`);

        // Track activity every intervalSeconds
        this.trackingInterval = setInterval(async () => {
            await this.trackCurrentActivity();
        }, intervalSeconds * 1000);

        console.log('Activity tracking started successfully');

        // Initial tracking
        this.trackCurrentActivity();
    }

    stopTracking() {
        if (!this.isTracking) {
            console.log('Tracking not in progress, ignoring stop request');
            return;
        }

        console.log('Stopping activity tracking...');
        this.isTracking = false;

        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
            this.trackingInterval = null;
            console.log('Tracking interval cleared');
        }

        // Save the last activity before stopping (only if not sleeping)
        if (this.currentActivity && !this.isSystemSleeping) {
            console.log('Saving final activity before stopping');
            this.saveActivity(this.currentActivity);
        }

        console.log('Activity tracking stopped successfully');
    }

    async trackCurrentActivity() {
        try {
            // Don't track if system is sleeping
            if (this.isSystemSleeping) {
                console.log('System is sleeping, skipping activity tracking');
                return;
            }

            // Check if AppleScript tracker is supported
            if (!this.appleScriptTracker.isSupported()) {
                console.error('AppleScript tracker is not supported on this platform');
                return;
            }

            console.log('Getting active window...');
            let activeWindow = await this.appleScriptTracker.getActiveWindow();

            // Fallback to simple method if the main method fails
            if (!activeWindow) {
                console.log('Main method failed, trying fallback method for active window detection');
                const fallbackWindow = await this.appleScriptTracker.getSimpleActiveWindow();
                if (!fallbackWindow) {
                    console.log('No active window detected from fallback method either');
                    return;
                }
                activeWindow = fallbackWindow;
            }

            console.log('Active window detected:', activeWindow);

            if (!activeWindow || this.ignoredApps.includes(activeWindow.processName)) {
                console.log('No active window detected or ignored app:', activeWindow?.processName);
                return;
            }

            const activity = await this.parseActivity(activeWindow);
            console.log('Parsed activity:', activity);

            // Check if activity has changed
            if (this.hasActivityChanged(activity)) {
                console.log('Activity has changed, saving previous and updating current');
                // Save previous activity
                if (this.currentActivity) {
                    this.saveActivity(this.currentActivity);
                }

                // Update current activity
                this.currentActivity = activity;
                this.lastActivityTime = new Date();
            } else {
                console.log('Activity has not changed, continuing current activity');
            }

        } catch (error) {
            console.error('Error tracking activity:', error);
        }
    }

    async parseActivity(activeWindow) {
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
            } catch (error) {
                console.log('Invalid URL:', url);
            }
        }

        // Store app icon in app_icons table if not already present
        try {
            const db = this.databaseManager.db;
            const processNameKey = activity.processName;
            db.get("SELECT icon_base64 FROM app_icons WHERE process_name = ?", [processNameKey], async (err, row) => {
                if (!row) {
                    const iconPath = await this.iconExtractor.getAppIcon(processNameKey);
                    let iconBase64 = null;
                    if (iconPath) {
                        iconBase64 = await this.iconExtractor.getIconAsBase64(iconPath);
                    }
                    db.run("INSERT OR IGNORE INTO app_icons (process_name, icon_path, icon_base64) VALUES (?, ?, ?)", [processNameKey, iconPath, iconBase64]);
                }
            });
        } catch (error) {
            console.log('Error storing app icon:', error.message);
        }

        // Use AI to categorize if enabled
        if (this.aiAnalyzer && this.aiAnalyzer.isEnabled()) {
            activity.category = await this.aiAnalyzer.categorizeActivity(activity);
        } else {
            // Fallback to hardcoded categorization
            if (activity.url || activity.domain) {
                activity.category = this.categorizeWebsite(activity.domain || '');
            } else {
                activity.category = this.categorizeApplication(activity.processName);
            }
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
            // Calculate duration if not already set
            if (!activity.duration && this.lastActivityTime) {
                activity.duration = Math.floor((new Date() - this.lastActivityTime) / 1000);
            }

            // Don't save activities with zero or negative duration
            if (!activity.duration || activity.duration <= 0) {
                return;
            }

            // Save to database
            await this.databaseManager.saveActivity(activity);

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
            lastActivityTime: this.lastActivityTime,
            isSystemSleeping: this.isSystemSleeping
        };
    }

    handleSystemSleep() {
        this.isSystemSleeping = true;
        this.sleepStartTime = new Date();

        // Save current activity before sleep
        if (this.currentActivity && this.lastActivityTime) {
            // Calculate duration up to sleep time
            const sleepDuration = Math.floor((this.sleepStartTime - this.lastActivityTime) / 1000);
            const activityToSave = { ...this.currentActivity };
            activityToSave.duration = sleepDuration;

            // Save the activity with the correct duration
            this.saveActivity(activityToSave);

            // Clear current activity since we're sleeping
            this.currentActivity = null;
            this.lastActivityTime = null;
        }

        console.log('Activity tracking paused due to system sleep');
    }

    handleSystemWake() {
        this.isSystemSleeping = false;
        this.sleepStartTime = null;

        // Reset tracking state for new session
        this.currentActivity = null;
        this.lastActivityTime = null;

        // Start tracking again immediately
        this.trackCurrentActivity();

        console.log('Activity tracking resumed after system wake');
    }
}

module.exports = { ActivityTracker }; 