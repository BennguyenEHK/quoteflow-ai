/**
 * CurrencyManager.js
 * Currency handling and global settings functionality for Formula Input Panel
 */

export class CurrencyManager {
    constructor(coreInstance) {
        this.core = coreInstance;
        
        // Initialize currency state
        this.core.selectedTargetCurrency = this.loadSavedTargetCurrency() || 'VND';
        console.log('💰 CurrencyManager initialized with target currency:', this.core.selectedTargetCurrency);
    }

    /**
     * Extract all unique currency_code values from items
     * Called by DataLoader after loading quotation items
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
     * Handle global currency change event
     * @param {Event} event - Change event from currency dropdown
     */
    onGlobalCurrencyChange(event) {
        const targetCurrency = event.target.value;
        
        // Store the selected target currency
        this.core.selectedTargetCurrency = targetCurrency;
        this.saveTargetCurrency(targetCurrency);
        
        console.log('🌍 Global currency changed to:', targetCurrency);
        
        // Update all exchange rate hints and inputs
        this.core.quotationItems.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            const currentItemCurrency = this.getCurrentItemCurrency(itemNo);
            
            // Update exchange rate hint
            const hint = this.core.itemVariablesContainer.querySelector(`.exchange-rate-hint[data-item="${itemNo}"]`);
            if (hint) {
                hint.textContent = `From ${currentItemCurrency} to ${targetCurrency}`;
            }
            
            // Auto-set exchange rate based on currency selection
            const exchangeRateInput = this.core.itemVariablesContainer.querySelector(`.exchange-rate[data-item="${itemNo}"]`);
            if (exchangeRateInput) {
                if (currentItemCurrency === targetCurrency) {
                    // Same currency - set to 1 and disable input
                    exchangeRateInput.value = '1';
                    exchangeRateInput.dataset.rawValue = '1';
                    exchangeRateInput.disabled = true;
                    exchangeRateInput.style.backgroundColor = '#f5f5f5';
                    exchangeRateInput.style.color = '#666';
                    
                    // Update internal variables immediately
                    if (!this.core.itemVariables.has(itemNo)) {
                        this.core.itemVariables.set(itemNo, this.getDefaultItemVariables());
                    }
                    const itemVars = this.core.itemVariables.get(itemNo);
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
     * @param {string} itemNo - Item number
     * @returns {string} Currency code for the item
     */
    getCurrentItemCurrency(itemNo) {
        const item = this.core.quotationItems.find(item => 
            (item.item_no || '1') === itemNo
        );
        return item?.currency_code || item?.bidder_proposal?.currency_code || 'VND';
    }

    /**
     * Restore global currency selection after HTML regeneration
     * This is called after UI regeneration to maintain currency selection state
     */
    restoreGlobalCurrencySelection() {
        const globalCurrency = this.core.itemVariablesContainer.querySelector('#globalCurrency');
        if (globalCurrency && this.core.selectedTargetCurrency) {
            // Set the selected target currency in the dropdown
            globalCurrency.value = this.core.selectedTargetCurrency;
            
            // Update the exchange rate labels
            const exchangeRateLabel = this.core.itemVariablesContainer.querySelector('.exchange-rate-label');
            if (exchangeRateLabel) {
                exchangeRateLabel.textContent = `To ${this.core.selectedTargetCurrency}`;
            }
            
            console.log('🔄 Restored global currency selection:', this.core.selectedTargetCurrency);
        }
    }

    /**
     * Render initial currency section HTML
     * Called during component initialization to show currency selection
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
                    <small class="exchange-rate-label">To ${this.core.selectedTargetCurrency}</small>
                </div>
            </div>
            <div class="no-items-message">Load quotation data to configure per-item variables</div>
        `;
        this.core.itemVariablesContainer.innerHTML = currencyHtml;
        
        // Bind event to the initial currency dropdown and restore selection
        const globalCurrency = this.core.itemVariablesContainer.querySelector('#globalCurrency');
        if (globalCurrency) {
            globalCurrency.addEventListener('change', this.onGlobalCurrencyChange.bind(this));
            // Restore saved currency selection
            if (this.core.selectedTargetCurrency) {
                globalCurrency.value = this.core.selectedTargetCurrency;
            }
        }
    }

    /**
     * Get currency HTML for global currency section used in UI generation
     * @returns {string} HTML for global currency section
     */
    getGlobalCurrencySectionHTML() {
        return `
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
        `;
    }

    /**
     * Get currency badge HTML for item display
     * @param {string} currencyCode - Currency code to display
     * @returns {string} HTML for currency badge
     */
    getCurrencyBadgeHTML(currencyCode) {
        return `<span class="currency-badge">${currencyCode}</span>`;
    }

    /**
     * Get exchange rate hint HTML for item
     * @param {string} itemNo - Item number
     * @param {string} itemCurrency - Item's original currency
     * @returns {string} HTML for exchange rate hint
     */
    getExchangeRateHintHTML(itemNo, itemCurrency) {
        return `<small class="exchange-rate-hint" data-item="${itemNo}">From ${itemCurrency} to ${this.core.selectedTargetCurrency}</small>`;
    }

    /**
     * Bind currency events to newly generated UI elements
     * Called by UIRenderer after HTML generation
     */
    bindCurrencyEvents() {
        // Add event listener to global currency dropdown
        const globalCurrency = this.core.itemVariablesContainer.querySelector('#globalCurrency');
        if (globalCurrency) {
            globalCurrency.addEventListener('change', this.onGlobalCurrencyChange.bind(this));
            console.log('💰 Currency events bound to global dropdown');
        }
    }

    /**
     * Update global currency from saved variables
     * Used when loading saved pricing variables to sync currency settings
     * @param {Object} variables - Saved variables that may contain currency info
     */
    updateGlobalCurrencyFromVariables(variables) {
        try {
            // Check if there's a consistent target currency across all items
            const targetCurrencies = new Set();
            
            Object.keys(variables).forEach(itemNo => {
                const itemVars = variables[itemNo];
                if (itemVars.target_currency) {
                    targetCurrencies.add(itemVars.target_currency);
                }
            });
            
            // If there's a single consistent currency, update the global setting
            if (targetCurrencies.size === 1) {
                const targetCurrency = Array.from(targetCurrencies)[0];
                if (targetCurrency !== this.core.selectedTargetCurrency) {
                    console.log(`💰 Updating global currency from variables: ${targetCurrency}`);
                    this.core.selectedTargetCurrency = targetCurrency;
                    this.saveTargetCurrency(targetCurrency);
                    this.restoreGlobalCurrencySelection();
                }
            }
            
        } catch (error) {
            console.error('❌ Error updating global currency from variables:', error);
        }
    }

    // Reference methods that will be implemented in other modules
    // These are called from this module but implemented elsewhere
    getDefaultItemVariables() {
        // Implemented in VariableManager
        if (this.getDefaultItemVariables) {
            return this.getDefaultItemVariables();
        }
        return {};
    }

    saveVariables() {
        // Implemented in StorageManager
        if (this.saveVariables) {
            return this.saveVariables();
        }
    }
}