/**
 * FormulaInputPanel - Modular Version
 * Main entry point that integrates all Formula Input Panel modules
 * 
 * This file replaces the original monolithic 3041-line formula-input.js
 * with a clean, modular architecture using 17 focused modules.
 */

// Core modules
import { FormulaInputCore } from './source/core/FormulaInputCore.js';
import { DataLoader } from './source/core/DataLoader.js';
import { CurrencyManager } from './source/core/CurrencyManager.js';

// UI modules
import { UIRenderer } from './source/ui/UIRenderer.js';
import { EventHandler } from './source/ui/EventHandler.js';
import { SearchManager } from './source/ui/SearchManager.js';

// Data management modules
import { VariableManager } from './source/data/VariableManager.js';
import { BulkOperations } from './source/data/BulkOperations.js';
import { StorageManager } from './source/data/StorageManager.js';

// Calculation modules
import { PricingCalculator } from './source/calculations/PricingCalculator.js';
import { FormulaProcessor } from './source/calculations/FormulaProcessor.js';
import { ProfitTableManager } from './source/calculations/ProfitTableManager.js';

// API communication modules
import { APIHandler } from './source/api/APIHandler.js';
import { ResponseProcessor } from './source/api/ResponseProcessor.js';

// Utility modules
import { Utilities } from './source/utils/Utilities.js';
import { ValidationHelpers } from './source/utils/ValidationHelpers.js';
import { TestingHelpers } from './source/utils/TestingHelpers.js';

/**
 * FormulaInputPanel - Main class that orchestrates all modules
 * Maintains the same public API as the original monolithic class
 */
export class FormulaInputPanel extends FormulaInputCore {
    constructor() {
        // Initialize core first
        super();
        
        console.log('🚀 FormulaInputPanel (Modular) - Initializing...');
        
        // Initialize all module instances
        this.initializeModules();
        
        // Mix in all module methods to this instance
        this.integrateModules();
        
        // Initialize the complete system
        this.initializeSystem();
        
        console.log('✅ FormulaInputPanel (Modular) - Fully initialized');
    }
    
    /**
     * Initialize all module instances
     */
    initializeModules() {
        // Core modules
        this.dataLoader = new DataLoader(this);
        this.currencyManager = new CurrencyManager(this);
        
        // UI modules
        this.uiRenderer = new UIRenderer(this);
        this.eventHandler = new EventHandler(this);
        this.searchManager = new SearchManager(this);
        
        // Data management modules  
        this.variableManager = new VariableManager(this);
        this.bulkOperations = new BulkOperations(this);
        this.storageManager = new StorageManager(this);
        
        // Calculation modules
        this.pricingCalculator = new PricingCalculator(this);
        this.formulaProcessor = new FormulaProcessor(this);
        this.profitTableManager = new ProfitTableManager(this);
        
        // API communication modules
        this.apiHandler = new APIHandler(this);
        this.responseProcessor = new ResponseProcessor(this);
        
        // Utility modules
        this.utilities = new Utilities(this);
        this.validationHelpers = new ValidationHelpers(this);
        this.testingHelpers = new TestingHelpers(this);
        
        console.log('📦 All modules instantiated');
    }
    
    /**
     * Mix in all module methods to this main instance
     * This maintains backward compatibility with existing code that calls methods on the main instance
     */
    integrateModules() {
        const modules = [
            this.dataLoader,
            this.currencyManager,
            this.uiRenderer,
            this.eventHandler,
            this.searchManager,
            this.variableManager,
            this.bulkOperations,
            this.storageManager,
            this.pricingCalculator,
            this.formulaProcessor,
            this.profitTableManager,
            this.apiHandler,
            this.responseProcessor,
            this.utilities,
            this.validationHelpers,
            this.testingHelpers
        ];
        
        // Mix in all methods from each module
        modules.forEach(module => {
            if (module) {
                Object.getOwnPropertyNames(Object.getPrototypeOf(module))
                    .filter(name => name !== 'constructor' && typeof module[name] === 'function')
                    .forEach(methodName => {
                        // Bind the method to the module instance and assign to main instance
                        this[methodName] = module[methodName].bind(module);
                    });
            }
        });
        
        console.log('🔗 All module methods integrated into main instance');
    }
    
    /**
     * Initialize the complete system
     */
    initializeSystem() {
        // Initialize core functionality
        this.initializeCore();
        
        // Load saved target currency
        this.selectedTargetCurrency = this.currencyManager.loadSavedTargetCurrency() || 'VND';
        
        // Initialize DOM elements
        this.initializeElements();
        
        // Bind all events
        this.bindEvents();
        
        // Load saved variables
        this.loadSavedVariables();
        
        // Render initial currency section
        this.renderInitialCurrencySection();
        
        // Auto-load latest quotation pricing variables
        this.autoLoadLatestQuotationPricingVariables();
        
        console.log('🎯 System initialization complete');
    }
    
