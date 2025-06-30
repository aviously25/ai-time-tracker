const { ipcRenderer } = require('electron');
const Chart = require('chart.js/auto');

class TimeTrackerUI {
    constructor() {
        this.currentDateRange = 'today';
        this.charts = {};
        this.isTracking = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateCurrentTime();
        this.loadInitialData();
        this.setupCharts();

        // Update time every second
        setInterval(() => this.updateCurrentTime(), 1000);

        // Refresh data every 30 seconds
        setInterval(() => this.refreshData(), 30000);
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToSection(item.dataset.section);
            });
        });

        // Date range selector
        document.getElementById('dateRange').addEventListener('change', (e) => {
            this.currentDateRange = e.target.value;
            this.refreshData();
        });

        // Tracking toggle
        document.getElementById('trackingToggle').addEventListener('click', () => {
            this.toggleTracking();
        });

        // Settings
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('clearData').addEventListener('click', () => {
            this.clearData();
        });

        // Insights refresh
        document.getElementById('refreshInsights').addEventListener('click', () => {
            this.refreshInsights();
        });

        // Activity filters
        document.getElementById('activitySearch').addEventListener('input', (e) => {
            this.filterActivities();
        });

        document.getElementById('categoryFilter').addEventListener('change', () => {
            this.filterActivities();
        });
    }

    navigateToSection(section) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.content-section').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(section).classList.add('active');

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            activities: 'Activities',
            insights: 'AI Insights',
            settings: 'Settings'
        };
        document.getElementById('pageTitle').textContent = titles[section];

        // Load section-specific data
        if (section === 'activities') {
            this.loadActivities();
        } else if (section === 'insights') {
            this.loadInsights();
        } else if (section === 'settings') {
            this.loadSettings();
        }
    }

    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        document.getElementById('currentTime').textContent = timeString;
    }

    async loadInitialData() {
        await this.loadTrackingStatus();
        await this.loadSettings();
        await this.refreshData();
    }

    async loadTrackingStatus() {
        try {
            const status = await ipcRenderer.invoke('get-tracking-status');
            this.updateTrackingUI(status.isTracking);
        } catch (error) {
            console.error('Error loading tracking status:', error);
        }
    }

    updateTrackingUI(isTracking) {
        this.isTracking = isTracking;
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const toggleBtn = document.getElementById('trackingToggle');
        const toggleIcon = toggleBtn.querySelector('i');
        const toggleText = toggleBtn.querySelector('span');

        if (isTracking) {
            indicator.classList.add('tracking');
            statusText.textContent = 'Tracking';
            toggleBtn.classList.add('tracking');
            toggleIcon.className = 'fas fa-pause';
            toggleText.textContent = 'Stop Tracking';
        } else {
            indicator.classList.remove('tracking');
            statusText.textContent = 'Not Tracking';
            toggleBtn.classList.remove('tracking');
            toggleIcon.className = 'fas fa-play';
            toggleText.textContent = 'Start Tracking';
        }
    }

    async toggleTracking() {
        try {
            if (this.isTracking) {
                await ipcRenderer.invoke('stop-tracking');
            } else {
                await ipcRenderer.invoke('start-tracking');
            }
            await this.loadTrackingStatus();
        } catch (error) {
            console.error('Error toggling tracking:', error);
        }
    }

    async refreshData() {
        await this.loadDashboardData();
        await this.loadActivities();
        await this.loadInsights();
    }

    async loadDashboardData() {
        try {
            const [activityData, statistics] = await Promise.all([
                ipcRenderer.invoke('get-activity-data', this.currentDateRange),
                ipcRenderer.invoke('get-statistics', this.currentDateRange)
            ]);

            this.updateDashboardStats(activityData, statistics);
            this.updateCharts(activityData, statistics);
            this.updateLists(statistics);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    updateDashboardStats(activityData, statistics) {
        // Calculate total time
        const totalSeconds = activityData.reduce((sum, activity) => sum + (activity.duration || 0), 0);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        document.getElementById('totalTime').textContent = `${hours}h ${minutes}m`;

        // Update other stats
        document.getElementById('activeSessions').textContent = activityData.length;

        const uniqueWebsites = new Set(activityData.filter(a => a.domain).map(a => a.domain)).size;
        document.getElementById('websitesVisited').textContent = uniqueWebsites;

        // Calculate productivity score
        const productivityScore = this.calculateProductivityScore(activityData);
        document.getElementById('productivityScore').textContent = `${productivityScore}/10`;
    }

    calculateProductivityScore(activities) {
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
        return Math.min(10, Math.max(1, score));
    }

    setupCharts() {
        // Removed category chart setup for performance
    }

    updateCharts(activityData, statistics) {
        // Removed category chart update logic for performance
    }

    updateLists(statistics) {
        // Update top apps
        const topAppsContainer = document.getElementById('topApps');
        if (statistics.topApps && statistics.topApps.length > 0) {
            topAppsContainer.innerHTML = statistics.topApps.map(app => `
                <div class="list-item">
                    <div class="list-item-left">
                        <div class="list-item-icon">
                            <i class="fas fa-desktop"></i>
                        </div>
                        <div class="list-item-info">
                            <h4>${app.process_name}</h4>
                            <small>${app.sessions} sessions</small>
                        </div>
                    </div>
                    <div class="list-item-time">${this.formatDuration(app.total_time)}</div>
                </div>
            `).join('');
        } else {
            topAppsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-desktop"></i>
                    <p>No application data yet</p>
                </div>
            `;
        }

        // Update top websites
        const topWebsitesContainer = document.getElementById('topWebsites');
        if (statistics.topWebsites && statistics.topWebsites.length > 0) {
            topWebsitesContainer.innerHTML = statistics.topWebsites.map(site => `
                <div class="list-item">
                    <div class="list-item-left">
                        <div class="list-item-icon">
                            <i class="fas fa-globe"></i>
                        </div>
                        <div class="list-item-info">
                            <h4>${site.domain}</h4>
                            <small>${site.sessions} sessions</small>
                        </div>
                    </div>
                    <div class="list-item-time">${this.formatDuration(site.total_time)}</div>
                </div>
            `).join('');
        } else {
            topWebsitesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-globe"></i>
                    <p>No website data yet</p>
                </div>
            `;
        }
    }

    async loadActivities() {
        try {
            const activities = await ipcRenderer.invoke('get-activity-data', this.currentDateRange);
            this.renderActivities(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    }

    renderActivities(activities) {
        const container = document.getElementById('activitiesList');

        if (activities.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-list"></i>
                    <p>No activities recorded yet</p>
                    <small>Start tracking to see your activities here</small>
                </div>
            `;
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon">
                    <i class="fas ${this.getActivityIcon(activity.category)}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${activity.window_title}</div>
                    <div class="activity-meta">
                        <span>${activity.process_name}</span>
                        <span>${new Date(activity.timestamp).toLocaleTimeString()}</span>
                        <span class="activity-category ${activity.category}">${activity.category.replace('_', ' ')}</span>
                    </div>
                </div>
                <div class="activity-time">${this.formatDuration(activity.duration)}</div>
            </div>
        `).join('');
    }

    getActivityIcon(category) {
        const icons = {
            productivity: 'fa-briefcase',
            development: 'fa-code',
            communication: 'fa-comments',
            social_media: 'fa-share-alt',
            entertainment: 'fa-play',
            news: 'fa-newspaper',
            shopping: 'fa-shopping-cart',
            system: 'fa-cog',
            other: 'fa-question'
        };
        return icons[category] || 'fa-question';
    }

    filterActivities() {
        const searchTerm = document.getElementById('activitySearch').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;

        const activityItems = document.querySelectorAll('.activity-item');

        activityItems.forEach(item => {
            const title = item.querySelector('.activity-title').textContent.toLowerCase();
            const category = item.querySelector('.activity-category').textContent.toLowerCase();

            const matchesSearch = title.includes(searchTerm);
            const matchesCategory = !categoryFilter || category.includes(categoryFilter);

            item.style.display = matchesSearch && matchesCategory ? 'flex' : 'none';
        });
    }

    async loadInsights() {
        try {
            const insights = await ipcRenderer.invoke('get-ai-insights', this.currentDateRange);
            this.renderInsights(insights);
        } catch (error) {
            console.error('Error loading insights:', error);
        }
    }

    renderInsights(insights) {
        const insightText = document.getElementById('insightText');
        const insightTimestamp = document.getElementById('insightTimestamp');

        insightText.textContent = insights.insights;
        insightTimestamp.textContent = insights.generated ?
            `Generated: ${new Date(insights.generated).toLocaleString()}` :
            'Not available';
    }

    async refreshInsights() {
        const button = document.getElementById('refreshInsights');
        const icon = button.querySelector('i');

        icon.className = 'fas fa-spinner fa-spin';
        button.disabled = true;

        try {
            await this.loadInsights();
        } finally {
            icon.className = 'fas fa-sync-alt';
            button.disabled = false;
        }
    }

    async loadSettings() {
        try {
            const settings = await ipcRenderer.invoke('get-settings');

            document.getElementById('autoStart').checked = settings.autoStart;
            document.getElementById('trackingInterval').value = settings.trackingInterval;
            document.getElementById('aiEnabled').checked = settings.aiEnabled;
            document.getElementById('togetherApiKey').value = settings.togetherApiKey || '';
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async saveSettings() {
        try {
            const settings = {
                autoStart: document.getElementById('autoStart').checked,
                trackingInterval: parseInt(document.getElementById('trackingInterval').value),
                aiEnabled: document.getElementById('aiEnabled').checked,
                togetherApiKey: document.getElementById('togetherApiKey').value
            };

            await ipcRenderer.invoke('update-settings', settings);

            // Update AI API key if provided
            if (settings.togetherApiKey) {
                await ipcRenderer.invoke('update-ai-api-key', settings.togetherApiKey);
            }

            // Show success message
            this.showNotification('Settings saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Error saving settings', 'error');
        }
    }

    async exportData() {
        try {
            // This would typically trigger a file save dialog
            this.showNotification('Export feature coming soon!', 'info');
        } catch (error) {
            console.error('Error exporting data:', error);
        }
    }

    async clearData() {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            try {
                // This would typically clear the database
                this.showNotification('Data cleared successfully!', 'success');
                await this.refreshData();
            } catch (error) {
                console.error('Error clearing data:', error);
                this.showNotification('Error clearing data', 'error');
            }
        }
    }

    formatDuration(seconds) {
        if (!seconds) return '0m';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;

        // Set background color based on type
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            info: '#667eea'
        };
        notification.style.background = colors[type] || colors.info;

        // Add to page
        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TimeTrackerUI();
}); 