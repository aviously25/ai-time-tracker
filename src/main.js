const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
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

        this.init();
    }

    init() {
        app.whenReady().then(() => {
            this.createWindow();
            this.setupTray();
            this.initializeServices();
            this.setupIPC();
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
        try {
            // Initialize database
            this.databaseManager = new DatabaseManager();
            await this.databaseManager.initialize();

            // Initialize AI analyzer
            this.aiAnalyzer = new AIAnalyzer();

            // Initialize activity tracker
            this.activityTracker = new ActivityTracker(this.databaseManager, this.aiAnalyzer);

            // Start tracking automatically if enabled
            const autoStart = this.store.get('autoStart', true);
            if (autoStart) {
                this.activityTracker.startTracking();
            }

            console.log('All services initialized successfully');
        } catch (error) {
            console.error('Failed to initialize services:', error);
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

        // Get AI insights
        ipcMain.handle('get-ai-insights', async (event, dateRange) => {
            return await this.aiAnalyzer.getInsights(dateRange);
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
            return { isTracking: this.activityTracker.isTracking };
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
                ])
            };
        });

        // Update AI API key
        ipcMain.handle('update-ai-api-key', (event, apiKey) => {
            if (this.aiAnalyzer) {
                this.aiAnalyzer.setApiKey(apiKey);
            }
            return { success: true };
        });

        // Update activity category
        ipcMain.handle('update-activity-category', async (event, { id, category }) => {
            if (this.databaseManager) {
                await this.databaseManager.updateActivityCategory(id, category);
                return { success: true };
            }
            return { success: false };
        });
    }
}

// Initialize the app
new TimeTrackerApp(); 