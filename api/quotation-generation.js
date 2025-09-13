// =============================================
// 🎯 QUOTATION GENERATION API - COMPLETE HANDLER
// =============================================
const fs = require('fs');
const path = require('path');
const { QuotationPriceCalculations } = require('../utils/quotation_price_calculations');

/**
 * QUOTATION GENERATION SYSTEM
 * Purpose: Complete quotation processing system
 * - Handles HTTP POST requests from Make.com automation workflows
 * - Processes direct function calls from local UI components
 * - Manages all quotation generation, updates, and calculations
 * - Maintains session state and data persistence across operations
 * - Coordinates with pricing calculations and document generation
 * - Provides unified interface for both external and internal consumers
 */
class QuotationGenerationAPI {
    constructor() {
        // Load input schema configuration
        this.inputSchema = this.loadInputSchema();
        this.priceCalculator = new QuotationPriceCalculations();
        this.activeSessions = new Map();
        
        
        // Statistics tracking
        this.stats = {
            totalGenerations: 0,
            totalUpdates: 0,
            autoCalculations: 0,
            errors: 0
        };
        
        console.log('🎯 QuotationGenerationAPI initialized successfully');
    }

    // =========================================================================
    // 📁 CONFIGURATION LOADING
    // =========================================================================
    
    /**
     * Load quotation input schema from quotation-input.json
     */
    loadInputSchema() {
        try {
            const schemaPath = path.join(__dirname, '../config/quotation-input.json');
            if (fs.existsSync(schemaPath)) {
                const schemaData = fs.readFileSync(schemaPath, 'utf8');
                return JSON.parse(schemaData);
            } else {
                console.warn('⚠️ quotation-input.json not found, using fallback schema');
                return this.getFallbackSchema();
            }
        } catch (error) {
            console.error('❌ Error loading input schema:', error);
            return this.getFallbackSchema();
        }
    }

    /**
     * Fallback schema when quotation-input.json is unavailable
     */
    getFallbackSchema() {
        return {
            validation_rules: {
                quotation_items: {
                    min_items: 1,
                    max_items: 100,
                    required_fields_per_item: ["item_no", "company_requirement.description", "company_requirement.qty"]
                },
                auto_calculate_conditions: {
                    triggers: [
                        "action_type is 'generate' AND item has unit_price_vnd AND qty > 0",
                        "action_type is 'update' AND item has unit_price_vnd AND qty > 0"
                    ]
                }
            }
        };
    }

    // =========================================================================
    // 🌐 HTTP ENDPOINT HANDLERS (for Make.com integration)
    // =========================================================================
    
