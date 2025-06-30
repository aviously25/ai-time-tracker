const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { format, startOfDay, endOfDay, subDays } = require('date-fns');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbPath = path.join(process.env.HOME || process.env.USERPROFILE, '.ai-time-tracker.db');
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const createActivitiesTable = `
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        process_name TEXT NOT NULL,
        window_title TEXT,
        url TEXT,
        domain TEXT,
        category TEXT NOT NULL,
        duration INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

        const createInsightsTable = `
      CREATE TABLE IF NOT EXISTS insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        category TEXT NOT NULL,
        total_time INTEGER DEFAULT 0,
        insights TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

        const createSettingsTable = `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(createActivitiesTable, (err) => {
                    if (err) {
                        console.error('Error creating activities table:', err);
                        reject(err);
                    }
                });

                this.db.run(createInsightsTable, (err) => {
                    if (err) {
                        console.error('Error creating insights table:', err);
                        reject(err);
                    }
                });

                this.db.run(createSettingsTable, (err) => {
                    if (err) {
                        console.error('Error creating settings table:', err);
                        reject(err);
                    } else {
                        console.log('Database tables created successfully');
                        resolve();
                    }
                });
            });
        });
    }

    async saveActivity(activity) {
        const query = `
      INSERT INTO activities (timestamp, process_name, window_title, url, domain, category, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

        return new Promise((resolve, reject) => {
            this.db.run(query, [
                activity.timestamp.toISOString(),
                activity.processName,
                activity.windowTitle,
                activity.url,
                activity.domain,
                activity.category,
                activity.duration
            ], function (err) {
                if (err) {
                    console.error('Error saving activity:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async getActivityData(dateRange = 'today') {
        let startDate, endDate;

        switch (dateRange) {
            case 'today':
                startDate = startOfDay(new Date());
                endDate = endOfDay(new Date());
                break;
            case 'yesterday':
                startDate = startOfDay(subDays(new Date(), 1));
                endDate = endOfDay(subDays(new Date(), 1));
                break;
            case 'week':
                startDate = startOfDay(subDays(new Date(), 7));
                endDate = endOfDay(new Date());
                break;
            case 'month':
                startDate = startOfDay(subDays(new Date(), 30));
                endDate = endOfDay(new Date());
                break;
            default:
                startDate = startOfDay(new Date());
                endDate = endOfDay(new Date());
        }

        const query = `
      SELECT * FROM activities 
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
    `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [startDate.toISOString(), endDate.toISOString()], (err, rows) => {
                if (err) {
                    console.error('Error getting activity data:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async getStatistics(dateRange = 'today') {
        let startDate, endDate;

        switch (dateRange) {
            case 'today':
                startDate = startOfDay(new Date());
                endDate = endOfDay(new Date());
                break;
            case 'yesterday':
                startDate = startOfDay(subDays(new Date(), 1));
                endDate = endOfDay(subDays(new Date(), 1));
                break;
            case 'week':
                startDate = startOfDay(subDays(new Date(), 7));
                endDate = endOfDay(new Date());
                break;
            case 'month':
                startDate = startOfDay(subDays(new Date(), 30));
                endDate = endOfDay(new Date());
                break;
            default:
                startDate = startOfDay(new Date());
                endDate = endOfDay(new Date());
        }

        const categoryStatsQuery = `
      SELECT 
        category,
        COUNT(*) as sessions,
        SUM(duration) as total_time,
        AVG(duration) as avg_duration
      FROM activities 
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY category
      ORDER BY total_time DESC
    `;

        const topAppsQuery = `
      SELECT 
        process_name,
        COUNT(*) as sessions,
        SUM(duration) as total_time
      FROM activities 
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY process_name
      ORDER BY total_time DESC
      LIMIT 10
    `;

        const topWebsitesQuery = `
      SELECT 
        domain,
        COUNT(*) as sessions,
        SUM(duration) as total_time
      FROM activities 
      WHERE timestamp BETWEEN ? AND ? AND domain IS NOT NULL
      GROUP BY domain
      ORDER BY total_time DESC
      LIMIT 10
    `;

        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                const results = {};

                this.db.all(categoryStatsQuery, [startDate.toISOString(), endDate.toISOString()], (err, rows) => {
                    if (err) {
                        console.error('Error getting category stats:', err);
                        reject(err);
                    } else {
                        results.categoryStats = rows;
                    }
                });

                this.db.all(topAppsQuery, [startDate.toISOString(), endDate.toISOString()], (err, rows) => {
                    if (err) {
                        console.error('Error getting top apps:', err);
                        reject(err);
                    } else {
                        results.topApps = rows;
                    }
                });

                this.db.all(topWebsitesQuery, [startDate.toISOString(), endDate.toISOString()], (err, rows) => {
                    if (err) {
                        console.error('Error getting top websites:', err);
                        reject(err);
                    } else {
                        results.topWebsites = rows;
                        resolve(results);
                    }
                });
            });
        });
    }

    async saveInsight(date, category, totalTime, insights) {
        const query = `
      INSERT OR REPLACE INTO insights (date, category, total_time, insights)
      VALUES (?, ?, ?, ?)
    `;

        return new Promise((resolve, reject) => {
            this.db.run(query, [format(date, 'yyyy-MM-dd'), category, totalTime, insights], function (err) {
                if (err) {
                    console.error('Error saving insight:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async getInsights(dateRange = 'today') {
        let startDate, endDate;

        switch (dateRange) {
            case 'today':
                startDate = startOfDay(new Date());
                endDate = endOfDay(new Date());
                break;
            case 'yesterday':
                startDate = startOfDay(subDays(new Date(), 1));
                endDate = endOfDay(subDays(new Date(), 1));
                break;
            case 'week':
                startDate = startOfDay(subDays(new Date(), 7));
                endDate = endOfDay(new Date());
                break;
            case 'month':
                startDate = startOfDay(subDays(new Date(), 30));
                endDate = endOfDay(new Date());
                break;
            default:
                startDate = startOfDay(new Date());
                endDate = endOfDay(new Date());
        }

        const query = `
      SELECT * FROM insights 
      WHERE date BETWEEN ? AND ?
      ORDER BY date DESC
    `;

        return new Promise((resolve, reject) => {
            this.db.all(query, [format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')], (err, rows) => {
                if (err) {
                    console.error('Error getting insights:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async updateActivityCategory(id, category) {
        const query = `UPDATE activities SET category = ? WHERE id = ?`;
        return new Promise((resolve, reject) => {
            this.db.run(query, [category, id], function (err) {
                if (err) {
                    console.error('Error updating activity category:', err);
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err);
                } else {
                    console.log('Database connection closed');
                }
            });
        }
    }
}

module.exports = { DatabaseManager }; 