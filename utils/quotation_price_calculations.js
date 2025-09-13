const fs = require('fs');
const path = require('path');

/**
 * QUOTATION PRICE CALCULATIONS UTILITY
 * Purpose: Pure calculation engine for quotation pricing
 * Integration: Called by quotation-generation/update functions
 * New Formula: 
 *   actual_unit_price = (((unit_price + shipping_cost) × tax_rate) × exchange_rate)
 *   profit_unit_price = actual_unit_price × profit_rate
 *   sales_unit_price = profit_unit_price − (profit_unit_price × discount_rate)
 * Output: sales_unit_price becomes official unit_price, ext_price = sales_unit_price * qty
 */
class QuotationPriceCalculations {
    constructor() {
        // Load system configuration
        this.config = this.loadSystemConfig();
        this.pricingDefaults = this.config?.pricing_defaults?.variables || {};
        this.calculationRules = this.config?.pricing_defaults?.calculation_rules || {};
        this.businessRules = this.config?.business_rules || {};
        
        console.log('🧮 QuotationPriceCalculations initialized with system defaults');
    }

    // =========================================================================
    // 📁 CONFIGURATION LOADING
    // =========================================================================

    /**
     * Load system configuration from system-defaults.json
     */
    loadSystemConfig() {
        try {
            const configPath = path.join(__dirname, '../system-defaults.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(configData);
            } else {
                console.warn('⚠️ system-defaults.json not found, using fallback defaults');
                return this.getFallbackConfig();
            }
        } catch (error) {
            console.error('❌ Error loading system configuration:', error);
            return this.getFallbackConfig();
        }
    }

    /**
     * Fallback configuration when system-defaults.json is unavailable
     */
    getFallbackConfig() {
        return {
            pricing_defaults: {
                variables: {
                    shipping_cost: { value: 50000, min: 0, max: Infinity },
                    currency_exchange: { value: 1.0, min: 0, max: Infinity },
                    import_tax: { value: 1.1, min: 0, max: Infinity },
                    markup_percentage: { value: 0.2, min: 0, max: Infinity }
                },
                calculation_rules: {
                    round_to_nearest: 1000,
                    minimum_price: 1000,
                    currency: "VND"
                }
            },
            business_rules: {
                quotation_validation: {
                    min_items_per_quotation: 1,
                    max_items_per_quotation: 100,
                    allow_zero_prices: false
                }
            }
        };
    }

    // =========================================================================
    // 🎯 DEFAULT VALUES MANAGEMENT
    // =========================================================================

    /**
     * Get default formula variables from system configuration
     * These are used when UI panel doesn't provide values
     */
    getDefaultFormulaVariables() {
        return {
            shipping_cost: this.pricingDefaults.shipping_cost?.value || 50000,
            exchange_rate: this.pricingDefaults.currency_exchange?.value || 1.0,
            tax_rate: this.pricingDefaults.import_tax?.value || 1.1,
            profit_rate: (this.pricingDefaults.markup_percentage?.value || 0.2) + 1.0  // Convert 0.2 to 1.2
        };
    }

    /**
     * Get variable constraints for validation
     */
    getVariableConstraints() {
        return {
            shipping_cost: {
                min: 0,  // Allow any non-negative shipping cost
                max: Infinity  // No upper limit for future flexibility
            },
            exchange_rate: {
                min: 0,  // Allow any non-negative exchange rate
                max: Infinity  // No upper limit - exchange rates can vary greatly over time
            },
            tax_rate: {
                min: 0,  // Allow tax-free scenarios
                max: Infinity  // No upper limit - tax rates vary by country/policy
            },
            profit_rate: {
                min: 0,  // Allow zero profit scenarios
                max: Infinity  // No upper limit - business decisions may require high markup
            }
        };
    }

    // =========================================================================
    // 🧮 CORE PRICING CALCULATION FUNCTIONS
    // =========================================================================

