const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const execAsync = promisify(exec);

class AppleScriptTracker {
    constructor() {
        this.platform = process.platform;
    }

    /**
     * Get a safe temp directory for the bundled app
     */
    getTempDir() {
        // For bundled apps, use app data directory instead of system temp
        if (app && app.isPackaged) {
            const appDataPath = app.getPath('userData');
            const tempDir = path.join(appDataPath, 'temp');

            // Ensure temp directory exists
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            return tempDir;
        }

        // For development, use system temp
        return os.tmpdir();
    }

    /**
     * Get information about the currently active window
     * @returns {Promise<Object|null>} Active window information or null if not available
     */
    async getActiveWindow() {
        // Always use the fallback method for maximum reliability
        return this.getSimpleActiveWindow();
    }

    /**
     * Check if the current platform is supported
     * @returns {boolean}
     */
    isSupported() {
        return this.platform === 'darwin';
    }

    /**
     * Get a simple active window info (fallback method)
     * @returns {Promise<Object|null>}
     */
    async getSimpleActiveWindow() {
        if (this.platform !== 'darwin') {
            return null;
        }

        let tmpFile = null;

        try {
            // Check if app is packaged
            const isPackaged = app && app.isPackaged;
            console.log(`App is packaged: ${isPackaged}`);

            // AppleScript code as a multi-line string with real newlines
            const script = [
                'set frontApp to ""',
                'set frontWindow to ""',
                'set currentUrl to ""',
                'set currentTitle to ""',
                'tell application "System Events"',
                'set frontApp to name of first application process whose frontmost is true',
                'set frontWindow to name of first window of process frontApp',
                'end tell',
                'try',
                'if frontApp is "Arc" then',
                'tell application "Arc"',
                'set currentUrl to URL of active tab of window 1',
                'set currentTitle to title of active tab of window 1',
                'end tell',
                'end if',
                'end try',
                'return frontApp & "|||" & frontWindow & "|||" & currentUrl & "|||" & currentTitle'
            ].join('\n');

            // Write script to a temp file as plain text
            const tempDir = this.getTempDir();
            tmpFile = path.join(tempDir, `aitimetracker_applescript_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.applescript`);

            console.log(`Writing AppleScript to: ${tmpFile}`);
            fs.writeFileSync(tmpFile, script, { encoding: 'utf8' });

            // Try multiple paths for osascript
            const osascriptPaths = ['/usr/bin/osascript', '/bin/osascript', 'osascript'];
            let command = null;

            for (const osascriptPath of osascriptPaths) {
                try {
                    // Test if this path exists
                    if (osascriptPath.startsWith('/')) {
                        if (fs.existsSync(osascriptPath)) {
                            command = `"${osascriptPath}" "${tmpFile}"`;
                            console.log(`Using osascript path: ${osascriptPath}`);
                            break;
                        }
                    } else {
                        // For relative paths, just try to use it
                        command = `${osascriptPath} "${tmpFile}"`;
                        console.log(`Trying relative osascript path: ${osascriptPath}`);
                        break;
                    }
                } catch (pathError) {
                    console.warn(`Failed to check osascript path ${osascriptPath}:`, pathError.message);
                }
            }

            if (!command) {
                throw new Error('Could not find osascript executable');
            }

            console.log(`Executing command: ${command}`);
            const { stdout, stderr } = await execAsync(command, {
                timeout: 10000,  // 10 second timeout
                env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } // Ensure standard paths
            });

            if (stderr) {
                console.warn('AppleScript stderr:', stderr);
            }

            console.log('AppleScript output:', stdout.trim());

            const lines = stdout.trim().split('|||');

            if (lines.length >= 4) {
                const [processName, windowTitle, url, tabTitle] = lines;

                return {
                    title: tabTitle && tabTitle !== '' ? tabTitle : windowTitle,
                    owner: {
                        name: processName
                    },
                    processName: processName,
                    url: url && url !== '' ? url : null
                };
            } else if (lines.length >= 2) {
                const [processName, windowTitle] = lines;

                return {
                    title: windowTitle,
                    owner: {
                        name: processName
                    },
                    processName: processName,
                    url: null
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting simple active window:', error.message);
            console.error('Error details:', error);
            return null;
        } finally {
            // Clean up temp file
            if (tmpFile && fs.existsSync(tmpFile)) {
                try {
                    fs.unlinkSync(tmpFile);
                    console.log(`Cleaned up temp file: ${tmpFile}`);
                } catch (cleanupError) {
                    console.warn('Failed to clean up temp file:', cleanupError.message);
                }
            }
        }
    }
}

module.exports = { AppleScriptTracker }; 