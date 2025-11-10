import { promises as fsPromises } from 'fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { DiacriticsMap } from './constants.js';
const execAsync = promisify(exec);

class Functions {
    constructor() {
    }

    async saveData(path, data, stringify = true) {
        try {
            data = stringify ? JSON.stringify(data, null, 2) : data;
            await fsPromises.writeFile(path, data);
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error}`);
        }
    }

    async readData(path, parseJson = false) {
        try {
            const data = await fsPromises.readFile(path, 'utf8');

            if (parseJson) {
                if (!data.trim()) {
                    // Empty file when expecting JSON
                    return null;
                }
                try {
                    return JSON.parse(data);
                } catch (jsonError) {
                    throw new Error(`JSON parse error in file "${path}": ${jsonError.message}`);
                }
            }

            // For non-JSON, just return file content (can be empty string)
            return data;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File does not exist
                return null;
            }
            // Preserve original error details
            const wrappedError = new Error(`Read data error for "${path}": ${error.message}`);
            wrappedError.original = error;
            throw wrappedError;
        }
    }

    async sanitizeString(str) {
        if (!str) return '';

        // Replace diacritics using map
        str = str.replace(/[^\u0000-\u007E]/g, ch => DiacriticsMap[ch] || ch);

        // Replace separators between words with space
        str = str.replace(/(\w)[.:;+\-\/]+(\w)/g, '$1 $2');

        // Replace remaining standalone separators with space
        str = str.replace(/[.:;+\-\/]/g, ' ');

        // Remove remaining invalid characters (keep letters, digits, space, apostrophe)
        str = str.replace(/[^A-Za-z0-9 ']/g, ' ');

        // Collapse multiple spaces
        str = str.replace(/\s+/g, ' ');

        // Trim
        return str.trim();
    }

    async scaleValue(value, inMin, inMax, outMin, outMax) {
        const scaledValue = parseFloat((((Math.max(inMin, Math.min(inMax, value)) - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin).toFixed(0));
        return scaledValue;
    }

    async ping(ipOrHost) {
        const isWindows = process.platform === 'win32';
        const cmd = isWindows ? `ping -n 1 ${ipOrHost}` : `ping -c 1 ${ipOrHost}`;

        try {
            const { stdout } = await execAsync(cmd);
            const alive = /ttl=/i.test(stdout);
            const timeMatch = stdout.match(/time[=<]([\d.]+)\s*ms/i);
            const time = timeMatch ? parseFloat(timeMatch[1]) : null;

            return { online: alive, time };
        } catch {
            return { online: false };
        }
    }
}
export default Functions