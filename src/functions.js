import { promises as fsPromises } from 'fs';
import { DiacriticsMap } from './constants.js';

class Functions {
    constructor(config) {


    }

    async saveData(path, data, stringify = true) {
        try {
            data = !stringify ? data : JSON.stringify(data, null, 2);
            await fsPromises.writeFile(path, data, 'utf8');
            return true;
        } catch (error) {
            throw new Error(`Save data error: ${error.message || error}`);
        };
    }

    async readData(path) {
        try {
            const data = await fsPromises.readFile(path);
            return data;
        } catch (error) {
            throw new Error(`Read data error: ${error}`);
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
}
export default Functions