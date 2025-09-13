/**
 * FormulaInputCore.js
 * Core functionality for Formula Input Panel - Constructor, initialization, and basic setup
 */

export class FormulaInputCore {
    constructor() {
        // Core state properties
        this.quotationItems = [];
        this.itemVariables = new Map(); // Store per-item pricing variables
        this.availableCurrencies = new Set();
        this.selectedTargetCurrency = null; // Will be set by CurrencyManager
        this.isRecalculating = false; // Prevent competing UI updates during recalculation
        this.lastLoadedQuotationId = null; // Track quotation identity for variable persistence
        this.willLoadSavedVariables = false; // Flag to prevent variable clearing when restoration is pending
        
        // DOM element references
        this.itemVariablesContainer = null;
        this.profitTableBody = null;
        this.resetBtn = null;
        this.applyBtn = null;
        this.pricingWarningBox = null;
    }

    /**
     * Initialize DOM element references
     * Called during main constructor initialization
     */
    initializeElements() {
        this.itemVariablesContainer = document.getElementById('itemVariablesContainer');
        this.profitTableBody = document.getElementById('profitTableBody');
        this.resetBtn = document.getElementById('resetBtn');
        this.applyBtn = document.getElementById('applyBtn');
        this.pricingWarningBox = document.getElementById('pricingWarningBox');
        
        // Validate critical elements exist
        if (!this.itemVariablesContainer) {
            console.error('❌ Critical element missing: itemVariablesContainer');
        }
        if (!this.profitTableBody) {
            console.error('❌ Critical element missing: profitTableBody');
        }
        
        console.log('✅ FormulaInputCore elements initialized');
    }

    /**
     * Basic event binding for core functionality
     * Called during main constructor initialization
     */
    bindCoreEvents() {
        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', this.resetFormulaVariables.bind(this));
        }
        
        if (this.applyBtn) {
            this.applyBtn.addEventListener('click', this.applyFormula.bind(this));
            // Add context menu for alternative update methods
            this.applyBtn.addEventListener('contextmenu', this.showUpdateOptions.bind(this));
        }
        
        console.log('✅ FormulaInputCore events bound');
    }

    /**
     * Reset all variables to defaults
     */
    resetFormulaVariables() {
        this.itemVariables.clear();
        this.generateItemVariableInputs();
        this.updateProfitTable();
        this.saveVariables();
        window.formulaVariables = this.getAllItemVariables();
        window.showNotification('🔄 All pricing variables reset to defaults', 'info');
    }

    /**
     * Get current quotation identifier for variable persistence tracking
     * @param {Object} quotationData - Quotation data object
     * @returns {string} Unique identifier for the quotation
     */
    getCurrentQuotationId(quotationData) {
        if (!quotationData) return 'no-quotation';
        
        // Try to extract RFQ reference and customer name for unique ID
        const rfqRef = quotationData.rfq_reference || 
                      quotationData.quotation_data?.rfq_reference || 
                      quotationData.metadata?.rfq_reference || 'unknown-rfq';
                      
        const customerName = quotationData.customer_info?.company_name ||
                            quotationData.quotation_data?.customer_info?.company_name ||
                            quotationData.metadata?.customer_name || 'unknown-customer';
        
        // Create sanitized identifier
        const sanitizedRfq = rfqRef.replace(/[^a-zA-Z0-9-_]/g, '-');
        const sanitizedCustomer = customerName.replace(/[^a-zA-Z0-9-_]/g, '-');
        
        const quotationId = `${sanitizedRfq}_${sanitizedCustomer}`;
        console.log(`🏷️ Quotation ID generated: ${quotationId}`);
        
        return quotationId;
    }

    /**
     * Check if variables should be cleared for quotation switch
     * @param {Object} quotationData - New quotation data
     * @returns {boolean} Whether variables should be cleared
     */
    shouldClearVariables(quotationData) {
        const currentQuotationId = this.getCurrentQuotationId(quotationData);
        const previousQuotationId = this.lastLoadedQuotationId || null;
        
        // Don't clear if switching to same quotation
        if (currentQuotationId === previousQuotationId) {
            console.log(`💾 Same quotation detected (${currentQuotationId}) - preserving existing formula variables`);
            return false;
        }
        
        // Don't clear if saved variables will be loaded
        if (this.willLoadSavedVariables) {
            console.log('💾 Preserving variables - saved data will be restored shortly');
            return false;
        }
        
        console.log(`🔄 Switching quotations (${previousQuotationId} → ${currentQuotationId})`);
        return true;
    }

    /**
     * Update the last loaded quotation ID for tracking
     * @param {Object} quotationData - Quotation data
     */
    updateQuotationTracking(quotationData) {
        this.lastLoadedQuotationId = this.getCurrentQuotationId(quotationData);
    }

    /**
     * Basic validation for quotation data structure
     * @param {Object} quotationData - Quotation data to validate
     * @returns {boolean} Whether the data is valid
     */
    isValidQuotationData(quotationData) {
        if (!quotationData) {
            console.log('❌ No quotation data provided');
            return false;
        }
        
        if (!quotationData.quotation_items || !Array.isArray(quotationData.quotation_items)) {
            console.log('❌ No valid quotation items found');
            return false;
        }
        
        if (quotationData.quotation_items.length === 0) {
            console.log('❌ Empty quotation items array');
            return false;
        }
        
        return true;
    }

    /**
     * Log quotation items for debugging
     * @param {Array} quotationItems - Array of quotation items
     */
    logQuotationItems(quotationItems) {
        console.log('📊 Loaded quotation items:', quotationItems.length);
        
        // Debug each item's structure
        quotationItems.forEach((item, index) => {
            const unitPrice = this.extractUnitPrice(item);
            const qty = item.company_requirement?.qty || 0;
            console.log(`Item ${index + 1}:`, {
                item_no: item.item_no,
                unit_price: unitPrice,
                qty: qty,
                bidder_proposal: item.bidder_proposal,
                company_requirement: item.company_requirement
            });
        });
    }

    /**
     * Extract unit price from item with multiple fallback options
     * @param {Object} item - Quotation item
     * @returns {number} Unit price or 0 if not found
     */
    extractUnitPrice(item) {
        if (!item) return 0;
        
        // Multiple fallback options for unit price
        return item.bidder_proposal?.unit_price ||
               item.bidder_proposal?.original_unit_price ||
               item.company_requirement?.unit_price ||
               item.unit_price ||
               0;
    }

    /**
     * Initialize core functionality - called by main constructor
     */
    initializeCore() {
        this.initializeElements();
        this.bindCoreEvents();
        console.log('✅ FormulaInputCore fully initialized');
    }
}