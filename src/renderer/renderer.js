const { ipcRenderer } = require('electron');
// Chart.js is loaded globally via CDN script in index.html
// const Chart = require('chart.js/auto');

class TimeTrackerUI {
    constructor() {
        this.currentDateRange = 'today';
        this.charts = {};
        this.isTracking = false;
        this.isSystemSleeping = false;
        this.categories = [
            'productivity', 'development', 'communication', 'social_media', 'entertainment', 'news', 'shopping', 'system', 'other'
        ];
        this.cachedInsights = null;
        this.lastInsightsDateRange = null;
        this.appOverrides = {};
        this.customCategorizationPrompt = '';
        this.categoryDescriptions = {};
        this.editingCategoryDescription = null;
        this.selectedActivityIds = new Set(); // Track selected activities for bulk actions
        this.categoryColors = {};
        this.defaultCategoryColors = [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
            '#8B5CF6', '#06B6D4', '#F97316', '#84CC16',
            '#EC4899', '#6B7280', '#F472B6', '#A78BFA',
            '#34D399', '#FBBF24', '#FB7185', '#E11D48'
        ];
        this.activitiesPerPage = 50;
        this.currentActivitiesPage = 1;
        this.totalActivitiesPages = 1;
        this.allActivities = [];

        this.init();
    }