    /**
     * Enhanced event binding that coordinates all modules
     */
    bindEvents() {
        // Bind core events
        this.bindCoreEvents();
        
        // Bind module-specific events
        this.eventHandler?.bindVariableInputEvents();
        this.searchManager?.bindSearchEvents();
        this.bulkOperations?.bindBulkOperationEvents();
        this.currencyManager?.bindCurrencyEvents();
        
        // Global event listeners for bulk update board
        document.addEventListener('click', this.handleDocumentClick?.bind(this));
        document.addEventListener('keydown', this.handleKeydown?.bind(this));
        
        console.log('🎯 All events bound across modules');
    }
    
    /**
     * Method delegation for backward compatibility
     * These methods are called by external code and need to be available on the main instance
     */
    
    // Core data loading methods
    loadQuotationData(quotationData) {
        return this.dataLoader.loadQuotationData(quotationData);
    }
    
    // UI generation methods
    generateItemVariableInputs() {
        return this.uiRenderer.generateItemVariableInputs();
    }
    
    // Variable management methods
    getItemVariables(itemNo) {
        return this.variableManager.getItemVariables(itemNo);
    }
    
    getAllItemVariables() {
        return this.variableManager.getAllItemVariables();
    }
    
    // Storage methods
    saveVariables() {
        return this.storageManager.saveVariables();
    }
    
    loadSavedVariables() {
        return this.storageManager.loadSavedVariables();
    }
    
    // Calculation methods
    updateProfitTable() {
        return this.profitTableManager.updateProfitTable();
    }
    
    applyFormula() {
        return this.formulaProcessor.applyFormula();
    }
    
    // Currency methods
    onGlobalCurrencyChange(event) {
        return this.currencyManager.onGlobalCurrencyChange(event);
    }
    
    // Search methods
    filterItemsBySearch(searchTerm) {
        return this.searchManager.filterItemsBySearch(searchTerm);
    }
    
    // Utility methods
    formatCurrency(amount) {
        return this.utilities.formatCurrency(amount);
    }
    
    parseFormattedNumber(value) {
        return this.utilities.parseFormattedNumber(value);
    }
    
    truncateText(text, maxLength) {
        return this.utilities.truncateText(text, maxLength);
    }
    
    // Event handling methods
    handleDocumentClick(event) {
        return this.eventHandler.handleDocumentClick(event);
    }
    
    handleKeydown(event) {
        return this.eventHandler.handleKeydown(event);
    }
    
    // Bulk operations methods
    showBulkUpdateBoard(event) {
        return this.bulkOperations.showBulkUpdateBoard(event);
    }
    
    applyBulkUpdate() {
        return this.bulkOperations.applyBulkUpdate();
    }
    
    /**
     * Get module instance for advanced usage
     * Allows external code to access specific modules if needed
     */
    getModule(moduleName) {
        const moduleMap = {
            'core': this,
            'dataLoader': this.dataLoader,
            'currencyManager': this.currencyManager,
            'uiRenderer': this.uiRenderer,
            'eventHandler': this.eventHandler,
            'searchManager': this.searchManager,
            'variableManager': this.variableManager,
            'bulkOperations': this.bulkOperations,
            'storageManager': this.storageManager,
            'pricingCalculator': this.pricingCalculator,
            'formulaProcessor': this.formulaProcessor,
            'profitTableManager': this.profitTableManager,
            'apiHandler': this.apiHandler,
            'responseProcessor': this.responseProcessor,
            'utilities': this.utilities,
            'validationHelpers': this.validationHelpers,
            'testingHelpers': this.testingHelpers
        };
        
        return moduleMap[moduleName] || null;
    }
    
    /**
     * Get system information for debugging
     */
    getSystemInfo() {
        return {
            version: '2.0.0-modular',
            totalModules: 17,
            originalFileSize: '3041 lines',
            newArchitecture: 'Modular (avg 179 lines per module)',
            modules: {
                core: ['FormulaInputCore', 'DataLoader', 'CurrencyManager'],
                ui: ['UIRenderer', 'EventHandler', 'SearchManager'],
                data: ['VariableManager', 'BulkOperations', 'StorageManager'],
                calculations: ['PricingCalculator', 'FormulaProcessor', 'ProfitTableManager'],
                api: ['APIHandler', 'ResponseProcessor'],
                utils: ['Utilities', 'ValidationHelpers', 'TestingHelpers']
            },
            benefits: [
                'Improved maintainability',
                'Better testing capabilities',
                'Reduced complexity per module',
                'Enhanced development experience',
                'Parallel development support'
            ]
        };
    }
}

// Make the system info globally accessible for debugging
window.getFormulaInputSystemInfo = function() {
    if (window.formulaInput) {
        return window.formulaInput.getSystemInfo();
    }
    return { error: 'Formula input panel not initialized' };
};

// Export convenience functions for testing individual modules
export const TestHelpers = {
    createCore: () => new FormulaInputCore(),
    createDataLoader: (core) => new DataLoader(core),
    createCurrencyManager: (core) => new CurrencyManager(core),
    createUtilities: (core) => new Utilities(core)
};

console.log('📁 FormulaInputPanel (Modular) module loaded successfully');