    /**
     * Calculate prices for complete quotation with per-item variables
     * @param {Object} quotationData - Quotation items from Make.com automation
     * @param {Object} uiVariables - Per-item pricing variables from formula-input.js UI panel
     * @returns {Object} Complete pricing calculation results
     */
    calculateQuotationPricing(quotationData, uiVariables = {}) {
        try {
            console.log('🎯 Starting quotation pricing calculation');
            console.log('📊 Input items count:', quotationData?.quotation_items?.length || 0);
            console.log('📊 UI variables received:', Object.keys(uiVariables));

            // Validate input data structure
            this.validateQuotationInput(quotationData);

            // Handle per-item variables or fallback to global variables
            const isPerItemVariables = this.isPerItemVariablesFormat(uiVariables);
            console.log('📊 Variables format detected:', isPerItemVariables ? 'per-item' : 'global');

            // Validate pricing variables format
            this.validatePricingVariablesFormat(uiVariables, quotationData);

            // Initialize results structure
            const results = {
                calculation_success: true,
                total_items: 0,
                processed_items: [],
                pricing_summary: {
                    subtotal: 0,
                    currency: this.calculationRules.currency || "VND"
                },
                calculation_metadata: {
                    formula_used: "sales_unit_price = ((unit_price + shipping_cost) × tax_rate × exchange_rate × profit_rate) - discount",
                    variables_applied: uiVariables,
                    timestamp: new Date().toISOString()
                },
                errors: []
            };

            // Process each quotation item
            quotationData.quotation_items.forEach((item, index) => {
                try {
                    console.log(`🔄 Processing item ${index + 1}: ${item.item_no || index + 1}`);
                    
                    // Get variables for this specific item
                    const itemVariables = this.getItemVariables(item, uiVariables, isPerItemVariables);
                    const itemResult = this.calculateItemPricing(item, itemVariables);
                    results.processed_items.push(itemResult);
                    results.pricing_summary.subtotal += itemResult.ext_price;
                    results.total_items++;

                    console.log(`✅ Item ${index + 1} processed: profit_unit_price=${itemResult.profit_unit_price}, ext_price=${itemResult.ext_price}`);

                } catch (itemError) {
                    console.error(`❌ Error processing item ${index + 1}:`, itemError.message);
                    results.errors.push({
                        item_index: index,
                        item_no: item.item_no || (index + 1).toString(),
                        error: itemError.message
                    });
                }
            });

            // Apply final rounding to subtotal
            results.pricing_summary.subtotal = this.roundPrice(results.pricing_summary.subtotal);
            results.pricing_summary.formatted_subtotal = this.formatCurrency(results.pricing_summary.subtotal);

            console.log(`✅ Quotation calculation completed: ${results.total_items} items, subtotal: ${results.pricing_summary.subtotal} VND`);

            return results;

        } catch (error) {
            console.error('❌ Quotation calculation failed:', error);
            return {
                calculation_success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Calculate pricing for individual quotation item
     * New Formula:
     *   actual_unit_price = (((unit_price + shipping_cost) × tax_rate) × exchange_rate)
     *   profit_unit_price = actual_unit_price × profit_rate
     *   sales_unit_price = profit_unit_price − (profit_unit_price × discount_rate)
     * @param {Object} item - Single quotation item from input data
     * @param {Object} formulaVariables - Calculation variables (shipping_cost, tax_rate, etc.)
     * @returns {Object} Item pricing results
     */
    calculateItemPricing(item, formulaVariables) {
        // Extract unit_price and qty from quotation item data
        const unitPrice = this.extractUnitPrice(item);
        const quantity = this.extractQuantity(item);

        console.log(`📊 Item calculation input: unit_price=${unitPrice}, qty=${quantity}`);
        console.log(`📊 Formula variables: shipping_cost=${formulaVariables.shipping_cost}, tax_rate=${formulaVariables.tax_rate}, exchange_rate=${formulaVariables.exchange_rate}, profit_rate=${formulaVariables.profit_rate}`);

        // CRITICAL: Validate price data to prevent calculation base contamination
        this.validatePriceData(item, unitPrice);

        // Validate extracted values
        if (unitPrice <= 0) {
            throw new Error(`Invalid unit price: ${unitPrice}. Must be greater than 0.`);
        }
        if (quantity <= 0) {
            throw new Error(`Invalid quantity: ${quantity}. Must be greater than 0.`);
        }

        // Apply the new pricing formula step by step for transparency
        const step1 = unitPrice + formulaVariables.shipping_cost;                    // unit_price + shipping_cost
        const step2 = step1 * formulaVariables.tax_rate;                            // * tax_rate  
        const step3 = step2 * formulaVariables.exchange_rate;                       // * exchange_rate
        const actualUnitPrice = step3;                                              // actual_unit_price (no rounding yet)
        
        const step4 = actualUnitPrice * formulaVariables.profit_rate;               // * profit_rate
        const profitUnitPrice = step4;                                              // profit_unit_price (no rounding yet)
        
        // Apply discount to get final sales unit price
        const discountAmount = profitUnitPrice * (formulaVariables.discount_rate || 0);
        const salesUnitPrice = profitUnitPrice - discountAmount;                    // sales_unit_price (final unit price)
        
        // Calculate extended price using sales_unit_price, then round final result
        const extPrice = this.roundPrice(salesUnitPrice) * quantity;
        const finalExtPrice = this.roundPrice(extPrice);

        console.log(`🧮 Calculation steps: ${unitPrice} + ${formulaVariables.shipping_cost} = ${step1} * ${formulaVariables.tax_rate} = ${step2} * ${formulaVariables.exchange_rate} = ${step3} (actual) * ${formulaVariables.profit_rate} = ${step4} (profit) - ${discountAmount} (discount) = ${salesUnitPrice}`);
        console.log(`🧮 Final result: sales_unit_price=${salesUnitPrice}, ext_price=${finalExtPrice}`);

        // Calculate potential profit for this item (per unit and total)
        const potentialProfitPerUnit = Math.round(profitUnitPrice) - Math.round(actualUnitPrice);
        const totalPotentialProfit = potentialProfitPerUnit * quantity;

        return {
            item_no: item.item_no || "N/A",
            description: item.company_requirement?.description || item.bidder_proposal?.description || "No description",
            original_unit_price: unitPrice,
            quantity: quantity,
            unit_of_measure: item.company_requirement?.uom || "EA",
            
            // Main calculation results (sales_unit_price becomes the official unit_price)
            actual_unit_price: Math.round(actualUnitPrice),
            profit_unit_price: Math.round(profitUnitPrice),
            sales_unit_price: Math.round(salesUnitPrice),
            ext_price: finalExtPrice,
            potential_profit: totalPotentialProfit,
            
            // Additional pricing details
            shipping_cost_applied: formulaVariables.shipping_cost,
            tax_rate_applied: formulaVariables.tax_rate,
            exchange_rate_applied: formulaVariables.exchange_rate,
            profit_rate_applied: formulaVariables.profit_rate,
            discount_rate_applied: formulaVariables.discount_rate || 0,
            discount_amount: Math.round(discountAmount),
            
            // Calculation breakdown for transparency
            calculation_steps: {
                step_1_with_shipping: step1,
                step_2_with_tax: step2,
                step_3_actual_unit_price: Math.round(actualUnitPrice),
                step_4_profit_unit_price: Math.round(profitUnitPrice),
                step_5_discount_amount: Math.round(discountAmount),
                step_6_sales_unit_price: Math.round(salesUnitPrice)
            },
            
            // Metadata
            currency: this.calculationRules.currency || "VND",
            calculation_timestamp: new Date().toISOString()
        };
    }

    // =========================================================================
    // 📥 DATA EXTRACTION FUNCTIONS
    // =========================================================================

    /**
     * Extract unit price from quotation item
     * CRITICAL FIX: Always prioritize original prices to prevent compounding calculations
     * Supports multiple input formats from Make.com automation
     */
    extractUnitPrice(item) {
        // Try different possible locations for unit price
        let unitPrice = 0;

        // Priority 1: Original unit price from new standard (ALWAYS use original for calculations)
        if (item.bidder_proposal?.original_unit_price) {
            unitPrice = this.parseNumericValue(item.bidder_proposal.original_unit_price);
            console.log(`🎯 Using original_unit_price for calculations: ${unitPrice}`);
        }
        // Priority 2: Original unit price from legacy VND field (ALWAYS use original for calculations)
        else if (item.bidder_proposal?.original_unit_price_vnd) {
            unitPrice = this.parseNumericValue(item.bidder_proposal.original_unit_price_vnd);
            console.log(`🎯 Using original_unit_price_vnd for calculations: ${unitPrice}`);
        }
        // Priority 3: Standard unit_price field (only if no original price stored)
        else if (item.unit_price) {
            unitPrice = this.parseNumericValue(item.unit_price);
            console.log(`⚠️ Using unit_price (no original found): ${unitPrice}`);
        }
        // Priority 4: Bidder proposal unit_price (only if no original price stored)
        else if (item.bidder_proposal?.unit_price) {
            unitPrice = this.parseNumericValue(item.bidder_proposal.unit_price);
            console.log(`⚠️ Using bidder_proposal.unit_price (no original found): ${unitPrice}`);
        }
        // Priority 5: Legacy VND-specific field (backward compatibility, last resort)
        else if (item.bidder_proposal?.unit_price_vnd) {
            unitPrice = this.parseNumericValue(item.bidder_proposal.unit_price_vnd);
            console.log(`⚠️ Using unit_price_vnd (legacy fallback): ${unitPrice}`);
        } 
        // Priority 6: Calculate from extended price and quantity
        else if (item.bidder_proposal?.ext_price_vnd && item.company_requirement?.qty) {
            const extPrice = this.parseNumericValue(item.bidder_proposal.ext_price_vnd);
            const qty = this.parseNumericValue(item.company_requirement.qty);
            if (qty > 0) {
                unitPrice = extPrice / qty;
            }
        }

        return Math.round(unitPrice); // Return as integer
    }

    /**
     * Validate price data to prevent calculation base contamination
     * Detects if potentially calculated values are being used as calculation input
     */
    validatePriceData(item, unitPrice) {
        const hasOriginalPrice = item.bidder_proposal?.original_unit_price || item.bidder_proposal?.original_unit_price_vnd;
        const currentPrice = item.bidder_proposal?.unit_price || item.bidder_proposal?.unit_price_vnd;
        const hasCalculationMetadata = item.bidder_proposal?.calculation_metadata;
        
        // Warning: If we have calculation metadata but no original price, something is wrong
        if (hasCalculationMetadata && !hasOriginalPrice) {
            console.warn(`⚠️ CONTAMINATION RISK: Item ${item.item_no} has calculation metadata but no original_unit_price. This suggests data contamination.`);
            console.warn(`   Current unit_price: ${currentPrice}, Extracted for calculation: ${unitPrice}`);
            console.warn(`   Recommendation: Original prices may have been overwritten. Check data integrity.`);
        }
        
        // Warning: If current price differs significantly from original price and we're using current price
        if (hasOriginalPrice && currentPrice && Math.abs(currentPrice - (item.bidder_proposal?.original_unit_price || item.bidder_proposal?.original_unit_price_vnd)) > 1) {
            const originalPrice = item.bidder_proposal?.original_unit_price || item.bidder_proposal?.original_unit_price_vnd;
            if (unitPrice === currentPrice && unitPrice !== originalPrice) {
                console.warn(`⚠️ CONTAMINATION DETECTED: Item ${item.item_no} using potentially calculated price as calculation base`);
                console.warn(`   Original price: ${originalPrice}, Current price: ${currentPrice}, Using for calculation: ${unitPrice}`);
                console.warn(`   This may cause compounding calculations! Verify price extraction logic.`);
                return false;
            }
        }
        
        return true;
    }

    /**
     * Extract quantity from quotation item
     */
    extractQuantity(item) {
        let quantity = 0;

        if (item.company_requirement?.qty) {
            quantity = this.parseNumericValue(item.company_requirement.qty);
        } else if (item.quantity) {
            quantity = this.parseNumericValue(item.quantity);
        } else if (item.qty) {
            quantity = this.parseNumericValue(item.qty);
        } else {
            quantity = 1; // Default to 1 if no quantity specified
        }

        return Math.round(quantity); // Return as integer
    }

    /**
     * Parse numeric value from string or number input
     */
    parseNumericValue(value) {
        // Handle null, undefined, empty string
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

    // =========================================================================
    // 🔧 VARIABLE MANAGEMENT FUNCTIONS - PER-ITEM SUPPORT
    // =========================================================================

    /**
     * Check if variables are in per-item format
     * @param {Object} uiVariables - Variables from UI
     * @returns {boolean} True if per-item format
     */
    isPerItemVariablesFormat(uiVariables) {
        if (!uiVariables || typeof uiVariables !== 'object') return false;
        
        // Check if any key looks like an item number and has variable object
        return Object.keys(uiVariables).some(key => {
            const value = uiVariables[key];
            return value && typeof value === 'object' && 
                   ('shipping_cost' in value || 'tax_rate' in value || 'profit_rate' in value);
        });
    }

    /**
     * Get variables for a specific item
     * @param {Object} item - Quotation item
     * @param {Object} uiVariables - Variables from UI (per-item or global)
     * @param {boolean} isPerItem - Whether variables are per-item format
     * @returns {Object} Variables for this item
     */
    getItemVariables(item, uiVariables, isPerItem) {
        const defaults = this.getDefaultFormulaVariables();
        
        if (isPerItem) {
            // Use per-item variables
            const itemNo = item.item_no || '1';
            const itemVariables = uiVariables[itemNo] || {};
            
            // Only use UI values if they are actually provided (not empty strings)
            const getValueOrDefault = (uiValue, defaultValue) => {
                const parsed = this.parseNumericValue(uiValue);
                return (parsed !== null && parsed > 0) ? parsed : defaultValue;
            };
            
            return {
                shipping_cost: getValueOrDefault(itemVariables.shipping_cost, defaults.shipping_cost),
                tax_rate: getValueOrDefault(itemVariables.tax_rate, defaults.tax_rate),
                exchange_rate: getValueOrDefault(itemVariables.exchange_rate, defaults.exchange_rate),
                profit_rate: getValueOrDefault(itemVariables.profit_rate, defaults.profit_rate),
                discount_rate: this.parseNumericValue(itemVariables.discount_rate) ?? 0.0
            };
        } else {
            // Use global variables (legacy support)
            return this.mergeVariables(uiVariables);
        }
    }

    /**
     * Merge UI variables with system defaults (legacy support)
     * Priority: UI input > System defaults
     */
    mergeVariables(uiVariables) {
        const defaults = this.getDefaultFormulaVariables();
        const merged = { ...defaults, discount_rate: 0.0 }; // Add discount_rate default

        // Override defaults with UI input, ensuring numeric types
        Object.keys(uiVariables).forEach(key => {
            if (uiVariables[key] !== undefined && uiVariables[key] !== null) {
                merged[key] = this.parseNumericValue(uiVariables[key]);
            }
        });

        return merged;
    }

    /**
     * Validate pricing variables format
     * @param {Object} uiVariables - Variables from UI
     * @param {Object} quotationData - Quotation data
     */
    validatePricingVariablesFormat(uiVariables, quotationData) {
        if (!uiVariables || Object.keys(uiVariables).length === 0) {
            console.log('📊 No UI variables provided, will use system defaults');
            return;
        }

        const isPerItem = this.isPerItemVariablesFormat(uiVariables);
        
        if (isPerItem) {
            // Validate per-item variables
            quotationData.quotation_items.forEach((item, index) => {
                const itemNo = item.item_no || (index + 1).toString();
                const itemVars = uiVariables[itemNo];
                
                if (itemVars) {
                    this.validateItemVariables(itemVars, itemNo);
                }
            });
        } else {
            // Validate global variables (legacy)
            this.validateFormulaVariables(uiVariables);
        }
    }

    /**
     * Validate variables for a single item
     * @param {Object} itemVars - Variables for single item
     * @param {string} itemNo - Item number for error messages
     */
    validateItemVariables(itemVars, itemNo) {
        const constraints = this.getVariableConstraints();
        const errors = [];

        Object.keys(itemVars).forEach(varName => {
            if (varName === 'discount_rate') {
                // Special validation for discount rate
                const value = itemVars[varName];
                if (value < 0 || value > 1) {
                    errors.push(`${itemNo}.${varName} (${value}) must be between 0 and 1 (0-100%)`);
                }
            } else if (constraints[varName]) {
                const value = itemVars[varName];
                const constraint = constraints[varName];

                if (value < constraint.min) {
                    errors.push(`${itemNo}.${varName} (${value}) is below minimum allowed value (${constraint.min})`);
                }
                if (value > constraint.max) {
                    errors.push(`${itemNo}.${varName} (${value}) exceeds maximum allowed value (${constraint.max})`);
                }
                
                if (!isFinite(value) || isNaN(value)) {
                    errors.push(`${itemNo}.${varName} must be a valid number, got: ${value}`);
                }
            }
        });

        if (errors.length > 0) {
            throw new Error(`Item variable validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * Validate formula variables against system constraints
     */
    validateFormulaVariables(variables) {
        const constraints = this.getVariableConstraints();
        const errors = [];

        Object.keys(variables).forEach(varName => {
            const value = variables[varName];
            const constraint = constraints[varName];

            if (constraint) {
                if (value < constraint.min) {
                    errors.push(`${varName} (${value}) is below minimum allowed value (${constraint.min})`);
                }
                if (value > constraint.max) {
                    errors.push(`${varName} (${value}) exceeds maximum allowed value (${constraint.max})`);
                }
            }

            // Check for reasonable numeric values
            if (!isFinite(value) || isNaN(value)) {
                errors.push(`${varName} must be a valid number, got: ${value}`);
            }
        });

        if (errors.length > 0) {
            throw new Error(`Formula variable validation failed: ${errors.join(', ')}`);
        }
    }

    // =========================================================================
    // ✅ INPUT VALIDATION FUNCTIONS
    // =========================================================================

    /**
     * Validate quotation input data structure
     */
    validateQuotationInput(quotationData) {
        if (!quotationData) {
            throw new Error('Quotation data is required');
        }

        if (!quotationData.quotation_items || !Array.isArray(quotationData.quotation_items)) {
            throw new Error('quotation_items must be an array');
        }

        if (quotationData.quotation_items.length === 0) {
            throw new Error('quotation_items array cannot be empty');
        }

        // Validate business rules from config
        const validation = this.businessRules.quotation_validation || {};
        const itemCount = quotationData.quotation_items.length;

        if (validation.min_items_per_quotation && itemCount < validation.min_items_per_quotation) {
            throw new Error(`Minimum ${validation.min_items_per_quotation} items required, got ${itemCount}`);
        }

        if (validation.max_items_per_quotation && itemCount > validation.max_items_per_quotation) {
            throw new Error(`Maximum ${validation.max_items_per_quotation} items allowed, got ${itemCount}`);
        }

        // Validate each item structure
        quotationData.quotation_items.forEach((item, index) => {
            this.validateQuotationItem(item, index);
        });
    }

    /**
     * Validate individual quotation item
     */
    validateQuotationItem(item, index) {
        const itemRef = `Item ${index + 1}`;

        if (!item.company_requirement && !item.bidder_proposal) {
            throw new Error(`${itemRef}: Must have either company_requirement or bidder_proposal`);
        }

        // Check for price information - prioritize unit_price over legacy _vnd fields
        const hasUnitPrice = item.bidder_proposal?.unit_price || 
                            item.bidder_proposal?.unit_price_vnd ||
                            item.bidder_proposal?.original_unit_price ||
                            item.bidder_proposal?.original_unit_price_vnd;
        const hasExtPrice = item.bidder_proposal?.ext_price || item.bidder_proposal?.ext_price_vnd;
        const hasQuantity = item.company_requirement?.qty;

        if (!hasUnitPrice && !(hasExtPrice && hasQuantity)) {
            throw new Error(`${itemRef}: Must have unit_price or both ext_price and qty`);
        }

        // Validate against business rules
        const allowZeroPrices = this.businessRules.quotation_validation?.allow_zero_prices;
        if (!allowZeroPrices) {
            const unitPrice = this.extractUnitPrice(item);
            if (unitPrice <= 0) {
                throw new Error(`${itemRef}: Zero or negative prices not allowed`);
            }
        }
    }

    // =========================================================================
    // 🎨 FORMATTING AND UTILITY FUNCTIONS
    // =========================================================================

    /**
     * Round price according to system configuration
     */
    roundPrice(price) {
        const roundTo = this.calculationRules.round_to_nearest || 1000;
        const rounded = Math.round(price / roundTo) * roundTo;
        const minimum = this.calculationRules.minimum_price || 0;
        return Math.max(rounded, minimum);
    }

    /**
     * Format currency for display
     */
    formatCurrency(amount) {
        const currency = this.calculationRules.currency || "VND";
        
        try {
            return new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        } catch (error) {
            // Fallback formatting
            return `${amount.toLocaleString()} ${currency}`;
        }
    }

    // =========================================================================
    // 🔄 PUBLIC UTILITY METHODS
    // =========================================================================

    /**
     * Test calculation with sample data (for development/debugging)
     */
    testCalculation(sampleItem, testVariables) {
        try {
            const result = this.calculateItemPricing(sampleItem, testVariables);
            return {
                success: true,
                result: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get current system defaults (for UI display)
     */
    getCurrentDefaults() {
        return {
            formula_variables: this.getDefaultFormulaVariables(),
            constraints: this.getVariableConstraints(),
            calculation_rules: this.calculationRules,
            formula: "(((unit_price + shipping_cost) * tax_rate) * exchange_rate) * profit_rate"
        };
    }

    /**
     * Update default variables (for admin configuration)
     */
    updateDefaults(newDefaults) {
        // Validate new defaults
        this.validateFormulaVariables(newDefaults);
        
        // Update in-memory defaults
        Object.keys(newDefaults).forEach(key => {
            if (this.pricingDefaults[key]) {
                this.pricingDefaults[key].value = newDefaults[key];
            }
        });

        console.log('✅ Pricing defaults updated:', newDefaults);
    }
}

module.exports = { QuotationPriceCalculations };