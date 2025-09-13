/**
 * DataLoader.js
 * Data loading and quotation processing functionality for Formula Input Panel
 */

export class DataLoader {
    constructor(coreInstance) {
        this.core = coreInstance;
    }

    /**
     * Load quotation data and generate per-item input rows
     * @param {Object} quotationData - Quotation data from the system
     */
    loadQuotationData(quotationData) {
        console.log('🧮 Loading quotation data for pricing variables:', quotationData);
        
        // ENHANCED FIX: Only clear variables if switching to a different quotation
        const currentQuotationId = this.core.getCurrentQuotationId(quotationData);
        const previousQuotationId = this.core.lastLoadedQuotationId || null;
        
        if (currentQuotationId !== previousQuotationId) {
            console.log(`🔄 Switching quotations (${previousQuotationId} → ${currentQuotationId})`);
            
            // CRITICAL FIX: Only clear variables if no saved data will be loaded
            if (!this.core.willLoadSavedVariables) {
                console.log('🧼 Clearing variables for clean state (no saved data to restore)');
                this.core.itemVariables.clear();
            } else {
                console.log('💾 Preserving variables - saved data will be restored shortly');
            }
            
            this.core.lastLoadedQuotationId = currentQuotationId;
        } else {
            console.log(`💾 Same quotation detected (${currentQuotationId}) - preserving existing formula variables`);
        }
        
        if (!quotationData?.quotation_items || !Array.isArray(quotationData.quotation_items)) {
            console.log('❌ No valid quotation items found');
            this.showNoItemsMessage();
            this.updateWarningBoxVisibility(); // Show warning when no data
            return;
        }

        this.core.quotationItems = quotationData.quotation_items;
        console.log('📊 Loaded quotation items:', this.core.quotationItems.length);
        
        // Debug each item's structure
        this.core.quotationItems.forEach((item, index) => {
            const unitPrice = this.core.extractUnitPrice(item);
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
        this.updateProfitTable();
        
        // Always update warning box after loading new data
        setTimeout(() => {
            this.updateWarningBoxVisibility();
        }, 100);
    }

    /**
     * Extract all unique currency_code values from items
     */
    extractCurrencyCodes() {
        this.core.availableCurrencies.clear();
        
        this.core.quotationItems.forEach(item => {
            const currencyCode = item.currency_code || item.bidder_proposal?.currency_code;
            if (currencyCode) {
                this.core.availableCurrencies.add(currencyCode);
            } else {
                // Default to VND if no currency_code specified
                this.core.availableCurrencies.add('VND');
            }
        });

        console.log('💰 Extracted currencies:', Array.from(this.core.availableCurrencies));
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
                this.core.itemVariables.clear();
                
                // Load variables for each item
                Object.keys(variablesApplied).forEach(itemNo => {
                    const variables = variablesApplied[itemNo];
                    console.log(`📊 Loading variables for item ${itemNo}:`, variables);
                    
                    // Set default values based on calculated data
                    this.core.itemVariables.set(itemNo, {
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
                    
                    this.core.itemVariables.set(itemNo, {
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
            }
            
        } catch (error) {
            console.error('❌ Error loading latest quotation data for display:', error);
        }
    }

    /**
     * Handle quotation data updated event from SSE
     * @param {Object} quotationData - Updated quotation data
     */
    onQuotationDataUpdated(quotationData) {
        // Skip updates when recalculating to prevent competing UI updates
        if (this.core.isRecalculating) {
            console.log('🚫 Skipping quotation data update during recalculation to prevent UI conflicts');
            return;
        }
        
        console.log('🔄 Quotation data updated via SSE, reloading...');
        this.loadQuotationData(quotationData);
    }

    // Reference methods that will be implemented in other modules
    // These are called from this module but implemented elsewhere
    showNoItemsMessage() {
        // Implemented in UIRenderer
        if (this.showNoItemsMessage) {
            return this.showNoItemsMessage();
        }
    }

    updateWarningBoxVisibility() {
        // Implemented in ValidationHelpers
        if (this.updateWarningBoxVisibility) {
            return this.updateWarningBoxVisibility();
        }
    }

    clearSearch() {
        // Implemented in SearchManager
        if (this.clearSearch) {
            return this.clearSearch();
        }
    }

    generateItemVariableInputs() {
        // Implemented in UIRenderer
        if (this.generateItemVariableInputs) {
            return this.generateItemVariableInputs();
        }
    }

    updateProfitTable() {
        // Implemented in ProfitTableManager
        if (this.updateProfitTable) {
            return this.updateProfitTable();
        }
    }

    saveVariables() {
        // Implemented in StorageManager
        if (this.saveVariables) {
            return this.saveVariables();
        }
    }
}