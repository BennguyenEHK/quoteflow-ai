// FORMULA INPUT PANEL COMPONENT - PER-ITEM PRICING VARIABLES

export class FormulaInputPanel {
    constructor() {
        this.quotationItems = [];
        this.itemVariables = new Map(); // Store per-item pricing variables
        this.availableCurrencies = new Set();
        this.selectedTargetCurrency = this.loadSavedTargetCurrency() || 'VND'; // Global currency state
        this.isRecalculating = false; // Prevent competing UI updates during recalculation
        this.lastLoadedQuotationId = null; // Track quotation identity for variable persistence
        this.willLoadSavedVariables = false; // Flag to prevent variable clearing when restoration is pending
        this.isLoadingStoredProfitValues = false; // Flag to prevent fallback calculations during stored value loading
        this.storedProfitValuesCache = new Map(); // Cache for stored values to improve reliability
        this.forceRecalculation = false; // Flag to bypass stored values and force fresh calculations
        this.initializeElements();
        this.bindEvents();
        this.loadSavedVariables();
        this.renderInitialCurrencySection(); // Render currency bar immediately
        
        // AUTO-LOAD: Automatically load latest quotation pricing variables on startup
        this.autoLoadLatestQuotationPricingVariables();
        
        // Initialize debounce timers for input processing
        this.inputDebounceTimers = new Map();
    }
    
    /**
     * Debounce utility to prevent processing incomplete inputs
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @param {string} key - Unique key for this debounce instance
     * @returns {Function} Debounced function
     */
    debounce(func, delay, key) {
        return (...args) => {
            // Clear existing timer for this key
            if (this.inputDebounceTimers.has(key)) {
                clearTimeout(this.inputDebounceTimers.get(key));
            }
            
            // Set new timer
            const timer = setTimeout(() => {
                this.inputDebounceTimers.delete(key);
                func.apply(this, args);
            }, delay);
            
            this.inputDebounceTimers.set(key, timer);
        };
    }
    
    /**
     * Generate quotation-specific cache key for potential_profit values
     * This ensures cache isolation between different quotations
     * @param {string} itemNo - Item number
     * @returns {string} Quotation-specific cache key
     */
    getQuotationSpecificCacheKey(itemNo) {
        const quotationId = this.lastLoadedQuotationId || 'default';
        return `${quotationId}_${itemNo}_potential_profit`;
    }
    
    /**
     * Clear cache for previous quotation when switching to a new one
     * This prevents potential_profit values from persisting across quotations
     * @param {string} previousQuotationId - ID of previous quotation
     */
    clearPreviousQuotationCache(previousQuotationId) {
        if (!previousQuotationId) {
            // Clear all cache if no specific quotation ID
            this.storedProfitValuesCache.clear();
            console.log('🧼 Cleared entire potential_profit cache (no previous quotation ID)');
            return;
        }
        
        // Clear only cache entries for the previous quotation
        const keysToDelete = [];
        for (let key of this.storedProfitValuesCache.keys()) {
            if (key.startsWith(`${previousQuotationId}_`)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.storedProfitValuesCache.delete(key));
        console.log(`🧼 Cleared ${keysToDelete.length} potential_profit cache entries for quotation: ${previousQuotationId}`);
    }

    /**
     * Clear localStorage variables for previous quotation when switching to a new one
     * This prevents formula variables from persisting across quotations
     * @param {string} previousQuotationId - ID of previous quotation
     */
    clearPreviousVariablesStorage(previousQuotationId) {
        if (!previousQuotationId) {
            // Clear all localStorage entries if no specific quotation ID
            try {
                const keys = Object.keys(localStorage);
                const variableKeys = keys.filter(key => key.startsWith('itemPricingVariables_'));
                variableKeys.forEach(key => localStorage.removeItem(key));
                console.log(`🧼 Cleared entire formula variables localStorage (${variableKeys.length} entries)`);
            } catch (error) {
                console.warn('⚠️ Error clearing localStorage variables:', error);
            }
            return;
        }
        
        // Clear only localStorage entry for the previous quotation
        try {
            const storageKey = `itemPricingVariables_${previousQuotationId}`;
            localStorage.removeItem(storageKey);
            console.log(`🧼 Cleared formula variables localStorage for quotation: ${previousQuotationId}`);
        } catch (error) {
            console.warn(`⚠️ Error clearing variables storage for quotation ${previousQuotationId}:`, error);
        }
    }

    initializeElements() {
        this.itemVariablesContainer = document.getElementById('itemVariablesContainer');
        this.profitTableBody = document.getElementById('profitTableBody');
        this.resetBtn = document.getElementById('resetBtn');
        this.applyBtn = document.getElementById('applyBtn');
        this.pricingWarningBox = document.getElementById('pricingWarningBox');
    }

    bindEvents() {
        this.resetBtn.addEventListener('click', this.resetFormulaVariables.bind(this));
        this.applyBtn.addEventListener('click', this.applyFormula.bind(this));
        
        // Add context menu for alternative update methods
        this.applyBtn.addEventListener('contextmenu', this.showUpdateOptions.bind(this));
        
        // Global event listeners for bulk update board
        document.addEventListener('click', this.handleDocumentClick.bind(this));
        document.addEventListener('keydown', this.handleKeydown.bind(this));
    }

    /**
     * Load quotation data and generate per-item input rows
     * @param {Object} quotationData - Quotation data from the system
     */
    loadQuotationData(quotationData) {
        console.log('🧮 Loading quotation data for pricing variables:', quotationData);
        
        // ENHANCED FIX: Always clear variables first for proper quotation isolation
        const currentQuotationId = this.getCurrentQuotationId(quotationData);
        const previousQuotationId = this.lastLoadedQuotationId || null;
        
        // CRITICAL FIX: Always clear variables to prevent cross-contamination between quotations
        console.log(`🔄 Loading quotation (${previousQuotationId} → ${currentQuotationId})`);
        console.log('🧼 Clearing variables for clean quotation isolation');
        this.itemVariables.clear();
        
        // Clear potential_profit cache for clean state
        this.clearPreviousQuotationCache(previousQuotationId);
        
        // Clear formula variables localStorage for clean state 
        this.clearPreviousVariablesStorage(previousQuotationId);
        
        // CRITICAL: Clear global window.formulaVariables to prevent memory persistence
        window.formulaVariables = null;
        console.log('🧼 Cleared global window.formulaVariables for clean state');
        
        this.lastLoadedQuotationId = currentQuotationId;
        
        if (!quotationData?.quotation_items || !Array.isArray(quotationData.quotation_items)) {
            console.log('❌ No valid quotation items found');
            this.showNoItemsMessage();
            this.updateWarningBoxVisibility(); // Show warning when no data
            return;
        }

        this.quotationItems = quotationData.quotation_items;
        console.log('📊 Loaded quotation items:', this.quotationItems.length);
        
        // Debug each item's structure
        this.quotationItems.forEach((item, index) => {
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
        
        this.extractCurrencyCodes();
        this.clearSearch(); // Clear any previous search when loading new data
        
        // ENHANCED: Auto-extract pricing variables from calculated_pricing if available
        this.autoExtractPricingVariables(quotationData);
        
        this.generateItemVariableInputs();
        
        // ENHANCED FIX: Comprehensive profit table restoration with multiple safeguards
        setTimeout(async () => {
            console.log('🔄 Starting comprehensive profit table restoration process...');
            
            try {
                await this.reloadFormulaVariables();
                console.log('✅ Auto-restored saved variables during quotation loading');
            } catch (error) {
                console.log('ℹ️ No saved variables to restore or restoration failed:', error.message);
            }
            
            // CRITICAL: Always update profit table regardless of variable restoration status
            // This ensures Potential_profit_in_VND values are always calculated and displayed
            console.log('🔄 Ensuring profit potential values are calculated and displayed...');
            this.updateProfitTable();
            console.log('✅ Profit potential values restoration completed');
            
        }, 100); // Small delay to ensure UI elements are ready
        
        // ADDITIONAL SAFEGUARD: Second profit table update with extended delay
        // This handles edge cases where the first update might be too early
        setTimeout(() => {
            if (this.quotationItems && this.quotationItems.length > 0) {
                console.log('🛡️ Secondary profit table update for reliability...');
                this.updateProfitTable();
                console.log('✅ Secondary profit table update completed');
            }
        }, 250); // Extended delay for robust restoration
        
        // 🎯 INITIALIZATION: Load stored potential_profit values during page startup
        setTimeout(async () => {
            console.log('🔄 Initialization: Loading stored potential_profit values...');
            const storedValuesLoaded = await this.loadAndDisplayStoredProfitValues();
            if (storedValuesLoaded) {
                console.log('✅ Stored potential_profit values loaded during initialization');
            } else {
                console.log('ℹ️ No stored potential_profit values found during initialization');
            }
        }, 1500); // Extended delay to prevent race conditions during page refresh
        
        // Always update warning box after loading new data
        setTimeout(() => {
            this.updateWarningBoxVisibility();
        }, 100);
    }

    /**
     * Generate unique identifier for quotation based on RFQ and customer
     * @param {Object} quotationData - Quotation data
     * @returns {string} Unique quotation identifier
     */
    getCurrentQuotationId(quotationData) {
        if (!quotationData) return 'no-quotation';
        
        const rfq = quotationData.rfq_reference || 'unknown-rfq';
        const customer = quotationData.customer_info?.company_name || 'unknown-customer';
        
        // Create sanitized unique identifier
        const sanitizedRfq = rfq.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 30);
        const sanitizedCustomer = customer.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 30);
        
        return `${sanitizedRfq}__${sanitizedCustomer}`;
    }

    /**
     * Extract all unique currency_code values from items
     */
    extractCurrencyCodes() {
        this.availableCurrencies.clear();
        
        this.quotationItems.forEach(item => {
            const currencyCode = item.currency_code || item.bidder_proposal?.currency_code;
            if (currencyCode) {
                this.availableCurrencies.add(currencyCode);
            } else {
                // Default to VND if no currency_code specified
                this.availableCurrencies.add('VND');
            }
        });

        console.log('💰 Extracted currencies:', Array.from(this.availableCurrencies));
    }

    /**
     * Auto-extract pricing variables from calculated_pricing data
     * This method automatically loads pricing variables when quotation data contains calculated pricing
     * @param {Object} quotationData - The complete quotation data including calculated_pricing
     */
    async autoExtractPricingVariables(quotationData) {
        try {
            console.log('🔍 Auto-extracting pricing variables from quotation data...');
            
            // Method 1: Check if calculated_pricing exists directly in the quotation data
            let variablesApplied = quotationData?.calculated_pricing?.calculation_metadata?.variables_applied;
            
            // Method 2: If not found, automatically load from latest.json and data file
            if (!variablesApplied) {
                console.log('📁 No pricing variables found in current data, checking latest.json...');
                variablesApplied = await this.loadPricingVariablesFromLatestFile();
            }
            
            if (variablesApplied && typeof variablesApplied === 'object') {
                console.log('✅ Found pricing variables to auto-load:', variablesApplied);
                
                // Clear existing variables and load from calculated data
                this.itemVariables.clear();
                
                // Load variables for each item
                Object.keys(variablesApplied).forEach(itemNo => {
                    const variables = variablesApplied[itemNo];
                    console.log(`📊 Loading variables for item ${itemNo}:`, variables);
                    
                    // Set default values based on calculated data
                    this.itemVariables.set(itemNo, {
                        shipping_cost: variables.shipping_cost || 0,
                        tax_rate: variables.tax_rate || 1.1,
                        exchange_rate: variables.exchange_rate || 1.0,
                        profit_rate: variables.profit_rate || 1.2,
                        discount_rate: variables.discount_rate || 0
                    });
                });
                
                console.log('✅ Auto-loaded pricing variables from calculated data');
                
                // Save the auto-loaded variables
                this.saveVariables();
                
                // Update global variables with loaded data
                this.updateGlobalVariables();
                
                return true;
            } else {
                console.log('ℹ️ No pricing variables found to auto-load');
                return false;
            }
        } catch (error) {
            console.error('❌ Error auto-extracting pricing variables:', error);
            return false;
        }
    }

    /**
     * Load pricing variables from latest.json data file
     * This method accesses latest.json to get the data_filename, then loads the calculated pricing variables
     */
    async loadPricingVariablesFromLatestFile() {
        try {
            console.log('📁 Loading pricing variables from latest.json data file...');
            
            // Step 1: Get latest.json
            const latestResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/latest.json`);
            if (!latestResponse.ok) {
                throw new Error(`Failed to fetch latest.json: ${latestResponse.status}`);
            }
            const latestData = await latestResponse.json();
            console.log('📄 Latest data:', latestData);
            
            // Step 2: Extract data_filename
            const dataFilename = latestData.data_filename;
            if (!dataFilename) {
                console.log('⚠️ No data_filename found in latest.json');
                return null;
            }
            
            console.log(`📊 Loading quotation data from: ${dataFilename}`);
            
            // Step 3: Load the actual quotation data file
            const dataResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/${dataFilename}`);
            if (!dataResponse.ok) {
                throw new Error(`Failed to fetch data file: ${dataResponse.status}`);
            }
            const quotationData = await dataResponse.json();
            
            // Step 4: Extract pricing variables from calculated_pricing
            const variablesApplied = quotationData?.calculated_pricing?.calculation_metadata?.variables_applied;
            if (variablesApplied) {
                console.log('✅ Successfully loaded pricing variables from data file:', variablesApplied);
                return variablesApplied;
            } else {
                console.log('ℹ️ No pricing variables found in data file calculated_pricing');
                return null;
            }
        } catch (error) {
            console.error('❌ Error loading pricing variables from latest file:', error);
            return null;
        }
    }

    /**
     * Auto-load latest quotation pricing variables on startup
     * This method is called automatically when the FormulaInputPanel is initialized
     * to ensure the latest quotation's pricing variables are loaded
     */
    async autoLoadLatestQuotationPricingVariables() {
        try {
            console.log('🚀 Auto-loading latest quotation pricing variables on startup...');
            
            const variablesApplied = await this.loadPricingVariablesFromLatestFile();
            
            if (variablesApplied && typeof variablesApplied === 'object') {
                console.log('✅ Found latest quotation pricing variables, loading into UI...');
                
                // Load variables for each item
                Object.keys(variablesApplied).forEach(itemNo => {
                    const variables = variablesApplied[itemNo];
                    console.log(`📊 Auto-loading startup variables for item ${itemNo}:`, variables);
                    
                    this.itemVariables.set(itemNo, {
                        shipping_cost: variables.shipping_cost || 0,
                        tax_rate: variables.tax_rate || 1.1,
                        exchange_rate: variables.exchange_rate || 1.0,
                        profit_rate: variables.profit_rate || 1.2,
                        discount_rate: variables.discount_rate || 0
                    });
                });
                
                console.log('✅ Successfully auto-loaded latest quotation pricing variables');
                
                // Also try to load the quotation data itself for display
                await this.loadLatestQuotationDataForDisplay();
                
                // Save the variables
                this.saveVariables();
                
                // Trigger UI update
                setTimeout(() => {
                    this.generateItemVariableInputs();
                    this.updateProfitTable();
                }, 100);
                
            } else {
                console.log('ℹ️ No latest quotation pricing variables found to auto-load');
            }
        } catch (error) {
            console.error('❌ Error auto-loading latest quotation pricing variables:', error);
        }
    }

