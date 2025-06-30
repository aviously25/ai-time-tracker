const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class IconExtractor {
    constructor() {
        this.iconCache = new Map();
        this.platform = process.platform;
    }

    async getAppIcon(processName) {
        // Check cache first
        if (this.iconCache.has(processName)) {
            return this.iconCache.get(processName);
        }

        let iconPath = null;

        try {
            if (this.platform === 'darwin') {
                iconPath = await this.getMacAppIcon(processName);
            } else if (this.platform === 'win32') {
                iconPath = await this.getWindowsAppIcon(processName);
            } else if (this.platform === 'linux') {
                iconPath = await this.getLinuxAppIcon(processName);
            }
        } catch (error) {
            console.log(`Could not get icon for ${processName}:`, error.message);
        }

        // Cache the result (even if null)
        this.iconCache.set(processName, iconPath);
        return iconPath;
    }

    async getMacAppIcon(processName) {
        try {
            // Common app locations on macOS
            const appLocations = [
                `/Applications/${processName}.app`,
                `/Applications/${processName}.app/Contents/Resources/${processName}.icns`,
                `/System/Applications/${processName}.app`,
                `/System/Applications/${processName}.app/Contents/Resources/${processName}.icns`
            ];

            // Also check for common variations
            const variations = [
                processName,
                processName.charAt(0).toUpperCase() + processName.slice(1),
                processName.toLowerCase(),
                processName.toUpperCase()
            ];

            for (const variation of variations) {
                for (const location of appLocations) {
                    const appPath = location.replace(processName, variation);
                    if (fs.existsSync(appPath)) {
                        if (appPath.endsWith('.icns')) {
                            return appPath;
                        } else {
                            // Look for icon file in the app bundle
                            const iconPath = path.join(appPath, 'Contents', 'Resources', `${variation}.icns`);
                            if (fs.existsSync(iconPath)) {
                                return iconPath;
                            }

                            // Try to find any .icns file in Resources
                            const resourcesPath = path.join(appPath, 'Contents', 'Resources');
                            if (fs.existsSync(resourcesPath)) {
                                const files = fs.readdirSync(resourcesPath);
                                const icnsFile = files.find(file => file.endsWith('.icns'));
                                if (icnsFile) {
                                    return path.join(resourcesPath, icnsFile);
                                }
                            }
                        }
                    }
                }
            }

            // Try using system_profiler to find the app
            try {
                const output = execSync(`system_profiler SPApplicationsDataType -json`, { encoding: 'utf8' });
                const apps = JSON.parse(output);

                for (const app of apps.SPApplicationsDataType || []) {
                    if (app._name && app._name.toLowerCase().includes(processName.toLowerCase())) {
                        const appPath = app.path;
                        if (appPath && fs.existsSync(appPath)) {
                            const resourcesPath = path.join(appPath, 'Contents', 'Resources');
                            if (fs.existsSync(resourcesPath)) {
                                const files = fs.readdirSync(resourcesPath);
                                const icnsFile = files.find(file => file.endsWith('.icns'));
                                if (icnsFile) {
                                    return path.join(resourcesPath, icnsFile);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                // system_profiler failed, continue with other methods
            }

            return null;
        } catch (error) {
            console.error('Error getting Mac app icon:', error);
            return null;
        }
    }

    async getWindowsAppIcon(processName) {
        try {
            // On Windows, we can try to find the executable and extract its icon
            // This is more complex and would require additional libraries
            // For now, return null and we can enhance this later
            return null;
        } catch (error) {
            console.error('Error getting Windows app icon:', error);
            return null;
        }
    }

    async getLinuxAppIcon(processName) {
        try {
            // On Linux, we can look for .desktop files and extract icons
            // This is more complex and would require additional libraries
            // For now, return null and we can enhance this later
            return null;
        } catch (error) {
            console.error('Error getting Linux app icon:', error);
            return null;
        }
    }

    // Convert icon to base64 for display in the UI
    async getIconAsBase64(iconPath) {
        if (!iconPath || !fs.existsSync(iconPath)) {
            return null;
        }

        try {
            let pngPath = iconPath;
            const ext = path.extname(iconPath).toLowerCase();
            const os = require('os');
            const { execSync } = require('child_process');

            // If .icns, convert to .png using sips (macOS only)
            if (ext === '.icns' && process.platform === 'darwin') {
                pngPath = path.join(os.tmpdir(), `${path.basename(iconPath, '.icns')}_${Date.now()}.png`);
                execSync(`sips -s format png "${iconPath}" --out "${pngPath}"`);
            }

            const iconBuffer = fs.readFileSync(pngPath);
            const base64 = iconBuffer.toString('base64');
            const mimeType = 'image/png';

            // Clean up temp file if we created one
            if (pngPath !== iconPath && fs.existsSync(pngPath)) {
                fs.unlinkSync(pngPath);
            }

            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            console.error('Error converting icon to base64:', error);
            return null;
        }
    }

    // Get a fallback icon based on category
    getFallbackIcon(category) {
        const iconMap = {
            'productivity': 'fas fa-briefcase',
            'development': 'fas fa-code',
            'communication': 'fas fa-comments',
            'social_media': 'fas fa-share-alt',
            'entertainment': 'fas fa-play',
            'news': 'fas fa-newspaper',
            'shopping': 'fas fa-shopping-cart',
            'system': 'fas fa-cog',
            'other': 'fas fa-question'
        };

        return iconMap[category] || 'fas fa-question';
    }

    // Clear the icon cache
    clearCache() {
        this.iconCache.clear();
    }
}

module.exports = { IconExtractor }; 