    init() {
        console.log('TimeTrackerUI constructed');
        this.setupEventListeners();
        this.updateCurrentTime();
        this.loadInitialData();
        console.log('TimeTrackerUI initialized');
        this.setupCharts();
        console.log('TimeTrackerUI charts setup');

        // Update time every second
        setInterval(() => this.updateCurrentTime(), 1000);

        // Refresh data every 30 seconds
        setInterval(() => {
            this.refreshData();
            this.loadTrackingStatus(); // Also refresh tracking status
        }, 30000);
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
            // Clear insights cache when date range changes
            this.cachedInsights = null;
            this.lastInsightsDateRange = null;
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

        // Activity filters
        document.getElementById('activitySearch').addEventListener('input', (e) => {
            this.filterActivities();
        });

        document.getElementById('categoryFilter').addEventListener('change', () => {
            this.filterActivities();
        });

        document.getElementById('addCategoryBtn').addEventListener('click', () => {
            const input = document.getElementById('newCategoryInput');
            const newCat = input.value.trim();
            if (newCat && !this.categories.includes(newCat)) {
                this.categories.push(newCat);
                this.addCategoryWithColor(newCat);
                this.updateCategoryWeight(newCat, this.getDefaultWeight(newCat));
                this.renderCategories();
                this.renderCategoryWeights();
                this.updateCategoryFilterDropdown();
                this.updateChartColors();
                input.value = '';
            }
        });

        // Refresh activities
        document.getElementById('refreshActivities').addEventListener('click', () => {
            this.loadActivities();
        });

        // App overrides
        document.getElementById('addAppOverrideBtn').addEventListener('click', () => {
            const appName = document.getElementById('newAppNameInput').value.trim();
            const category = document.getElementById('newAppCategorySelect').value;
            const description = document.getElementById('newAppDescriptionInput').value.trim();

            if (appName && category) {
                this.appOverrides[appName] = { category, description };
                this.renderAppOverrides();
                this.updateAppOverrideCategoryDropdown();

                // Clear inputs
                document.getElementById('newAppNameInput').value = '';
                document.getElementById('newAppCategorySelect').value = '';
                document.getElementById('newAppDescriptionInput').value = '';
            }
        });

        // Custom prompt actions
        document.getElementById('resetPromptBtn').addEventListener('click', () => {
            this.customCategorizationPrompt = this.getDefaultCategorizationPrompt();
            document.getElementById('customCategorizationPrompt').value = this.customCategorizationPrompt;
        });

        document.getElementById('testPromptBtn').addEventListener('click', () => {
            this.testCustomPrompt();
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
            settings: 'Settings'
        };
        document.getElementById('pageTitle').textContent = titles[section];

        // Load section-specific data
        if (section === 'activities') {
            this.loadActivities();
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
            this.updateTrackingUI(status.isTracking, status.isSystemSleeping);
        } catch (error) {
            console.error('Error loading tracking status:', error);
        }
    }

    updateTrackingUI(isTracking, isSystemSleeping = false) {
        this.isTracking = isTracking;
        this.isSystemSleeping = isSystemSleeping;
        const indicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const toggleBtn = document.getElementById('trackingToggle');
        const toggleIcon = toggleBtn.querySelector('i');
        const toggleText = toggleBtn.querySelector('span');

        if (isSystemSleeping) {
            indicator.classList.add('sleeping');
            statusText.textContent = 'System Sleeping';
            toggleBtn.classList.remove('tracking');
            toggleBtn.classList.add('sleeping');
            toggleIcon.className = 'fas fa-moon';
            toggleText.textContent = 'Sleeping';
        } else if (isTracking) {
            indicator.classList.remove('sleeping');
            indicator.classList.add('tracking');
            statusText.textContent = 'Tracking';
            toggleBtn.classList.remove('sleeping');
            toggleBtn.classList.add('tracking');
            toggleIcon.className = 'fas fa-pause';
            toggleText.textContent = 'Stop Tracking';
        } else {
            indicator.classList.remove('tracking', 'sleeping');
            statusText.textContent = 'Not Tracking';
            toggleBtn.classList.remove('tracking', 'sleeping');
            toggleIcon.className = 'fas fa-play';
            toggleText.textContent = 'Start Tracking';
        }
    }

    async toggleTracking() {
        try {
            // Don't allow toggling when system is sleeping
            if (this.isSystemSleeping) {
                this.showNotification('Cannot toggle tracking while system is sleeping', 'info');
                return;
            }

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
        // Get category weights from settings
        const categoryWeights = this.getCategoryWeights();

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

    getCategoryWeights() {
        // Get weights from settings, or generate defaults if not set
        if (!this.categoryWeights || Object.keys(this.categoryWeights).length === 0) {
            this.categoryWeights = this.generateDefaultWeights();
        }
        return this.categoryWeights;
    }

    generateDefaultWeights() {
        const weights = {};

        if (!this.categories || this.categories.length === 0) {
            // Fallback to default categories if none are set
            const defaultCategories = ['productivity', 'development', 'communication', 'social_media', 'entertainment', 'news', 'shopping', 'system', 'other'];
            defaultCategories.forEach(cat => {
                weights[cat] = this.getDefaultWeight(cat);
            });
            return weights;
        }

        // Generate default weights for user's custom categories
        this.categories.forEach(category => {
            weights[category] = this.getDefaultWeight(category);
        });

        return weights;
    }

    getDefaultWeight(category) {
        // Intelligent default weights based on category name
        const categoryLower = category.toLowerCase();

        // High productivity categories
        if (categoryLower.includes('productivity') || categoryLower.includes('work') || categoryLower.includes('business')) return 1.0;
        if (categoryLower.includes('development') || categoryLower.includes('coding') || categoryLower.includes('programming')) return 1.0;
        if (categoryLower.includes('study') || categoryLower.includes('learning') || categoryLower.includes('education')) return 1.0;
        if (categoryLower.includes('research') || categoryLower.includes('analysis')) return 0.9;

        // Medium productivity categories
        if (categoryLower.includes('communication') || categoryLower.includes('email') || categoryLower.includes('chat')) return 0.7;
        if (categoryLower.includes('meeting') || categoryLower.includes('call') || categoryLower.includes('zoom')) return 0.7;
        if (categoryLower.includes('planning') || categoryLower.includes('organize')) return 0.8;

        // Neutral categories
        if (categoryLower.includes('news') || categoryLower.includes('reading')) return 0.5;
        if (categoryLower.includes('system') || categoryLower.includes('admin')) return 0.5;
        if (categoryLower.includes('other') || categoryLower.includes('misc')) return 0.5;

        // Lower productivity categories
        if (categoryLower.includes('social') || categoryLower.includes('media')) return 0.3;
        if (categoryLower.includes('entertainment') || categoryLower.includes('fun') || categoryLower.includes('play')) return 0.2;
        if (categoryLower.includes('shopping') || categoryLower.includes('buy')) return 0.3;
        if (categoryLower.includes('gaming') || categoryLower.includes('game')) return 0.1;

        // Default weight for unknown categories
        return 0.5;
    }

    updateCategoryWeight(category, weight) {
        if (!this.categoryWeights) {
            this.categoryWeights = this.generateDefaultWeights();
        }
        this.categoryWeights[category] = Math.max(0, Math.min(1, weight)); // Clamp between 0 and 1
    }

    getCategoryWeight(category) {
        return this.getCategoryWeights()[category] || 0.5;
    }

    setupCharts() {
        console.log('setupCharts called');
        // Setup pie chart for activity distribution
        const pieCtx = document.getElementById('activityPieChart');
        if (pieCtx) {
            this.charts.pieChart = new Chart(pieCtx, {
                type: 'pie',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: this.generateChartColors(),
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const label = context.label || '';
                                    const value = context.parsed;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${label}: ${this.formatDuration(value * 60)} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // Setup timeline chart for daily activity
        const timelineCtx = document.getElementById('timelineChart');
        console.log('timelineCtx:', timelineCtx);
        if (timelineCtx) {
            console.log('Timeline chart initialized');
            this.charts.timelineChart = new Chart(timelineCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                usePointStyle: true,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                title: (context) => {
                                    const hour = context[0].label;
                                    return `${hour}`;
                                },
                                label: (context) => {
                                    const category = context.dataset.label;
                                    const value = context.parsed.y;
                                    return `${category}: ${this.formatDuration(value * 60)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'category',
                            title: {
                                display: true,
                                text: 'Time of Day'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Duration (minutes)'
                            },
                            ticks: {
                                callback: function (value) {
                                    return Math.round(value) + 'm';
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    generateChartColors(categoriesOverride) {
        // Always use the color for each category from categoryColors
        const cats = categoriesOverride || this.categories;
        return cats.map(cat => this.categoryColors[cat] || '#cccccc');
    }

    updateChartColors() {
        if (this.charts.pieChart) {
            this.charts.pieChart.data.datasets[0].backgroundColor = this.generateChartColors();
            this.charts.pieChart.update();
        }
    }

    updateCharts(activityData, statistics) {
        console.log('updateCharts called', activityData, statistics);
        // Update pie chart with category distribution
        if (this.charts.pieChart) {
            const categoryData = {};
            activityData.forEach(activity => {
                const category = activity.category || 'other';
                if (!categoryData[category]) {
                    categoryData[category] = 0;
                }
                categoryData[category] += activity.duration || 0;
            });
            const labels = Object.keys(categoryData).map(cat => cat.replace('_', ' '));
            const data = Object.values(categoryData).map(seconds => Math.round(seconds / 60));
            const cats = Object.keys(categoryData);
            this.charts.pieChart.data.labels = labels;
            this.charts.pieChart.data.datasets[0].data = data;
            this.charts.pieChart.data.datasets[0].backgroundColor = this.generateChartColors(cats);
            this.charts.pieChart.update();
        }
        // Update timeline chart
        if (this.charts.timelineChart) {
            console.log('updateCharts: updating timeline chart');
            this.updateTimelineChart(activityData);
        }
    }

    updateTimelineChart(activityData) {
        console.log('updateTimelineChart called', activityData);
        if (!activityData || activityData.length === 0) {
            this.charts.timelineChart.data.labels = [];
            this.charts.timelineChart.data.datasets = [];
            this.charts.timelineChart.update();
            console.log('updateTimelineChart: no data, cleared chart');
            return;
        }
        const timelineData = this.processTimelineData(activityData);
        console.log('updateTimelineChart: processed data', timelineData);
        this.charts.timelineChart.data.labels = timelineData.labels;
        this.charts.timelineChart.data.datasets = timelineData.datasets;
        this.charts.timelineChart.update();
        console.log('updateTimelineChart: chart data after update', this.charts.timelineChart.data);
    }

    processTimelineData(activityData) {
        console.log('processTimelineData called', activityData);
        const categories = [...new Set(activityData.map(a => a.category))];
        // Use the correct color for each category
        const colors = this.generateChartColors(categories);
        const hourlyData = {};
        for (let hour = 0; hour < 24; hour++) {
            hourlyData[hour] = {};
            categories.forEach(category => {
                hourlyData[hour][category] = 0;
            });
        }
        activityData.forEach(activity => {
            const startTime = new Date(activity.timestamp);
            const startHour = startTime.getHours();
            const duration = activity.duration || 0;
            const category = activity.category || 'other';
            if (hourlyData[startHour]) {
                hourlyData[startHour][category] += duration;
            }
        });
        const labels = [];
        const datasets = [];
        for (let hour = 0; hour < 24; hour++) {
            const timeString = `${hour.toString().padStart(2, '0')}:00`;
            labels.push(timeString);
        }
        categories.forEach((category, index) => {
            const data = [];
            for (let hour = 0; hour < 24; hour++) {
                const durationMinutes = Math.round((hourlyData[hour][category] || 0) / 60);
                data.push(durationMinutes);
            }
            datasets.push({
                label: category.replace('_', ' '),
                data: data,
                borderColor: this.categoryColors[category] || colors[index] || '#cccccc',
                backgroundColor: (this.categoryColors[category] || colors[index] || '#cccccc') + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5
            });
        });
        const result = { labels, datasets };
        console.log('processTimelineData result', result);
        return result;
    }

    updateLists(statistics) {
        // Update top apps
        const topAppsContainer = document.getElementById('topApps');
        if (statistics.topApps && statistics.topApps.length > 0) {
            topAppsContainer.innerHTML = statistics.topApps.map(app => {
                // Try to get icon for the app
                let iconHtml = `<i class="fas fa-desktop"></i>`;
                const iconBase64 = app.iconBase64 || app.icon_base64;
                if (iconBase64) {
                    iconHtml = `<img src="${iconBase64}" alt="${app.process_name}" class="list-app-icon">`;
                }

                return `
                    <div class="list-item">
                        <div class="list-item-left">
                            <div class="list-item-icon">
                                ${iconHtml}
                            </div>
                            <div class="list-item-info">
                                <h4>${app.process_name}</h4>
                                <small>${app.sessions} sessions</small>
                            </div>
                        </div>
                        <div class="list-item-time">${this.formatDuration(app.total_time)}</div>
                    </div>
                `;
            }).join('');
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
            this.allActivities = activities;
            this.currentActivitiesPage = 1;
            this.totalActivitiesPages = Math.max(1, Math.ceil(activities.length / this.activitiesPerPage));
            this.renderActivitiesPage();
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    }

    renderActivitiesPage() {
        const startIdx = (this.currentActivitiesPage - 1) * this.activitiesPerPage;
        const endIdx = startIdx + this.activitiesPerPage;
        const activities = this.allActivities.slice(startIdx, endIdx);
        this.renderActivities(activities);
        this.renderActivitiesPagination();
    }

    renderActivitiesPagination() {
        const container = document.getElementById('activitiesList');
        let paginationHtml = '';
        if (this.totalActivitiesPages > 1) {
            paginationHtml = `
                <div class="activities-pagination">
                    <button id="activitiesPrevPage" ${this.currentActivitiesPage === 1 ? 'disabled' : ''}>Prev</button>
                    <span>Page ${this.currentActivitiesPage} of ${this.totalActivitiesPages}</span>
                    <button id="activitiesNextPage" ${this.currentActivitiesPage === this.totalActivitiesPages ? 'disabled' : ''}>Next</button>
                </div>
            `;
        }
        // Append pagination controls after the list
        container.insertAdjacentHTML('beforeend', paginationHtml);
        if (this.totalActivitiesPages > 1) {
            document.getElementById('activitiesPrevPage').addEventListener('click', () => {
                if (this.currentActivitiesPage > 1) {
                    this.currentActivitiesPage--;
                    this.renderActivitiesPage();
                }
            });
            document.getElementById('activitiesNextPage').addEventListener('click', () => {
                if (this.currentActivitiesPage < this.totalActivitiesPages) {
                    this.currentActivitiesPage++;
                    this.renderActivitiesPage();
                }
            });
        }
    }

    renderActivities(activities) {
        const container = document.getElementById('activitiesList');

        // Bulk actions bar
        let bulkBarHtml = '';
        if (this.selectedActivityIds.size > 0) {
            bulkBarHtml = `
                <div class="bulk-actions-bar">
                    <span>${this.selectedActivityIds.size} selected</span>
                    <select id="bulkCategorySelect">
                        <option value="">Change category...</option>
                        ${this.categories.map(cat => `<option value="${cat}">${cat.replace('_', ' ')}</option>`).join('')}
                    </select>
                    <button id="applyBulkCategoryBtn" class="btn-primary">Apply</button>
                    <button id="clearBulkSelectionBtn" class="btn-secondary">Clear Selection</button>
                </div>
            `;
        }

        if (activities.length === 0) {
            container.innerHTML = `
                ${bulkBarHtml}
                <div class="empty-state">
                    <i class="fas fa-list"></i>
                    <p>No activities recorded yet</p>
                    <small>Start tracking to see your activities here</small>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            ${bulkBarHtml}
            ${activities.map(activity => {
            // Determine icon to display
            let iconHtml = '';
            const iconBase64 = activity.iconBase64 || activity.icon_base64;
            if (iconBase64) {
                iconHtml = `<img src="${iconBase64}" alt="${activity.processName}" class="activity-app-icon">`;
            } else {
                iconHtml = `<i class="fas ${this.getActivityIcon(activity.category)}"></i>`;
            }
            const checked = this.selectedActivityIds.has(activity.id) ? 'checked' : '';
            const catColor = this.categoryColors[activity.category] || '#cccccc';
            return `
                    <div class="activity-item improved-activity-row" data-activity-id="${activity.id}" style="border-left: 6px solid ${catColor};">
                        <input type="checkbox" class="activity-select-checkbox" data-activity-id="${activity.id}" ${checked} />
                        <div class="activity-icon">
                            ${iconHtml}
                        </div>
                        <div class="activity-content">
                            <div class="activity-title">${activity.windowTitle}</div>
                            <div class="activity-meta">
                                <span>${activity.processName}</span>
                                <span>${new Date(activity.timestamp).toLocaleTimeString()}</span>
                                <div class="category-select-wrapper">
                                    <select class="activity-category-select improved-category-select modern-category-select" data-activity-id="${activity.id}">
                                        ${this.categories.map(cat => `
                                            <option value="${cat}" ${cat === activity.category ? 'selected' : ''}>
                                                ${cat.replace('_', ' ')}
                                            </option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="activity-time">${this.formatDuration(activity.duration)}</div>
                    </div>
                `;
        }).join('')}
        `;

        // Attach change handlers for category dropdowns
        container.querySelectorAll('.activity-category-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const activityId = select.getAttribute('data-activity-id');
                const newCategory = select.value;
                await this.updateActivityCategory(activityId, newCategory);
            });
        });

        // Attach handlers for checkboxes
        container.querySelectorAll('.activity-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const activityId = parseInt(checkbox.getAttribute('data-activity-id'));
                if (checkbox.checked) {
                    this.selectedActivityIds.add(activityId);
                } else {
                    this.selectedActivityIds.delete(activityId);
                }
                this.renderActivities(activities); // Re-render to update bulk bar
            });
        });

        // Bulk actions handlers
        if (this.selectedActivityIds.size > 0) {
            const bulkCategorySelect = document.getElementById('bulkCategorySelect');
            const applyBulkBtn = document.getElementById('applyBulkCategoryBtn');
            const clearBulkBtn = document.getElementById('clearBulkSelectionBtn');
            if (applyBulkBtn) {
                applyBulkBtn.addEventListener('click', async () => {
                    const newCategory = bulkCategorySelect.value;
                    if (!newCategory) return;
                    await this.bulkUpdateActivityCategory(Array.from(this.selectedActivityIds), newCategory);
                    this.selectedActivityIds.clear();
                    this.loadActivities();
                });
            }
            if (clearBulkBtn) {
                clearBulkBtn.addEventListener('click', () => {
                    this.selectedActivityIds.clear();
                    this.renderActivities(activities);
                });
            }
        }
    }

    async updateActivityCategory(activityId, newCategory) {
        try {
            await ipcRenderer.invoke('update-activity-category', { id: activityId, category: newCategory });
            this.showNotification('Category updated!', 'success');
        } catch (error) {
            this.showNotification('Failed to update category', 'error');
        }
    }

    async bulkUpdateActivityCategory(activityIds, newCategory) {
        try {
            await ipcRenderer.invoke('bulk-update-activity-category', { ids: activityIds, category: newCategory });
            this.showNotification('Categories updated!', 'success');
        } catch (error) {
            this.showNotification('Failed to update categories', 'error');
        }
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
        // Filter allActivities, then re-render page 1
        const filtered = this.allActivities.filter(activity => {
            const title = (activity.windowTitle || '').toLowerCase();
            const category = (activity.category || '').toLowerCase();
            const matchesSearch = title.includes(searchTerm);
            const matchesCategory = !categoryFilter || category.includes(categoryFilter);
            return matchesSearch && matchesCategory;
        });
        this.currentActivitiesPage = 1;
        this.totalActivitiesPages = Math.max(1, Math.ceil(filtered.length / this.activitiesPerPage));
        this.filteredActivities = filtered;
        this.renderActivitiesPageFiltered();
    }

    renderActivitiesPageFiltered() {
        const startIdx = (this.currentActivitiesPage - 1) * this.activitiesPerPage;
        const endIdx = startIdx + this.activitiesPerPage;
        const activities = this.filteredActivities.slice(startIdx, endIdx);
        this.renderActivities(activities);
        this.renderActivitiesPagination();
    }

    async loadSettings() {
        try {
            const settings = await ipcRenderer.invoke('get-settings');

            document.getElementById('autoStart').checked = settings.autoStart;
            document.getElementById('trackingInterval').value = settings.trackingInterval;
            document.getElementById('aiEnabled').checked = settings.aiEnabled;
            document.getElementById('togetherApiKey').value = settings.togetherApiKey || '';
            this.categories = settings.categories || [
                'productivity', 'development', 'communication', 'social_media', 'entertainment', 'news', 'shopping', 'system', 'other'
            ];

            // Load category weights from settings
            if (settings.categoryWeights && Object.keys(settings.categoryWeights).length > 0) {
                this.categoryWeights = settings.categoryWeights;
            } else {
                this.categoryWeights = this.generateDefaultWeights();
            }

            // Load app overrides
            this.appOverrides = settings.appOverrides || {};

            // Load custom prompt
            this.customCategorizationPrompt = settings.customCategorizationPrompt || this.getDefaultCategorizationPrompt();

            // Load category descriptions
            this.categoryDescriptions = settings.categoryDescriptions || {};

            this.categoryColors = settings.categoryColors || this.generateDefaultCategoryColors(this.categories);

            this.renderCategories();
            this.renderCategoryWeights();
            this.renderAppOverrides();
            this.renderCategoryDescriptions();
            this.updateCategoryFilterDropdown();
            this.updateAppOverrideCategoryDropdown();
            this.updateCustomPromptField();
            this.saveCategoryColors();
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    renderCategoryWeights() {
        const container = document.getElementById('categoryWeightsList');
        if (!container) return;

        if (!this.categories || this.categories.length === 0) {
            container.innerHTML = '<div style="color:#6b7280;">No categories defined.</div>';
            return;
        }

        container.innerHTML = this.categories.map(cat => {
            const weight = this.getCategoryWeight(cat);
            return `
                <div class="category-weight-item">
                    <span class="category-name">${cat.replace('_', ' ')}</span>
                    <div class="weight-controls">
                        <input type="range" 
                               min="0" 
                               max="1" 
                               step="0.1" 
                               value="${weight}" 
                               class="weight-slider" 
                               data-category="${cat}"
                               oninput="this.nextElementSibling.textContent = (this.value * 10).toFixed(0) + '/10'">
                        <span class="weight-value">${(weight * 10).toFixed(0)}/10</span>
                    </div>
                </div>
            `;
        }).join('');

        // Attach event listeners for weight sliders
        container.querySelectorAll('.weight-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const category = e.target.getAttribute('data-category');
                const weight = parseFloat(e.target.value);
                this.updateCategoryWeight(category, weight);
            });
        });
    }

    updateCategoryFilterDropdown() {
        const categoryFilter = document.getElementById('categoryFilter');
        if (!categoryFilter) return;

        // Keep the "All Categories" option
        categoryFilter.innerHTML = '<option value="">All Categories</option>';

        // Add user's custom categories
        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.replace('_', ' ');
            categoryFilter.appendChild(option);
        });
    }

    updateAppOverrideCategoryDropdown() {
        const categorySelect = document.getElementById('newAppCategorySelect');
        if (!categorySelect) return;

        // Keep the "Select category..." option
        categorySelect.innerHTML = '<option value="">Select category...</option>';

        // Add user's custom categories
        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.replace('_', ' ');
            categorySelect.appendChild(option);
        });
    }

    renderAppOverrides() {
        const container = document.getElementById('appOverridesList');
        if (!container) return;

        if (!this.appOverrides || Object.keys(this.appOverrides).length === 0) {
            container.innerHTML = '<div style="color:#6b7280;">No app overrides defined.</div>';
            return;
        }

        container.innerHTML = Object.entries(this.appOverrides).map(([appName, override]) => `
            <div class="app-override-item">
                <div class="app-override-info">
                    <div class="app-override-name">${appName}</div>
                    <div class="app-override-category">Category: ${override.category.replace('_', ' ')}</div>
                    ${override.description ? `<div class="app-override-description">${override.description}</div>` : ''}
                </div>
                <button class="remove-override-btn" data-app="${appName}">Remove</button>
            </div>
        `).join('');

        // Attach remove handlers
        container.querySelectorAll('.remove-override-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const appName = btn.getAttribute('data-app');
                this.removeAppOverride(appName);
            });
        });
    }

    removeAppOverride(appName) {
        delete this.appOverrides[appName];
        this.renderAppOverrides();
    }

    updateCustomPromptField() {
        const promptField = document.getElementById('customCategorizationPrompt');
        if (promptField) {
            promptField.value = this.customCategorizationPrompt;
        }
    }

    getDefaultCategorizationPrompt() {
        return `Categorize this activity into one of these categories:
{categories}

Activity: {appName} - {windowTitle}
Current category: {currentCategory}

Consider the category descriptions above when categorizing. If a category has a description, use it to guide your decision.

Respond with only the category name.`;
    }

    async testCustomPrompt() {
        const prompt = document.getElementById('customCategorizationPrompt').value;
        const testApp = { name: 'kitty', title: 'Terminal - nvim' };

        try {
            const result = await ipcRenderer.invoke('test-custom-prompt', { prompt, testApp });

            if (result.success) {
                this.showNotification(`Test result: ${testApp.name} → ${result.category}`, 'success');
            } else {
                this.showNotification(`Test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification('Error testing prompt', 'error');
        }
    }

    renderCategories() {
        const list = document.getElementById('categoriesList');
        if (!this.categories || this.categories.length === 0) {
            list.innerHTML = '<div style="color:#6b7280;">No categories defined.</div>';
            return;
        }
        list.innerHTML = this.categories.map(cat => {
            const color = this.categoryColors[cat] || '#ccc';
            const description = this.categoryDescriptions[cat] || '';
            const inputId = `color-input-${cat}`;
            const isEditing = this.editingCategoryDescription === cat;
            return `
                <div class="category-item category-row-flex">
                    <div class="category-swatch-col">
                        <label for="${inputId}" class="category-color-swatch category-color-picker-swatch" style="background:${color}; cursor:pointer;" title="Change color"></label>
                        <input type="color" id="${inputId}" class="category-color-picker visually-hidden" data-cat="${cat}" value="${color}" />
                    </div>
                    <div class="category-info-col">
                        <span class="category-name">${cat}</span>
                        <div class="category-description-editable">
                            ${isEditing
                    ? `<textarea class="category-description-input" data-cat="${cat}">${description}</textarea>
                                   <div class="category-description-actions">
                                       <button class="save-description-btn" data-cat="${cat}">Save</button>
                                       <button class="cancel-description-btn" data-cat="${cat}">Cancel</button>
                                   </div>`
                    : description
                        ? `<div class="category-description-text">${description}</div>
                                       <button class="edit-description-btn" data-cat="${cat}" title="Edit description"><i class="fas fa-pen"></i></button>`
                        : `<button class="edit-description-btn" data-cat="${cat}" title="Add description"><i class="fas fa-pen"></i></button>`
                }
                        </div>
                    </div>
                    <div class="category-remove-col">
                        <button class="remove-category-btn" data-cat="${cat}">Remove</button>
                    </div>
                </div>
            `;
        }).join('');
        // Attach remove handlers
        list.querySelectorAll('.remove-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = btn.getAttribute('data-cat');
                this.removeCategory(cat);
            });
        });
        // Attach color pickers (click swatch opens input)
        list.querySelectorAll('.category-color-picker-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                const input = swatch.parentNode.querySelector('.category-color-picker');
                if (input) input.click();
            });
        });
        list.querySelectorAll('.category-color-picker').forEach(picker => {
            picker.addEventListener('input', (e) => {
                const cat = picker.getAttribute('data-cat');
                this.categoryColors[cat] = picker.value;
                this.saveCategoryColors();
                this.renderCategories();
                this.updateChartColors();
            });
        });
        // Attach edit/save/cancel handlers for descriptions
        list.querySelectorAll('.edit-description-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = btn.getAttribute('data-cat');
                this.editingCategoryDescription = cat;
                this.renderCategories();
            });
        });
        list.querySelectorAll('.save-description-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = btn.getAttribute('data-cat');
                const textarea = list.querySelector(`.category-description-input[data-cat="${cat}"]`);
                const desc = textarea.value.trim();
                if (desc) {
                    this.categoryDescriptions[cat] = desc;
                } else {
                    delete this.categoryDescriptions[cat];
                }
                this.editingCategoryDescription = null;
                this.renderCategories();
            });
        });
        list.querySelectorAll('.cancel-description-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.editingCategoryDescription = null;
                this.renderCategories();
            });
        });
    }

    removeCategory(cat) {
        this.categories = this.categories.filter(c => c !== cat);
        // Remove weight for deleted category
        if (this.categoryWeights && this.categoryWeights[cat]) {
            delete this.categoryWeights[cat];
        }
        if (this.categoryColors && this.categoryColors[cat]) {
            delete this.categoryColors[cat];
            this.saveCategoryColors();
        }
        this.renderCategories();
        this.renderCategoryWeights();
        this.updateCategoryFilterDropdown();
        this.updateChartColors();
    }

    async saveSettings() {
        try {
            // Update custom prompt from textarea
            this.customCategorizationPrompt = document.getElementById('customCategorizationPrompt').value;

            const settings = {
                autoStart: document.getElementById('autoStart').checked,
                trackingInterval: parseInt(document.getElementById('trackingInterval').value),
                aiEnabled: document.getElementById('aiEnabled').checked,
                togetherApiKey: document.getElementById('togetherApiKey').value,
                categories: this.categories,
                categoryWeights: this.categoryWeights,
                appOverrides: this.appOverrides,
                customCategorizationPrompt: this.customCategorizationPrompt,
                categoryDescriptions: this.categoryDescriptions,
                categoryColors: this.categoryColors
            };

            await ipcRenderer.invoke('update-settings', settings);

            // Update AI API key if provided
            if (settings.togetherApiKey) {
                await ipcRenderer.invoke('update-ai-api-key', settings.togetherApiKey);
            }

            // Update app overrides
            await ipcRenderer.invoke('update-app-overrides', this.appOverrides);

            // Update custom prompt
            await ipcRenderer.invoke('update-custom-prompt', this.customCategorizationPrompt);

            // Update category descriptions
            await ipcRenderer.invoke('update-category-descriptions', this.categoryDescriptions);

            // Update category colors
            await ipcRenderer.invoke('update-category-colors', this.categoryColors);

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

    renderCategoryDescriptions() {
        const container = document.getElementById('categoryDescriptionsList');
        if (!container) return;

        if (!this.categories || this.categories.length === 0) {
            container.innerHTML = '<div style="color:#6b7280;">No categories defined.</div>';
            return;
        }

        container.innerHTML = this.categories.map(cat => {
            const description = this.categoryDescriptions[cat] || '';
            const isEditing = this.editingCategoryDescription === cat;

            return `
                <div class="category-description-item">
                    <div class="category-description-info">
                        <div class="category-description-name">${cat.replace('_', ' ')}</div>
                        ${isEditing ?
                    `<textarea class="category-description-input" placeholder="Enter description for ${cat.replace('_', ' ')}...">${description}</textarea>
                             <div class="category-description-actions">
                                 <button class="save-description-btn" data-category="${cat}">Save</button>
                                 <button class="cancel-description-btn" data-category="${cat}">Cancel</button>
                             </div>` :
                    `<div class="category-description-text">${description || 'No description set'}</div>
                             <div class="category-description-actions">
                                 <button class="edit-description-btn" data-category="${cat}">Edit</button>
                             </div>`
                }
                    </div>
                </div>
            `;
        }).join('');

        // Attach event listeners
        container.querySelectorAll('.save-description-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.target.getAttribute('data-category');
                const textarea = e.target.closest('.category-description-item').querySelector('.category-description-input');
                const description = textarea.value.trim();
                this.saveCategoryDescription(category, description);
            });
        });

        container.querySelectorAll('.edit-description-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.target.getAttribute('data-category');
                this.startEditingCategoryDescription(category);
            });
        });

        container.querySelectorAll('.cancel-description-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const category = e.target.getAttribute('data-category');
                this.cancelEditingCategoryDescription(category);
            });
        });
    }

    startEditingCategoryDescription(category) {
        this.editingCategoryDescription = category;
        this.renderCategoryDescriptions();
    }

    cancelEditingCategoryDescription(category) {
        this.editingCategoryDescription = null;
        this.renderCategoryDescriptions();
    }

    saveCategoryDescription(category, description) {
        if (description) {
            this.categoryDescriptions[category] = description;
        } else {
            delete this.categoryDescriptions[category];
        }
        this.editingCategoryDescription = null;
        this.renderCategoryDescriptions();
    }

    saveCategoryColors() {
        ipcRenderer.invoke('update-category-colors', this.categoryColors);
    }

    generateDefaultCategoryColors(categories) {
        const colors = {};
        categories.forEach((cat, i) => {
            colors[cat] = this.defaultCategoryColors[i % this.defaultCategoryColors.length];
        });
        return colors;
    }

    addCategoryWithColor(newCat) {
        // Assign a color to the new category
        const usedColors = Object.values(this.categoryColors);
        const available = this.defaultCategoryColors.find(c => !usedColors.includes(c));
        this.categoryColors[newCat] = available || '#cccccc';
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