    /**
     * Load latest quotation data for display in the UI
     * This complements the pricing variables by loading the actual quotation items
     */
    async loadLatestQuotationDataForDisplay() {
        try {
            console.log('📊 Loading latest quotation data for display...');
            
            // Get latest.json
            const latestResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/latest.json`);
            if (!latestResponse.ok) return;
            
            const latestData = await latestResponse.json();
            const dataFilename = latestData.data_filename;
            if (!dataFilename) return;
            
            // Load the quotation data
            const dataResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/${dataFilename}`);
            if (!dataResponse.ok) return;
            
            const quotationData = await dataResponse.json();
            
            // Load the quotation data into the component
            if (quotationData?.quotation_data?.quotation_items) {
                console.log('✅ Loading latest quotation data for display');
                this.loadQuotationData(quotationData.quotation_data);
                
                // 🎯 ENHANCEMENT: Load stored potential_profit values after quotation data is loaded
                setTimeout(async () => {
                    console.log('🔄 Auto-loading stored potential_profit values after quotation data load...');
                    const storedValuesLoaded = await this.loadAndDisplayStoredProfitValues();
                    if (storedValuesLoaded) {
                        console.log('✅ Stored potential_profit values auto-loaded successfully');
                    }
                }, 800); // Extended delay for quotation switching scenarios
            }
            
        } catch (error) {
            console.error('❌ Error loading latest quotation data for display:', error);
        }
    }

    /**
     * Load and display stored potential_profit values from the latest quotation data file
     * This ensures that after calculations are completed and stored, the UI displays the stored values
     * Called after: apply button completion, page load, quotation switching, server restart
     */
    async loadAndDisplayStoredProfitValues(maxRetries = 3, retryDelay = 300) {
        // Set loading flag to prevent fallback calculations
        this.isLoadingStoredProfitValues = true;
        
        try {
            console.log('🔄 Loading and displaying stored potential_profit values...');
            
            let lastError = null;
            
            // Retry logic for improved reliability
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`🔄 Attempt ${attempt}/${maxRetries} to load stored values...`);
                    
                    // Try to load from localStorage backup first
                    if (attempt === 1) {
                        const cachedResult = await this.loadFromLocalStorageBackup();
                        if (cachedResult) {
                            console.log('✅ Successfully loaded from localStorage backup');
                            return true;
                        }
                    }
                    
                    // Step 1: Get latest.json to find current quotation data filename
                    const latestResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/latest.json?t=${Date.now()}`);
                    if (!latestResponse.ok) {
                        throw new Error(`Failed to fetch latest.json: ${latestResponse.status}`);
                    }
                    
                    const latestData = await latestResponse.json();
                    const dataFilename = latestData.data_filename;
                    if (!dataFilename) {
                        throw new Error('No data_filename found in latest.json');
                    }
                    
                    console.log(`📁 Loading stored values from: ${dataFilename}`);
                    
                    // Step 2: Load the quotation data file containing calculated results
                    const dataResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/${dataFilename}?t=${Date.now()}`);
                    if (!dataResponse.ok) {
                        throw new Error(`Failed to fetch quotation data file: ${dataFilename} (${dataResponse.status})`);
                    }
                    
                    const quotationData = await dataResponse.json();
                    
                    // Step 3: Extract stored potential_profit values and update quotation items
                    const quotationItems = quotationData?.quotation_data?.quotation_items;
                    if (!quotationItems || !Array.isArray(quotationItems)) {
                        throw new Error('No quotation_items found in loaded data');
                    }
                    
                    let storedValuesFound = 0;
                    let valuesUpdated = 0;
                    const profitValuesForBackup = new Map();
                    
                    // Update current quotation items with stored calculated results
                    quotationItems.forEach((item, index) => {
                        const itemNo = item.item_no || (index + 1).toString();
                        const storedPotentialProfit = item.calculated_results?.potential_profit;
                        
                        if (typeof storedPotentialProfit === 'number') {
                            storedValuesFound++;
                            
                            // Cache the value for future use with quotation-specific key
                            const cacheKey = this.getQuotationSpecificCacheKey(itemNo);
                            this.storedProfitValuesCache.set(cacheKey, storedPotentialProfit);
                            profitValuesForBackup.set(itemNo, storedPotentialProfit);
                            
                            // Find matching item in current quotation data
                            const currentItemIndex = this.quotationItems.findIndex(qItem => 
                                String(qItem.item_no) === String(itemNo) || qItem.item_no == itemNo
                            );
                            
                            if (currentItemIndex >= 0) {
                                // Update the current quotation item with stored calculated results
                                if (!this.quotationItems[currentItemIndex].calculated_results) {
                                    this.quotationItems[currentItemIndex].calculated_results = {};
                                }
                                
                                // Copy all calculated results from stored data
                                this.quotationItems[currentItemIndex].calculated_results = {
                                    ...this.quotationItems[currentItemIndex].calculated_results,
                                    ...item.calculated_results
                                };
                                
                                valuesUpdated++;
                                console.log(`✅ Updated stored values for item ${itemNo}: potential_profit=${storedPotentialProfit.toLocaleString()} VND`);
                            }
                        }
                    });
                    
                    // Save to localStorage backup for future reliability
                    if (profitValuesForBackup.size > 0) {
                        await this.saveToLocalStorageBackup(profitValuesForBackup, dataFilename);
                    }
                    
                    console.log(`📊 Stored values summary: ${storedValuesFound} found, ${valuesUpdated} applied to current data`);
                    
                    // Step 4: Update the profit table UI to display stored values
                    if (valuesUpdated > 0) {
                        this.updateProfitTable();
                        console.log('✅ UI updated with stored potential_profit values');
                        return true;
                    } else {
                        console.log('ℹ️ No stored potential_profit values found to display');
                        return false;
                    }
                    
                } catch (error) {
                    lastError = error;
                    console.warn(`⚠️ Attempt ${attempt} failed:`, error.message);
                    
                    if (attempt < maxRetries) {
                        console.log(`⏳ Retrying in ${retryDelay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        retryDelay *= 1.5; // Exponential backoff
                    }
                }
            }
            
            // All retries failed
            console.error('❌ All attempts to load stored potential_profit values failed:', lastError.message);
            return false;
            
        } finally {
            // Always reset loading flag
            this.isLoadingStoredProfitValues = false;
            console.log('🏁 Finished loading stored profit values process');
        }
    }

    /**
     * Save potential_profit values to localStorage as backup
     * @param {Map} profitValuesMap - Map of itemNo -> potential_profit values
     * @param {string} dataFilename - Source filename for tracking
     */
    async saveToLocalStorageBackup(profitValuesMap, dataFilename) {
        try {
            const backupData = {
                values: Object.fromEntries(profitValuesMap),
                timestamp: Date.now(),
                sourceFile: dataFilename,
                quotationId: this.lastLoadedQuotationId
            };
            
            const backupKey = `potential_profit_backup_${this.lastLoadedQuotationId || 'default'}`;
            localStorage.setItem(backupKey, JSON.stringify(backupData));
            console.log(`💾 Saved ${profitValuesMap.size} profit values to localStorage backup`);
        } catch (error) {
            console.warn('⚠️ Failed to save localStorage backup:', error);
        }
    }

    /**
     * Load potential_profit values from localStorage backup
     * @returns {boolean} - True if backup was successfully loaded and applied
     */
    async loadFromLocalStorageBackup() {
        try {
            const backupKey = `potential_profit_backup_${this.lastLoadedQuotationId || 'default'}`;
            const backupData = localStorage.getItem(backupKey);
            
            if (!backupData) {
                console.log('💾 No localStorage backup found');
                return false;
            }
            
            const parsed = JSON.parse(backupData);
            const { values, timestamp, sourceFile } = parsed;
            
            // Check if backup is not too old (max 24 hours)
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            if (Date.now() - timestamp > maxAge) {
                console.log('💾 localStorage backup is too old, ignoring');
                localStorage.removeItem(backupKey);
                return false;
            }
            
            console.log(`💾 Loading from localStorage backup (from ${sourceFile})`);
            
            let valuesUpdated = 0;
            // Apply cached values to current quotation items
            Object.entries(values).forEach(([itemNo, potentialProfit]) => {
                if (typeof potentialProfit === 'number') {
                    // Cache the value with quotation-specific key
                    const cacheKey = this.getQuotationSpecificCacheKey(itemNo);
                    this.storedProfitValuesCache.set(cacheKey, potentialProfit);
                    
                    // Find matching item in current quotation data
                    const currentItemIndex = this.quotationItems.findIndex(qItem => 
                        String(qItem.item_no) === String(itemNo) || qItem.item_no == itemNo
                    );
                    
                    if (currentItemIndex >= 0) {
                        // Update the current quotation item with backup values
                        if (!this.quotationItems[currentItemIndex].calculated_results) {
                            this.quotationItems[currentItemIndex].calculated_results = {};
                        }
                        
                        this.quotationItems[currentItemIndex].calculated_results.potential_profit = potentialProfit;
                        valuesUpdated++;
                        console.log(`✅ Applied backup value for item ${itemNo}: ${potentialProfit.toLocaleString()} VND`);
                    }
                }
            });
            
            if (valuesUpdated > 0) {
                this.updateProfitTable();
                console.log(`💾 Successfully applied ${valuesUpdated} values from localStorage backup`);
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.warn('⚠️ Failed to load localStorage backup:', error);
            return false;
        }
    }

    /**
     * Generate per-item variable input rows
     */
    generateItemVariableInputs() {
        // Auto-load test data if no quotation data exists for formula testing
        if (this.quotationItems.length === 0) {
            console.log('🧪 No quotation data found - auto-loading test data for formula calculations');
            const testData = this.createTestQuotationData();
            this.quotationItems = testData.quotation_items;
            console.log('✅ Test data loaded automatically:', this.quotationItems.length, 'items');
            
            // Also make it globally accessible for preview panel
            if (window.resultPreview) {
                window.resultPreview.currentQuotationData = {
                    quotationData: testData,
                    sessionId: 'auto_test_session_' + Date.now()
                };
            }
        }

        let html = `
            <div class="global-currency-section">
                <h5>Global Currency Setting</h5>
                <div class="variable-input">
                    <label>Target currency</label>
                    <select class="global-currency" id="globalCurrency">
                        <option value="VND">VND</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="JPY">JPY</option>
                    </select>
                    <small>Choose desired currency for all items</small>
                </div>
            </div>
            
            <div class="item-search-section search-bar-visible" id="itemSearchSection">
                <div class="item-search-container">
                    <div class="search-input-wrapper">
                        <svg class="search-icon" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"></path>
                        </svg>
                        <input 
                            type="text" 
                            class="search-input" 
                            id="itemSearchInput"
                            placeholder="Search items by keywords (e.g., 'steel', 'pipe', 'valve')..."
                            autocomplete="off"
                        >
                    </div>
                </div>
                <div class="search-results-info" id="searchResultsInfo">
                    ${this.quotationItems.length} items available
                </div>
            </div>
        `;
        
        this.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const description = item.company_requirement?.description || item.bidder_proposal?.description || 'No description';
            const currencyCode = item.currency_code || item.bidder_proposal?.currency_code || 'VND';
            
            // Get saved variables for this item or use defaults
            const itemVars = this.getItemVariables(itemNo);
            
            // Auto-set exchange rate to 1 if currencies match
            if (currencyCode === this.selectedTargetCurrency && itemVars.exchange_rate === "") {
                itemVars.exchange_rate = "1";
            }
            
            html += `
            <div class="item-variables-group" data-item-no="${itemNo}">
                <div class="item-header">
                    <h5>Item ${itemNo}: ${this.truncateText(description, 40)}</h5>
                    <span class="currency-badge">${currencyCode}</span>
                </div>
                
                
                <div class="variables-grid">
                    <div class="variable-input">
                        <label>Shipping cost</label>
                        <input type="number" 
                               class="shipping-cost" 
                               data-item="${itemNo}" 
                               value="${itemVars.shipping_cost}" 
                               min="0" 
                               step="1000"
                               placeholder="Entering shipping_cost">
                        <small>e.g., 50000 for 50,000 VND</small>
                    </div>
                    
                    <div class="variable-input">
                        <label>Tax rate</label>
                        <input type="number" 
                               class="tax-rate" 
                               data-item="${itemNo}" 
                               value="${itemVars.tax_rate}" 
                               min="0" 
                               step="0.01"
                               placeholder="Entering tax_rate">
                        <small>e.g., 1.1 for 10% tax</small>
                    </div>
                    
                    <div class="variable-input">
                        <label>Exchange rate</label>
                        <input type="number" 
                               class="exchange-rate" 
                               data-item="${itemNo}" 
                               value="${itemVars.exchange_rate}" 
                               min="0" 
                               step="0.1"
                               placeholder="Entering exchange_rate">
                        <small class="exchange-rate-hint" data-item="${itemNo}">From ${currencyCode} to ${this.selectedTargetCurrency}</small>
                    </div>
                    
                    <div class="variable-input">
                        <label>Profit rate</label>
                        <input type="number" 
                               class="profit-rate" 
                               data-item="${itemNo}" 
                               value="${itemVars.profit_rate}" 
                               min="0" 
                               step="0.05"
                               placeholder="Entering profit_rate">
                        <small>e.g., 1.2 for 20% profit</small>
                    </div>
                    
                    <div class="variable-input">
                        <label>Discount rate</label>
                        <input type="number" 
                               class="discount-rate" 
                               data-item="${itemNo}" 
                               value="${itemVars.discount_rate !== '' ? (itemVars.discount_rate * 100).toFixed(1) : ''}" 
                               min="0" 
                               step="0.5"
                               placeholder="Entering discount_rate">
                        <small>e.g., 5 for 5% off final price</small>
                    </div>
                </div>
            </div>
            `;
        });

        this.itemVariablesContainer.innerHTML = html;
        this.bindVariableInputEvents();
        this.setupIntegerFormatting();
        this.updateSearchBarVisibility();
        
        // Restore global currency selection after HTML regeneration
        this.restoreGlobalCurrencySelection();
    }

    /**
     * Restore global currency selection after HTML regeneration
     */
    restoreGlobalCurrencySelection() {
        const globalCurrency = this.itemVariablesContainer.querySelector('#globalCurrency');
        if (globalCurrency && this.selectedTargetCurrency) {
            // Set the dropdown to the stored selection
            globalCurrency.value = this.selectedTargetCurrency;
            
            // Update exchange-rate-label if it exists (for initial state)
            const exchangeRateLabel = this.itemVariablesContainer.querySelector('.exchange-rate-label');
            if (exchangeRateLabel) {
                exchangeRateLabel.textContent = `To ${this.selectedTargetCurrency}`;
            }
            
            console.log('🔄 Restored global currency selection:', this.selectedTargetCurrency);
        }
    }

    /**
     * Setup integer formatting for numeric inputs - FOCUS ONLY
     * Note: Input/blur formatting moved to onVariableChange() to prevent event handler conflicts
     */
    setupIntegerFormatting() {
        const numericInputs = this.itemVariablesContainer.querySelectorAll('.shipping-cost, .exchange-rate');
        
        numericInputs.forEach(input => {
            // Focus behavior - show raw number for editing
            input.addEventListener('focus', (e) => {
                const rawValue = e.target.dataset.rawValue;
                if (rawValue && rawValue !== '') {
                    e.target.value = rawValue; // Show raw digits for editing
                } else {
                    // Clean fallback - extract digits from formatted value
                    const currentValue = e.target.value;
                    if (currentValue) {
                        const cleanValue = currentValue.replace(/[^0-9]/g, '');
                        e.target.dataset.rawValue = cleanValue;
                        e.target.value = cleanValue;
                    }
                }
            });
            
            // Blur behavior - apply formatting when field loses focus
            input.addEventListener('blur', (e) => {
                const rawValue = e.target.dataset.rawValue;
                if (rawValue && rawValue !== '') {
                    const numValue = Math.floor(parseFloat(rawValue));
                    if (!isNaN(numValue) && numValue >= 0) {
                        const formatted = new Intl.NumberFormat('vi-VN').format(numValue);
                        e.target.value = formatted;
                    }
                }
            });
        });
    }

    /**
     * Bind events to dynamically created variable inputs
     */
    bindVariableInputEvents() {
        const inputs = this.itemVariablesContainer.querySelectorAll('input');
        inputs.forEach(input => {
            // Create unique debounce key for each input
            const itemNo = input.dataset.item;
            const variableType = input.className;
            const debounceKey = `${itemNo}-${variableType}`;
            
            // Use debounced handler for input events (300ms delay for integer inputs, 150ms for others)
            const delay = (variableType === 'shipping-cost' || variableType === 'exchange-rate') ? 300 : 150;
            const debouncedHandler = this.debounce(this.onVariableChangeDebounced.bind(this), delay, debounceKey);
            
            input.addEventListener('input', debouncedHandler);
        });
        
        // Add event listener to global currency dropdown
        const globalCurrency = this.itemVariablesContainer.querySelector('#globalCurrency');
        if (globalCurrency) {
            globalCurrency.addEventListener('change', this.onGlobalCurrencyChange.bind(this));
        }
        
        // Add event listener to search input
        const searchInput = this.itemVariablesContainer.querySelector('#itemSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', this.onSearchInputChange.bind(this));
            searchInput.addEventListener('keydown', this.onSearchKeydown.bind(this));
        }
        
        // Add right-click event listeners to formula inputs for bulk update
        const formulaInputs = this.itemVariablesContainer.querySelectorAll('.variable-input input');
        formulaInputs.forEach(input => {
            input.addEventListener('contextmenu', this.showBulkUpdateBoard.bind(this));
        });
    }

    /**
     * Handle global currency selection changes
     */
    onGlobalCurrencyChange(event) {
        const targetCurrency = event.target.value;
        
        // Store the selected target currency
        this.selectedTargetCurrency = targetCurrency;
        this.saveTargetCurrency(targetCurrency);
        
        console.log('🌍 Global currency changed to:', targetCurrency);
        
        // Update all exchange rate hints and inputs
        this.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const currentItemCurrency = this.getCurrentItemCurrency(itemNo);
            
            // Update exchange rate hint
            const hint = this.itemVariablesContainer.querySelector(`.exchange-rate-hint[data-item="${itemNo}"]`);
            if (hint) {
                hint.textContent = `From ${currentItemCurrency} to ${targetCurrency}`;
            }
            
            // Auto-set exchange rate based on currency selection
            const exchangeRateInput = this.itemVariablesContainer.querySelector(`.exchange-rate[data-item="${itemNo}"]`);
            if (exchangeRateInput) {
                if (currentItemCurrency === targetCurrency) {
                    // Same currency - set to 1 and disable input
                    exchangeRateInput.value = '1';
                    exchangeRateInput.dataset.rawValue = '1';
                    exchangeRateInput.disabled = true;
                    exchangeRateInput.style.backgroundColor = '#f5f5f5';
                    exchangeRateInput.style.color = '#666';
                    
                    // Update internal variables immediately
                    if (!this.itemVariables.has(itemNo)) {
                        this.itemVariables.set(itemNo, this.getDefaultItemVariables());
                    }
                    const itemVars = this.itemVariables.get(itemNo);
                    itemVars.exchange_rate = 1;
                    this.saveVariables();
                } else {
                    // Different currency - enable input and clear if it was 1
                    exchangeRateInput.disabled = false;
                    exchangeRateInput.style.backgroundColor = '';
                    exchangeRateInput.style.color = '';
                    if (exchangeRateInput.value === '1') {
                        exchangeRateInput.value = '';
                        exchangeRateInput.dataset.rawValue = '';
                    }
                    exchangeRateInput.placeholder = `Rate from ${currentItemCurrency} to ${targetCurrency}`;
                }
                
                // Trigger input change event to update variables
                exchangeRateInput.dispatchEvent(new Event('input'));
            }
        });
    }

    /**
     * Load saved target currency from localStorage
     * @returns {string|null} Saved target currency or null
     */
    loadSavedTargetCurrency() {
        try {
            return localStorage.getItem('selectedTargetCurrency');
        } catch (error) {
            console.error('Error loading saved target currency:', error);
            return null;
        }
    }

    /**
     * Save target currency selection to localStorage
     * @param {string} currency - Currency code to save
     */
    saveTargetCurrency(currency) {
        try {
            localStorage.setItem('selectedTargetCurrency', currency);
            console.log('💾 Target currency saved:', currency);
        } catch (error) {
            console.error('Error saving target currency:', error);
        }
    }

    /**
     * Get current currency for an item
     */
    getCurrentItemCurrency(itemNo) {
        const item = this.quotationItems.find(item => 
            (item.item_no || '1') === itemNo
        );
        return item?.currency_code || item?.bidder_proposal?.currency_code || 'VND';
    }

    /**
     * Get appropriate initial value for bulk update board
     * @param {HTMLElement} inputElement - The clicked input element
     * @param {string} variableType - Type of variable (shipping_cost, tax_rate, etc.)
     * @returns {string} Appropriate initial value for bulk board
     */
    getBulkBoardInitialValue(inputElement, variableType) {
        // For formatted inputs (shipping_cost, exchange_rate), use raw value if available
        if (variableType === 'shipping_cost' || variableType === 'exchange_rate') {
            const rawValue = inputElement.dataset.rawValue;
            if (rawValue && rawValue !== '') {
                // Return raw value formatted for display
                const numValue = parseFloat(rawValue);
                if (!isNaN(numValue)) {
                    return new Intl.NumberFormat('vi-VN').format(numValue);
                }
            }
        }
        
        // For discount_rate, ensure it's displayed as percentage
        if (variableType === 'discount_rate') {
            const value = inputElement.value;
            // Return empty string for truly empty fields or uninitialized items
            if (value === '' || value === null || value === undefined) {
                return '';
            }
            // If it's already a percentage (0-100), return as is
            // If it's a decimal (0-1), convert to percentage
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
                return numValue <= 1 ? (numValue * 100).toString() : value;
            }
            // Fallback to empty for invalid values
            return '';
        }
        
        // For other inputs (tax_rate, profit_rate), return current display value
        return inputElement.value;
    }

    /**
     * Show bulk update board on right-click
     */
    showBulkUpdateBoard(event) {
        event.preventDefault();
        
        const variableType = event.target.className.split(' ')[0].replace('-', '_');
        // Get raw value for formatted inputs, display value for others
        const currentValue = this.getBulkBoardInitialValue(event.target, variableType);
        
        // Remove existing board if any
        this.hideBulkUpdateBoard();
        
        // Create floating board
        const board = document.createElement('div');
        board.className = 'bulk-update-board';
        board.innerHTML = `
            <div class="bulk-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e9ecef;">
                <h4 style="margin: 0; color: #343a40; font-size: 16px; font-weight: 600;">🔄 Apply to Multiple Items</h4>
                <button class="close-board" style="background: none; border: none; font-size: 20px; color: #6c757d; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='transparent'">&times;</button>
            </div>
            <div class="bulk-options" style="margin-bottom: 12px;">
                <label style="display: flex; align-items: center; color: #495057; font-size: 14px; font-weight: 500; cursor: pointer;">
                    <input type="checkbox" class="apply-all-checkbox" style="margin-right: 8px; accent-color: #007bff;"> ✨ Apply to all items
                </label>
            </div>
            <div class="item-list" style="max-height: 180px; overflow-y: auto; margin-bottom: 16px; padding: 8px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                ${this.generateItemCheckboxes()}
            </div>
            <div class="bulk-actions" style="display: flex; flex-direction: column; gap: 12px;">
                <input type="text" class="bulk-value" value="${currentValue}" placeholder="Enter value" style="padding: 10px 12px; border: 2px solid #e9ecef; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; outline: none;" onfocus="this.style.borderColor='#007bff'" onblur="this.style.borderColor='#e9ecef'">
                <div style="display: flex; gap: 8px;">
                    <button class="apply-bulk" style="flex: 1; padding: 10px; background: linear-gradient(135deg, #007bff, #0056b3); color: white; border: none; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(0,123,255,0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">✅ Apply Selected</button>
                    <button class="cancel-bulk" style="padding: 10px 16px; background: #f8f9fa; color: #6c757d; border: 1px solid #e9ecef; border-radius: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#e9ecef'" onmouseout="this.style.backgroundColor='#f8f9fa'">❌ Cancel</button>
                </div>
            </div>
        `;
        
        // Position board near the clicked input with improved viewport calculation
        const rect = event.target.getBoundingClientRect();
        const boardWidth = 300;
        const boardMaxHeight = 450;
        
        // Calculate optimal position to ensure full visibility
        let left = rect.right + 10;
        let top = rect.top - 50;
        
        // Adjust horizontal position if board would go off-screen
        if (left + boardWidth > window.innerWidth - 20) {
            left = rect.left - boardWidth - 10; // Position to the left
            if (left < 20) {
                left = window.innerWidth - boardWidth - 20; // Force right edge
            }
        }
        
        // Adjust vertical position if board would go off-screen
        if (top + boardMaxHeight > window.innerHeight - 20) {
            top = window.innerHeight - boardMaxHeight - 20; // Force bottom edge
        }
        if (top < 20) {
            top = 20; // Force top edge
        }
        
        board.style.cssText = `
            position: fixed;
            left: ${left}px;
            top: ${top}px;
            z-index: 999999;
            background: linear-gradient(145deg, #ffffff, #f8f9fa);
            border: 1px solid #e9ecef;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2), 0 1px 8px rgba(0,0,0,0.15);
            width: ${boardWidth}px;
            max-height: ${boardMaxHeight}px;
            overflow: auto;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            backdrop-filter: blur(10px);
        `;
        
        document.body.appendChild(board);
        this.currentBulkBoard = { board, variableType };
        
        // Add event listeners
        board.querySelector('.close-board').addEventListener('click', this.hideBulkUpdateBoard.bind(this));
        board.querySelector('.cancel-bulk').addEventListener('click', this.hideBulkUpdateBoard.bind(this));
        board.querySelector('.apply-bulk').addEventListener('click', this.applyBulkUpdate.bind(this));
        
        // Handle "apply all" checkbox
        const applyAllCheckbox = board.querySelector('.apply-all-checkbox');
        applyAllCheckbox.addEventListener('change', (e) => {
            const itemCheckboxes = board.querySelectorAll('.item-checkbox');
            itemCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });
        
        // Add thousands formatting to bulk-value input for shipping_cost and exchange_rate
        const bulkValueInput = board.querySelector('.bulk-value');
        if (variableType === 'shipping_cost' || variableType === 'exchange_rate') {
            // Initialize rawValue if the input has formatted content
            const initValue = bulkValueInput.value;
            if (initValue && initValue !== '') {
                const rawInitValue = initValue.replace(/[^0-9]/g, '');
                if (rawInitValue !== '') {
                    bulkValueInput.dataset.rawValue = rawInitValue;
                }
            }
            // Format on input - immediate formatting as user types
            bulkValueInput.addEventListener('input', (e) => {
                if (e.target.dataset.isFormatting === 'true') return; // Prevent recursive formatting
                
                let value = e.target.value.replace(/[^0-9]/g, ''); // Only keep digits
                
                if (value && value !== '') {
                    e.target.dataset.isFormatting = 'true';
                    
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        const formatted = new Intl.NumberFormat('vi-VN').format(Math.floor(numValue));
                        e.target.value = formatted;
                        e.target.dataset.rawValue = value; // Store raw digits
                    }
                    
                    setTimeout(() => {
                        e.target.dataset.isFormatting = 'false';
                    }, 10);
                } else {
                    e.target.dataset.rawValue = '';
                }
            });
            
            // Clean up for processing on blur
            bulkValueInput.addEventListener('blur', (e) => {
                let cleaned = e.target.value.replace(/[^0-9]/g, ''); // Only digits
                if (cleaned && cleaned !== '') {
                    const numValue = parseFloat(cleaned);
                    if (!isNaN(numValue)) {
                        const formatted = new Intl.NumberFormat('vi-VN').format(Math.floor(numValue));
                        e.target.value = formatted;
                        e.target.dataset.rawValue = cleaned;
                    }
                } else {
                    e.target.value = '';
                    e.target.dataset.rawValue = '';
                }
            });
            
            // Focus behavior - show raw number for editing
            bulkValueInput.addEventListener('focus', (e) => {
                let rawValue = e.target.dataset.rawValue;
                
                // Enhanced fallback with digit preservation
                if (!rawValue || rawValue === '') {
                    const currentValue = e.target.value;
                    if (currentValue && currentValue !== '') {
                        // Parse formatted number properly instead of regex strip
                        const parsed = parseFloat(currentValue.replace(/[,.\s₫VND]/g, ''));
                        rawValue = isNaN(parsed) ? '' : parsed.toString();
                        // Update dataset for consistency
                        e.target.dataset.rawValue = rawValue;
                    }
                }
                
                if (rawValue && rawValue !== '') {
                    e.target.value = rawValue;
                }
            });
        }
    }

    /**
     * Generate checkboxes for items
     */
    generateItemCheckboxes() {
        return this.quotationItems.map((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const description = item.company_requirement?.description || item.bidder_proposal?.description || 'No description';
            
            return `
                <label class="item-checkbox-label" style="display: flex; align-items: center; padding: 6px 8px; margin: 2px 0; border-radius: 6px; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#e9ecef'" onmouseout="this.style.backgroundColor='transparent'">
                    <input type="checkbox" class="item-checkbox" data-item="${itemNo}" style="margin-right: 8px; accent-color: #007bff;">
                    <span style="font-size: 13px; color: #495057;">📦 Item ${itemNo}: ${this.truncateText(description, 25)}</span>
                </label>
            `;
        }).join('');
    }

    /**
     * Unified number parsing for formatted inputs
     * Handles both comma-separated and raw number inputs
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
     * Apply bulk update to selected items
     */
    applyBulkUpdate() {
        if (!this.currentBulkBoard) return;
        
        const { board, variableType } = this.currentBulkBoard;
        const bulkInput = board.querySelector('.bulk-value');
        // Prioritize raw value for formatted inputs
        const bulkValueRaw = bulkInput.dataset.rawValue || bulkInput.value;
        const bulkValue = this.parseFormattedNumber(bulkValueRaw);
        const selectedItems = Array.from(board.querySelectorAll('.item-checkbox:checked'))
            .map(checkbox => checkbox.dataset.item);
        
        if (bulkValue === null || isNaN(bulkValue) || selectedItems.length === 0) {
            alert('Please enter a valid value and select at least one item.');
            return;
        }
        
        // Apply value to selected items
        selectedItems.forEach(itemNo => {
            // Update internal data
            if (!this.itemVariables.has(itemNo)) {
                this.itemVariables.set(itemNo, this.getDefaultItemVariables());
            }
            
            const itemVars = this.itemVariables.get(itemNo);
            if (variableType === 'discount_rate') {
                itemVars[variableType] = bulkValue / 100; // Convert percentage to decimal
            } else {
                itemVars[variableType] = bulkValue;
            }
            
            // Update UI input with proper formatting
            const input = this.itemVariablesContainer.querySelector(`.${variableType.replace('_', '-')}[data-item="${itemNo}"]`);
            if (input) {
                if (variableType === 'discount_rate') {
                    input.value = bulkValue; // Display as percentage
                } else if (variableType === 'shipping_cost' || variableType === 'exchange_rate') {
                    // Apply thousands formatting for integer inputs
                    const formatted = new Intl.NumberFormat('vi-VN').format(bulkValue);
                    input.value = formatted;
                    input.dataset.rawValue = bulkValue.toString();
                    // Trigger formatting events to ensure consistency
                    input.dispatchEvent(new Event('blur'));
                } else {
                    input.value = bulkValue;
                }
            }
        });
        
        // Clear cached potential_profit for all updated items
        selectedItems.forEach(itemNo => {
            const cacheKey = this.getQuotationSpecificCacheKey(itemNo);
            if (this.storedProfitValuesCache.has(cacheKey)) {
                this.storedProfitValuesCache.delete(cacheKey);
            }
        });
        console.log(`🧼 Cleared cached potential_profit for ${selectedItems.length} items due to bulk update`);
        
        // ENHANCED: Activate force recalculation mode for bulk updates
        this.forceRecalculation = true;
        console.log('🔥 Force recalculation activated due to bulk variable update');
        
        this.saveVariables();
        this.updateProfitTable(); // This will use force mode and reset the flag
        
        // Update global reference only if variables are present
        this.updateGlobalVariables();
        
        this.hideBulkUpdateBoard();
        window.showNotification(`✅ Applied ${variableType.replace('_', ' ')} to ${selectedItems.length} items`, 'success');
        
        // Bulk values applied locally only - no automatic recalculation
        // Use the main "Apply" button in the Pricing variables UI to trigger calculations
    }

    /**
     * Hide bulk update board
     */
    hideBulkUpdateBoard() {
        if (this.currentBulkBoard) {
            this.currentBulkBoard.board.remove();
            this.currentBulkBoard = null;
        }
    }

    /**
     * Handle document clicks to close bulk update board
     */
    handleDocumentClick(event) {
        if (this.currentBulkBoard && !this.currentBulkBoard.board.contains(event.target)) {
            this.hideBulkUpdateBoard();
        }
    }

    /**
     * Handle keyboard events for bulk update board
     */
    handleKeydown(event) {
        if (event.key === 'Escape' && this.currentBulkBoard) {
            this.hideBulkUpdateBoard();
        }
    }

    /**
     * Handle variable input changes with debouncing and proper formatting
     */
    onVariableChangeDebounced(event) {
        const itemNo = event.target.dataset.item;
        const variableType = event.target.className;
        
        // Skip if this is a formatting event
        if (event.target.dataset.isFormatting === 'true') {
            return;
        }
        
        // Handle formatting and raw value extraction for integer inputs
        let rawValue = event.target.value;
        if (variableType === 'shipping-cost' || variableType === 'exchange-rate') {
            // Extract digits only for integer inputs
            rawValue = event.target.value.replace(/[^0-9]/g, '');
            
            // Store raw value for future reference
            event.target.dataset.rawValue = rawValue;
            
            // Apply formatting to display if value exists
            if (rawValue && rawValue !== '') {
                const numValue = Math.floor(parseFloat(rawValue));
                if (!isNaN(numValue) && numValue >= 0) {
                    // Temporarily mark as formatting to prevent recursive calls
                    event.target.dataset.isFormatting = 'true';
                    event.target.value = new Intl.NumberFormat('vi-VN').format(numValue);
                    // Remove formatting flag after a brief delay
                    setTimeout(() => {
                        event.target.dataset.isFormatting = 'false';
                    }, 10);
                }
            } else {
                event.target.value = '';
                event.target.dataset.rawValue = '';
            }
        }
        
        // Handle empty values properly - store as empty string if no value
        let value;
        if (!rawValue || rawValue.trim() === '') {
            value = "";
        } else {
            value = this.parseFormattedNumber(rawValue);
            if (value === null || isNaN(value)) {
                value = "";
            } else {
                // Convert discount percentage to rate (divide by 100)
                if (variableType === 'discount-rate') {
                    value = value / 100;
                }
            }
        }

        // Update item variables
        if (!this.itemVariables.has(itemNo)) {
            this.itemVariables.set(itemNo, this.getDefaultItemVariables());
        }
        
        const itemVars = this.itemVariables.get(itemNo);
        itemVars[variableType.replace('-', '_')] = value;
        
        console.log(`Updated ${variableType} for item ${itemNo}:`, value);
        
        // ENHANCED: Activate force recalculation mode for immediate fresh calculations
        this.forceRecalculation = true;
        console.log('🔥 Force recalculation activated due to variable change');
        
        // Clear cached potential_profit for this item when variables change
        const cacheKey = this.getQuotationSpecificCacheKey(itemNo);
        if (this.storedProfitValuesCache.has(cacheKey)) {
            this.storedProfitValuesCache.delete(cacheKey);
            console.log(`🧼 Cleared cached potential_profit for item ${itemNo} due to variable change`);
        }
        
        this.saveVariables();
        this.updateProfitTable(); // This will use force mode and reset the flag
        this.updateWarningBoxVisibility();
        
        // Update global reference only if variables are present
        this.updateGlobalVariables();
    }

    /**
     * Legacy method kept for compatibility - now calls debounced version
     */
    onVariableChange(event) {
        // Immediate call for non-debounced scenarios (legacy compatibility)
        this.onVariableChangeDebounced(event);
    }

    /**
     * Get variables for a specific item
     */
    getItemVariables(itemNo) {
        if (this.itemVariables.has(itemNo)) {
            return this.itemVariables.get(itemNo);
        }
        
        const defaults = this.getDefaultItemVariables();
        this.itemVariables.set(itemNo, defaults);
        return defaults;
    }

    /**
     * Get default variables for an item (empty by default to require user input)
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
     */
    getAllItemVariables() {
        const allVariables = {};
        
        this.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            allVariables[itemNo] = this.getItemVariables(itemNo);
        });
        
        // DEBUG: Log what's being sent to backend
        console.log('📤 Frontend sending variables to backend:', JSON.stringify(allVariables, null, 2));
        
        return allVariables;
    }

    /**
     * Update global window.formulaVariables only when variables are actually present
     * This prevents empty variables from contaminating the global state
     */
    updateGlobalVariables() {
        // Only update if we have actual variables with non-default values
        if (this.hasAnyUserInputVariables()) {
            window.formulaVariables = this.getAllItemVariables();
            console.log('📝 Updated global window.formulaVariables with user input variables');
        } else {
            // Keep window.formulaVariables as null if no user input exists
            console.log('🚫 Skipping global variables update - no user input detected');
        }
    }

    /**
     * Check if any items have variables that differ from defaults (indicating user input)
     */
    hasAnyUserInputVariables() {
        for (let [itemNo, variables] of this.itemVariables.entries()) {
            const defaults = this.getDefaultItemVariables();
            // Check if any variable differs from default
            if (variables.shipping_cost !== defaults.shipping_cost ||
                variables.tax_rate !== defaults.tax_rate ||
                variables.exchange_rate !== defaults.exchange_rate ||
                variables.profit_rate !== defaults.profit_rate ||
                variables.discount_rate !== defaults.discount_rate) {
                return true;
            }
        }
        return false;
    }

    /**
     * Update the profit calculation table
     */
    updateProfitTable() {
        if (this.quotationItems.length === 0) {
            this.profitTableBody.innerHTML = '<tr><td colspan="3" class="no-data">No quotation data available</td></tr>';
            return;
        }

        let tableHtml = '';
        
        this.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const description = item.company_requirement?.description || item.bidder_proposal?.description || 'No description';
            const qty = item.company_requirement?.qty || 0;
            
            // ENHANCED: Priority system with force-recalculation mode
            let potentialProfit = 0;
            const cacheKey = this.getQuotationSpecificCacheKey(itemNo);
            
            if (this.forceRecalculation) {
                // FORCE MODE: Always calculate fresh values, ignore stored data
                console.log(`🔥 Force recalculation mode for item ${itemNo} - calculating fresh values`);
                const variables = this.getItemVariables(itemNo);
                const hasValidVariables = this.validateItemVariables(variables);
                
                if (hasValidVariables) {
                    potentialProfit = this.calculateItemPotentialProfit(item, itemNo);
                    console.log(`🧮 Fresh calculation for item ${itemNo}: ${potentialProfit.toLocaleString()} VND`);
                } else {
                    console.warn(`⚠️ Invalid or missing variables for item ${itemNo}, using debug calculation in force mode`);
                    potentialProfit = this.calculateItemPotentialProfitWithDebug(item, itemNo);
                }
            } else {
                // NORMAL MODE: Use standard priority system
                const storedPotentialProfit = this.getStoredPotentialProfit(item, itemNo);
                const cachedValue = this.storedProfitValuesCache.get(cacheKey);
                
                if (cachedValue !== undefined) {
                    // Use cached value for consistency
                    potentialProfit = cachedValue;
                    console.log(`💾 Using cached potential_profit for item ${itemNo}: ${potentialProfit.toLocaleString()} VND`);
                } else if (storedPotentialProfit !== null) {
                    // Use stored value from JSON (Solution 2) - stored value is already total
                    potentialProfit = storedPotentialProfit;
                    // Cache the value for future use with quotation-specific key
                    this.storedProfitValuesCache.set(cacheKey, potentialProfit);
                    
                    // VALIDATION REMOVED: Allow unlimited profit values for exchange rate flexibility
                    // Previous validation capped profits, but exchange rates can vary significantly in the future
                    console.log(`📁 Using stored potential_profit for item ${itemNo}: ${potentialProfit.toLocaleString()} VND total (for qty=${qty}) - unrestricted`);
                    // No maximum validation - trust stored values
                } else if (this.isLoadingStoredProfitValues) {
                    // Currently loading stored values - return zero to prevent fallback calculations
                    console.log(`⏳ Loading stored values in progress for item ${itemNo} - preventing fallback calculation`);
                    potentialProfit = 0;
                } else {
                    // Fallback to calculation (backward compatibility)
                    console.log(`🧮 No stored potential_profit found for item ${itemNo}, calculating...`);
                    const variables = this.getItemVariables(itemNo);
                    const hasValidVariables = this.validateItemVariables(variables);
                    
                    if (hasValidVariables) {
                        potentialProfit = this.calculateItemPotentialProfit(item, itemNo);
                    } else {
                        console.warn(`⚠️ Invalid or missing variables for item ${itemNo}, using debug calculation`);
                        potentialProfit = this.calculateItemPotentialProfitWithDebug(item, itemNo);
                    }
                }
            }
            
            tableHtml += `
            <tr data-item="${itemNo}">
                <td class="item-desc">${this.truncateText(description, 30)}</td>
                <td class="qty">${qty}</td>
                <td class="profit">${this.formatCurrency(potentialProfit)}</td>
            </tr>
            `;
        });
        
        this.profitTableBody.innerHTML = tableHtml;
        
        // Reset force recalculation flag after successful update
        if (this.forceRecalculation) {
            this.forceRecalculation = false;
            console.log('🔥 Force recalculation completed - flag reset to normal mode');
        }
        
        // Log variable loading status for debugging
        const allVariablesLoaded = this.areAllVariablesLoaded();
        console.log(`📊 Profit table updated: ${this.quotationItems.length} items, All variables loaded: ${allVariablesLoaded}`);
    }

    /**
     * Get stored potential profit from loaded quotation data (Enhanced Dual-Path Solution)
     * @param {Object} item - Quotation item
     * @param {string} itemNo - Item number
     * @returns {number|null} Stored potential profit or null if not found
     */
    getStoredPotentialProfit(item, itemNo) {
        try {
            // ENHANCED: Check all storage paths with improved logging
            
            // PATH 1 (Primary): Check calculated_pricing.processed_items[] structure
            const calculatedPricing = this.quotationData?.calculated_pricing;
            if (calculatedPricing?.processed_items) {
                const processedItem = calculatedPricing.processed_items.find(processed => {
                    return String(processed.item_no) === String(itemNo) || processed.item_no == itemNo;
                });

                if (processedItem && typeof processedItem.potential_profit === 'number') {
                    console.log(`📁 ✅ Found potential_profit in calculated_pricing path for item ${itemNo}: ${processedItem.potential_profit.toLocaleString()} VND`);
                    return processedItem.potential_profit;
                }
            }

            // PATH 2 (Fallback): Check quotation_data.quotation_items[].calculated_results structure
            if (item?.calculated_results && typeof item.calculated_results.potential_profit === 'number') {
                console.log(`📁 ✅ Found potential_profit in item.calculated_results path for item ${itemNo}: ${item.calculated_results.potential_profit.toLocaleString()} VND`);
                return item.calculated_results.potential_profit;
            }

            // PATH 3 (Alternative): Check from quotationItems within quotation_data structure
            const quotationDataItems = this.quotationData?.quotation_data?.quotation_items;
            if (quotationDataItems && Array.isArray(quotationDataItems)) {
                const quotationItem = quotationDataItems.find(qItem => {
                    return String(qItem.item_no) === String(itemNo) || qItem.item_no == itemNo;
                });

                if (quotationItem?.calculated_results && typeof quotationItem.calculated_results.potential_profit === 'number') {
                    console.log(`📁 ✅ Found potential_profit in quotation_data.quotation_items path for item ${itemNo}: ${quotationItem.calculated_results.potential_profit.toLocaleString()} VND`);
                    return quotationItem.calculated_results.potential_profit;
                }
            }

            // PATH 4 (Debug): Check if data structure exists but paths are different
            console.log(`🔍 Debug paths for item ${itemNo}:`, {
                'calculatedPricing exists': !!calculatedPricing,
                'processed_items exists': !!calculatedPricing?.processed_items,
                'processed_items length': calculatedPricing?.processed_items?.length || 0,
                'item.calculated_results exists': !!item?.calculated_results,
                'quotationData.quotation_data exists': !!this.quotationData?.quotation_data,
                'quotation_items exists': !!quotationDataItems,
                'quotation_items length': quotationDataItems?.length || 0
            });

            console.log(`ℹ️ No stored potential_profit found for item ${itemNo} in any path`);
            return null;
        } catch (error) {
            console.warn(`⚠️ Error retrieving stored potential_profit for item ${itemNo}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate potential profit for an item
     * potential_profit = profit_unit_price - actual_unit_price
     */
    calculateItemPotentialProfit(item, itemNo) {
        try {
            const unitPrice = this.extractUnitPrice(item);
            const qty = item.company_requirement?.qty || 0;
            
            if (unitPrice <= 0 || qty <= 0) return 0;
            
            const variables = this.getItemVariables(itemNo);
            
            // FIXED: Use conservative defaults and proper validation to prevent inflated values
            const defaultShipping = 50000; // Conservative shipping cost in VND
            const defaultTax = 1.1; // 10% tax
            const defaultExchange = 1.0; // FIXED: Use 1.0 instead of auto-calculation to prevent inflation
            const defaultProfit = 1.2; // 20% profit (conservative)
            const defaultDiscount = 0; // No discount
            
            // Convert to numbers with smart defaults applied - no max limits for future flexibility
            const shippingCost = Math.max(0, this.parseFormattedNumber(variables.shipping_cost) || defaultShipping);
            const taxRate = Math.max(0, this.parseFormattedNumber(variables.tax_rate) || defaultTax); // Min 0, no max limit
            const exchangeRate = Math.max(0, this.parseFormattedNumber(variables.exchange_rate) || defaultExchange); // Min 0, no max limit for future exchange rates
            const profitRate = Math.max(0, this.parseFormattedNumber(variables.profit_rate) || defaultProfit); // Min 0, no max limit
            const discountRate = Math.max(0.0, this.parseFormattedNumber(variables.discount_rate) || defaultDiscount); // Min 0, no max limit
            
            console.warn(`⚠️ FALLBACK CALCULATION: No stored potential_profit found for item ${itemNo}, using conservative calculation`);
            console.log(`🧮 Conservative Potential Profit Calculation for item ${itemNo}:`, {
                unitPrice,
                qty,
                variables: {
                    shippingCost,
                    taxRate,
                    exchangeRate,
                    profitRate,
                    discountRate
                },
                note: "Using conservative defaults to prevent inflation"
            });
            
            // Follow the exact calculation sequence:
            // actual_unit_price = (((unit_price + shipping_cost) × tax_rate) × exchange_rate)
            const step1 = unitPrice + shippingCost;
            const step2 = step1 * taxRate;
            const actualUnitPrice = step2 * exchangeRate;
            
            // profit_unit_price = actual_unit_price × profit_rate
            const profitUnitPrice = actualUnitPrice * profitRate;
            
            // Apply discount to get sales_unit_price
            const discountAmount = profitUnitPrice * discountRate;
            const salesUnitPrice = profitUnitPrice - discountAmount;
            
            // Potential profit per unit (difference between profit and actual)
            // FIXED: Match backend calculation by rounding before subtraction
            const potentialProfitPerUnit = Math.round(profitUnitPrice) - Math.round(actualUnitPrice);
            
            // Total potential profit for this item
            const totalPotentialProfit = potentialProfitPerUnit * qty;
            
            // VALIDATION REMOVED: Allow unlimited profit calculations for exchange rate flexibility
            // Previous validation capped profits at 500%, but future exchange rates may require higher calculations
            console.log(`💰 Calculated potential_profit for item ${itemNo}: ${totalPotentialProfit.toLocaleString()} VND (unrestricted)`);
            
            return totalPotentialProfit;
            
        } catch (error) {
            console.error('Error calculating potential profit for item:', itemNo, error);
            return 0;
        }
    }

    /**
     * Extract unit price from item data
     * CRITICAL FIX: Always prioritize original prices to prevent compounding calculations
     */
    extractUnitPrice(item) {
        // Priority 1: Original unit price from new standard (ALWAYS use original for calculations)
        if (item.bidder_proposal?.original_unit_price) {
            return this.parseFormattedNumber(item.bidder_proposal.original_unit_price) || 0;
        }
        
        // Priority 2: Original unit price from legacy VND field (ALWAYS use original for calculations)
        if (item.bidder_proposal?.original_unit_price_vnd) {
            return this.parseFormattedNumber(item.bidder_proposal.original_unit_price_vnd) || 0;
        }
        
        // Priority 3: Standard unit_price field (only if no original price stored)
        if (item.bidder_proposal?.unit_price) {
            return this.parseFormattedNumber(item.bidder_proposal.unit_price) || 0;
        }
        
        // Priority 4: Legacy unit_price_vnd field (only if no original price stored)
        if (item.bidder_proposal?.unit_price_vnd) {
            return this.parseFormattedNumber(item.bidder_proposal.unit_price_vnd) || 0;
        }
        
        // Priority 4: Calculate from ext_price and qty
        if (item.bidder_proposal?.ext_price && item.company_requirement?.qty) {
            const extPrice = this.parseFormattedNumber(item.bidder_proposal.ext_price) || 0;
            const qty = this.parseFormattedNumber(item.company_requirement.qty) || 1;
            return extPrice / qty;
        }
        
        // Priority 5: Legacy ext_price_vnd calculation
        if (item.bidder_proposal?.ext_price_vnd && item.company_requirement?.qty) {
            const extPrice = this.parseFormattedNumber(item.bidder_proposal.ext_price_vnd) || 0;
            const qty = this.parseFormattedNumber(item.company_requirement.qty) || 1;
            return extPrice / qty;
        }
        
        return 0;
    }

    /**
     * Get reasonable exchange rate between two currencies
     * @param {string} fromCurrency - Source currency
     * @param {string} toCurrency - Target currency
     * @returns {number} - Reasonable exchange rate
     */
    getReasonableExchangeRate(fromCurrency, toCurrency) {
        // If currencies are the same or either is missing, use 1.0
        if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
            return 1.0;
        }

        // Common exchange rates (approximate, as of 2025)
        const exchangeRates = {
            'USD_VND': 24000,
            'VND_USD': 1/24000,
            'EUR_VND': 26000,
            'VND_EUR': 1/26000,
            'JPY_VND': 160,
            'VND_JPY': 1/160,
            'USD_EUR': 0.92,
            'EUR_USD': 1.08,
            'USD_JPY': 150,
            'JPY_USD': 1/150
        };

        const rateKey = `${fromCurrency}_${toCurrency}`;
        const rate = exchangeRates[rateKey];
        
        if (rate) {
            console.log(`📈 Using predefined exchange rate ${fromCurrency} → ${toCurrency}: ${rate}`);
            return rate;
        }

        // For unknown currency pairs, default to 1.0 to prevent calculation inflation
        console.warn(`⚠️ Unknown currency pair ${fromCurrency} → ${toCurrency}, using 1.0 to prevent inflation`);
        return 1.0;
    }

    /**
     * Validate if variables are properly loaded for an item
     * @param {Object} variables - Item variables object
     * @returns {boolean} - True if variables are loaded with non-default values
     */
    validateItemVariables(variables) {
        // Check for non-empty string values (not just defaults)
        return variables && 
               variables.shipping_cost !== "" && 
               variables.tax_rate !== "" && 
               variables.exchange_rate !== "" && 
               variables.profit_rate !== "" && 
               variables.discount_rate !== "";
    }

    /**
     * Check if all quotation items have properly loaded variables
     * @returns {boolean} - True if all items have loaded variables
     */
    areAllVariablesLoaded() {
        if (this.quotationItems.length === 0) {
            return false;
        }

        return this.quotationItems.every((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const variables = this.getItemVariables(itemNo);
            return this.validateItemVariables(variables);
        });
    }

    /**
     * Calculate potential profit with debugging for variable validation
     * @param {Object} item - Quotation item
     * @param {string} itemNo - Item number
     * @returns {number} - Calculated potential profit
     */
    calculateItemPotentialProfitWithDebug(item, itemNo) {
        const variables = this.getItemVariables(itemNo);
        const hasValidVariables = this.validateItemVariables(variables);
        
        console.log(`🔧 Debug calculation for item ${itemNo}:`, {
            hasValidVariables,
            variables,
            itemData: {
                description: item.company_requirement?.description || 'No description',
                qty: item.company_requirement?.qty || 0
            }
        });
        
        // Continue with normal calculation logic
        return this.calculateItemPotentialProfit(item, itemNo);
    }

    /**
     * Verify variable loading completion and update profit table with retry mechanism
     * @returns {Promise<void>}
     */
    async verifyAndUpdateProfitTable() {
        let verificationRetries = 0;
        const maxRetries = 3;
        
        while (verificationRetries < maxRetries) {
            const allVariablesLoaded = this.areAllVariablesLoaded();
            
            if (allVariablesLoaded) {
                console.log('✅ All variables verified loaded - updating profit table');
                this.updateProfitTable();
                return;
            } else {
                verificationRetries++;
                console.warn(`⚠️ Variable loading incomplete (attempt ${verificationRetries}/${maxRetries})`);
                
                if (verificationRetries < maxRetries) {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 100));
                } else {
                    console.warn('❌ Max retries reached - updating profit table with current state');
                    this.updateProfitTable();
                }
            }
        }
    }

    /**
     * Render the target currency section immediately on initialization
     */
    renderInitialCurrencySection() {
        const currencyHtml = `
            <div class="global-currency-section">
                <h5>Global Currency Setting</h5>
                <div class="variable-input">
                    <label>Target currency</label>
                    <select class="global-currency" id="globalCurrency">
                        <option value="VND">VND</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="JPY">JPY</option>
                    </select>
                    <small class="exchange-rate-label">To ${this.selectedTargetCurrency}</small>
                </div>
            </div>
            <div class="no-items-message">Load quotation data to configure per-item variables</div>
        `;
        this.itemVariablesContainer.innerHTML = currencyHtml;
        
        // Bind event to the initial currency dropdown and restore selection
        const globalCurrency = this.itemVariablesContainer.querySelector('#globalCurrency');
        if (globalCurrency) {
            globalCurrency.addEventListener('change', this.onGlobalCurrencyChange.bind(this));
            // Restore saved currency selection
            if (this.selectedTargetCurrency) {
                globalCurrency.value = this.selectedTargetCurrency;
            }
        }
    }

    /**
     * Show message when no items are available
     */
    showNoItemsMessage() {
        // Keep the currency section and just show the no-items message
        const currencyHtml = `
            <div class="global-currency-section">
                <h5>Global Currency Setting</h5>
                <div class="variable-input">
                    <label>Target currency</label>
                    <select class="global-currency" id="globalCurrency">
                        <option value="VND">VND</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="JPY">JPY</option>
                    </select>
                    <small class="exchange-rate-label">To ${this.selectedTargetCurrency}</small>
                </div>
            </div>
            <div class="no-items-message">Load quotation data to configure per-item variables</div>
        `;
        this.itemVariablesContainer.innerHTML = currencyHtml;
        this.profitTableBody.innerHTML = '<tr><td colspan="3" class="no-data">No quotation data available</td></tr>';
        
        // Re-bind currency dropdown event and restore selection
        const globalCurrency = this.itemVariablesContainer.querySelector('#globalCurrency');
        if (globalCurrency) {
            globalCurrency.addEventListener('change', this.onGlobalCurrencyChange.bind(this));
            // Restore saved currency selection
            if (this.selectedTargetCurrency) {
                globalCurrency.value = this.selectedTargetCurrency;
            }
        }
    }

    /**
     * Reset all variables to defaults
     */
    resetFormulaVariables() {
        this.itemVariables.clear();
        this.generateItemVariableInputs();
        this.updateProfitTable();
        this.saveVariables();
        // Clear global variables since we reset to defaults
        window.formulaVariables = null;
        console.log('🧼 Reset: Cleared global window.formulaVariables');
        window.showNotification('🔄 All pricing variables reset to defaults', 'info');
    }

    /**
     * Fetch current processing quotation data from backend
     * This ensures we work with fresh data rather than potentially stale memory data
     * @returns {Object} Fresh quotation data from backend
     */
    async fetchCurrentQuotationData() {
        try {
            console.log('🔄 Fetching current processing quotation data from backend...');
            
            // First, try to get session ID from current quotation data
            let sessionId = null;
            if (window.resultPreview && window.resultPreview.currentQuotationData) {
                sessionId = window.resultPreview.currentQuotationData.sessionId || 
                           window.resultPreview.currentQuotationData.session_id ||
                           window.resultPreview.currentQuotationData.data?.session_id;
            }
            
            // If no session ID available, try to get data from currently selected quotation
            if (!sessionId) {
                console.log('🔍 No session ID found, attempting to load from currently selected quotation...');
                
                // FIXED: Use current quotation instead of always falling back to latest.json
                let currentDataFilename = null;
                
                // First, try to get the data filename from the currently selected quotation
                if (window.resultPreview && window.resultPreview.currentFilename) {
                    const currentHtmlFilename = window.resultPreview.currentFilename;
                    console.log('📁 Current quotation filename:', currentHtmlFilename);
                    
                    // Extract base filename from HTML filename
                    // Example: "quotation_RFQ-123_Company_2025-08-23T12-00-00-000Z.html" → "quotation_RFQ-123_Company"
                    const baseFilename = currentHtmlFilename
                        .replace(/\.html$/, '')  // Remove .html extension
                        .replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '');  // Remove timestamp
                    
                    currentDataFilename = `${baseFilename}_data.json`;
                    console.log('📊 Derived data filename:', currentDataFilename);
                } else {
                    console.log('⚠️ No current quotation found, falling back to latest.json...');
                    
                    // Fallback: only use latest.json if absolutely no current quotation context
                    const latestResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/latest.json`);
                    if (latestResponse.ok) {
                        const latestData = await latestResponse.json();
                        if (latestData.data_filename) {
                            currentDataFilename = latestData.data_filename;
                            console.log('📁 Using latest data filename as fallback:', currentDataFilename);
                        }
                    }
                }
                
                // Load the data file for the current/selected quotation
                if (currentDataFilename) {
                    const dataResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/${currentDataFilename}`);
                    if (dataResponse.ok) {
                        const quotationDataFile = await dataResponse.json();
                        console.log('✅ Loaded fresh quotation data from current quotation data file:', quotationDataFile);
                        
                        return {
                            quotationData: quotationDataFile.quotation_data,
                            quotationDataFile: quotationDataFile, // Full JSON structure for stored value access
                            sessionId: quotationDataFile.session_info?.id || 'fetched_' + Date.now(),
                            source: 'current_quotation_data_file'
                        };
                    } else {
                        console.warn('⚠️ Failed to load data file:', currentDataFilename);
                    }
                }
            }
            
            // If we have a session ID, try to fetch from session endpoint
            if (sessionId) {
                console.log('🔍 Attempting to fetch from session:', sessionId);
                
                const sessionResponse = await fetch(`${window.CONFIG.API_BASE}/api/quotation-session/${sessionId}`);
                if (sessionResponse.ok) {
                    const sessionData = await sessionResponse.json();
                    console.log('✅ Loaded fresh quotation data from session:', sessionData);
                    
                    return {
                        quotationData: sessionData.data.quotationData,
                        sessionId: sessionId,
                        source: 'session_api'
                    };
                }
            }
            
            // Fallback: use current memory data but log warning
            console.warn('⚠️ Unable to fetch fresh data from backend, using current memory data');
            
            if (this.quotationItems && this.quotationItems.length > 0) {
                // Build quotation data from current items with existing context
                const quotationData = {
                    quotation_items: this.quotationItems
                };
                
                // Try to merge with existing context data
                if (window.resultPreview && window.resultPreview.currentQuotationData) {
                    const existingData = window.resultPreview.currentQuotationData.quotationData || 
                                       window.resultPreview.currentQuotationData.data ||
                                       window.resultPreview.currentQuotationData;
                    
                    if (existingData) {
                        Object.assign(quotationData, existingData);
                        quotationData.quotation_items = this.quotationItems; // Always use current items
                    }
                }
                
                return {
                    quotationData: quotationData,
                    sessionId: 'memory_' + Date.now(),
                    source: 'memory_fallback'
                };
            }
            
            throw new Error('No quotation data available from any source');
            
        } catch (error) {
            console.error('❌ Error fetching current quotation data:', error);
            throw new Error(`Failed to fetch quotation data: ${error.message}`);
        }
    }

    /**
     * Apply current formula variables and trigger automatic recalculation
     */
    async applyFormula() {
        try {
            console.log('🧮 Apply Formula button clicked - starting recalculation process');
            
            // Set recalculating flag to prevent SSE updates from overwriting local calculations
            this.isRecalculating = true;
            
            // Update warning box visibility (but don't update profit table yet - wait for backend response)
            this.updateWarningBoxVisibility();
            
            // 🎯 STEP 1: Fetch current processing quotation data from backend
            console.log('🎯 Step 1: Fetching fresh quotation data from backend...');
            window.showNotification('🔄 Fetching current quotation data...', 'info');
            
            const freshData = await this.fetchCurrentQuotationData();
            console.log('✅ Fresh data fetched from:', freshData.source);
            console.log('📋 Fresh quotation data:', freshData.quotationData);
            
            // Update our local items with fresh data if available
            if (freshData.quotationData && freshData.quotationData.quotation_items) {
                this.quotationItems = freshData.quotationData.quotation_items;
                console.log('🔄 Updated local quotation items with fresh data:', this.quotationItems.length, 'items');
            }
            
            // Check if we have quotation items to work with
            if (this.quotationItems && this.quotationItems.length > 0) {
                // Smart validation with defaults - allow calculation even with minimal data
                const validationResults = this.quotationItems.map(item => {
                    const unitPrice = this.extractUnitPrice(item);
                    const qty = item.company_requirement?.qty || 1; // Default qty to 1
                    return {
                        item_no: item.item_no,
                        unitPrice: unitPrice >= 0 ? unitPrice : 1000, // Use default if missing
                        qty: qty > 0 ? qty : 1, // Ensure positive qty
                        isValid: true // Always valid with defaults
                    };
                });
                
                const hasValidItems = validationResults.length > 0;
                console.log('📊 Validation results:', validationResults);
                
                if (!hasValidItems) {
                    console.error('❌ No quotation items found after validation');
                    window.showNotification('❌ No quotation items available. Auto-loading test data...', 'info');
                    this.loadTestData();
                    return;
                }
                const allVariables = this.getAllItemVariables();
                
                console.log('🔄 Applying formula variables:', allVariables);
                console.log('📊 Available quotation items:', this.quotationItems.length);
                window.showNotification('🧮 Recalculating prices...', 'info');
                
                // 🎯 IMMEDIATE UPDATE: Force recalculation and update profit table immediately with new variables
                console.log('🔄 Activating force recalculation and updating table immediately...');
                this.forceRecalculation = true;
                console.log('🔥 Force recalculation activated for apply formula');
                
                // Clear cache for all items
                this.quotationItems.forEach((item, index) => {
                    const itemNo = item.item_no || (index + 1).toString();
                    const cacheKey = this.getQuotationSpecificCacheKey(itemNo);
                    if (this.storedProfitValuesCache.has(cacheKey)) {
                        this.storedProfitValuesCache.delete(cacheKey);
                    }
                });
                this.updateProfitTable(); // Update UI immediately with fresh calculations (force mode will reset)
                console.log('✅ Immediate profit table update completed');
                
                // 🎯 STEP 2: Use fresh quotation data as base and process items for calculations
                console.log('🎯 Step 2: Processing quotation data with fresh backend data...');
                
                // Use the fresh quotation data as the base
                const quotationData = { ...freshData.quotationData };
                
                // Process items to ensure they have the minimum required fields for backend validation
                const processedItems = this.quotationItems.map(item => {
                    const processedItem = { ...item };
                    
                    // Ensure bidder_proposal exists
                    if (!processedItem.bidder_proposal) {
                        processedItem.bidder_proposal = {};
                    }
                    
                    // Ensure company_requirement exists
                    if (!processedItem.company_requirement) {
                        processedItem.company_requirement = {};
                    }
                    
                    // Extract unit price from our frontend logic and set it in the proper field
                    const unitPrice = this.extractUnitPrice(item);
                    // Always set unit_price, even if 0 (backend will validate)
                    processedItem.bidder_proposal.unit_price = unitPrice;
                    // Also keep legacy field for compatibility
                    processedItem.bidder_proposal.unit_price_vnd = unitPrice;
                    
                    // Ensure qty is available
                    const qty = item.company_requirement?.qty || 0;
                    // Always set qty, even if 0 (backend will validate)
                    processedItem.company_requirement.qty = qty;
                    
                    console.log(`Processed item ${processedItem.item_no}:`, {
                        unit_price: processedItem.bidder_proposal.unit_price,
                        qty: processedItem.company_requirement.qty
                    });
                    
                    return processedItem;
                });
                
                // Update quotation data with processed items
                quotationData.quotation_items = processedItems;
                
                console.log('📋 Using fresh quotation data with processed items for API:', quotationData);
                
                // Clean up pricing variables for API call - apply smart defaults for missing values
                const cleanedVariables = {};
                let hasValidVariables = false;
                
                Object.keys(allVariables).forEach(itemNo => {
                    const vars = allVariables[itemNo];
                    
                    // Apply smart defaults for empty/missing variables
                    const defaultShipping = 0;
                    const defaultTax = 1.1; // 10% tax
                    const defaultExchange = this.getReasonableExchangeRate(this.getCurrentItemCurrency(itemNo), this.selectedTargetCurrency); // Reasonable exchange rate
                    const defaultProfit = 1.25; // 25% profit
                    const defaultDiscount = 0; // No discount
                    
                    // FIXED: Properly preserve user input values, only use defaults for truly missing values
                    const parsedShipping = this.parseFormattedNumber(vars.shipping_cost);
                    const parsedTax = this.parseFormattedNumber(vars.tax_rate);
                    const parsedExchange = this.parseFormattedNumber(vars.exchange_rate);
                    const parsedProfit = this.parseFormattedNumber(vars.profit_rate);
                    const parsedDiscount = this.parseFormattedNumber(vars.discount_rate);
                    
                    // DEBUG: Log user input preservation
                    console.log(`🔍 Item ${itemNo} - Variable Processing:`, {
                        original_vars: vars,
                        parsed_values: {
                            shipping_cost: parsedShipping,
                            tax_rate: parsedTax,
                            exchange_rate: parsedExchange,
                            profit_rate: parsedProfit,
                            discount_rate: parsedDiscount
                        },
                        will_use_defaults: {
                            shipping_cost: (parsedShipping === null || parsedShipping === undefined),
                            tax_rate: (parsedTax === null || parsedTax === undefined),
                            exchange_rate: (parsedExchange === null || parsedExchange === undefined),
                            profit_rate: (parsedProfit === null || parsedProfit === undefined),
                            discount_rate: (parsedDiscount === null || parsedDiscount === undefined)
                        }
                    });
                    
                    cleanedVariables[itemNo] = {
                        shipping_cost: (parsedShipping !== null && parsedShipping !== undefined) ? parsedShipping : defaultShipping,
                        tax_rate: (parsedTax !== null && parsedTax !== undefined) ? parsedTax : defaultTax,
                        exchange_rate: (parsedExchange !== null && parsedExchange !== undefined) ? parsedExchange : defaultExchange,
                        profit_rate: (parsedProfit !== null && parsedProfit !== undefined) ? parsedProfit : defaultProfit,
                        discount_rate: (parsedDiscount !== null && parsedDiscount !== undefined) ? parsedDiscount : defaultDiscount
                    };
                    
                    console.log(`✅ Item ${itemNo} - Final cleaned variables:`, cleanedVariables[itemNo]);
                    
                    hasValidVariables = true; // Always valid with defaults
                    
                    // Log when defaults are applied
                    const appliedDefaults = [];
                    if (vars.shipping_cost === "" || !vars.shipping_cost) appliedDefaults.push('shipping_cost');
                    if (vars.tax_rate === "" || !vars.tax_rate) appliedDefaults.push('tax_rate');
                    if (vars.exchange_rate === "" || !vars.exchange_rate) appliedDefaults.push('exchange_rate');
                    if (vars.profit_rate === "" || !vars.profit_rate) appliedDefaults.push('profit_rate');
                    
                    if (appliedDefaults.length > 0) {
                        console.log(`📋 Applied defaults for item ${itemNo}:`, appliedDefaults);
                    }
                });
                
                // Always proceed with calculation using defaults
                console.log('✅ All variables validated with smart defaults applied');
                console.log('🔧 Final cleaned variables:', cleanedVariables);
                console.log('🔍 DEBUG: Check console logs above to see if user input values are preserved correctly');
                
                // 🎯 STEP 3: Use session ID from fresh data
                console.log('🎯 Step 3: Using session ID from fresh data source:', freshData.source);
                const sessionId = freshData.sessionId;
                
                // 🎯 STEP 4: Assemble JSON input for quotation-generation endpoint
                console.log('🎯 Step 4: Assembling data for quotation-generation endpoint with action_type = update...');
                
                const requestPayload = {
                    action_type: 'update',
                    session_id: sessionId,
                    quotation_data: quotationData,
                    pricing_variables: cleanedVariables
                };
                
                console.log('📤 API Request payload assembled with fresh data:', requestPayload);
                console.log('🧮 Cleaned variables for API:', cleanedVariables);
                console.log('🔍 Items with valid variables:', Object.keys(cleanedVariables));
                
                // ===== ENHANCED LOGGING: EXACT JSON INPUT FORMAT =====
                console.log('🎯 ===== APPLY BUTTON FLOW: FRESH DATA → CALCULATE → ASSEMBLE → SEND =====');
                console.log('🎯 Data Source:', freshData.source);
                console.log('🎯 Action Type:', requestPayload.action_type);
                console.log('🎯 Session ID:', requestPayload.session_id);
                console.log('🎯 Pricing Variables Structure:');
                console.log(JSON.stringify(requestPayload.pricing_variables, null, 2));
                console.log('🎯 Full Request Payload (Fresh Data + Calculations):');
                console.log(JSON.stringify(requestPayload, null, 2));
                console.log('🎯 =================================================================');
                
                console.log('📤 Sending API request to:', `${window.CONFIG.API_BASE}/api/quotation-generation`);
                console.log('📤 Request payload:', JSON.stringify(requestPayload, null, 2));
                
                const response = await fetch(`${window.CONFIG.API_BASE}/api/quotation-generation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestPayload)
                });
                
                console.log('📥 API Response status:', response.status, response.statusText);
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Recalculation API response received:', result);
                    
                    // CRITICAL FIX: Display complete API response in expected format
                    this.displayCompleteAPIResponse(result);
                    
                    // ENHANCED: Also save pricing variables to quotation data file
                    await this.savePricingVariablesToDataFile(cleanedVariables, quotationData);
                    
                    // Update local data with recalculated values
                    if (result.calculated_pricing && result.calculated_pricing.processed_items) {
                        console.log('🔄 Updating local data with calculated pricing');
                        this.updateLocalDataWithCalculations(result.calculated_pricing.processed_items);
                        window.showNotification('✅ Prices recalculated and complete response displayed', 'success');
                    } else {
                        console.warn('⚠️ No calculated pricing data received from server, but request succeeded');
                        console.log('📊 Full response data:', result);
                        window.showNotification('✅ Recalculation request sent - check SSE for updates', 'info');
                    }
                    
                    // Reset recalculating flag after a brief delay to allow SSE updates to complete
                    setTimeout(async () => {
                        this.isRecalculating = false;
                        console.log('🔄 Recalculation state reset - SSE updates now allowed');
                        
                        // Update profit table with final calculated values after backend processing is complete
                        this.updateProfitTable();
                        console.log('✅ Profit table updated with final backend-calculated values');
                        
                        // 🎯 CRITICAL: Load and display stored potential_profit values after calculations complete
                        console.log('🔄 Loading stored potential_profit values after calculation completion...');
                        const storedValuesLoaded = await this.loadAndDisplayStoredProfitValues();
                        if (storedValuesLoaded) {
                            console.log('✅ Stored potential_profit values successfully loaded and displayed');
                        } else {
                            console.log('ℹ️ No stored potential_profit values available - using calculated values');
                        }
                    }, 2000); // 2 second delay to allow SSE processing
                } else {
                    const errorText = await response.text();
                    console.error('❌ Server error during recalculation:', response.status, errorText);
                    this.isRecalculating = false; // Reset flag on server error
                    throw new Error(`Server error: ${response.status} - ${errorText}`);
                }
            } else {
                console.error('❌ No quotation items available for calculation - auto-loading test data');
                console.log('🧪 Attempting to auto-load test data for formula calculations');
                
                try {
                    this.loadTestData();
                    window.showNotification('✅ Test data loaded automatically - please try Apply again', 'success');
                    // Auto-retry the calculation after loading test data
                    setTimeout(() => {
                        console.log('🔄 Auto-retrying calculation with test data');
                        this.applyFormula();
                    }, 1000);
                } catch (error) {
                    console.error('❌ Failed to load test data:', error);
                    window.showNotification('❌ No quotation data available and failed to load test data. Please load quotation data manually.', 'error');
                    this.isRecalculating = false; // Reset flag on test data loading error
                }
            }
        } catch (error) {
            console.error('❌ Error applying formula:', error);
            console.error('❌ Error stack:', error.stack);
            window.showNotification(`❌ Error during recalculation: ${error.message}`, 'error');
            this.isRecalculating = false; // Reset flag on any error
        }
    }

    /**
     * Save pricing variables directly to the quotation data file
     * This ensures variables are persisted even if the main API doesn't save them
     * @param {Object} pricingVariables - Pricing variables to save
     * @param {Object} quotationData - Quotation data containing RFQ and customer info
     */
    async savePricingVariablesToDataFile(pricingVariables, quotationData) {
        try {
            if (!quotationData || !pricingVariables) {
                console.log('⚠️ Cannot save pricing variables: missing data');
                return;
            }

            const rfqReference = quotationData.rfq_reference;
            const customerName = quotationData.customer_info?.company_name;

            if (!rfqReference || !customerName) {
                console.log('⚠️ Cannot save pricing variables: missing RFQ reference or customer name');
                return;
            }

            console.log('💾 Saving pricing variables to data file for:', rfqReference, '-', customerName);
            console.log('💾 Variables to save:', pricingVariables);

            // Call the API endpoint to update the data file
            const response = await fetch(`${window.CONFIG.API_BASE}/api/update-pricing-variables`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rfq_reference: rfqReference,
                    customer_name: customerName,
                    pricing_variables: pricingVariables
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Pricing variables saved to data file:', result);
            } else {
                console.warn('⚠️ Failed to save pricing variables to data file:', response.status, response.statusText);
            }

        } catch (error) {
            console.error('❌ Error saving pricing variables to data file:', error);
        }
    }

    /**
     * Update local quotation data with backend calculation results
     * @param {Array} calculatedItems - Array of calculated items from backend
     */
    updateLocalDataWithCalculations(calculatedItems) {
        if (!this.quotationItems || !calculatedItems) {
            console.warn('⚠️ Cannot update local data: missing quotation items or calculated items');
            return;
        }
        
        console.log('🔄 Updating local data with backend calculations');
        console.log('📊 Calculated items received:', calculatedItems);
        
        let updatedCount = 0;
        
        // Update quotation items with calculated values
        this.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const calculatedItem = calculatedItems.find(calc => calc.item_no === itemNo);
            
            if (calculatedItem) {
                // Update bidder_proposal with official calculated prices
                if (!item.bidder_proposal) {
                    item.bidder_proposal = {};
                }
                
                // CRITICAL FIX: Preserve original prices robustly - never overwrite calculation base
                // Save original unit prices from both standard and VND fields
                if (!item.bidder_proposal.original_unit_price && item.bidder_proposal.unit_price) {
                    item.bidder_proposal.original_unit_price = item.bidder_proposal.unit_price;
                    console.log(`🛡️ Preserved original_unit_price: ${item.bidder_proposal.unit_price}`);
                }
                if (!item.bidder_proposal.original_unit_price_vnd && item.bidder_proposal.unit_price_vnd) {
                    item.bidder_proposal.original_unit_price_vnd = item.bidder_proposal.unit_price_vnd;
                    console.log(`🛡️ Preserved original_unit_price_vnd: ${item.bidder_proposal.unit_price_vnd}`);
                }
                
                // CRITICAL FIX: Store calculated results in separate display/metadata fields ONLY
                // DO NOT overwrite calculation base fields (unit_price, unit_price_vnd) 
                
                // Store calculated results in metadata for UI display
                item.bidder_proposal.calculated_unit_price_vnd = calculatedItem.sales_unit_price;
                item.bidder_proposal.calculated_ext_price_vnd = calculatedItem.ext_price;
                item.bidder_proposal.calculated_unit_price = calculatedItem.sales_unit_price;
                item.bidder_proposal.calculated_ext_price = calculatedItem.ext_price;
                
                console.log(`🧮 Stored calculated results (unit_price: ${calculatedItem.sales_unit_price}, ext_price: ${calculatedItem.ext_price}) without contaminating original prices`);
                
                // Keep original prices intact for future calculations
                // item.bidder_proposal.unit_price_vnd = UNCHANGED (preserves original)
                // item.bidder_proposal.unit_price = UNCHANGED (preserves original)
                
                // Store calculation metadata
                item.bidder_proposal.calculation_metadata = {
                    actual_unit_price: calculatedItem.actual_unit_price,
                    profit_unit_price: calculatedItem.profit_unit_price,
                    sales_unit_price: calculatedItem.sales_unit_price,
                    discount_amount: calculatedItem.discount_amount,
                    calculation_timestamp: calculatedItem.calculation_timestamp || new Date().toISOString()
                };

                // CRITICAL FIX: Extract and store potential_profit from backend response
                if (!item.calculated_results) {
                    item.calculated_results = {};
                }

                // Store potential_profit from backend calculations
                if (calculatedItem.potential_profit !== undefined) {
                    item.calculated_results.potential_profit = calculatedItem.potential_profit;
                    console.log(`💰 Updated potential_profit for item ${itemNo}: ${calculatedItem.potential_profit.toLocaleString()} VND`);

                    // Clear quotation-specific cache to ensure fresh values are displayed
                    const cacheKey = this.getQuotationSpecificCacheKey(itemNo);
                    if (this.storedProfitValuesCache.has(cacheKey)) {
                        this.storedProfitValuesCache.delete(cacheKey);
                        console.log(`🧼 Cleared cached potential_profit for item ${itemNo} after backend update`);
                    }
                } else {
                    console.warn(`⚠️ No potential_profit received from backend for item ${itemNo}`);
                }

                updatedCount++;
                console.log(`✅ Updated item ${itemNo}: unit_price=${calculatedItem.sales_unit_price}, ext_price=${calculatedItem.ext_price}`);
            } else {
                console.warn(`⚠️ No calculated data found for item ${itemNo}`);
            }
        });
        
        console.log(`📊 Updated ${updatedCount} items with new calculations`);
        
        // Update the profit table to reflect new calculations
        this.updateProfitTable();
        
        // Update global quotation data reference
        if (window.resultPreview && window.resultPreview.currentQuotationData) {
            window.resultPreview.currentQuotationData.quotationData = {
                ...window.resultPreview.currentQuotationData.quotationData,
                quotation_items: this.quotationItems
            };
        }
        
        // Notify other components about the data update
        if (window.resultPreview && typeof window.resultPreview.refreshPreview === 'function') {
            console.log('🔄 Refreshing preview display...');
            window.resultPreview.refreshPreview();
        }
        
        // Trigger a global event for other components
        window.dispatchEvent(new CustomEvent('quotationDataUpdated', {
            detail: {
                updatedItems: updatedCount,
                quotationItems: this.quotationItems
            }
        }));
    }

    /**
     * Generate quotation-specific storage key for formula variables
     * This ensures variable isolation between different quotations
     * @returns {string} Quotation-specific localStorage key
     */
    getVariablesStorageKey() {
        const quotationId = this.lastLoadedQuotationId || 'default';
        return `itemPricingVariables_${quotationId}`;
    }

    /**
     * Save variables to localStorage
     */
    saveVariables() {
        const data = {};
        this.itemVariables.forEach((vars, itemNo) => {
            data[itemNo] = vars;
        });
        const storageKey = this.getVariablesStorageKey();
        localStorage.setItem(storageKey, JSON.stringify(data));
        console.log(`💾 Saved variables for quotation: ${this.lastLoadedQuotationId || 'default'}`);
    }

    /**
     * Load saved variables from localStorage
     */
    loadSavedVariables() {
        try {
            const storageKey = this.getVariablesStorageKey();
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                this.itemVariables.clear();
                Object.keys(data).forEach(itemNo => {
                    this.itemVariables.set(itemNo, data[itemNo]);
                });
                console.log(`🔄 Loaded variables for quotation: ${this.lastLoadedQuotationId || 'default'}`);
                
                // Update global variables only if we loaded actual user input
                this.updateGlobalVariables();
            } else {
                console.log(`ℹ️ No saved variables found for quotation: ${this.lastLoadedQuotationId || 'default'}`);
            }
        } catch (error) {
            console.error('Error loading saved variables:', error);
        }
    }

    /**
     * Utility: Truncate text to specified length
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Utility: Format currency
     */
    formatCurrency(amount) {
        try {
            return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' VND';
        } catch (error) {
            return Math.round(amount).toLocaleString() + ' VND';
        }
    }

    /**
     * Handle search input changes - filter items by keywords
     */
    onSearchInputChange(event) {
        const searchTerm = event.target.value.toLowerCase().trim();
        this.filterItemsBySearch(searchTerm);
    }

    /**
     * Handle search input keydown events
     */
    onSearchKeydown(event) {
        if (event.key === 'Escape') {
            // Clear search on Escape
            event.target.value = '';
            this.filterItemsBySearch('');
        } else if (event.key === 'Enter') {
            // Prevent form submission, just perform search
            event.preventDefault();
        }
    }

    /**
     * Filter items by search term
     */
    filterItemsBySearch(searchTerm) {
        const itemGroups = this.itemVariablesContainer.querySelectorAll('.item-variables-group');
        const searchResultsInfo = this.itemVariablesContainer.querySelector('#searchResultsInfo');
        
        let visibleCount = 0;
        let highlightedItems = [];

        itemGroups.forEach(group => {
            const itemNo = group.dataset.itemNo;
            const item = this.quotationItems.find(item => 
                (item.item_no || '1') === itemNo
            );
            
            if (!item) {
                group.classList.add('search-hidden');
                group.classList.remove('search-visible');
                return;
            }

            const description = (item.company_requirement?.description || 
                               item.bidder_proposal?.description || 
                               'No description').toLowerCase();
            
            const itemNoLower = itemNo.toLowerCase();

            if (searchTerm === '') {
                // Show all items when search is empty
                group.classList.remove('search-hidden');
                group.classList.add('search-visible');
                this.removeSearchHighlights(group);
                visibleCount++;
            } else {
                // Search in description and item number
                const matchesDescription = description.includes(searchTerm);
                const matchesItemNo = itemNoLower.includes(searchTerm);
                
                if (matchesDescription || matchesItemNo) {
                    group.classList.remove('search-hidden');
                    group.classList.add('search-visible');
                    this.highlightSearchTerm(group, searchTerm);
                    visibleCount++;
                    highlightedItems.push(itemNo);
                } else {
                    group.classList.add('search-hidden');
                    group.classList.remove('search-visible');
                }
            }
        });

        // Update search results info
        if (searchResultsInfo) {
            if (searchTerm === '') {
                searchResultsInfo.textContent = `${this.quotationItems.length} items available`;
                searchResultsInfo.className = 'search-results-info';
            } else {
                searchResultsInfo.textContent = `${visibleCount} of ${this.quotationItems.length} items match "${searchTerm}"`;
                searchResultsInfo.className = visibleCount > 0 ? 'search-results-info highlighted' : 'search-results-info';
            }
        }

        // Scroll to first match if there are results
        if (visibleCount > 0 && searchTerm !== '') {
            const firstVisible = this.itemVariablesContainer.querySelector('.item-variables-group.search-visible');
            if (firstVisible) {
                firstVisible.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    /**
     * Highlight search term in item descriptions
     */
    highlightSearchTerm(group, searchTerm) {
        const itemHeader = group.querySelector('.item-header h5');
        if (!itemHeader) return;

        const originalText = itemHeader.dataset.originalText || itemHeader.textContent;
        if (!itemHeader.dataset.originalText) {
            itemHeader.dataset.originalText = originalText;
        }

        if (searchTerm === '') {
            itemHeader.innerHTML = originalText;
            return;
        }

        // Create highlighted version
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const highlightedText = originalText.replace(regex, '<span class="search-highlight">$1</span>');
        itemHeader.innerHTML = highlightedText;
    }

    /**
     * Remove search highlights from item group
     */
    removeSearchHighlights(group) {
        const itemHeader = group.querySelector('.item-header h5');
        if (!itemHeader || !itemHeader.dataset.originalText) return;

        itemHeader.innerHTML = itemHeader.dataset.originalText;
    }

    /**
     * Manage search bar visibility based on items availability
     */
    updateSearchBarVisibility() {
        const searchSection = this.itemVariablesContainer.querySelector('#itemSearchSection');
        
        if (!searchSection) return; // Search bar not present
        
        if (this.quotationItems.length > 0) {
            // Show search bar when items are available
            searchSection.classList.remove('search-bar-hidden');
            searchSection.classList.add('search-bar-visible');
            
            // Update search results info
            const searchResultsInfo = searchSection.querySelector('#searchResultsInfo');
            if (searchResultsInfo) {
                searchResultsInfo.textContent = `${this.quotationItems.length} items available`;
                searchResultsInfo.className = 'search-results-info';
            }
        } else {
            // Hide search bar when no items are available
            searchSection.classList.add('search-bar-hidden');
            searchSection.classList.remove('search-bar-visible');
        }
    }

    /**
     * Clear search input and reset filtering
     */
    clearSearch() {
        const searchInput = this.itemVariablesContainer.querySelector('#itemSearchInput');
        if (searchInput) {
            searchInput.value = '';
            this.filterItemsBySearch('');
        }
    }

    /**
     * Show update options on right-click of Apply button
     */
    showUpdateOptions(event) {
        event.preventDefault();
        
        // Create options menu
        const menu = document.createElement('div');
        menu.className = 'update-options-menu';
        menu.innerHTML = `
            <div style="background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 8px; min-width: 200px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <div style="font-size: 12px; color: #666; margin-bottom: 8px; padding: 4px 8px; border-bottom: 1px solid #eee;">Update Method</div>
                <button class="update-option api-update" style="width: 100%; padding: 8px 12px; margin: 2px 0; border: none; background: none; text-align: left; cursor: pointer; border-radius: 4px; font-size: 13px; transition: background 0.2s;" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background='none'">
                    🔄 Full API Recalculation
                    <div style="font-size: 11px; color: #666; margin-top: 2px;">Complete backend processing with Make.com</div>
                </button>
                <button class="update-option template-update" style="width: 100%; padding: 8px 12px; margin: 2px 0; border: none; background: none; text-align: left; cursor: pointer; border-radius: 4px; font-size: 13px; transition: background 0.2s;" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background='none'">
                    ⚡ Direct Template Update
                    <div style="font-size: 11px; color: #666; margin-top: 2px;">Fast local update without API call</div>
                </button>
                <button class="update-option cancel-update" style="width: 100%; padding: 8px 12px; margin: 2px 0; border: none; background: none; text-align: left; cursor: pointer; border-radius: 4px; font-size: 13px; color: #666; transition: background 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='none'">
                    ❌ Cancel
                </button>
            </div>
        `;
        
        // Position menu near the button
        const rect = event.target.getBoundingClientRect();
        menu.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.bottom + 5}px;
            z-index: 10000;
        `;
        
        document.body.appendChild(menu);
        
        // Add event listeners
        menu.querySelector('.api-update').addEventListener('click', () => {
            document.body.removeChild(menu);
            this.applyFormula(); // Regular API call
        });
        
        menu.querySelector('.template-update').addEventListener('click', async () => {
            document.body.removeChild(menu);
            const success = await this.updateTemplateDirectly();
            if (success) {
                this.updateProfitTable(); // Update local calculations too
            }
        });
        
        menu.querySelector('.cancel-update').addEventListener('click', () => {
            document.body.removeChild(menu);
        });
        
        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    }

    /**
     * Alternative to full API recalculation: Direct template value injection
     * This updates the existing template with calculated values without re-running the API
     */
    async updateTemplateDirectly() {
        try {
            // Check if we have a current template loaded
            if (!window.resultPreview || !window.resultPreview.currentFilename || !window.resultPreview.iframeRef) {
                throw new Error('No quotation template currently loaded for direct update');
            }

            const iframe = window.resultPreview.iframeRef;
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            
            if (!doc) {
                throw new Error('Cannot access iframe document for template update');
            }

            // Calculate new values using local data
            const allVariables = this.getAllItemVariables();
            let updatedCount = 0;

            // Update each item's pricing in the template
            this.quotationItems.forEach((item, index) => {
                const itemNo = item.item_no || (index + 1).toString();
                const variables = this.getItemVariables(itemNo);

                // Check if we have complete variables for this item
                const hasCompleteVars = variables.shipping_cost !== "" && 
                                      variables.tax_rate !== "" && 
                                      variables.exchange_rate !== "" && 
                                      variables.profit_rate !== "";

                if (hasCompleteVars) {
                    // Calculate the pricing locally
                    const calculatedPricing = this.calculateItemPricing(item, itemNo);
                    
                    // Find and update unit price and extended price in the template
                    const updated = this.updateItemPricingInTemplate(doc, itemNo, calculatedPricing);
                    if (updated) {
                        updatedCount++;
                    }
                }
            });

            if (updatedCount > 0) {
                // Save the updated template
                const updatedHTML = doc.documentElement.outerHTML;
                const response = await fetch('/api/save-quotation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: window.resultPreview.currentFilename,
                        html: updatedHTML
                    })
                });

                if (response.ok) {
                    console.log(`✅ Template updated directly with ${updatedCount} items`);
                    window.showNotification(`✅ Template updated directly (${updatedCount} items)`, 'success');
                    
                    // Refresh the display to show changes
                    iframe.contentWindow.location.reload();
                    return true;
                } else {
                    throw new Error(`Failed to save updated template: ${response.status}`);
                }
            } else {
                throw new Error('No items with complete pricing variables found for template update');
            }

        } catch (error) {
            console.error('❌ Error in direct template update:', error);
            window.showNotification(`❌ Direct update failed: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Calculate pricing for a single item (similar to calculateItemPotentialProfit but returns all values)
     */
    calculateItemPricing(item, itemNo) {
        const unitPrice = this.extractUnitPrice(item);
        const qty = item.company_requirement?.qty || 0;
        const variables = this.getItemVariables(itemNo);

        // Clean formatted values using unified parser
        const shippingCost = this.parseFormattedNumber(variables.shipping_cost) || 0;
        const taxRate = this.parseFormattedNumber(variables.tax_rate) || 1;
        const exchangeRate = this.parseFormattedNumber(variables.exchange_rate) || 1;
        const profitRate = this.parseFormattedNumber(variables.profit_rate) || 1;
        const discountRate = this.parseFormattedNumber(variables.discount_rate) || 0;

        // Calculate step by step
        const step1 = unitPrice + shippingCost;
        const step2 = step1 * taxRate;
        const actualUnitPrice = step2 * exchangeRate;
        const profitUnitPrice = actualUnitPrice * profitRate;
        const discountAmount = profitUnitPrice * discountRate;
        const salesUnitPrice = profitUnitPrice - discountAmount;
        const extPrice = salesUnitPrice * qty;

        return {
            sales_unit_price: salesUnitPrice,
            ext_price: extPrice,
            actual_unit_price: actualUnitPrice,
            profit_unit_price: profitUnitPrice
        };
    }

    /**
     * Update item pricing values in the template DOM
     */
    updateItemPricingInTemplate(doc, itemNo, pricing) {
        try {
            // Look for pricing elements that might contain the item values
            // Common patterns: data-item, class names with item numbers, table rows, etc.
            const possibleSelectors = [
                `[data-item="${itemNo}"]`,
                `[data-item-no="${itemNo}"]`,
                `.item-${itemNo}`,
                `#item-${itemNo}`,
                `tr[data-item="${itemNo}"]`
            ];

            let updated = false;

            possibleSelectors.forEach(selector => {
                const elements = doc.querySelectorAll(selector);
                elements.forEach(element => {
                    // Look for unit price and ext price fields within this element
                    const unitPriceElements = element.querySelectorAll('.unit-price, .sales-unit-price, [data-field="unit_price"]');
                    const extPriceElements = element.querySelectorAll('.ext-price, .total-price, [data-field="ext_price"]');

                    unitPriceElements.forEach(el => {
                        el.textContent = this.formatCurrency(pricing.sales_unit_price);
                        updated = true;
                    });

                    extPriceElements.forEach(el => {
                        el.textContent = this.formatCurrency(pricing.ext_price);
                        updated = true;
                    });
                });
            });

            // If specific selectors didn't work, try a more general approach
            if (!updated) {
                // Look for table rows and try to identify by item number in first column
                const tableRows = doc.querySelectorAll('table tr');
                tableRows.forEach(row => {
                    const firstCell = row.querySelector('td:first-child');
                    if (firstCell && firstCell.textContent.trim() === itemNo) {
                        // Assume unit price is in 4th column, ext price in 5th (common table structure)
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 4) {
                            cells[3].textContent = this.formatCurrency(pricing.sales_unit_price);
                            updated = true;
                        }
                        if (cells.length >= 5) {
                            cells[4].textContent = this.formatCurrency(pricing.ext_price);
                            updated = true;
                        }
                    }
                });
            }

            return updated;
        } catch (error) {
            console.error(`❌ Error updating template for item ${itemNo}:`, error);
            return false;
        }
    }

    /**
     * Update warning box visibility based on pricing data
     */
    updateWarningBoxVisibility() {
        if (!this.pricingWarningBox) {
            console.log('⚠️ Warning box element not found in DOM');
            return;
        }

        let hasEmptyPrices = false;

        // Check if any item has zero or empty unit_price or ext_price
        if (this.quotationItems && this.quotationItems.length > 0) {
            console.log('🔍 Checking pricing data for warning box visibility...');
            
            hasEmptyPrices = this.quotationItems.some(item => {
                const unitPrice = this.extractUnitPrice(item);
                const extPrice = item.bidder_proposal?.ext_price_vnd || 
                               item.bidder_proposal?.ext_price || 0;
                
                console.log(`Item ${item.item_no || 'unknown'}: unitPrice=${unitPrice}, extPrice=${extPrice}`);
                
                return unitPrice <= 0 || extPrice <= 0;
            });
            
            console.log(`📊 Has empty prices: ${hasEmptyPrices}`);
        } else {
            // No items loaded = show warning
            hasEmptyPrices = true;
            console.log('📊 No quotation items loaded - showing warning');
        }

        // Show/hide warning box with visual confirmation
        if (hasEmptyPrices) {
            this.pricingWarningBox.style.display = 'flex';
            this.pricingWarningBox.style.backgroundColor = '#fff3cd';
            this.pricingWarningBox.style.border = '1px solid #ffeaa7';
            console.log('⚠️ Warning box shown - empty pricing detected');
        } else {
            this.pricingWarningBox.style.display = 'none';
            console.log('✅ Warning box hidden - all prices filled');
        }
    }

    /**
     * Public method to be called when quotation data is loaded
     */
    onQuotationDataUpdated(quotationData) {
        // Skip profit table updates during recalculation to prevent competing UI updates
        if (this.isRecalculating) {
            console.log('🔄 Skipping quotation data update during recalculation to preserve calculated profit values');
            return;
        }
        
        this.loadQuotationData(quotationData);
    }

    /**
     * Create test quotation data for debugging
     */
    createTestQuotationData() {
        return {
            quotation_items: [
                {
                    item_no: "1",
                    company_requirement: {
                        description: "Test Product 1",
                        qty: 10
                    },
                    bidder_proposal: {
                        unit_price: 1000,
                        description: "Test Product 1 Proposal"
                    },
                    currency_code: "VND"
                },
                {
                    item_no: "2", 
                    company_requirement: {
                        description: "Test Product 2",
                        qty: 5
                    },
                    bidder_proposal: {
                        unit_price: 2000,
                        description: "Test Product 2 Proposal"
                    },
                    currency_code: "USD"
                }
            ]
        };
    }

    /**
     * Load test data for debugging - call this from browser console
     */
    loadTestData() {
        const testData = this.createTestQuotationData();
        console.log('🧪 Loading test data:', testData);
        this.loadQuotationData(testData);
        
        // Also make it globally accessible for preview panel
        if (window.resultPreview) {
            window.resultPreview.currentQuotationData = {
                quotationData: testData,
                sessionId: 'test_session_' + Date.now()
            };
        }
    }

    /**
     * UNIFIED FORMULA VARIABLE RELOADING ENGINE
     * 6-Step Aspire Reloading Engine for Formula Variables in Quotations
     * Consolidates all variable reloading methods into one unified approach
     */
    async reloadFormulaVariables() {
        let currentStep = 'INITIALIZATION';
        try {
            console.log('🚀 Starting Unified Formula Variable Reloading Engine...');
            
            // STEP 1: DETECTION - Check if quotation is displayed or being loaded on quotation-preview panel
            currentStep = 'STEP 1: DETECTION';
            console.log('🔍 STEP 1: Enhanced Detection - Checking quotation display status...');
            
            // Enhanced detection logic: Check multiple indicators for quotation readiness
            const isQuotationReady = (
                (window.resultPreview?.isShowingFullQuotation) ||
                (window.resultPreview?.currentFilename) ||
                (this.quotationItems && this.quotationItems.length > 0)
            );
            
            if (!isQuotationReady) {
                console.log('⚠️ No quotation ready for variable reloading');
                console.log('📊 Detection Status:', {
                    hasResultPreview: !!window.resultPreview,
                    isShowingFullQuotation: window.resultPreview?.isShowingFullQuotation,
                    hasCurrentFilename: !!window.resultPreview?.currentFilename,
                    hasQuotationItems: this.quotationItems?.length > 0
                });
                
                // More forgiving approach: Try to proceed if we have quotation items
                if (this.quotationItems && this.quotationItems.length > 0) {
                    console.log('🎯 Proceeding with variable reloading based on available quotation items');
                } else {
                    window.showNotification('⚠️ No quotation ready for variable reloading', 'warning');
                    return false;
                }
            }
            console.log('✅ STEP 1 Complete: Quotation detected and ready for variable reloading');
            
            // STEP 2: METADATA FETCH - Get CURRENT quotation's data filename (not always latest.json)
            currentStep = 'STEP 2: METADATA FETCH';
            console.log('📁 STEP 2: Metadata Fetch - Determining current quotation data filename...');
            let currentDataFilename = null;
            
            try {
                // FIXED: Use current quotation context instead of always using latest.json
                if (window.resultPreview && window.resultPreview.currentFilename) {
                    const currentHtmlFilename = window.resultPreview.currentFilename;
                    console.log('📁 Current quotation filename:', currentHtmlFilename);
                    
                    // Extract base filename from HTML filename
                    const baseFilename = currentHtmlFilename
                        .replace(/\.html$/, '')  // Remove .html extension
                        .replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '');  // Remove timestamp
                    
                    currentDataFilename = `${baseFilename}_data.json`;
                    console.log('📊 Using current quotation data filename:', currentDataFilename);
                } else {
                    console.log('⚠️ No current quotation context, falling back to latest.json...');
                    
                    // Fallback: only use latest.json if absolutely no current quotation context
                    const latestResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/latest.json`);
                    if (!latestResponse.ok) {
                        throw new Error(`HTTP ${latestResponse.status}: ${latestResponse.statusText}`);
                    }
                    const latestData = await latestResponse.json();
                    currentDataFilename = latestData.data_filename;
                    console.log('📁 Using latest.json fallback filename:', currentDataFilename);
                }
                
                if (!currentDataFilename) {
                    throw new Error('No data filename could be determined');
                }
                
                console.log('✅ STEP 2 Complete: Data filename determined:', currentDataFilename);
            } catch (error) {
                console.error('❌ STEP 2 Failed: Metadata fetch error:', error);
                window.showNotification('❌ Failed to access quotation metadata', 'error');
                return false;
            }
            
            // STEP 3: DATA FETCH - Load actual quotation data file from /assets/generated/
            currentStep = 'STEP 3: DATA FETCH';
            console.log('💾 STEP 3: Data Fetch - Loading quotation data file...');
            const dataFilename = currentDataFilename;
            if (!dataFilename) {
                console.error('❌ STEP 3 Failed: No data filename determined');
                window.showNotification('❌ Quotation data filename not found', 'error');
                return false;
            }
            
            let quotationData;
            try {
                const dataResponse = await fetch(`${window.CONFIG.API_BASE}/assets/generated/${dataFilename}`);
                if (!dataResponse.ok) {
                    throw new Error(`HTTP ${dataResponse.status}: ${dataResponse.statusText}`);
                }
                quotationData = await dataResponse.json();
                console.log('✅ STEP 3 Complete: Quotation data loaded from', dataFilename);
            } catch (error) {
                console.error(`❌ STEP 3 Failed: Data fetch error for ${dataFilename}:`, error);
                window.showNotification(`❌ Failed to load quotation data`, 'error');
                return false;
            }
            
            // STEP 4: VARIABLE EXTRACTION - Extract pricing_variables section from quotation data
            currentStep = 'STEP 4: VARIABLE EXTRACTION';
            console.log('🎯 STEP 4: Variable Extraction - Extracting pricing_variables section...');
            const pricingVariables = quotationData.pricing_variables;
            if (!pricingVariables || typeof pricingVariables !== 'object') {
                console.log('ℹ️ STEP 4 Result: No pricing variables found in quotation data');
                window.showNotification('ℹ️ No saved pricing variables to reload', 'info');
                return true; // Not an error, just no data to load
            }
            
            console.log('✅ STEP 4 Complete: Variables extracted:', {
                hasFormatVersion: !!pricingVariables.format_version,
                hasPerItem: !!pricingVariables.per_item,
                hasGlobalFallback: !!pricingVariables.global_fallback,
                keys: Object.keys(pricingVariables)
            });
            
            // STEP 5: FORMAT DETECTION - Support v2.0 per-item, v2.0 global, and legacy formats
            currentStep = 'STEP 5: FORMAT DETECTION';
            console.log('🔧 STEP 5: Format Detection - Analyzing variable format...');
            let targetVariables = null;
            let loadingMethod = 'unknown';
            
            // FORMAT 1: v2.0 per-item format (highest priority)
            if (pricingVariables.format_version === "2.0" && pricingVariables.per_item) {
                targetVariables = pricingVariables.per_item;
                loadingMethod = 'v2.0-per-item';
                console.log('🎯 Format detected: v2.0 per-item format');
            }
            // FORMAT 2: v2.0 global fallback format
            else if (pricingVariables.format_version === "2.0" && pricingVariables.global_fallback) {
                targetVariables = pricingVariables.global_fallback;
                loadingMethod = 'v2.0-global-fallback';
                console.log('🔄 Format detected: v2.0 global fallback format');
            }
            // FORMAT 3: Legacy format (backward compatibility)
            else if (pricingVariables.shipping_cost !== undefined || pricingVariables.tax_rate !== undefined) {
                targetVariables = pricingVariables;
                loadingMethod = 'legacy-global';
                console.log('📜 Format detected: Legacy global format');
            }
            // FORMAT 4: Current per-item format (missing v2.0 wrapper)
            else if (typeof pricingVariables === 'object' && 
                     Object.keys(pricingVariables).some(key => 
                       /^\d+$/.test(key) && pricingVariables[key] && 
                       typeof pricingVariables[key] === 'object' &&
                       pricingVariables[key].shipping_cost !== undefined)) {
                targetVariables = pricingVariables;
                loadingMethod = 'current-per-item';
                console.log('🔧 Format detected: Current per-item format');
            }
            else {
                console.warn('❌ STEP 5 Failed: No valid format detected');
                window.showNotification('⚠️ Unrecognized pricing variable format', 'warning');
                return false;
            }
            
            console.log(`✅ STEP 5 Complete: Format detection successful (${loadingMethod})`);
            
            // STEP 6: UI POPULATION - Update all form inputs with saved variable values
            currentStep = 'STEP 6: UI POPULATION';
            console.log('🎨 STEP 6: UI Population - Updating form inputs with saved values...');
            
            // ENHANCED: Ensure UI is ready for variable loading with robust coordination
            if (this.quotationItems && this.quotationItems.length > 0) {
                const currentItemCount = this.quotationItems.length;
                const existingInputCount = this.itemVariablesContainer?.querySelectorAll('.item-variables-row')?.length || 0;
                
                if (currentItemCount !== existingInputCount) {
                    console.log(`🔄 UI Regeneration Required: ${existingInputCount} → ${currentItemCount} items`);
                    this.generateItemVariableInputs();
                    
                    // Enhanced timing coordination: Wait longer for complex UI updates
                    await new Promise(resolve => setTimeout(resolve, 150));
                    
                    // Verify UI elements are actually created and accessible
                    const verifyInputCount = this.itemVariablesContainer?.querySelectorAll('.item-variables-row')?.length || 0;
                    if (verifyInputCount !== currentItemCount) {
                        console.warn(`⚠️ UI Generation Issue: Expected ${currentItemCount} but found ${verifyInputCount} input rows`);
                        // Allow more time for complex UI rendering
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } else {
                    console.log(`✅ UI Already Ready: ${currentItemCount} items with matching input count`);
                }
            } else {
                console.warn('⚠️ No quotation items available for UI preparation');
            }
            
            let populatedVariableCount = 0;
            const variableTypes = ['shipping_cost', 'tax_rate', 'exchange_rate', 'profit_rate', 'discount_rate'];
            
            if (loadingMethod === 'v2.0-per-item') {
                // Per-item variable population
                this.quotationItems.forEach((item, index) => {
                    const itemNo = item.item_no || (index + 1).toString();
                    const itemVariables = targetVariables[itemNo];
                    
                    if (itemVariables) {
                        console.log(`💾 Populating item ${itemNo} with saved variables:`, itemVariables);
                        variableTypes.forEach(varType => {
                            const value = itemVariables[varType];
                            if (value !== undefined && value !== null) {
                                this.setItemVariableValue(itemNo, varType, value);
                                populatedVariableCount++;
                            }
                        });
                    } else {
                        // Apply defaults for items without saved data
                        console.log(`⚙️ Applying defaults for item ${itemNo}`);
                        this.setItemVariableValue(itemNo, 'shipping_cost', 0);
                        this.setItemVariableValue(itemNo, 'tax_rate', 1.1);
                        this.setItemVariableValue(itemNo, 'exchange_rate', 1);
                        this.setItemVariableValue(itemNo, 'profit_rate', 1.25);
                        this.setItemVariableValue(itemNo, 'discount_rate', 0);
                    }
                });
            } else {
                // Global variable population (for v2.0-global-fallback and legacy-global)
                console.log('🌐 Applying global variables to all items:', targetVariables);
                this.quotationItems.forEach((item, index) => {
                    const itemNo = item.item_no || (index + 1).toString();
                    
                    variableTypes.forEach(varType => {
                        const value = targetVariables[varType];
                        const defaultValue = {
                            'shipping_cost': 0,
                            'tax_rate': 1.1,
                            'exchange_rate': 1,
                            'profit_rate': 1.25,
                            'discount_rate': 0
                        }[varType];
                        
                        this.setItemVariableValue(itemNo, varType, value ?? defaultValue);
                        if (value !== undefined && value !== null) {
                            populatedVariableCount++;
                        }
                    });
                });
            }
            
            // Update currency and UI elements
            this.updateGlobalCurrencyFromVariables(targetVariables);
            // Note: Profit table will be updated after this method completes in loadQuotationData()
            
            console.log('✅ STEP 6 Complete: UI population successful');
            console.log(`📊 Reloading Statistics: ${populatedVariableCount} variables populated across ${this.quotationItems.length} items using ${loadingMethod} method`);
            
            // Success notification and visual feedback
            window.showNotification(`✅ Formula variables reloaded (${this.quotationItems.length} items, ${loadingMethod})`, 'success');
            
            setTimeout(() => {
                this.highlightLoadedVariables();
            }, 500);
            
            // OPTIMAL FIX: Always recalculate profit after successful variable loading
            console.log('🔄 Auto-recalculating profit potential values after variable reload...');
            this.updateProfitTable();
            console.log('✅ Profit potential values updated automatically');
            
            // Update global variables only if variables were actually loaded
            this.updateGlobalVariables();
            
            console.log('🎉 Unified Formula Variable Reloading Engine completed successfully!');
            return true;
            
        } catch (error) {
            console.error(`💥 Unified Reloading Engine Error in ${currentStep}:`, error);
            
            // Enhanced error messaging based on current step
            let errorMessage = 'Unknown error in formula variable reloading engine';
            let userGuidance = '';
            
            switch (currentStep) {
                case 'INITIALIZATION':
                    errorMessage = 'Failed to initialize formula variable reloading engine';
                    userGuidance = 'Please refresh the page and try again';
                    break;
                case 'STEP 1: DETECTION':
                    errorMessage = 'Unable to detect quotation readiness for variable loading';
                    userGuidance = 'Ensure a quotation is properly loaded in the preview panel';
                    break;
                case 'STEP 2: METADATA FETCH':
                    errorMessage = 'Failed to fetch quotation metadata';
                    userGuidance = 'Check network connection and ensure quotation files are available';
                    break;
                case 'STEP 3: DATA FETCH':
                    errorMessage = 'Failed to load quotation data file';
                    userGuidance = 'The quotation data file may be missing or corrupted';
                    break;
                case 'STEP 4: VARIABLE EXTRACTION':
                    errorMessage = 'Unable to extract pricing variables from quotation data';
                    userGuidance = 'The quotation data may not contain saved pricing variables';
                    break;
                case 'STEP 5: FORMAT DETECTION':
                    errorMessage = 'Could not detect pricing variable format';
                    userGuidance = 'The saved variable format may be incompatible';
                    break;
                case 'STEP 6: UI POPULATION':
                    errorMessage = 'Failed to populate UI with pricing variables';
                    userGuidance = 'UI elements may not be ready - try again in a few seconds';
                    break;
                default:
                    errorMessage = 'Unexpected error in formula variable reloading engine';
                    userGuidance = 'Please contact support if this issue persists';
            }
            
            // Display user-friendly error with step context
            window.showNotification(`❌ ${errorMessage}`, 'error');
            
            // Log technical details for debugging
            console.error(`🔧 Error Context:`, {
                step: currentStep,
                message: errorMessage,
                guidance: userGuidance,
                error: error.message,
                stack: error.stack
            });
            
            // Additional guidance notification after a short delay
            if (userGuidance) {
                setTimeout(() => {
                    window.showNotification(`💡 Suggestion: ${userGuidance}`, 'info');
                }, 2000);
            }
            
            return false;
        }
    }

    /**
     * LEGACY METHODS (Deprecated - use reloadFormulaVariables() instead)
     * These methods are kept for backward compatibility but will be removed in future versions
     */
    
    // Legacy method 1: Direct loading from memory (deprecated)
    async loadSavedPricingVariables(pricingVariables) {
        console.warn('⚠️ loadSavedPricingVariables() is deprecated. Use reloadFormulaVariables() instead.');
        if (!pricingVariables || typeof pricingVariables !== 'object') {
            return this.reloadFormulaVariables();
        }
        // For backward compatibility, simulate the new unified approach
        return this.reloadFormulaVariables();
    }

    // Legacy method 2: Manual reload from current quotation (deprecated)
    async reloadCurrentQuotationFormulaVariables() {
        console.warn('⚠️ reloadCurrentQuotationFormulaVariables() is deprecated. Use reloadFormulaVariables() instead.');
        return this.reloadFormulaVariables();
    }

    /**
     * Highlight recently loaded variables for visual feedback
     * Provides user indication that variables were auto-populated during quotation switching
     */
    highlightLoadedVariables() {
        try {
            const variableInputs = this.itemVariablesContainer.querySelectorAll('input[data-item]');
            
            variableInputs.forEach(input => {
                if (input.value && input.value !== '' && input.value !== '0') {
                    // Add highlight effect
                    input.style.backgroundColor = '#e8f4fd';
                    input.style.borderColor = '#007bff';
                    input.style.transition = 'all 0.3s ease';
                    
                    // Remove highlight after animation
                    setTimeout(() => {
                        input.style.backgroundColor = '';
                        input.style.borderColor = '';
                        input.style.transition = '';
                    }, 2000);
                }
            });
            
            console.log('✨ Applied highlight effect to loaded variables');
            
        } catch (error) {
            console.warn('⚠️ Could not highlight loaded variables:', error);
        }
    }

    /**
     * Apply global variables to all items (legacy support)
     * @param {Object} globalVariables - Global variable values
     */
    applyGlobalVariablesToAllItems(globalVariables) {
        this.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            
            this.setItemVariableValue(itemNo, 'shipping_cost', globalVariables.shipping_cost || 0);
            this.setItemVariableValue(itemNo, 'tax_rate', globalVariables.tax_rate || 1.1);
            this.setItemVariableValue(itemNo, 'exchange_rate', globalVariables.exchange_rate || 1);
            this.setItemVariableValue(itemNo, 'profit_rate', globalVariables.profit_rate || 1.25);
            this.setItemVariableValue(itemNo, 'discount_rate', globalVariables.discount_rate || 0);
            
            console.log(`💾 Applied global variables to item ${itemNo}`);
        });
    }

    /**
     * Update global currency selection based on variable heuristics (preserved logic)
     * @param {Object} variables - Variable object containing exchange_rate
     */
    updateGlobalCurrencyFromVariables(variables) {
        // Use first item's variables for global currency detection
        const exchangeRate = variables.exchange_rate || (variables[Object.keys(variables)[0]]?.exchange_rate);
        
        if (exchangeRate && this.availableCurrencies.size > 0) {
            if (exchangeRate > 10000) {
                this.selectedTargetCurrency = 'VND';
            } else if (exchangeRate < 2) {
                const firstCurrency = Array.from(this.availableCurrencies)[0];
                this.selectedTargetCurrency = firstCurrency || 'VND';
            }
            this.saveTargetCurrency();
            this.updateGlobalCurrencyDisplay();
        }
    }

    /**
     * Enhanced set item variable with proper UI coordination
     * @param {string} itemNo - Item number
     * @param {string} variableType - Variable type
     * @param {*} value - Variable value
     */
    setItemVariableValue(itemNo, variableType, value) {
        // Update internal storage
        if (!this.itemVariables.has(itemNo)) {
            this.itemVariables.set(itemNo, this.getDefaultItemVariables());
        }
        
        const itemVars = this.itemVariables.get(itemNo);
        itemVars[variableType] = value;
        
        // Update UI input elements
        const inputSelector = `.${variableType.replace('_', '-')}[data-item="${itemNo}"]`;
        const inputElement = this.itemVariablesContainer.querySelector(inputSelector);
        
        if (inputElement) {
            if (variableType === 'discount_rate' && typeof value === 'number') {
                // Convert decimal to percentage for display
                inputElement.value = (value * 100).toString();
            } else if ((variableType === 'shipping_cost' || variableType === 'exchange_rate') && typeof value === 'number') {
                // Apply number formatting for large values
                const formatted = new Intl.NumberFormat('vi-VN').format(value);
                inputElement.value = formatted;
                inputElement.dataset.rawValue = value.toString();
            } else {
                inputElement.value = value?.toString() || '';
            }
        }
        
        // Save to localStorage
        this.saveVariables();
    }

    /**
     * Set a specific variable for a specific item
     * @param {number} itemNo - Item number (1-based)
     * @param {string} variableType - Type of variable (shipping_cost, tax_rate, etc.)
     * @param {number|string} value - Value to set
     */
    setItemVariable(itemNo, variableType, value) {
        try {
            const inputId = `${variableType}_${itemNo}`;
            const inputElement = document.getElementById(inputId);
            
            if (inputElement) {
                // Handle formatted inputs (with commas)
                if (variableType === 'shipping_cost' && typeof value === 'number') {
                    inputElement.value = value.toLocaleString();
                } else {
                    inputElement.value = value;
                }
                
                // Update internal storage
                if (!this.itemVariables.has(itemNo)) {
                    this.itemVariables.set(itemNo, {});
                }
                this.itemVariables.get(itemNo)[variableType] = value;
                
                console.log(`🔧 Set ${variableType} for item ${itemNo}: ${value}`);
            } else {
                console.warn(`⚠️ Input element not found: ${inputId}`);
            }
        } catch (error) {
            console.error(`❌ Error setting ${variableType} for item ${itemNo}:`, error);
        }
    }

    /**
     * CRITICAL FIX: Display complete API response in expected output format
     * Shows all components: quotation_data, calculated_pricing, preview_data, etc.
     * @param {Object} apiResponse - Complete API response from quotation-generation endpoint
     */
    displayCompleteAPIResponse(apiResponse) {
        try {
            console.log('🎯 ===== DISPLAYING COMPLETE API RESPONSE IN EXPECTED FORMAT =====');
            
            // Create the complete response structure that matches expected_output_formula.json
            const completeResponse = {
                success: apiResponse.success || true,
                action_type: apiResponse.action_type || 'update',
                status: apiResponse.status || 'completed',
                session_id: apiResponse.session_id,
                processing_time_ms: apiResponse.processing_time_ms,
                workflow_info: apiResponse.workflow_info || {
                    action_performed: apiResponse.action_type || 'update',
                    current_status: apiResponse.status || 'completed',
                    items_processed: apiResponse.quotation_data?.quotation_items?.length || 0,
                    auto_calculation_triggered: !!apiResponse.calculated_pricing
                },
                quotation_data: apiResponse.quotation_data,
                calculated_pricing: apiResponse.calculated_pricing,
                preview_data: apiResponse.preview_data,
                generated_files: apiResponse.generated_files,
                session_data: apiResponse.session_data,
                timestamp: apiResponse.timestamp || new Date().toISOString()
            };

            // Enhanced logging with detailed breakdown
            console.log('✅ COMPLETE API RESPONSE (Expected Format):');
            console.log(JSON.stringify(completeResponse, null, 2));
            
            // Show specific components that were missing in current_output_formula.json
            if (completeResponse.calculated_pricing) {
                console.log('🧮 CALCULATION DETAILS:');
                console.log('- Total Items Processed:', completeResponse.calculated_pricing.total_items);
                console.log('- Pricing Summary:', completeResponse.calculated_pricing.pricing_summary);
                
                if (completeResponse.calculated_pricing.processed_items) {
                    console.log('📊 PER-ITEM CALCULATION STEPS:');
                    completeResponse.calculated_pricing.processed_items.forEach((item, index) => {
                        console.log(`Item ${item.item_no}:`, {
                            original_price: item.original_unit_price,
                            final_price: item.sales_unit_price,
                            extended_price: item.ext_price,
                            calculation_steps: item.calculation_steps
                        });
                    });
                }

                if (completeResponse.calculated_pricing.calculation_metadata) {
                    console.log('📋 CALCULATION METADATA:');
                    console.log('- Formula Used:', completeResponse.calculated_pricing.calculation_metadata.formula_used);
                    console.log('- Variables Applied:', completeResponse.calculated_pricing.calculation_metadata.variables_applied);
                    console.log('- Calculation Engine:', completeResponse.calculated_pricing.calculation_metadata.calculation_engine);
                }
            }

            if (completeResponse.preview_data) {
                console.log('👀 PREVIEW DATA (for UI):');
                console.log('- Items Count:', completeResponse.preview_data.items?.length || 0);
                console.log('- Total Amount:', completeResponse.preview_data.pricing_summary?.formatted_total);
            }

            if (completeResponse.generated_files) {
                console.log('📄 GENERATED FILES:');
                Object.keys(completeResponse.generated_files).forEach(fileType => {
                    if (completeResponse.generated_files[fileType] && typeof completeResponse.generated_files[fileType] === 'object') {
                        console.log(`- ${fileType.toUpperCase()}:`, completeResponse.generated_files[fileType].filename, 
                                  '| Status:', completeResponse.generated_files[fileType].status);
                    }
                });
            }

            // Store the complete response globally for easy access
            window.lastCompleteAPIResponse = completeResponse;
            console.log('💾 Complete response stored in window.lastCompleteAPIResponse for inspection');

            // Show user-friendly notification
            const itemsCount = completeResponse.calculated_pricing?.total_items || 0;
            const totalAmount = completeResponse.calculated_pricing?.pricing_summary?.formatted_subtotal || 
                              completeResponse.preview_data?.pricing_summary?.formatted_total || 'N/A';
            
            console.log(`🎉 SUMMARY: Processed ${itemsCount} items, Total: ${totalAmount}`);
            console.log('🎯 ===== END COMPLETE API RESPONSE DISPLAY =====');
            
            // Also trigger any additional UI updates based on the complete response
            this.handleCompleteResponseUIUpdates(completeResponse);

        } catch (error) {
            console.error('❌ Error displaying complete API response:', error);
            console.log('📊 Raw API response for debugging:', apiResponse);
        }
    }

    /**
     * Handle UI updates based on the complete API response
     * @param {Object} completeResponse - The complete formatted response
     */
    handleCompleteResponseUIUpdates(completeResponse) {
        try {
            // Update profit table with calculated data if available
            if (completeResponse.calculated_pricing?.processed_items) {
                this.updateProfitTableWithCalculatedData(completeResponse.calculated_pricing.processed_items);
            }

            // Trigger any additional UI component updates
            if (window.resultPreview && completeResponse.preview_data) {
                // This ensures the quotation preview gets the complete data structure
                window.resultPreview.handleQuotationGenerated({
                    data: completeResponse
                }).catch(error => {
                    console.error('❌ Error updating result preview with complete response:', error);
                });
            }

        } catch (error) {
            console.error('❌ Error in handleCompleteResponseUIUpdates:', error);
        }
    }

    /**
     * Update profit table with calculated pricing data from API response
     * @param {Array} calculatedItems - Array of calculated item pricing from API
     */
    updateProfitTableWithCalculatedData(calculatedItems) {
        try {
            console.log('🔄 Updating profit table with calculated data from API response');
            
            calculatedItems.forEach(calculatedItem => {
                const itemNo = calculatedItem.item_no;
                const row = document.querySelector(`#profitTableBody tr[data-item="${itemNo}"]`);
                
                if (row) {
                    // Update calculated prices in the table
                    const unitPriceCell = row.querySelector('.calculated-unit-price');
                    const extPriceCell = row.querySelector('.calculated-ext-price');
                    const profitCell = row.querySelector('.profit-amount');
                    
                    if (unitPriceCell) {
                        unitPriceCell.textContent = this.formatCurrency(calculatedItem.sales_unit_price);
                    }
                    if (extPriceCell) {
                        extPriceCell.textContent = this.formatCurrency(calculatedItem.ext_price);
                    }
                    if (profitCell) {
                        const profit = calculatedItem.sales_unit_price - calculatedItem.original_unit_price;
                        profitCell.textContent = this.formatCurrency(profit);
                    }

                    // Add visual indicator for updated rows
                    row.style.backgroundColor = '#e8f5e8';
                    setTimeout(() => {
                        row.style.backgroundColor = '';
                    }, 2000);
                }
            });
            
        } catch (error) {
            console.error('❌ Error updating profit table with calculated data:', error);
        }
    }
}

// Make loadTestData globally accessible for debugging
window.loadFormulaTestData = function() {
    if (window.formulaInput) {
        window.formulaInput.loadTestData();
    } else {
        console.error('Formula input panel not available');
    }
};