/**
 * Utilities.js
 * Common utility functions and formatters for Formula Input Panel
 */

export class Utilities {
    constructor(coreInstance) {
        this.core = coreInstance;
    }

    /**
     * Unified number parsing for formatted inputs
     * Handles both comma-separated and raw number inputs
     * @param {string|number|null|undefined} value - Value to parse
     * @returns {number|null} Parsed number or null if invalid
     */
    parseFormattedNumber(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        
        if (typeof value === 'number') {
            return isFinite(value) ? value : null;
        }
        
        if (typeof value === 'string') {
            // Remove commas, spaces, and currency symbols
            const cleaned = value.replace(/[,\s₫VND]/g, '');
            if (cleaned === '') return null;
            
            const parsed = parseFloat(cleaned);
            return (isNaN(parsed) || !isFinite(parsed)) ? null : parsed;
        }
        
        return null;
    }

    /**
     * Format currency for display
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount) {
        try {
            return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' VND';
        } catch (error) {
            return Math.round(amount).toLocaleString() + ' VND';
        }
    }

    /**
     * Truncate text to specified length
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length before truncation
     * @returns {string} Truncated text with ellipsis if needed
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Validate if a value is a valid number
     * @param {any} value - Value to validate
     * @returns {boolean} True if valid number
     */
    isValidNumber(value) {
        const parsed = this.parseFormattedNumber(value);
        return parsed !== null && isFinite(parsed);
    }

    /**
     * Convert percentage to decimal (e.g., 20 -> 0.2)
     * @param {number} percentage - Percentage value
     * @returns {number} Decimal value
     */
    percentageToDecimal(percentage) {
        return percentage / 100;
    }

    /**
     * Convert decimal to percentage (e.g., 0.2 -> 20)
     * @param {number} decimal - Decimal value
     * @returns {number} Percentage value
     */
    decimalToPercentage(decimal) {
        return decimal * 100;
    }

    /**
     * Format number with thousand separators
     * @param {number} num - Number to format
     * @returns {string} Formatted number string
     */
    formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        return num.toLocaleString('vi-VN');
    }

    /**
     * Generate a unique identifier
     * @param {string} prefix - Prefix for the ID
     * @returns {string} Unique identifier
     */
    generateUniqueId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sanitize string for use in HTML attributes
     * @param {string} str - String to sanitize
     * @returns {string} Sanitized string
     */
    sanitizeForAttribute(str) {
        if (!str) return '';
        return str.replace(/[^a-zA-Z0-9-_]/g, '_');
    }

    /**
     * Deep clone an object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });
            return cloned;
        }
    }

    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function execution
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Check if a string contains any of the search terms
     * @param {string} text - Text to search in
     * @param {string} searchTerms - Search terms (space-separated)
     * @returns {boolean} True if text contains any search term
     */
    matchesSearch(text, searchTerms) {
        if (!text || !searchTerms) return false;
        
        const normalizedText = text.toLowerCase();
        const terms = searchTerms.toLowerCase().split(/\s+/).filter(term => term.length > 0);
        
        return terms.some(term => normalizedText.includes(term));
    }

    /**
     * Escape HTML special characters
     * @param {string} unsafe - Unsafe HTML string
     * @returns {string} Escaped HTML string
     */
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Get current timestamp in ISO format
     * @returns {string} ISO timestamp
     */
    getCurrentTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Format date for display
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        try {
            const dateObj = date instanceof Date ? date : new Date(date);
            return dateObj.toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Invalid Date';
        }
    }

    /**
     * Check if an object is empty
     * @param {Object} obj - Object to check
     * @returns {boolean} True if object is empty
     */
    isEmpty(obj) {
        if (!obj) return true;
        if (Array.isArray(obj)) return obj.length === 0;
        if (typeof obj === 'object') return Object.keys(obj).length === 0;
        return false;
    }

    /**
     * Get safe property value from object with dot notation
     * @param {Object} obj - Object to get property from
     * @param {string} path - Property path (e.g., 'user.profile.name')
     * @param {any} defaultValue - Default value if property doesn't exist
     * @returns {any} Property value or default value
     */
    getProperty(obj, path, defaultValue = null) {
        if (!obj || !path) return defaultValue;
        
        const keys = path.split('.');
        let result = obj;
        
        for (const key of keys) {
            if (result === null || result === undefined || !(key in result)) {
                return defaultValue;
            }
            result = result[key];
        }
        
        return result;
    }

    /**
     * Set property value in object with dot notation
     * @param {Object} obj - Object to set property in
     * @param {string} path - Property path (e.g., 'user.profile.name')
     * @param {any} value - Value to set
     * @returns {Object} Modified object
     */
    setProperty(obj, path, value) {
        if (!obj || !path) return obj;
        
        const keys = path.split('.');
        let current = obj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[keys[keys.length - 1]] = value;
        return obj;
    }

    /**
     * Retry function with exponential backoff
     * @param {Function} fn - Function to retry
     * @param {number} retries - Number of retries
     * @param {number} delay - Initial delay in milliseconds
     * @returns {Promise} Promise that resolves with function result
     */
    async retryWithBackoff(fn, retries = 3, delay = 1000) {
        try {
            return await fn();
        } catch (error) {
            if (retries === 0) throw error;
            
            console.log(`Retrying in ${delay}ms... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.retryWithBackoff(fn, retries - 1, delay * 2);
        }
    }
}