    /**
     * HTTP POST handler for quotation generation/update
     * Called from sse-server.js route registration
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} sseNotifier - Function to send SSE updates to UI
     */
    async handleHTTPRequest(req, res, sseNotifier = null) {
        const startTime = Date.now();
        let sessionId = null;
        let actionType = null;
        let currentStatus = 'initializing';
        
        try {
            console.log('🎯 HTTP Quotation POST request received');
            console.log('📊 Request body keys:', Object.keys(req.body || {}));
            console.log('📊 Request Content-Type:', req.get('Content-Type'));
            
            // ===== ENHANCED LOGGING: INCOMING REQUEST FROM APPLY BUTTON =====
            console.log('🎯 ===== INCOMING REQUEST FROM APPLY BUTTON =====');
            console.log('🎯 Full Request Body:');
            console.log(JSON.stringify(req.body, null, 2));
            if (req.body.pricing_variables) {
                console.log('🎯 Pricing Variables Received:');
                console.log(JSON.stringify(req.body.pricing_variables, null, 2));
            }
            console.log('🎯 Action Type:', req.body.action_type);
            console.log('🎯 Session ID:', req.body.session_id);
            console.log('🎯 ===============================================');
            
            // Ensure we can parse JSON POST request body
            if (!req.body) {
                throw new Error('Request body is empty. Ensure Content-Type: application/json');
            }

            // Validate and parse input from POST request body
            const validatedInput = this.validateInput(req.body);
            sessionId = validatedInput.session_id || this.generateSessionId();
            actionType = validatedInput.action_type;
            currentStatus = 'validated';
            
            console.log(`🔄 Processing quotation - Session: ${sessionId}, Action: ${actionType}`);
            
            // Send initial workflow status notification via SSE
            if (sseNotifier) {
                sseNotifier({
                    type: 'workflow_start',
                    data: {
                        session_id: sessionId,
                        action_type: actionType,
                        status: currentStatus,
                        message: 'Quotation_price_calculations',
                        agent_name: 'quotation-generation',
                        items_count: validatedInput.quotation_data?.quotation_items?.length || 0,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            currentStatus = 'processing';

            // Process quotation based on action type
            let result;
            if (actionType === 'generate') {
                result = await this.processQuotationGeneration(validatedInput, sessionId, sseNotifier);
                this.stats.totalGenerations++;
                currentStatus = 'generation_complete';
            } else if (actionType === 'update') {
                result = await this.processQuotationUpdate(validatedInput, sessionId, sseNotifier);
                this.stats.totalUpdates++;
                currentStatus = 'update_complete';
            } else if (actionType === 'calculate') {
                result = await this.processQuotationCalculation(validatedInput, sessionId, sseNotifier);
                this.stats.totalCalculations = (this.stats.totalCalculations || 0) + 1;
                currentStatus = 'calculation_complete';
            } else {
                throw new Error(`Invalid action_type: ${actionType}. Must be 'generate', 'update', or 'calculate'`);
            }

            currentStatus = 'completed';

            // Send quotation generated notification for Result Preview panel
            if (sseNotifier) {
                sseNotifier({
                    type: 'quotation_generated',
                    data: {
                        session_id: sessionId,
                        action_type: actionType,
                        quotation_data: result.quotation_data,
                        calculated_pricing: result.calculated_pricing,
                        preview_data: result.preview_data,
                        generated_files: result.generated_files,
                        html_content: result.generated_files?.html?.content,
                        timestamp: new Date().toISOString()
                    }
                });
                
                // Send workflow status for workflow tracker (non-interfering)
                sseNotifier({
                    type: 'quotation_workflow_complete',
                    data: {
                        session_id: sessionId,
                        action_type: actionType,
                        status: currentStatus,
                        agent_name: 'quotation-generation',
                        processing_time: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Send successful HTTP response with explicit action and status
            const response = {
                success: true,
                action_type: actionType,
                status: currentStatus,
                session_id: sessionId,
                processing_time_ms: Date.now() - startTime,
                workflow_info: {
                    action_performed: actionType,
                    current_status: currentStatus,
                    items_processed: validatedInput.quotation_data?.quotation_items?.length || 0,
                    auto_calculation_triggered: !!result.calculated_pricing
                },
                ...result
            };

            console.log(`✅ HTTP Response prepared for ${actionType} action with status: ${currentStatus}`);
            res.json(response);

        } catch (error) {
            console.error('❌ Quotation processing error:', error);
            this.stats.errors++;
            currentStatus = 'error';
            
            
            // Send error notification via SSE for UI workflow tracking
            if (sseNotifier && sessionId) {
                sseNotifier({
                    type: 'workflow_error',
                    data: {
                        session_id: sessionId,
                        action_type: actionType || 'unknown',
                        status: currentStatus,
                        agent_name: 'quotation-generation',
                        error: error.message,
                        processing_time: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            res.status(400).json({
                success: false,
                action_type: actionType || 'unknown',
                status: currentStatus,
                error: error.message,
                session_id: sessionId,
                processing_time_ms: Date.now() - startTime,
                workflow_info: {
                    action_attempted: actionType || 'unknown',
                    current_status: currentStatus,
                    error_details: error.message
                },
                timestamp: new Date().toISOString()
            });
        }
    }

    // =========================================================================
    // 🔧 DIRECT FUNCTION CALLS (for UI integration)
    // =========================================================================
    
    /**
     * Generate quotation from UI components
     * @param {Object} quotationData - Quotation data from UI
     * @param {Object} uiVariables - Pricing variables from formula panel
     * @returns {Object} Quotation results
     */
    async generateForUI(quotationData, uiVariables = {}) {
        try {
            const sessionId = this.generateSessionId();
            
            const input = {
                action_type: 'generate',
                session_id: sessionId,
                quotation_data: quotationData,
                pricing_variables: uiVariables,
                generation_options: {
                    include_preview: true,
                    formats: ['pdf', 'excel']
                }
            };

            console.log('🎯 UI quotation generation request');
            return await this.processQuotationGeneration(input, sessionId);
            
        } catch (error) {
            console.error('❌ UI quotation generation error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Update quotation from UI components
     * @param {string} sessionId - Existing session ID
     * @param {Object} updatedData - Updated quotation data
     * @param {Object} newVariables - New pricing variables
     * @returns {Object} Updated quotation results
     */
    async updateForUI(sessionId, updatedData, newVariables = {}) {
        try {
            const input = {
                action_type: 'update',
                session_id: sessionId,
                quotation_data: updatedData,
                pricing_variables: newVariables,
                generation_options: {
                    include_preview: true,
                    formats: ['pdf', 'excel']
                }
            };

            console.log(`🔄 UI quotation update request for session: ${sessionId}`);
            return await this.processQuotationUpdate(input, sessionId);
            
        } catch (error) {
            console.error('❌ UI quotation update error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // =========================================================================
    // 🎯 CORE PROCESSING FUNCTIONS
    // =========================================================================
    
    /**
     * Process quotation generation (new quotation)
     * @param {Object} input - Validated input data
     * @param {string} sessionId - Session identifier
     * @param {Function} sseNotifier - SSE notification function
     * @returns {Object} Processing results
     */
    async processQuotationGeneration(input, sessionId, sseNotifier = null) {
        console.log(`🆕 Starting quotation generation - Session: ${sessionId}`);
        
        // Normalize the data structure to match expected schema
        const normalizedInput = this.normalizeQuotationData(input);
        
        // Initialize session data
        const sessionData = {
            id: sessionId,
            action: 'generate',
            input: normalizedInput,
            quotationData: normalizedInput.quotation_data,
            createdAt: new Date(),
            lastUpdate: new Date(),
            status: 'processing'
        };
        
        this.activeSessions.set(sessionId, sessionData);

        // CRITICAL FIX: Store pricing variables in session for future retrieval
        if (normalizedInput.pricing_variables && Object.keys(normalizedInput.pricing_variables).length > 0) {
            sessionData.storedPricingVariables = normalizedInput.pricing_variables;
            console.log('💾 Stored pricing variables in session during generation:', normalizedInput.pricing_variables);
        }

        // Check if auto-calculation should be triggered
        const shouldAutoCalculate = this.shouldTriggerAutoCalculation(normalizedInput);
        let calculatedPricing = null;
        
        if (shouldAutoCalculate) {
            console.log('🧮 Auto-calculation triggered - processing pricing');
            
            if (sseNotifier) {
                sseNotifier({
                    type: 'calculation_start',
                    data: {
                        session_id: sessionId,
                        agent_name: 'quotation-price-calculations',
                        message: 'Starting price calculations',
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
            calculatedPricing = this.priceCalculator.calculateQuotationPricing(
                normalizedInput.quotation_data,
                normalizedInput.pricing_variables || {}
            );
            
            this.stats.autoCalculations++;
            sessionData.calculatedPricing = calculatedPricing;
            
            // Merge calculated pricing results back into quotation data for persistence
            this.mergeCalculatedPricingIntoQuotationData(sessionData, calculatedPricing);
            
            if (sseNotifier) {
                sseNotifier({
                    type: 'calculation_complete',
                    data: {
                        session_id: sessionId,
                        agent_name: 'quotation-price-calculations',
                        pricing_summary: calculatedPricing.pricing_summary,
                        items_processed: calculatedPricing.total_items,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }

        // Generate preview data for UI
        const previewData = this.generatePreviewData(sessionData, calculatedPricing);
        sessionData.previewData = previewData;
        
        // TODO: Integrate with document-generator.js for PDF/Excel generation
        const generatedFiles = await this.generateDocuments(sessionData, calculatedPricing, true);
        sessionData.generatedFiles = generatedFiles;
        
        // Update session status
        sessionData.status = 'completed';
        sessionData.completedAt = new Date();
        
        console.log(`✅ Quotation generation completed - Session: ${sessionId}`);
        
        
        return {
            quotation_data: sessionData.quotationData,
            calculated_pricing: calculatedPricing,
            preview_data: previewData,
            generated_files: generatedFiles,
            session_data: {
                id: sessionId,
                created_at: sessionData.createdAt,
                completed_at: sessionData.completedAt
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Process quotation update (modify existing quotation)
     * @param {Object} input - Validated input data
     * @param {string} sessionId - Session identifier
     * @param {Function} sseNotifier - SSE notification function
     * @returns {Object} Processing results
     */
    async processQuotationUpdate(input, sessionId, sseNotifier = null) {
        console.log(`🔄 Starting quotation update - Session: ${sessionId}`);
        
        // Normalize the data structure to match expected schema
        const normalizedInput = this.normalizeQuotationData(input);
        
        // Retrieve or create session data
        let sessionData = this.activeSessions.get(sessionId);
        if (!sessionData) {
            console.log(`🆕 Creating new session for update request: ${sessionId}`);
            sessionData = {
                id: sessionId,
                action: 'update',
                createdAt: new Date()
            };
            this.activeSessions.set(sessionId, sessionData);
        }
        
        // CRITICAL FIX: Preserve original quotation context during updates
        const originalQuotationData = sessionData.quotationData || {};
        const updatedQuotationData = normalizedInput.quotation_data || {};
        
        // Merge quotation data while preserving original RFQ reference and customer info
        const mergedQuotationData = {
            ...originalQuotationData,
            ...updatedQuotationData,
            // FORCE PRESERVE: Always keep original RFQ reference and customer info if they exist
            rfq_reference: originalQuotationData.rfq_reference || updatedQuotationData.rfq_reference || 'unknown_rfq',
            customer_info: {
                ...originalQuotationData.customer_info,
                ...updatedQuotationData.customer_info
            },
            // Update quotation items (this is typically what changes during pricing updates)
            quotation_items: updatedQuotationData.quotation_items || originalQuotationData.quotation_items || []
        };
        
        console.log(`📋 Context preservation check:`, {
            original_rfq: originalQuotationData.rfq_reference,
            updated_rfq: updatedQuotationData.rfq_reference,
            final_rfq: mergedQuotationData.rfq_reference,
            original_customer: originalQuotationData.customer_info?.company_name,
            updated_customer: updatedQuotationData.customer_info?.company_name,
            final_customer: mergedQuotationData.customer_info?.company_name
        });
        
        // Update session data with merged context
        sessionData.input = normalizedInput;
        sessionData.quotationData = mergedQuotationData;
        sessionData.lastUpdate = new Date();
        sessionData.status = 'processing';
        
        // CRITICAL FIX: Store pricing variables in session for future retrieval
        if (normalizedInput.pricing_variables && Object.keys(normalizedInput.pricing_variables).length > 0) {
            sessionData.storedPricingVariables = normalizedInput.pricing_variables;
            console.log('💾 Stored pricing variables in session:', normalizedInput.pricing_variables);
        }
        
        // Check if auto-calculation should be triggered
        const shouldAutoCalculate = this.shouldTriggerAutoCalculation(normalizedInput);
        let calculatedPricing = null;
        
        if (shouldAutoCalculate) {
            console.log('🧮 Auto-calculation triggered for update - processing pricing');
            
            if (sseNotifier) {
                sseNotifier({
                    type: 'calculation_start',
                    data: {
                        session_id: sessionId,
                        agent_name: 'quotation-price-calculations',
                        message: 'Recalculating prices with updated data',
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
            calculatedPricing = this.priceCalculator.calculateQuotationPricing(
                normalizedInput.quotation_data,
                normalizedInput.pricing_variables || {}
            );
            
            this.stats.autoCalculations++;
            sessionData.calculatedPricing = calculatedPricing;
            
            // Merge calculated pricing results back into quotation data for persistence
            this.mergeCalculatedPricingIntoQuotationData(sessionData, calculatedPricing);
            
            if (sseNotifier) {
                sseNotifier({
                    type: 'calculation_complete',
                    data: {
                        session_id: sessionId,
                        agent_name: 'quotation-price-calculations',
                        pricing_summary: calculatedPricing.pricing_summary,
                        items_processed: calculatedPricing.total_items,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }

        // Generate updated preview data
        const previewData = this.generatePreviewData(sessionData, calculatedPricing);
        sessionData.previewData = previewData;
        
        // Regenerate documents with updated data
        const generatedFiles = await this.generateDocuments(sessionData, calculatedPricing, false);
        sessionData.generatedFiles = generatedFiles;
        
        // Update session status
        sessionData.status = 'completed';
        sessionData.completedAt = new Date();
        
        console.log(`✅ Quotation update completed - Session: ${sessionId}`);
        
        return {
            quotation_data: sessionData.quotationData,
            calculated_pricing: calculatedPricing,
            preview_data: previewData,
            generated_files: generatedFiles,
            session_data: {
                id: sessionId,
                updated_at: sessionData.lastUpdate,
                completed_at: sessionData.completedAt
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Process quotation calculation only (no document generation)
     * Used for real-time price updates from formula UI
     */
    async processQuotationCalculation(input, sessionId, sseNotifier = null) {
        console.log(`🧮 Starting calculation-only request - Session: ${sessionId}`);
        
        // Normalize the data structure to match expected schema
        const normalizedInput = this.normalizeQuotationData(input);
        
        // Retrieve or create session data (lightweight for calculations)
        let sessionData = this.activeSessions.get(sessionId);
        if (!sessionData) {
            console.log(`🆕 Creating lightweight session for calculation request: ${sessionId}`);
            sessionData = {
                id: sessionId,
                action: 'calculate',
                createdAt: new Date()
            };
            this.activeSessions.set(sessionId, sessionData);
        }
        
        // Update session data
        sessionData.input = normalizedInput;
        sessionData.quotationData = normalizedInput.quotation_data;
        sessionData.lastUpdate = new Date();
        sessionData.status = 'calculating';
        
        // CRITICAL FIX: Store pricing variables in session for future retrieval
        if (normalizedInput.pricing_variables && Object.keys(normalizedInput.pricing_variables).length > 0) {
            sessionData.storedPricingVariables = normalizedInput.pricing_variables;
            console.log('💾 Stored pricing variables in session during calculation:', normalizedInput.pricing_variables);
        }
        
        console.log('🧮 Performing price calculations without document generation');
        
        if (sseNotifier) {
            sseNotifier({
                type: 'calculation_start',
                data: {
                    session_id: sessionId,
                    agent_name: 'quotation-price-calculations',
                    message: 'Calculating prices (no documents generated)',
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        // Perform calculations
        const calculatedPricing = this.priceCalculator.calculateQuotationPricing(
            normalizedInput.quotation_data,
            normalizedInput.pricing_variables || {}
        );
        
        this.stats.autoCalculations++;
        sessionData.calculatedPricing = calculatedPricing;
        
        // Merge calculated pricing results back into quotation data for persistence
        this.mergeCalculatedPricingIntoQuotationData(sessionData, calculatedPricing);
        
        // Generate preview data for UI updates
        const previewData = this.generatePreviewData(sessionData, calculatedPricing);
        sessionData.previewData = previewData;
        
        // Update session status
        sessionData.status = 'completed';
        sessionData.completedAt = new Date();
        
        if (sseNotifier) {
            sseNotifier({
                type: 'calculation_complete',
                data: {
                    session_id: sessionId,
                    agent_name: 'quotation-price-calculations',
                    pricing_summary: calculatedPricing.pricing_summary,
                    items_processed: calculatedPricing.total_items,
                    message: 'Price calculations completed (no files generated)',
                    timestamp: new Date().toISOString()
                }
            });
        }
        
        console.log(`✅ Calculation-only request completed - Session: ${sessionId}`);
        
        return {
            quotation_data: sessionData.quotationData,
            calculated_pricing: calculatedPricing,
            preview_data: previewData,
            generated_files: null, // No files generated
            session_data: {
                id: sessionId,
                updated_at: sessionData.lastUpdate,
                completed_at: sessionData.completedAt
            },
            timestamp: new Date().toISOString()
        };
    }

    // =========================================================================
    // 🔍 AUTO-CALCULATION DETECTION
    // =========================================================================
    
    /**
     * Determine if automatic price calculation should be triggered
     * Based on conditions defined in quotation-input.json
     * @param {Object} input - Validated input data
     * @returns {boolean} Whether to trigger auto-calculation
     */
    shouldTriggerAutoCalculation(input) {
        const actionType = input.action_type;
        const quotationData = input.quotation_data;
        const pricingVariables = input.pricing_variables;
        
        // For generate action: never auto-calculate, always leave prices blank
        if (actionType === 'generate') {
            console.log(`🔍 Auto-calculation disabled for generate action - prices will be blank`);
            return false;
        }
        
        // For update action: only calculate if pricing variables are explicitly provided
        if (actionType === 'update') {
            const hasPricingVariables = pricingVariables && 
                                       Object.keys(pricingVariables).length > 0;
            
            console.log(`🔍 Auto-calculation check for update:`, {
                action_type: actionType,
                has_pricing_variables: hasPricingVariables,
                variables_count: Object.keys(pricingVariables || {}).length
            });
            
            return hasPricingVariables;
        }
        
        return false;
    }

    // =========================================================================
    // 📄 DOCUMENT GENERATION & PREVIEW
    // =========================================================================
    
    /**
     * Generate preview data for UI display
     * @param {Object} sessionData - Session data
     * @param {Object} calculatedPricing - Calculated pricing results
     * @returns {Object} Preview data structured for UI consumption
     */
    generatePreviewData(sessionData, calculatedPricing) {
        const quotationData = sessionData.quotationData;
        const previewItems = [];
        
        // Process each quotation item for preview
        if (quotationData?.quotation_items) {
            quotationData.quotation_items.forEach((item, index) => {
                const calculatedItem = calculatedPricing?.processed_items?.find(
                    calc => calc.item_no === item.item_no
                ) || null;
                
                previewItems.push({
                    item_no: item.item_no || (index + 1).toString(),
                    description: item.company_requirement?.description || 'No description',
                    quantity: item.company_requirement?.qty || 0,
                    uom: item.company_requirement?.uom || 'EA',
                    original_unit_price: item.bidder_proposal?.unit_price_vnd || 0,
                    calculated_unit_price: calculatedItem?.sales_unit_price || calculatedItem?.profit_unit_price || null,
                    calculated_ext_price: calculatedItem?.ext_price || null,
                    potential_profit: calculatedItem?.potential_profit || 0,
                    delivery_time: item.bidder_proposal?.delivery_time || '',
                    specifications: item.company_requirement?.specifications || '',
                    compliance: item.bidder_proposal?.compliance_deviation || ''
                });
            });
        }
        
        return {
            session_id: sessionData.id,
            rfq_reference: quotationData?.rfq_reference || '',
            customer_info: quotationData?.customer_info || {},
            items: previewItems,
            pricing_summary: calculatedPricing?.pricing_summary || {
                subtotal: 0,
                currency: 'VND'
            },
            calculation_metadata: calculatedPricing?.calculation_metadata || null,
            generation_info: {
                generated_at: new Date().toISOString(),
                action_type: sessionData.action,
                auto_calculated: !!calculatedPricing
            }
        };
    }

    /**
     * Generate HTML documents from template with table format
     * Parses default-template.html and generates table rows for all quotation items
     * @param {Object} sessionData - Session data
     * @param {Object} calculatedPricing - Calculated pricing results
     * @param {boolean} updateLatest - Whether to update latest.json (default: true for new quotations, false for updates)
     * @returns {Object} Generated file information
     */
    async generateDocuments(sessionData, calculatedPricing, updateLatest = true) {
        try {
            console.log('📄 Starting template-based document generation');
            
            // Skip document generation for updates with unknown/missing data
            if (sessionData.action === 'update' && (!sessionData.quotationData?.rfq_reference || !sessionData.quotationData?.customer_info?.company_name)) {
                console.log('📌 Skipping document generation for update with incomplete RFQ/customer data');
                return {
                    html_file: null,
                    pdf_file: null,
                    excel_file: null,
                    base_filename: null,
                    updated_at: new Date().toISOString()
                };
            }
            
            // Load default template
            const template = await this.loadTemplate('default-template.html');
            
            // Generate table rows based on action type
            const tableRows = this.generateTableRows(
                sessionData.quotationData.quotation_items || [], 
                calculatedPricing,
                sessionData.action
            );
            
            // Replace template variables
            const htmlContent = this.populateTemplate(template, sessionData, calculatedPricing, tableRows);
            
            // Generate standardized filename based on RFQ and customer data
            const baseFilename = this.generateQuotationFilename(sessionData.quotationData);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${baseFilename}_${timestamp}.html`;
            const filePath = path.join(__dirname, '..', 'assets', 'generated', filename);
            
            // Ensure assets/generated directory exists
            const assetsDir = path.join(__dirname, '..', 'assets');
            const generatedDir = path.join(assetsDir, 'generated');
            
            if (!fs.existsSync(assetsDir)) {
                fs.mkdirSync(assetsDir, { recursive: true });
            }
            if (!fs.existsSync(generatedDir)) {
                fs.mkdirSync(generatedDir, { recursive: true });
            }
            
            // Clean up old files for the same RFQ+customer combination (maintain one version per unique combination)
            console.log(`🧹 Cleaning up old files for: ${baseFilename}...`);
            try {
                const existingFiles = fs.readdirSync(generatedDir);
                let deletedCount = 0;
                
                existingFiles.forEach(file => {
                    // Don't delete the index files
                    if (file === 'latest.json' || file === 'quotations-index.json') return;
                    
                    // Only delete files that match the same baseFilename (same RFQ + customer)
                    if ((file.endsWith('.html') || file.endsWith('.pdf') || file.endsWith('.xlsx') || file.endsWith('_data.json')) && 
                        file.startsWith(baseFilename + '_')) {
                        const oldFilePath = path.join(generatedDir, file);
                        fs.unlinkSync(oldFilePath);
                        deletedCount++;
                        console.log(`🗑️ Deleted old version: ${file}`);
                    }
                });
                
                if (deletedCount > 0) {
                    console.log(`✅ Cleaned up ${deletedCount} old versions for ${baseFilename}`);
                } else {
                    console.log(`📂 No old versions to clean up for ${baseFilename}`);
                }
            } catch (cleanupError) {
                console.warn('⚠️ Warning: Could not clean up old files:', cleanupError.message);
            }
            
            // Write new HTML file
            fs.writeFileSync(filePath, htmlContent, 'utf8');
            
            // Save complete quotation data for future retrieval with pricing variables
            // FIX 3: Simplified and reliable logic for pricing variables storage
            const currentInputVariables = sessionData.input?.pricing_variables || {};
            const storedSessionVariables = sessionData.storedPricingVariables || {};
            
            let finalPricingVariables = {};
            let shouldSavePricingVariables = false;
            let variableSource = 'none';
            
            if (sessionData.action === 'update') {
                // For UPDATE actions: Always save pricing variables when they exist from user input
                // Priority 1: Current UI input (from the Apply button click)
                if (this.hasUserInputVariables(currentInputVariables)) {
                    finalPricingVariables = currentInputVariables;
                    shouldSavePricingVariables = true;
                    variableSource = 'current_ui_input';
                }
                // Priority 2: Previously stored session variables 
                else if (this.hasUserInputVariables(storedSessionVariables)) {
                    finalPricingVariables = storedSessionVariables;
                    shouldSavePricingVariables = true;
                    variableSource = 'stored_session';
                }
                // Priority 3: For updates, always save something to indicate the update occurred
                else {
                    finalPricingVariables = this.getSystemDefaults();
                    shouldSavePricingVariables = true;
                    variableSource = 'system_defaults_explicit';
                }
            } else {
                // For GENERATE actions: Only save if explicit user input exists
                if (this.hasUserInputVariables(currentInputVariables)) {
                    finalPricingVariables = currentInputVariables;
                    shouldSavePricingVariables = true;
                    variableSource = 'current_input';
                } else if (this.hasUserInputVariables(storedSessionVariables)) {
                    finalPricingVariables = storedSessionVariables;
                    shouldSavePricingVariables = true;
                    variableSource = 'stored_session';
                } else {
                    // ENHANCED: For Apply button scenarios, check if we have any variables at all
                    if (Object.keys(currentInputVariables).length > 0 || Object.keys(storedSessionVariables).length > 0) {
                        finalPricingVariables = Object.keys(currentInputVariables).length > 0 ? currentInputVariables : storedSessionVariables;
                        shouldSavePricingVariables = true;
                        variableSource = 'apply_button_fallback';
                    } else {
                        shouldSavePricingVariables = false;
                        variableSource = 'none';
                    }
                }
            }
            
            const variablesToSave = shouldSavePricingVariables ? finalPricingVariables : null;
            
            console.log('💾 FIX 3 - Reliable pricing variables storage logic:', {
                action_type: sessionData.action,
                current_input_vars: currentInputVariables,
                stored_session_vars: storedSessionVariables,
                has_current_user_input: this.hasUserInputVariables(currentInputVariables),
                has_stored_user_input: this.hasUserInputVariables(storedSessionVariables),
                final_vars_to_save: finalPricingVariables,
                should_save: shouldSavePricingVariables,
                variable_source: variableSource
            });
            
            const savedDataFilename = this.saveQuotationData(generatedDir, baseFilename, sessionData, calculatedPricing, variablesToSave);
            
            // Update quotations index to track all available quotations
            this.updateQuotationsIndex(generatedDir, filename, baseFilename, sessionData.quotationData);
            
            // Re-enabled: latest.json creation for automatic preview display after generation
            if (updateLatest) {
                console.log('📌 latest.json created for automatic preview display');
                const indexPath = path.join(generatedDir, 'latest.json');
                const indexData = {
                    filename: filename,
                    generated_at: new Date().toISOString(),
                    size: htmlContent.length,
                    base_filename: baseFilename,
                    data_filename: savedDataFilename
                };
                fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
            } else {
                console.log('📌 latest.json creation skipped for this operation');
            }
            
            console.log(`✅ HTML document generated: ${filename}`);
            
            return {
                html: {
                    filename: filename,
                    path: filePath,
                    url: `http://localhost:5000/assets/generated/${filename}`,
                    status: 'generated',
                    content: htmlContent
                },
                pdf: {
                    filename: `${baseFilename}_${timestamp}.pdf`,
                    path: `/assets/generated/${baseFilename}_${timestamp}.pdf`,
                    url: `http://localhost:5000/assets/generated/${baseFilename}_${timestamp}.pdf`,
                    status: 'pending_pdf_conversion'
                },
                excel: {
                    filename: `${baseFilename}_${timestamp}.xlsx`,
                    path: `/assets/generated/${baseFilename}_${timestamp}.xlsx`,
                    url: `http://localhost:5000/assets/generated/${baseFilename}_${timestamp}.xlsx`,
                    status: 'pending_excel_conversion'
                },
                table_rows_count: (sessionData.quotationData.quotation_items || []).length
            };
        } catch (error) {
            console.error('❌ Document generation error:', error);
            throw new Error(`Document generation failed: ${error.message}`);
        }
    }

    /**
     * Load HTML template from templates directory
     * @param {string} templateName - Template filename
     * @returns {string} Template content
     */
    async loadTemplate(templateName) {
        const fs = require('fs');
        const customTemplatesDir = path.join(__dirname, '..', 'assets', 'template', 'custom_templates');
        const defaultTemplatePath = path.join(__dirname, '..', 'assets', 'template', templateName);
        
        console.log('🔍 Checking for custom templates in:', customTemplatesDir);
        
        // First check for any custom template in custom_templates folder
        let templatePath = defaultTemplatePath;
        if (fs.existsSync(customTemplatesDir)) {
            const customFiles = fs.readdirSync(customTemplatesDir).filter(file => file.endsWith('.html'));
            if (customFiles.length > 0) {
                // Use the first custom template found
                templatePath = path.join(customTemplatesDir, customFiles[0]);
                console.log('✅ Using custom template:', customFiles[0]);
            } else {
                console.log('📄 No custom templates found, using default:', templateName);
            }
        } else {
            console.log('📄 Custom templates directory not found, using default:', templateName);
        }
        
        if (!fs.existsSync(templatePath)) {
            throw new Error(`Template file not found: ${templatePath}`);
        }
        
        return fs.readFileSync(templatePath, 'utf8');
    }

    /**
     * Generate table rows for quotation items
     * On generate: append new rows for each item
     * On update: overwrite matching rows, append new ones
     * @param {Array} quotationItems - Array of quotation items
     * @param {Object} calculatedPricing - Pricing calculation results
     * @param {string} action - 'generate' or 'update'
     * @returns {string} HTML table rows
     */
    generateTableRows(quotationItems, calculatedPricing, action) {
        console.log(`🔄 Generating table rows - Action: ${action}, Items: ${quotationItems.length}`);
        console.log(`📊 CalculatedPricing exists: ${!!calculatedPricing}, ProcessedItems count: ${calculatedPricing?.processed_items?.length || 0}`);
        
        if (!quotationItems || quotationItems.length === 0) {
            return '<tr><td colspan="10" style="text-align: center; color: #666;">No items available</td></tr>';
        }
        
        // Debug: Log all available calculated items for better matching
        if (calculatedPricing?.processed_items) {
            console.log(`📋 Available calculated items:`, calculatedPricing.processed_items.map(calc => ({
                item_no: calc.item_no,
                sales_unit_price: calc.sales_unit_price,
                profit_unit_price: calc.profit_unit_price,
                ext_price: calc.ext_price
            })));
        }
        
        let rows = '';
        
        quotationItems.forEach((item, index) => {
            // Find calculated pricing for this item with enhanced matching
            const itemNo = item.item_no || (index + 1).toString();
            console.log(`🔍 Searching for item: "${itemNo}" (type: ${typeof itemNo})`);
            
            const calculatedItem = calculatedPricing?.processed_items?.find(calc => {
                console.log(`  🔍 Comparing with calc.item_no: "${calc.item_no}" (type: ${typeof calc.item_no})`);
                return String(calc.item_no) === String(itemNo) || calc.item_no == itemNo;
            });
            
            console.log(`🔍 Item ${itemNo}: calculatedItem found = ${!!calculatedItem}`);
            if (calculatedItem) {
                console.log(`  📊 Found calculated data:`, {
                    sales_unit_price: calculatedItem.sales_unit_price,
                    profit_unit_price: calculatedItem.profit_unit_price,
                    ext_price: calculatedItem.ext_price
                });
            }
            
            // Extract all required fields from quotation item
            const description = item.company_requirement?.description || item.bidder_proposal?.description || 'No description';
            const modelPartNumber = item.company_requirement?.model_part_number || '';
            const manufacturer = item.company_requirement?.maker_origin || '';
            const uom = item.company_requirement?.uom || 'EA';
            const qty = item.company_requirement?.qty || 0;
            
            // Enhanced price extraction with fallbacks and type checking
            let unitPrice = 0;
            let extPrice = 0;
            
            if (calculatedItem) {
                // Prioritize calculated values with proper type checking
                unitPrice = calculatedItem.sales_unit_price || calculatedItem.profit_unit_price || 0;
                extPrice = calculatedItem.ext_price || 0;
                
                // Ensure numeric values
                unitPrice = typeof unitPrice === 'number' ? unitPrice : parseFloat(unitPrice) || 0;
                extPrice = typeof extPrice === 'number' ? extPrice : parseFloat(extPrice) || 0;
                
                console.log(`  ✅ Using calculated prices: unitPrice=${unitPrice}, extPrice=${extPrice}`);
            } else {
                // Fallback to original prices
                unitPrice = item.bidder_proposal?.unit_price_vnd || item.bidder_proposal?.original_unit_price || item.bidder_proposal?.original_unit_price_vnd || 0;
                extPrice = item.bidder_proposal?.ext_price_vnd || item.bidder_proposal?.original_ext_price_vnd || (unitPrice * qty);
                
                unitPrice = typeof unitPrice === 'number' ? unitPrice : parseFloat(unitPrice) || 0;
                extPrice = typeof extPrice === 'number' ? extPrice : parseFloat(extPrice) || 0;
                
                console.log(`  ⚠️ Using fallback prices: unitPrice=${unitPrice}, extPrice=${extPrice}`);
            }
            
            const deliveryTime = item.bidder_proposal?.delivery_time || '';
            const compliance = item.bidder_proposal?.compliance_deviation || '';
            
            // Format numbers with thousand separators
            const formattedUnitPrice = (unitPrice && unitPrice > 0) ? unitPrice.toLocaleString('vi-VN') : '0';
            const formattedExtPrice = (extPrice && extPrice > 0) ? extPrice.toLocaleString('vi-VN') : '0';
            
            rows += `
            <tr data-item-no="${itemNo}">
                <td>${itemNo}</td>
                <td>${description}</td>
                <td>${modelPartNumber}</td>
                <td>${manufacturer}</td>
                <td>${uom}</td>
                <td class="number">${qty}</td>
                <td class="number">${formattedUnitPrice}</td>
                <td class="number">${formattedExtPrice}</td>
                <td>${deliveryTime}</td>
                <td>${compliance}</td>
            </tr>`;
        });
        
        return rows;
    }

    /**
     * Load stored assets (logo and signature) from asset directories
     * @returns {Object} Asset data with base64 encoded content
     */
    async loadStoredAssets() {
        const assets = {
            logo: null,
            signature: null
        };
        
        try {
            // Load logo
            const logoDir = path.join(__dirname, '..', 'assets', 'logo');
            if (fs.existsSync(logoDir)) {
                const logoFiles = fs.readdirSync(logoDir).filter(file => 
                    /\.(png|jpg|jpeg|svg)$/i.test(file)
                );
                if (logoFiles.length > 0) {
                    const logoPath = path.join(logoDir, logoFiles[0]); // Use first logo found
                    const logoData = fs.readFileSync(logoPath);
                    const logoExt = path.extname(logoFiles[0]).toLowerCase();
                    const mimeType = this.getImageMimeType(logoExt);
                    assets.logo = {
                        filename: logoFiles[0],
                        base64: logoData.toString('base64'),
                        mimeType: mimeType,
                        dataUrl: `data:${mimeType};base64,${logoData.toString('base64')}`
                    };
                    console.log(`📷 Loaded logo: ${logoFiles[0]}`);
                }
            }
            
            // Load signature
            const signatureDir = path.join(__dirname, '..', 'assets', 'signature');
            if (fs.existsSync(signatureDir)) {
                const signatureFiles = fs.readdirSync(signatureDir).filter(file => 
                    /\.(png|jpg|jpeg|svg)$/i.test(file)
                );
                if (signatureFiles.length > 0) {
                    const signaturePath = path.join(signatureDir, signatureFiles[0]); // Use first signature found
                    const signatureData = fs.readFileSync(signaturePath);
                    const signatureExt = path.extname(signatureFiles[0]).toLowerCase();
                    const mimeType = this.getImageMimeType(signatureExt);
                    assets.signature = {
                        filename: signatureFiles[0],
                        base64: signatureData.toString('base64'),
                        mimeType: mimeType,
                        dataUrl: `data:${mimeType};base64,${signatureData.toString('base64')}`
                    };
                    console.log(`✍️ Loaded signature: ${signatureFiles[0]}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Error loading assets:', error);
        }
        
        return assets;
    }

    /**
     * Load stored assets synchronously (logo and signature) from asset directories
     * @returns {Object} Asset data with base64 encoded content
     */
    loadStoredAssetsSync() {
        const assets = {
            logo: null,
            signature: null
        };
        
        try {
            // Load logo
            const logoDir = path.join(__dirname, '..', 'assets', 'logo');
            if (fs.existsSync(logoDir)) {
                const logoFiles = fs.readdirSync(logoDir).filter(file => 
                    /\.(png|jpg|jpeg|svg)$/i.test(file)
                );
                if (logoFiles.length > 0) {
                    const logoPath = path.join(logoDir, logoFiles[0]); // Use first logo found
                    const logoData = fs.readFileSync(logoPath);
                    const logoExt = path.extname(logoFiles[0]).toLowerCase();
                    const mimeType = this.getImageMimeType(logoExt);
                    assets.logo = {
                        filename: logoFiles[0],
                        base64: logoData.toString('base64'),
                        mimeType: mimeType,
                        dataUrl: `data:${mimeType};base64,${logoData.toString('base64')}`
                    };
                    console.log(`📷 Loaded logo: ${logoFiles[0]}`);
                }
            }
            
            // Load signature
            const signatureDir = path.join(__dirname, '..', 'assets', 'signature');
            if (fs.existsSync(signatureDir)) {
                const signatureFiles = fs.readdirSync(signatureDir).filter(file => 
                    /\.(png|jpg|jpeg|svg)$/i.test(file)
                );
                if (signatureFiles.length > 0) {
                    const signaturePath = path.join(signatureDir, signatureFiles[0]); // Use first signature found
                    const signatureData = fs.readFileSync(signaturePath);
                    const signatureExt = path.extname(signatureFiles[0]).toLowerCase();
                    const mimeType = this.getImageMimeType(signatureExt);
                    assets.signature = {
                        filename: signatureFiles[0],
                        base64: signatureData.toString('base64'),
                        mimeType: mimeType,
                        dataUrl: `data:${mimeType};base64,${signatureData.toString('base64')}`
                    };
                    console.log(`✍️ Loaded signature: ${signatureFiles[0]}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Error loading assets:', error);
        }
        
        return assets;
    }
    
    /**
     * Get MIME type for image file extensions
     * @param {string} extension - File extension
     * @returns {string} MIME type
     */
    getImageMimeType(extension) {
        const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml'
        };
        return mimeTypes[extension.toLowerCase()] || 'image/jpeg';
    }

    /**
     * Populate template with actual data including stored assets
     * @param {string} template - HTML template content
     * @param {Object} sessionData - Session data
     * @param {Object} calculatedPricing - Pricing calculation results
     * @param {string} tableRows - Generated table rows HTML
     * @returns {string} Populated HTML content
     */
    populateTemplate(template, sessionData, calculatedPricing, tableRows) {
        const quotationData = sessionData.quotationData;
        const customerInfo = quotationData?.customer_info || {};
        
        // Calculate total amount
        const totalAmount = calculatedPricing?.pricing_summary?.subtotal || 
                           this.calculateTotalFromItems(quotationData.quotation_items || []);
        const formattedTotal = typeof totalAmount === 'number' ? totalAmount.toLocaleString('vi-VN') : totalAmount;
        
        // Load stored assets (logo and signature) - synchronously for now
        const assets = this.loadStoredAssetsSync();
        
        // Prepare asset HTML
        const logoHtml = assets.logo ? 
            `<img src="${assets.logo.dataUrl}" alt="Company Logo" style="max-height: 80px; max-width: 200px;">` : 
            '<div class="no-logo">No Logo</div>';
            
        const signatureHtml = assets.signature ? 
            `<img src="${assets.signature.dataUrl}" alt="Signature" style="max-height: 60px; max-width: 150px;">` : 
            '<div class="no-signature">No Signature</div>';
        
        // Replace all template variables including assets
        return template
            .replace(/\{\{company_logo\}\}/g, logoHtml)
            .replace(/\{\{company_signature\}\}/g, signatureHtml)
            .replace(/\{\{rfq_reference\}\}/g, quotationData?.rfq_reference || 'N/A')
            .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('vi-VN'))
            .replace(/\{\{customer_company\}\}/g, customerInfo.company_name || 'N/A')
            .replace(/\{\{customer_contact\}\}/g, customerInfo.contact_person || 'N/A')
            .replace(/\{\{customer_email\}\}/g, customerInfo.email || 'N/A')
            .replace(/\{\{customer_address\}\}/g, customerInfo.address || 'N/A')
            .replace(/\{\{table_rows\}\}/g, tableRows)
            .replace(/\{\{total_amount\}\}/g, formattedTotal)
            .replace(/\{\{currency\}\}/g, calculatedPricing?.pricing_summary?.currency || 'VND')
            .replace(/\{\{generated_date\}\}/g, new Date().toLocaleString('vi-VN'));
    }

    /**
     * Calculate total amount from items when pricing calculation is not available
     * @param {Array} quotationItems - Quotation items
     * @returns {number} Total amount
     */
    calculateTotalFromItems(quotationItems) {
        return quotationItems.reduce((total, item) => {
            const qty = item.company_requirement?.qty || 0;
            const unitPrice = item.bidder_proposal?.unit_price_vnd || 0;
            const extPrice = item.bidder_proposal?.ext_price_vnd || (unitPrice * qty);
            return total + (typeof extPrice === 'number' ? extPrice : 0);
        }, 0);
    }

    // =========================================================================
    // ✅ INPUT VALIDATION
    // =========================================================================
    
    /**
     * Normalize quotation data to match the expected schema and handle currency_code
     * @param {Object} input - Raw input data
     * @returns {Object} Normalized input data
     */
    normalizeQuotationData(input) {
        const normalized = JSON.parse(JSON.stringify(input)); // Deep clone
        
        if (normalized.quotation_data && normalized.quotation_data.quotation_items) {
            normalized.quotation_data.quotation_items = normalized.quotation_data.quotation_items.map(item => {
                // If pricing data is at root level, move it to bidder_proposal
                if (item.unit_price || item.unit_price_vnd || item.ext_price_vnd || item.delivery_time) {
                    if (!item.bidder_proposal) {
                        item.bidder_proposal = {};
                    }
                    
                    // Handle standardized unit_price field (new standard)
                    if (item.unit_price !== undefined) {
                        // Store original price for calculations
                        item.bidder_proposal.original_unit_price = item.unit_price;
                        // Set display price to blank initially
                        item.bidder_proposal.unit_price = "";
                        delete item.unit_price;
                    }
                    
                    // Handle legacy unit_price_vnd field (backward compatibility)
                    if (item.unit_price_vnd !== undefined) {
                        // Store original price for calculations
                        item.bidder_proposal.original_unit_price_vnd = item.unit_price_vnd;
                        // Set display price to blank initially
                        item.bidder_proposal.unit_price_vnd = "";
                        delete item.unit_price_vnd;
                    }
                    
                    if (item.ext_price_vnd !== undefined) {
                        // Store original ext price for reference
                        item.bidder_proposal.original_ext_price_vnd = item.ext_price_vnd;
                        // Set display ext price to blank initially
                        item.bidder_proposal.ext_price_vnd = "";
                        delete item.ext_price_vnd;
                    }
                    
                    if (item.delivery_time !== undefined) {
                        item.bidder_proposal.delivery_time = item.delivery_time;
                        delete item.delivery_time;
                    }
                }
                
                // Handle currency_code - preserve in both locations for compatibility
                if (item.currency_code !== undefined) {
                    // Keep at item level for easy access
                    item.currency_code = item.currency_code;
                    
                    // Also add to bidder_proposal for consistency
                    if (!item.bidder_proposal) {
                        item.bidder_proposal = {};
                    }
                    item.bidder_proposal.currency_code = item.currency_code;
                }
                
                // Ensure UOM is in company_requirement if provided at root
                if (item.uom !== undefined && item.company_requirement) {
                    item.company_requirement.uom = item.uom;
                    delete item.uom;
                }
                
                return item;
            });
        }
        
        console.log('🔄 Data normalized - original prices saved, display prices set to blank');
        console.log('📝 Sample normalized item:', JSON.stringify(normalized.quotation_data?.quotation_items?.[0], null, 2));
        return normalized;
    }

    /**
     * Validate and normalize input data against schema
     * @param {Object} input - Raw input data
     * @returns {Object} Validated and normalized input
     */
    validateInput(input) {
        if (!input) {
            throw new Error('Input data is required');
        }

        // Check required action_type
        if (!input.action_type) {
            throw new Error('action_type is required (generate|update)');
        }

        if (!['generate', 'update'].includes(input.action_type)) {
            throw new Error('action_type must be either "generate" or "update"');
        }

        // Validate quotation_data
        if (!input.quotation_data) {
            throw new Error('quotation_data is required');
        }

        if (!input.quotation_data.quotation_items || !Array.isArray(input.quotation_data.quotation_items)) {
            throw new Error('quotation_data.quotation_items must be an array');
        }

        if (input.quotation_data.quotation_items.length === 0) {
            throw new Error('At least one quotation item is required');
        }

        // Validate against schema rules
        const rules = this.inputSchema.validation_rules || {};
        const itemRules = rules.quotation_items || {};
        
        if (itemRules.max_items && input.quotation_data.quotation_items.length > itemRules.max_items) {
            throw new Error(`Too many items. Maximum ${itemRules.max_items} allowed`);
        }

        if (itemRules.min_items && input.quotation_data.quotation_items.length < itemRules.min_items) {
            throw new Error(`Too few items. Minimum ${itemRules.min_items} required`);
        }

        // Validate individual items
        input.quotation_data.quotation_items.forEach((item, index) => {
            this.validateQuotationItem(item, index);
        });

        console.log(`✅ Input validation passed - Action: ${input.action_type}, Items: ${input.quotation_data.quotation_items.length}`);
        
        return input;
    }

    /**
     * Validate individual quotation item
     * @param {Object} item - Quotation item
     * @param {number} index - Item index for error messages
     */
    validateQuotationItem(item, index) {
        const itemRef = `Item ${index + 1}`;
        
        if (!item.item_no) {
            throw new Error(`${itemRef}: item_no is required`);
        }

        if (!item.company_requirement) {
            throw new Error(`${itemRef}: company_requirement is required`);
        }

        if (!item.company_requirement.description) {
            throw new Error(`${itemRef}: company_requirement.description is required`);
        }

        if (!item.company_requirement.qty || parseFloat(item.company_requirement.qty) <= 0) {
            throw new Error(`${itemRef}: company_requirement.qty must be greater than 0`);
        }
    }

    // =========================================================================
    // 🛠️ UTILITY FUNCTIONS
    // =========================================================================
    
    /**
     * Generate unique session ID
     * @returns {string} Session ID
     */
    generateSessionId() {
        return 'quotation_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get current session data
     * @param {string} sessionId - Session ID
     * @returns {Object|null} Session data or null if not found
     */
    getSessionData(sessionId) {
        return this.activeSessions.get(sessionId) || null;
    }

    /**
     * Generate standardized filename based on RFQ and customer data
     * @param {Object} quotationData - Quotation data containing rfq_reference and customer_info
     * @returns {string} Sanitized filename in format quotation_<rfq_number>_<customer_name>
     */
    generateQuotationFilename(quotationData) {
        console.log(`📁 Generating filename for quotation data:`, {
            rfq_reference: quotationData?.rfq_reference,
            customer_name: quotationData?.customer_info?.company_name,
            has_quotation_data: !!quotationData
        });
        
        // Extract RFQ reference and customer name with better fallback logic
        const rfqReference = quotationData?.rfq_reference || 'unknown_rfq';
        const customerName = quotationData?.customer_info?.company_name || 'unknown_customer';
        
        // Warn if using fallback values
        if (rfqReference === 'unknown_rfq') {
            console.warn(`⚠️ No RFQ reference found, using fallback: ${rfqReference}`);
        }
        if (customerName === 'unknown_customer') {
            console.warn(`⚠️ No customer name found, using fallback: ${customerName}`);
        }
        
        // Sanitize strings for filename compatibility
        const sanitizedRfq = rfqReference
            .replace(/[^a-zA-Z0-9\-_]/g, '_')  // Replace special chars with underscore
            .replace(/_+/g, '_')               // Collapse multiple underscores
            .substring(0, 50);                 // Limit length
            
        const sanitizedCustomer = customerName
            .replace(/[^a-zA-Z0-9\-_]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 50);
        
        const filename = `quotation_${sanitizedRfq}_${sanitizedCustomer}`;
        console.log(`📁 Generated base filename: ${filename}`);
        
        return filename;
    }

    /**
     * Update the quotations index file to track all available quotations
     * @param {string} generatedDir - Path to generated files directory
     * @param {string} filename - Current file name
     * @param {string} baseFilename - Base filename (without timestamp)
     * @param {Object} quotationData - Quotation data for metadata
     */
    updateQuotationsIndex(generatedDir, filename, baseFilename, quotationData) {
        try {
            const indexPath = path.join(generatedDir, 'quotations-index.json');
            let quotationsIndex = {};
            
            // Load existing index
            if (fs.existsSync(indexPath)) {
                const existingData = fs.readFileSync(indexPath, 'utf8');
                quotationsIndex = JSON.parse(existingData);
            }
            
            // Update index with current quotation
            quotationsIndex[baseFilename] = {
                filename: filename,
                base_filename: baseFilename,
                rfq_reference: quotationData?.rfq_reference || 'unknown_rfq',
                customer_name: quotationData?.customer_info?.company_name || 'unknown_customer',
                generated_at: new Date().toISOString(),
                last_updated: new Date().toISOString()
            };
            
            // Save updated index
            fs.writeFileSync(indexPath, JSON.stringify(quotationsIndex, null, 2), 'utf8');
            console.log(`📋 Updated quotations index with: ${baseFilename}`);
            
        } catch (error) {
            console.error('❌ Error updating quotations index:', error);
        }
    }

    /**
     * FIX 3: Enhanced variable extraction with dual format support and UPDATE action awareness
     * @param {Object} pricingVariables - Input pricing variables (per-item or global)
     * @param {Object} sessionData - Session data containing quotation items
     * @returns {Object} Enhanced pricing variables with both formats
     */
    enhancedVariableExtraction(pricingVariables, sessionData) {
        const actionType = sessionData?.action || 'generate';
        const isUpdateAction = actionType === 'update';
        
        console.log('🔄 FIX 3 - Enhanced variable extraction:', {
            input_format: typeof pricingVariables,
            action_type: actionType,
            is_update_action: isUpdateAction
        });
        console.log('📥 Original user input:', JSON.stringify(pricingVariables, null, 2));
        
        // Check if input is per-item format (object with item numbers as keys)
        const isPerItemFormat = pricingVariables && typeof pricingVariables === 'object' && 
                               Object.keys(pricingVariables).some(key => 
                                   pricingVariables[key] && typeof pricingVariables[key] === 'object' &&
                                   ('shipping_cost' in pricingVariables[key] || 'tax_rate' in pricingVariables[key])
                               );
        
        console.log('📊 Input format detected:', isPerItemFormat ? 'per-item' : 'global');
        
        let perItemVariables = {};
        let globalVariables = {};
        
        if (isPerItemFormat) {
            // Extract per-item variables directly with proper user input preservation
            perItemVariables = {};
            Object.keys(pricingVariables).forEach(itemNo => {
                const itemVars = pricingVariables[itemNo];
                
                // DEBUG: Parse each variable and check what gets preserved vs defaulted
                const parsedShipping = this.parseAndValidateUserInput(itemVars.shipping_cost);
                const parsedTax = this.parseAndValidateUserInput(itemVars.tax_rate);
                const parsedExchange = this.parseAndValidateUserInput(itemVars.exchange_rate);
                const parsedProfit = this.parseAndValidateUserInput(itemVars.profit_rate);
                const parsedDiscount = this.parseAndValidateUserInput(itemVars.discount_rate);
                
                console.log(`🔍 Backend processing Item ${itemNo}:`, {
                    original_input: itemVars,
                    parsed_values: {
                        shipping_cost: parsedShipping,
                        tax_rate: parsedTax, 
                        exchange_rate: parsedExchange,
                        profit_rate: parsedProfit,
                        discount_rate: parsedDiscount
                    },
                    will_use_system_defaults: {
                        shipping_cost: parsedShipping === null,
                        tax_rate: parsedTax === null,
                        exchange_rate: parsedExchange === null,
                        profit_rate: parsedProfit === null,
                        discount_rate: parsedDiscount === null
                    },
                    system_defaults: {
                        shipping_cost: this.getSystemDefault('shipping_cost'),
                        tax_rate: this.getSystemDefault('tax_rate'),
                        exchange_rate: this.getSystemDefault('exchange_rate'),
                        profit_rate: this.getSystemDefault('profit_rate'),
                        discount_rate: this.getSystemDefault('discount_rate')
                    }
                });
                
                // FIX 3: For UPDATE actions, preserve user input more aggressively
                if (isUpdateAction) {
                    // For updates: Preserve original user values when explicitly provided, even if they match defaults
                    perItemVariables[itemNo] = {
                        shipping_cost: itemVars.shipping_cost !== undefined && itemVars.shipping_cost !== null && itemVars.shipping_cost !== '' ? 
                                     (parsedShipping ?? itemVars.shipping_cost) : this.getSystemDefault('shipping_cost'),
                        tax_rate: itemVars.tax_rate !== undefined && itemVars.tax_rate !== null && itemVars.tax_rate !== '' ? 
                                (parsedTax ?? itemVars.tax_rate) : this.getSystemDefault('tax_rate'),
                        exchange_rate: itemVars.exchange_rate !== undefined && itemVars.exchange_rate !== null && itemVars.exchange_rate !== '' ? 
                                     (parsedExchange ?? itemVars.exchange_rate) : this.getSystemDefault('exchange_rate'),
                        profit_rate: itemVars.profit_rate !== undefined && itemVars.profit_rate !== null && itemVars.profit_rate !== '' ? 
                                   (parsedProfit ?? itemVars.profit_rate) : this.getSystemDefault('profit_rate'),
                        discount_rate: itemVars.discount_rate !== undefined && itemVars.discount_rate !== null && itemVars.discount_rate !== '' ? 
                                     (parsedDiscount ?? itemVars.discount_rate) : this.getSystemDefault('discount_rate')
                    };
                } else {
                    // For generate actions: Use original logic
                    perItemVariables[itemNo] = {
                        shipping_cost: parsedShipping ?? this.getSystemDefault('shipping_cost'),
                        tax_rate: parsedTax ?? this.getSystemDefault('tax_rate'),
                        exchange_rate: parsedExchange ?? this.getSystemDefault('exchange_rate'),
                        profit_rate: parsedProfit ?? this.getSystemDefault('profit_rate'),
                        discount_rate: parsedDiscount ?? this.getSystemDefault('discount_rate')
                    };
                }
                
                console.log(`✅ Backend final variables for Item ${itemNo}:`, perItemVariables[itemNo]);
            });
            
            // Create global fallback from first item (preserve user input, not system defaults)
            const firstItemKey = Object.keys(perItemVariables)[0];
            const firstItem = perItemVariables[firstItemKey] || {};
            globalVariables = { ...firstItem };
            
            console.log('📋 Extracted per-item variables for', Object.keys(perItemVariables).length, 'items');
        } else {
            // Input is global format - extract global with proper user input preservation
            const originalInput = pricingVariables || {};
            const sessionInput = sessionData.input?.pricing_variables || {};
            
            console.log('🔍 Processing global format - sources:', {
                originalInput,
                sessionInput,
                systemDefaults: this.getSystemDefaults()
            });
            
            // FIX 3: For UPDATE actions, preserve user input more aggressively
            if (isUpdateAction) {
                // For updates: Preserve explicit user input, even if it matches system defaults
                globalVariables = {
                    shipping_cost: this.getUpdatePreservedValue('shipping_cost', originalInput, sessionInput),
                    tax_rate: this.getUpdatePreservedValue('tax_rate', originalInput, sessionInput),
                    exchange_rate: this.getUpdatePreservedValue('exchange_rate', originalInput, sessionInput),
                    profit_rate: this.getUpdatePreservedValue('profit_rate', originalInput, sessionInput),
                    discount_rate: this.getUpdatePreservedValue('discount_rate', originalInput, sessionInput)
                };
            } else {
                // For generate actions: Use original logic  
                globalVariables = {
                    shipping_cost: this.parseAndValidateUserInput(originalInput.shipping_cost) ?? 
                                  this.parseAndValidateUserInput(sessionInput.shipping_cost) ?? 
                                  this.getSystemDefault('shipping_cost'),
                    tax_rate: this.parseAndValidateUserInput(originalInput.tax_rate) ?? 
                             this.parseAndValidateUserInput(sessionInput.tax_rate) ?? 
                             this.getSystemDefault('tax_rate'),
                    exchange_rate: this.parseAndValidateUserInput(originalInput.exchange_rate) ?? 
                                 this.parseAndValidateUserInput(sessionInput.exchange_rate) ?? 
                                 this.getSystemDefault('exchange_rate'),
                    profit_rate: this.parseAndValidateUserInput(originalInput.profit_rate) ?? 
                               this.parseAndValidateUserInput(sessionInput.profit_rate) ?? 
                               this.getSystemDefault('profit_rate'),
                    discount_rate: this.parseAndValidateUserInput(originalInput.discount_rate) ?? 
                                 this.parseAndValidateUserInput(sessionInput.discount_rate) ?? 
                                 this.getSystemDefault('discount_rate')
                };
            }
            
            // Log which values came from user input vs system defaults
            console.log('🔍 Global variable sources:', {
                shipping_cost: this.getValueSource('shipping_cost', originalInput, sessionInput, globalVariables.shipping_cost),
                tax_rate: this.getValueSource('tax_rate', originalInput, sessionInput, globalVariables.tax_rate),
                exchange_rate: this.getValueSource('exchange_rate', originalInput, sessionInput, globalVariables.exchange_rate),
                profit_rate: this.getValueSource('profit_rate', originalInput, sessionInput, globalVariables.profit_rate),
                discount_rate: this.getValueSource('discount_rate', originalInput, sessionInput, globalVariables.discount_rate)
            });
            
            // Create per-item variables by applying global to each item
            const quotationItems = sessionData.quotationData?.quotation_items || [];
            quotationItems.forEach((item, index) => {
                const itemNo = item.item_no || (index + 1).toString();
                perItemVariables[itemNo] = { ...globalVariables };
            });
            
            console.log('📋 Applied global variables to', quotationItems.length, 'items');
        }
        
        const result = {
            format_version: "2.0",
            storage_timestamp: new Date().toISOString(),
            per_item: perItemVariables,
            global_fallback: globalVariables,
            original_format: isPerItemFormat ? 'per-item' : 'global'
        };
        
        console.log('💾 Final processed variables:', JSON.stringify(result, null, 2));
        console.log('⚠️ User input preservation check:', this.validateUserInputPreservation(pricingVariables, result));
        
        return result;
    }

    /**
     * Parse and validate user input, distinguishing between missing vs intentionally empty values
     * @param {*} value - User input value
     * @returns {number|null} Parsed number or null if invalid/missing
     */
    parseAndValidateUserInput(value) {
        // Handle null, undefined, empty string as missing input
        if (value === null || value === undefined || value === '') {
            return null;
        }
        
        if (typeof value === 'number') {
            return isFinite(value) ? value : null;
        }
        
        if (typeof value === 'string') {
            // Remove commas, spaces, and currency symbols for parsing
            const cleaned = value.replace(/[,\s₫VND]/g, '');
            if (cleaned === '') return null;
            
            const parsed = parseFloat(cleaned);
            return (isNaN(parsed) || !isFinite(parsed)) ? null : parsed;
        }
        
        return null;
    }

    /**
     * Get system default for a specific variable type
     * @param {string} variableType - Type of variable
     * @returns {number} System default value
     */
    getSystemDefault(variableType) {
        const systemDefaults = this.getSystemDefaults();
        return systemDefaults[variableType] ?? 0;
    }

    /**
     * Get all system default values
     * @returns {Object} System defaults object
     */
    getSystemDefaults() {
        // Get defaults from price calculator if available
        const calculatorDefaults = this.priceCalculator?.getDefaultFormulaVariables() || {};
        
        // Fallback defaults if calculator not available
        const fallbackDefaults = {
            shipping_cost: 50000,
            tax_rate: 1.1,
            exchange_rate: 1.0,
            profit_rate: 1.25,
            discount_rate: 0
        };
        
        return {
            shipping_cost: calculatorDefaults.shipping_cost ?? fallbackDefaults.shipping_cost,
            tax_rate: calculatorDefaults.tax_rate ?? fallbackDefaults.tax_rate,
            exchange_rate: calculatorDefaults.exchange_rate ?? fallbackDefaults.exchange_rate,
            profit_rate: calculatorDefaults.profit_rate ?? fallbackDefaults.profit_rate,
            discount_rate: calculatorDefaults.discount_rate ?? fallbackDefaults.discount_rate
        };
    }

    /**
     * Check if pricing variables object contains actual user input (not just empty object or system defaults)
     * @param {Object} variables - Pricing variables object
     * @returns {boolean} True if contains user input, false if empty or system defaults only
     */
    hasUserInputVariables(variables) {
        if (!variables || typeof variables !== 'object') {
            return false;
        }
        
        // Check if it's an empty object
        if (Object.keys(variables).length === 0) {
            return false;
        }
        
        // Check for per-item format (object with item numbers as keys)
        const isPerItemFormat = Object.keys(variables).some(key => 
            variables[key] && typeof variables[key] === 'object' &&
            ('shipping_cost' in variables[key] || 'tax_rate' in variables[key])
        );
        
        if (isPerItemFormat) {
            // For per-item format, check if any item has meaningful values
            return Object.keys(variables).some(itemNo => {
                const itemVars = variables[itemNo];
                return this.hasNonEmptyPricingValues(itemVars);
            });
        } else {
            // For global format, check if it has meaningful values
            return this.hasNonEmptyPricingValues(variables);
        }
    }

    /**
     * Check if a pricing variables object has non-empty, meaningful values
     * @param {Object} vars - Pricing variables object (single item or global)
     * @returns {boolean} True if has meaningful user input values
     */
    hasNonEmptyPricingValues(vars) {
        if (!vars || typeof vars !== 'object') {
            return false;
        }
        
        const variableTypes = ['shipping_cost', 'tax_rate', 'exchange_rate', 'profit_rate', 'discount_rate'];
        
        return variableTypes.some(varType => {
            const value = vars[varType];
            // Check if value exists and is not empty string
            if (value !== undefined && value !== null && value !== '') {
                // Parse the value to check if it's a valid number
                const parsed = this.parseAndValidateUserInput(value);
                return parsed !== null; // Return true if it parsed to a valid number
            }
            return false;
        });
    }

    /**
     * Get the source of a variable value for debugging
     * @param {string} variableType - Variable type
     * @param {Object} originalInput - Original user input
     * @param {Object} sessionInput - Session input
     * @param {*} finalValue - Final processed value
     * @returns {string} Source description
     */
    getValueSource(variableType, originalInput, sessionInput, finalValue) {
        const originalValue = this.parseAndValidateUserInput(originalInput[variableType]);
        const sessionValue = this.parseAndValidateUserInput(sessionInput[variableType]);
        const systemDefault = this.getSystemDefault(variableType);
        
        if (originalValue !== null && originalValue === finalValue) {
            return 'original_user_input';
        } else if (sessionValue !== null && sessionValue === finalValue) {
            return 'session_user_input';
        } else if (systemDefault === finalValue) {
            return 'system_default';
        } else {
            return 'unknown';
        }
    }

    /**
     * FIX 3: Get preserved value for UPDATE actions - prioritizes explicit user input
     * @param {string} variableType - Variable type (shipping_cost, tax_rate, etc.)
     * @param {Object} originalInput - Original user input
     * @param {Object} sessionInput - Session input
     * @returns {*} Preserved value with user input priority
     */
    getUpdatePreservedValue(variableType, originalInput, sessionInput) {
        // Check if user explicitly provided a value (not null, undefined, or empty string)
        const originalValue = originalInput[variableType];
        const sessionValue = sessionInput[variableType];
        
        // Priority 1: Original input (current UI update)
        if (originalValue !== undefined && originalValue !== null && originalValue !== '') {
            const parsed = this.parseAndValidateUserInput(originalValue);
            // For updates, preserve even if parsed to same as system default
            return parsed !== null ? parsed : originalValue;
        }
        
        // Priority 2: Session input (previous user input)
        if (sessionValue !== undefined && sessionValue !== null && sessionValue !== '') {
            const parsed = this.parseAndValidateUserInput(sessionValue);
            return parsed !== null ? parsed : sessionValue;
        }
        
        // Priority 3: System default (only when no user input at all)
        return this.getSystemDefault(variableType);
    }

    /**
     * Check if user input was preserved for a specific item
     * @param {Object} originalVars - Original user variables
     * @param {Object} processedVars - Processed variables
     * @returns {Object} Preservation status
     */
    checkUserInputPreservation(originalVars, processedVars) {
        const preservation = {};
        const variableTypes = ['shipping_cost', 'tax_rate', 'exchange_rate', 'profit_rate', 'discount_rate'];
        
        variableTypes.forEach(varType => {
            const originalValue = this.parseAndValidateUserInput(originalVars[varType]);
            const processedValue = processedVars[varType];
            
            if (originalValue !== null) {
                preservation[varType] = originalValue === processedValue ? 'preserved' : 'changed';
            } else {
                preservation[varType] = 'system_default_used';
            }
        });
        
        return preservation;
    }

    /**
     * Validate overall user input preservation
     * @param {Object} originalInput - Original user input
     * @param {Object} processedResult - Final processed result
     * @returns {Object} Validation results
     */
    validateUserInputPreservation(originalInput, processedResult) {
        const validation = {
            totalUserInputs: 0,
            preservedInputs: 0,
            changedInputs: 0,
            systemDefaultsUsed: 0,
            preservationRate: 0,
            issues: []
        };
        
        if (!originalInput || typeof originalInput !== 'object') {
            validation.issues.push('No original input to validate');
            return validation;
        }
        
        // Check if original input is per-item format
        const isPerItemFormat = Object.keys(originalInput).some(key => 
            originalInput[key] && typeof originalInput[key] === 'object' &&
            ('shipping_cost' in originalInput[key] || 'tax_rate' in originalInput[key])
        );
        
        if (isPerItemFormat) {
            // Validate per-item preservation
            Object.keys(originalInput).forEach(itemNo => {
                const originalItemVars = originalInput[itemNo];
                const processedItemVars = processedResult.per_item[itemNo];
                
                if (processedItemVars) {
                    const preservation = this.checkUserInputPreservation(originalItemVars, processedItemVars);
                    
                    Object.keys(preservation).forEach(varType => {
                        const status = preservation[varType];
                        if (status === 'preserved') {
                            validation.preservedInputs++;
                            validation.totalUserInputs++;
                        } else if (status === 'changed') {
                            validation.changedInputs++;
                            validation.totalUserInputs++;
                            validation.issues.push(`Item ${itemNo}.${varType}: user input was changed`);
                        } else {
                            validation.systemDefaultsUsed++;
                        }
                    });
                } else {
                    validation.issues.push(`Item ${itemNo}: missing in processed result`);
                }
            });
        } else {
            // Validate global preservation
            const preservation = this.checkUserInputPreservation(originalInput, processedResult.global_fallback);
            
            Object.keys(preservation).forEach(varType => {
                const status = preservation[varType];
                if (status === 'preserved') {
                    validation.preservedInputs++;
                    validation.totalUserInputs++;
                } else if (status === 'changed') {
                    validation.changedInputs++;
                    validation.totalUserInputs++;
                    validation.issues.push(`Global ${varType}: user input was changed`);
                } else {
                    validation.systemDefaultsUsed++;
                }
            });
        }
        
        validation.preservationRate = validation.totalUserInputs > 0 ? 
            (validation.preservedInputs / validation.totalUserInputs) * 100 : 100;
        
        return validation;
    }

    /**
     * Save complete quotation data and pricing variables as JSON for future retrieval
     * @param {string} generatedDir - Path to generated files directory
     * @param {string} baseFilename - Base filename (without timestamp)
     * @param {Object} sessionData - Complete session data
     * @param {Object} calculatedPricing - Calculated pricing results
     * @param {Object} pricingVariables - Pricing variables used in calculations
     */
    saveQuotationData(generatedDir, baseFilename, sessionData, calculatedPricing, pricingVariables = {}) {
        try {
            const dataFilename = `${baseFilename}_data.json`;
            const dataFilePath = path.join(generatedDir, dataFilename);
            
            const savedData = {
                base_filename: baseFilename,
                saved_at: new Date().toISOString(),
                session_info: {
                    id: sessionData.id,
                    action: sessionData.action,
                    status: sessionData.status
                },
                quotation_data: sessionData.quotationData,
                calculated_pricing: calculatedPricing,
                metadata: {
                    rfq_reference: sessionData.quotationData?.rfq_reference || 'unknown_rfq',
                    customer_name: sessionData.quotationData?.customer_info?.company_name || 'unknown_customer',
                    items_count: (sessionData.quotationData?.quotation_items || []).length,
                    has_pricing: calculatedPricing ? true : false
                }
            };

            // ENHANCED: Always include pricing variables if they exist, even if just defaults
            if (pricingVariables !== null && typeof pricingVariables === 'object') {
                savedData.pricing_variables = this.enhancedVariableExtraction(pricingVariables, sessionData);
                console.log(`💾 Including pricing variables in saved data for action: ${sessionData.action}`);
                console.log(`💾 Saved variables:`, savedData.pricing_variables);
            } else {
                console.log(`💾 Skipping pricing variables for action: ${sessionData.action} (no valid variables provided)`);
            }
            
            // Save data file
            fs.writeFileSync(dataFilePath, JSON.stringify(savedData, null, 2), 'utf8');
            console.log(`💾 Saved quotation data: ${dataFilename}`);
            
            return dataFilename;
            
        } catch (error) {
            console.error('❌ Error saving quotation data:', error);
            return null;
        }
    }

    /**
     * Update existing quotation data file with new pricing variables
     * This method finds and updates the corresponding data.json file
     * @param {string} rfqReference - RFQ reference from quotation
     * @param {string} customerName - Customer company name
     * @param {Object} pricingVariables - New pricing variables to save
     * @returns {boolean} True if update was successful
     */
    updateQuotationPricingVariables(rfqReference, customerName, pricingVariables) {
        try {
            console.log(`🔄 Attempting to update pricing variables for ${rfqReference} - ${customerName}`);
            
            const generatedDir = path.join(__dirname, '..', 'assets', 'generated');
            
            // Find matching data file
            const files = fs.readdirSync(generatedDir);
            const matchingFile = files.find(file => {
                return file.includes(rfqReference.replace(/[^a-zA-Z0-9\-_]/g, '_')) && 
                       file.includes(customerName.replace(/[^a-zA-Z0-9\-_]/g, '_')) && 
                       file.endsWith('_data.json');
            });
            
            if (!matchingFile) {
                console.log(`❌ No matching data file found for ${rfqReference} - ${customerName}`);
                return false;
            }
            
            console.log(`📁 Found matching file: ${matchingFile}`);
            const dataFilePath = path.join(generatedDir, matchingFile);
            
            // Read existing data
            const existingData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
            
            // Update with new pricing variables using v2.0 format
            const mockSessionData = {
                action: 'update',
                quotationData: existingData.quotation_data
            };
            existingData.pricing_variables = this.enhancedVariableExtraction(pricingVariables, mockSessionData);
            existingData.saved_at = new Date().toISOString();
            
            // Add metadata about the update
            if (!existingData.update_history) {
                existingData.update_history = [];
            }
            existingData.update_history.push({
                timestamp: new Date().toISOString(),
                action: 'pricing_variables_updated',
                source: 'apply_button'
            });
            
            // Save updated data
            fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2), 'utf8');
            console.log(`✅ Successfully updated pricing variables in ${matchingFile}`);
            
            return true;
            
        } catch (error) {
            console.error('❌ Error updating quotation pricing variables:', error);
            return false;
        }
    }

    /**
     * Get system statistics
     * @returns {Object} Current statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            active_sessions: this.activeSessions.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Clean up old sessions (older than 2 hours)
     */
    cleanupOldSessions() {
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        let cleanedCount = 0;
        
        this.activeSessions.forEach((session, sessionId) => {
            const sessionTime = session.lastUpdate?.getTime() || session.createdAt?.getTime();
            if (sessionTime && sessionTime < twoHoursAgo) {
                this.activeSessions.delete(sessionId);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} old quotation sessions`);
        }
    }

    /**
     * Merge calculated pricing results back into quotation data items
     * This ensures potential_profit and other calculated values are persisted in quotation_data structure
     * @param {Object} sessionData - Session data containing quotationData
     * @param {Object} calculatedPricing - Calculated pricing results
     */
    mergeCalculatedPricingIntoQuotationData(sessionData, calculatedPricing) {
        if (!sessionData.quotationData?.quotation_items || !calculatedPricing?.processed_items) {
            console.log('⚠️ No quotation items or calculated pricing to merge');
            return;
        }

        console.log('🔄 Merging calculated pricing results into quotation data structure');

        // Merge calculated results back into each quotation item
        sessionData.quotationData.quotation_items.forEach((item, index) => {
            const itemNo = item.item_no || (index + 1).toString();
            
            // Find the corresponding calculated item
            const calculatedItem = calculatedPricing.processed_items.find(
                calc => String(calc.item_no) === String(itemNo)
            );

            if (calculatedItem) {
                // Merge potential_profit and other calculated values into the quotation item
                if (!item.calculated_results) {
                    item.calculated_results = {};
                }

                item.calculated_results.potential_profit = calculatedItem.potential_profit || 0;
                item.calculated_results.actual_unit_price = calculatedItem.actual_unit_price;
                item.calculated_results.profit_unit_price = calculatedItem.profit_unit_price;
                item.calculated_results.sales_unit_price = calculatedItem.sales_unit_price;
                item.calculated_results.ext_price = calculatedItem.ext_price;
                item.calculated_results.calculation_timestamp = calculatedItem.calculation_timestamp;

                console.log(`✅ Merged calculated results for item ${itemNo}: potential_profit=${calculatedItem.potential_profit}`);
            } else {
                console.log(`⚠️ No calculated item found for item ${itemNo}`);
            }
        });

        console.log('✅ Completed merging calculated pricing into quotation data structure');
    }

}

// =============================================
// 🚀 EXPORT AND UTILITY FUNCTIONS
// =============================================

/**
 * Create HTTP endpoint handlers for sse-server.js
 * @param {QuotationGenerationAPI} quotationAPI - API instance
 * @param {Function} sseNotifier - SSE notification function
 * @returns {Object} HTTP handlers
 */
function createHTTPHandlers(quotationAPI, sseNotifier) {
    return {
        // POST /api/quotation-generation
        handleGeneration: async (req, res) => {
            await quotationAPI.handleHTTPRequest(req, res, sseNotifier);
        },
        
        // POST /api/quotation-update  
        handleUpdate: async (req, res) => {
            // Force action_type to update
            req.body.action_type = 'update';
            await quotationAPI.handleHTTPRequest(req, res, sseNotifier);
        },
        
        // GET /api/quotation-session/:sessionId
        getSession: (req, res) => {
            const sessionId = req.params.sessionId;
            const session = quotationAPI.getSessionData(sessionId);
            
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found',
                    session_id: sessionId
                });
            }
            
            res.json({
                success: true,
                data: session,
                timestamp: new Date().toISOString()
            });
        },
        
        // GET /api/quotation-stats
        getStats: (req, res) => {
            res.json({
                success: true,
                data: quotationAPI.getStatistics(),
                timestamp: new Date().toISOString()
            });
        },

        // POST /api/update-pricing-variables
        updatePricingVariables: (req, res) => {
            try {
                const { rfq_reference, customer_name, pricing_variables } = req.body;

                if (!rfq_reference || !customer_name || !pricing_variables) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: rfq_reference, customer_name, or pricing_variables'
                    });
                }

                const success = quotationAPI.updateQuotationPricingVariables(
                    rfq_reference,
                    customer_name,
                    pricing_variables
                );

                if (success) {
                    res.json({
                        success: true,
                        message: 'Pricing variables updated successfully',
                        rfq_reference: rfq_reference,
                        customer_name: customer_name,
                        timestamp: new Date().toISOString()
                    });
                } else {
                    res.status(404).json({
                        success: false,
                        error: 'Could not find or update the quotation data file',
                        rfq_reference: rfq_reference,
                        customer_name: customer_name
                    });
                }

            } catch (error) {
                console.error('❌ Error in updatePricingVariables endpoint:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
    };
}

module.exports = { 
    QuotationGenerationAPI, 
    createHTTPHandlers 
};