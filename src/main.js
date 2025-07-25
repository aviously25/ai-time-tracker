const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const { ActivityTracker } = require('./tracker/activity-tracker');
const { DatabaseManager } = require('./database/database-manager');
const { AIAnalyzer } = require('./ai/ai-analyzer');
const Store = require('electron-store');

class TimeTrackerApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.activityTracker = null;
        this.databaseManager = null;
        this.aiAnalyzer = null;
        this.store = new Store();
        this.isSystemSleeping = false;

        this.init();
    }

    init() {
        app.whenReady().then(() => {
            this.createWindow();
            this.setupTray();
            this.initializeServices();
            this.setupIPC();
            this.setupPowerMonitoring();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });
    }

    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            icon: path.join(__dirname, '../assets/icon.png'),
            show: false
        });

        this.mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
        });

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    setupTray() {
        const iconPath = path.join(__dirname, '../assets/tray-icon.png');
        const icon = nativeImage.createFromPath(iconPath);

        this.tray = new Tray(icon);
        this.tray.setToolTip('AI Time Tracker');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show Dashboard',
                click: () => {
                    this.mainWindow.show();
                    this.mainWindow.focus();
                }
            },
            {
                label: 'Start Tracking',
                click: () => {
                    this.activityTracker.startTracking();
                }
            },
            {
                label: 'Stop Tracking',
                click: () => {
                    this.activityTracker.stopTracking();
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    app.quit();
                }
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    async initializeServices() {
        console.log('Initializing services...');

        // Initialize database
        this.databaseManager = new DatabaseManager();
        this.databaseManager.initialize().then(() => {
            console.log('Database initialized successfully');
        }).catch(error => {
            console.error('Failed to initialize database:', error);
        });

        // Initialize AI analyzer
        this.aiAnalyzer = new AIAnalyzer();
        console.log('AI Analyzer initialized');

        // Initialize activity tracker
        this.activityTracker = new ActivityTracker(this.databaseManager, this.aiAnalyzer);
        console.log('Activity tracker initialized');

        // Auto-start tracking if enabled
        const autoStart = this.store.get('autoStart', true);
        console.log('Auto-start setting:', autoStart);

        if (autoStart) {
            console.log('Auto-starting activity tracking...');
            setTimeout(() => {
                this.activityTracker.startTracking();
            }, 2000); // Give some time for everything to initialize
        }
    }

    setupIPC() {
        // Get activity data
        ipcMain.handle('get-activity-data', async (event, dateRange) => {
            return await this.databaseManager.getActivityData(dateRange);
        });

        // Get statistics
        ipcMain.handle('get-statistics', async (event, dateRange) => {
            return await this.databaseManager.getStatistics(dateRange);
        });

        // Start/stop tracking
        ipcMain.handle('start-tracking', () => {
            this.activityTracker.startTracking();
            return { success: true };
        });

        ipcMain.handle('stop-tracking', () => {
            this.activityTracker.stopTracking();
            return { success: true };
        });

        // Get tracking status
        ipcMain.handle('get-tracking-status', () => {
            return this.activityTracker.getTrackingStatus();
        });

        // Update settings
        ipcMain.handle('update-settings', (event, settings) => {
            Object.keys(settings).forEach(key => {
                this.store.set(key, settings[key]);
            });
            return { success: true };
        });

        // Get settings
        ipcMain.handle('get-settings', () => {
            return {
                autoStart: this.store.get('autoStart', true),
                trackingInterval: this.store.get('trackingInterval', 30),
                aiEnabled: this.store.get('aiEnabled', true),
                togetherApiKey: this.store.get('togetherApiKey', ''),
                categories: this.store.get('categories', [
                    'productivity', 'development', 'communication', 'social_media', 'entertainment', 'news', 'shopping', 'system', 'other'
                ]),
                categoryWeights: this.store.get('categoryWeights', {}),
                categoryDescriptions: this.store.get('categoryDescriptions', {}),
                appOverrides: this.store.get('appOverrides', {}),
                customCategorizationPrompt: this.store.get('customCategorizationPrompt', ''),
                categoryColors: this.store.get('categoryColors', {})
            };
        });

        // Update AI API key
        ipcMain.handle('update-ai-api-key', (event, apiKey) => {
            if (this.aiAnalyzer) {
                this.aiAnalyzer.setApiKey(apiKey);
            }
            return { success: true };
        });

        // Update app overrides
        ipcMain.handle('update-app-overrides', (event, overrides) => {
            if (this.aiAnalyzer) {
                this.aiAnalyzer.setAppOverrides(overrides);
            }
            return { success: true };
        });

        // Update custom categorization prompt
        ipcMain.handle('update-custom-prompt', (event, prompt) => {
            if (this.aiAnalyzer) {
                this.aiAnalyzer.setCustomCategorizationPrompt(prompt);
            }
            return { success: true };
        });

        // Update category descriptions
        ipcMain.handle('update-category-descriptions', (event, descriptions) => {
            if (this.aiAnalyzer) {
                this.aiAnalyzer.setCategoryDescriptions(descriptions);
            }
            return { success: true };
        });

        // Test custom prompt
        ipcMain.handle('test-custom-prompt', async (event, { prompt, testApp }) => {
            if (this.aiAnalyzer && this.aiAnalyzer.isEnabled()) {
                try {
                    const testActivity = {
                        processName: testApp.name || 'test-app',
                        windowTitle: testApp.title || 'Test Window',
                        category: 'other'
                    };

                    // Temporarily set the custom prompt
                    const originalPrompt = this.aiAnalyzer.customCategorizationPrompt;
                    this.aiAnalyzer.setCustomCategorizationPrompt(prompt);

                    // Test categorization
                    const result = await this.aiAnalyzer.categorizeActivity(testActivity);

                    // Restore original prompt
                    this.aiAnalyzer.setCustomCategorizationPrompt(originalPrompt);

                    return { success: true, category: result };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }
            return { success: false, error: 'AI not enabled' };
        });

        // Update activity category
        ipcMain.handle('update-activity-category', async (event, { id, category }) => {
            if (this.databaseManager) {
                await this.databaseManager.updateActivityCategory(id, category);
                return { success: true };
            }
            return { success: false };
        });

        // Bulk update activity categories
        ipcMain.handle('bulk-update-activity-category', async (event, { ids, category }) => {
            if (this.databaseManager && Array.isArray(ids) && category) {
                for (const id of ids) {
                    await this.databaseManager.updateActivityCategory(id, category);
                }
                return { success: true };
            }
            return { success: false };
        });

        // Update category colors
        ipcMain.handle('update-category-colors', (event, categoryColors) => {
            this.store.set('categoryColors', categoryColors);
            return { success: true };
        });

        // Get app icons
        ipcMain.handle('get-app-icons', async () => {
            return await this.databaseManager.getAppIcons();
        });
    }

    setupPowerMonitoring() {
        // Monitor system sleep/wake events
        powerMonitor.on('suspend', () => {
            console.log('System going to sleep');
            this.isSystemSleeping = true;

            // Stop tracking and save current activity before sleep
            if (this.activityTracker && this.activityTracker.isTracking) {
                this.activityTracker.handleSystemSleep();
            }
        });

        powerMonitor.on('resume', () => {
            console.log('System waking from sleep');
            this.isSystemSleeping = false;

            // Resume tracking after wake
            if (this.activityTracker && this.activityTracker.isTracking) {
                this.activityTracker.handleSystemWake();
            }
        });

        // Monitor lock/unlock events (additional sleep detection)
        powerMonitor.on('lock-screen', () => {
            console.log('Screen locked');
            if (this.activityTracker && this.activityTracker.isTracking) {
                this.activityTracker.handleSystemSleep();
            }
        });

        powerMonitor.on('unlock-screen', () => {
            console.log('Screen unlocked');
            if (this.activityTracker && this.activityTracker.isTracking) {
                this.activityTracker.handleSystemWake();
            }
        });
    }
}

// Initialize the app
new TimeTrackerApp(); 