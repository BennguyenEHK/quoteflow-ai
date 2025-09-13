/**
 * VariableManager.js
 * Variable storage and persistence functionality for Formula Input Panel
 */

export class VariableManager {
    constructor(coreInstance) {
        this.core = coreInstance;
    }

    /**
     * Get variables for a specific item
     * @param {string} itemNo - Item number
     * @returns {Object} Item variables object
     */
    getItemVariables(itemNo) {
        if (this.core.itemVariables.has(itemNo)) {
            return this.core.itemVariables.get(itemNo);
        }
        
        const defaults = this.getDefaultItemVariables();
        this.core.itemVariables.set(itemNo, defaults);
        return defaults;
    }

    /**
     * Get default variables for an item (empty by default to require user input)
     * @returns {Object} Default variables object
     */
    getDefaultItemVariables() {
        return {
            shipping_cost: "",
            tax_rate: "",
            exchange_rate: "",
            profit_rate: "",
            discount_rate: ""
        };
    }

    /**
     * Get all item variables in the format expected by the backend
     * @returns {Object} All variables formatted for backend
     */
    getAllItemVariables() {
        const allVariables = {};
        
        this.core.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            allVariables[itemNo] = this.getItemVariables(itemNo);
        });
        
        // DEBUG: Log what's being sent to backend
        console.log('📤 Frontend sending variables to backend:', JSON.stringify(allVariables, null, 2));
        
        return allVariables;
    }

    /**
     * Set variable value for a specific item
     * @param {string} itemNo - Item number
     * @param {string} variableType - Type of variable (shipping_cost, tax_rate, etc.)
     * @param {any} value - Variable value
     */
    setItemVariable(itemNo, variableType, value) {
        if (!this.core.itemVariables.has(itemNo)) {
            this.core.itemVariables.set(itemNo, this.getDefaultItemVariables());
        }
        
        const itemVars = this.core.itemVariables.get(itemNo);
        itemVars[variableType] = value;
        
        // Update global window reference
        window.formulaVariables = this.getAllItemVariables();
        
        console.log(`📝 Set ${variableType} = ${value} for item ${itemNo}`);
    }

    /**
     * Set multiple variables for a specific item
     * @param {string} itemNo - Item number
     * @param {Object} variables - Object containing multiple variables
     */
    setItemVariables(itemNo, variables) {
        if (!this.core.itemVariables.has(itemNo)) {
            this.core.itemVariables.set(itemNo, this.getDefaultItemVariables());
        }
        
        const itemVars = this.core.itemVariables.get(itemNo);
        Object.keys(variables).forEach(key => {
            itemVars[key] = variables[key];
        });
        
        // Update global window reference
        window.formulaVariables = this.getAllItemVariables();
        
        console.log(`📝 Set multiple variables for item ${itemNo}:`, variables);
    }

    /**
     * Clear variables for a specific item
     * @param {string} itemNo - Item number
     */
    clearItemVariables(itemNo) {
        this.core.itemVariables.set(itemNo, this.getDefaultItemVariables());
        window.formulaVariables = this.getAllItemVariables();
        console.log(`🧼 Cleared variables for item ${itemNo}`);
    }

    /**
     * Clear all variables
     */
    clearAllVariables() {
        this.core.itemVariables.clear();
        window.formulaVariables = this.getAllItemVariables();
        console.log('🧼 Cleared all variables');
    }

    /**
     * Check if item has any non-empty variables
     * @param {string} itemNo - Item number
     * @returns {boolean} True if item has non-empty variables
     */
    hasNonEmptyVariables(itemNo) {
        const variables = this.getItemVariables(itemNo);
        return Object.values(variables).some(value => 
            value !== "" && value !== null && value !== undefined
        );
    }

    /**
     * Get variable count for an item
     * @param {string} itemNo - Item number
     * @returns {number} Number of non-empty variables
     */
    getNonEmptyVariableCount(itemNo) {
        const variables = this.getItemVariables(itemNo);
        return Object.values(variables).filter(value => 
            value !== "" && value !== null && value !== undefined
        ).length;
    }

    /**
     * Validate variables for an item
     * @param {string} itemNo - Item number
     * @returns {Object} Validation result with isValid flag and errors array
     */
    validateItemVariables(itemNo) {
        const variables = this.getItemVariables(itemNo);
        const errors = [];
        let isValid = true;

        // Check each variable for validity
        Object.keys(variables).forEach(key => {
            const value = variables[key];
            
            if (value !== "" && value !== null && value !== undefined) {
                const numValue = this.parseFormattedNumber ? this.parseFormattedNumber(value) : parseFloat(value);
                
                if (isNaN(numValue) || !isFinite(numValue)) {
                    errors.push(`${key}: Invalid number format`);
                    isValid = false;
                } else if (numValue < 0) {
                    errors.push(`${key}: Cannot be negative`);
                    isValid = false;
                }
            }
        });

        return { isValid, errors };
    }

    /**
     * Get variables summary for display
     * @returns {Object} Summary of variables across all items
     */
    getVariablesSummary() {
        const summary = {
            totalItems: this.core.quotationItems.length,
            itemsWithVariables: 0,
            totalVariables: 0,
            commonVariables: {},
            variableDistribution: {}
        };

        // Analyze variable distribution
        this.core.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const variables = this.getItemVariables(itemNo);
            
            if (this.hasNonEmptyVariables(itemNo)) {
                summary.itemsWithVariables++;
            }
            
            Object.keys(variables).forEach(key => {
                const value = variables[key];
                if (value !== "" && value !== null && value !== undefined) {
                    summary.totalVariables++;
                    
                    // Track variable distribution
                    if (!summary.variableDistribution[key]) {
                        summary.variableDistribution[key] = 0;
                    }
                    summary.variableDistribution[key]++;
                    
                    // Track common values
                    if (!summary.commonVariables[key]) {
                        summary.commonVariables[key] = {};
                    }
                    if (!summary.commonVariables[key][value]) {
                        summary.commonVariables[key][value] = 0;
                    }
                    summary.commonVariables[key][value]++;
                }
            });
        });

        return summary;
    }

    /**
     * Clone variables from one item to another
     * @param {string} fromItemNo - Source item number
     * @param {string} toItemNo - Target item number
     */
    cloneVariables(fromItemNo, toItemNo) {
        const sourceVariables = this.getItemVariables(fromItemNo);
        const clonedVariables = { ...sourceVariables };
        this.setItemVariables(toItemNo, clonedVariables);
        console.log(`📋 Cloned variables from item ${fromItemNo} to item ${toItemNo}`);
    }

    /**
     * Apply global variable values to all items
     * @param {Object} globalVariables - Variables to apply to all items
     */
    applyGlobalVariablesToAllItems(globalVariables) {
        console.log('🌍 Applying global variables to all items:', globalVariables);
        
        this.core.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            this.setItemVariables(itemNo, { ...globalVariables });
        });
        
        // Save after applying global changes
        if (this.saveVariables) {
            this.saveVariables();
        }
        
        console.log('✅ Global variables applied to all items');
    }

    /**
     * Reset variables to smart defaults based on context
     * @param {string} itemNo - Item number (optional - if not provided, reset all)
     */
    resetToSmartDefaults(itemNo = null) {
        const smartDefaults = {
            shipping_cost: 0,
            tax_rate: 1.1,
            exchange_rate: 1, // Will be updated by currency manager
            profit_rate: 1.25,
            discount_rate: 0
        };

        if (itemNo) {
            this.setItemVariables(itemNo, smartDefaults);
            console.log(`🔄 Reset item ${itemNo} to smart defaults`);
        } else {
            this.core.quotationItems.forEach((item, index) => {
                const currentItemNo = item.item_no || (index + 1).toString();
                this.setItemVariables(currentItemNo, smartDefaults);
            });
            console.log('🔄 Reset all items to smart defaults');
        }
    }

    /**
     * Export variables for backup or sharing
     * @returns {Object} Complete variables export
     */
    exportVariables() {
        return {
            timestamp: new Date().toISOString(),
            version: '1.0',
            variables: this.getAllItemVariables(),
            summary: this.getVariablesSummary()
        };
    }

    /**
     * Import variables from backup or sharing
     * @param {Object} exportData - Previously exported variables data
     * @returns {boolean} True if import was successful
     */
    importVariables(exportData) {
        try {
            if (!exportData || !exportData.variables) {
                throw new Error('Invalid export data');
            }

            // Clear existing variables
            this.clearAllVariables();

            // Import variables
            Object.keys(exportData.variables).forEach(itemNo => {
                this.setItemVariables(itemNo, exportData.variables[itemNo]);
            });

            console.log('📥 Variables imported successfully:', exportData.summary);
            return true;
        } catch (error) {
            console.error('❌ Failed to import variables:', error);
            return false;
        }
    }

    // Reference methods that will be implemented in other modules
    parseFormattedNumber(value) {
        // Implemented in Utilities
        if (this.parseFormattedNumber) {
            return this.parseFormattedNumber(value);
        }
        return parseFloat(value);
    }

    saveVariables() {
        // Implemented in StorageManager
        if (this.saveVariables) {
            return this.saveVariables();
        }
    }
}