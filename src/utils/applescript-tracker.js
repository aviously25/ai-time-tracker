const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execAsync = promisify(exec);

class AppleScriptTracker {
    constructor() {
        this.platform = process.platform;
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

        try {
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
            const tmpFile = path.join(os.tmpdir(), `aitimetracker_applescript_${Date.now()}.applescript`);
            fs.writeFileSync(tmpFile, script, { encoding: 'utf8' });

            const { stdout } = await execAsync(`osascript "${tmpFile}"`);
            fs.unlinkSync(tmpFile);

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
            return null;
        }
    }
}

module.exports = { AppleScriptTracker }; 