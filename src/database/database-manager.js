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

        const createAppIconsTable = `
      CREATE TABLE IF NOT EXISTS app_icons (
        process_name TEXT PRIMARY KEY,
        icon_path TEXT,
        icon_base64 TEXT
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

                this.db.run(createAppIconsTable, (err) => {
                    if (err) {
                        console.error('Error creating app_icons table:', err);
                        reject(err);
                    }
                });

                this.db.run(createSettingsTable, (err) => {
                    if (err) {
                        console.error('Error creating settings table:', err);
                        reject(err);
                    } else {
                        console.log('Database tables created successfully');
                        this.migrateDatabase().then(resolve).catch(reject);
                    }
                });
            });
        });
    }

    async migrateDatabase() {
        // Remove icon_path and icon_base64 from activities, migrate to app_icons
        return new Promise((resolve, reject) => {
            this.db.all("PRAGMA table_info(activities)", (err, columns) => {
                if (err) {
                    console.error('Error getting table info:', err);
                    reject(err);
                    return;
                }
                const hasIconPath = columns.some(col => col.name === 'icon_path');
                const hasIconBase64 = columns.some(col => col.name === 'icon_base64');
                if (hasIconPath || hasIconBase64) {
                    // Migrate unique icons to app_icons
                    this.db.all("SELECT DISTINCT process_name, icon_path, icon_base64 FROM activities WHERE icon_base64 IS NOT NULL", (err, rows) => {
                        if (!err && rows && rows.length > 0) {
                            rows.forEach(row => {
                                this.db.run("INSERT OR IGNORE INTO app_icons (process_name, icon_path, icon_base64) VALUES (?, ?, ?)", [row.process_name, row.icon_path, row.icon_base64]);
                            });
                        }
                        // Remove columns from activities (requires table recreation in SQLite)
                        this._recreateActivitiesTableWithoutIcons().then(resolve).catch(reject);
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    async _recreateActivitiesTableWithoutIcons() {
        // SQLite doesn't support DROP COLUMN, so we need to recreate the table
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run(`ALTER TABLE activities RENAME TO activities_old`);
                this.db.run(`CREATE TABLE activities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME NOT NULL,
                    process_name TEXT NOT NULL,
                    window_title TEXT,
                    url TEXT,
                    domain TEXT,
                    category TEXT NOT NULL,
                    duration INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);
                this.db.run(`INSERT INTO activities (id, timestamp, process_name, window_title, url, domain, category, duration, created_at)
                    SELECT id, timestamp, process_name, window_title, url, domain, category, duration, created_at FROM activities_old`);
                this.db.run(`DROP TABLE activities_old`, (err) => {
                    if (err) reject(err);
                    else resolve();
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

    async getAppIcons() {
        const query = `SELECT process_name, icon_base64 FROM app_icons`;
        return new Promise((resolve, reject) => {
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    console.error('Error getting app icons:', err);
                    reject(err);
                } else {
                    const iconMap = {};
                    rows.forEach(row => {
                        if (row.icon_base64) {
                            iconMap[row.process_name] = row.icon_base64;
                        }
                    });
                    resolve(iconMap);
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
      SELECT 
        a.id,
        a.timestamp,
        a.process_name as processName,
        a.window_title as windowTitle,
        a.url,
        a.domain,
        a.category,
        a.duration,
        a.created_at as createdAt
      FROM activities a
      WHERE a.timestamp BETWEEN ? AND ?
      ORDER BY a.timestamp DESC
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
        a.process_name,
        COUNT(*) as sessions,
        SUM(a.duration) as total_time
      FROM activities a
      WHERE a.timestamp BETWEEN ? AND ?
      GROUP BY a.process_name
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
            this.db.all(categoryStatsQuery, [startDate.toISOString(), endDate.toISOString()], (err, categoryStats) => {
                if (err) {
                    console.error('Error getting category stats:', err);
                    reject(err);
                } else {
                    this.db.all(topAppsQuery, [startDate.toISOString(), endDate.toISOString()], (err, topApps) => {
                        if (err) {
                            console.error('Error getting top apps:', err);
                            reject(err);
                        } else {
                            this.db.all(topWebsitesQuery, [startDate.toISOString(), endDate.toISOString()], (err, topWebsites) => {
                                if (err) {
                                    console.error('Error getting top websites:', err);
                                    reject(err);
                                } else {
                                    resolve({
                                        categoryStats,
                                        topApps,
                                        topWebsites
                                    });
                                }
                            });
                        }
                    });
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