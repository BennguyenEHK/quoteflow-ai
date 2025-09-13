// =============================================
// 🏠 UNIFIED SSE SERVER - CORE ARCHITECTURE
// =============================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');
const { QuotationGenerationAPI } = require('./api/quotation-generation');
const SessionManager = require('./utils/session-manager');

/**
 * UNIFIED QUOTATION SYSTEM SSE SERVER
 * Purpose: Central communication hub handling all operations
 * - Make.com webhook integration
 * - Real-time SSE broadcasting to UI panels
 * - Session and state management
 * - Quotation processing coordination
 * - Static file serving for frontend
 */
class UnifiedSSEServer {
    constructor() {
        // Core Express application
        this.app = express();
        this.port = process.env.PORT || 5000;
        
        // Named Session Management Integration
        this.sessionManager = new SessionManager();
        this.currentSessionId = null;
        this.currentSessionName = null;
        
        // Connection and session management
        this.sseClients = new Map();        // Connected UI clients
        this.activeSessions = new Map();    // Active quotation sessions
        this.moduleSteps = new Map();       // Workflow module tracking
        this.httpConnections = new Set();  // Track HTTP connections for proper cleanup
        
        // System statistics
        this.stats = {
            totalConnections: 0,
            activeWorkflows: 0,
            completedToday: 0,
            totalProcessed: 0,
            serverStartTime: new Date()
        };
        
        // Initialize quotation processing API
        this.quotationAPI = new QuotationGenerationAPI();
        
        
        // Initialize file upload configuration
        this.initializeFileUpload();
        
        // Initialize server components
        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeSSE();
        this.initializeCleanup();
        
        // AUTO-SYNC: Sync latest.json on server startup
        setTimeout(async () => {
            await this.autoSyncLatestJson();
        }, 2000); // Delay to ensure server is fully ready
        
        console.log('🚀 UnifiedSSEServer initialized successfully');
    }

    // =========================================================================
    // 📁 FILE UPLOAD INITIALIZATION
    // =========================================================================
    
    /**
     * Initialize file upload configuration with multer
     * Sets up storage destinations and file filtering
     */
    initializeFileUpload() {
        console.log('📁 Initializing file upload configuration...');
        
        // Ensure asset directories exist
        const assetDirs = ['logo', 'signature', 'template', 'template/custom_templates'];
        assetDirs.forEach(dir => {
            const fullPath = path.join(__dirname, 'assets', dir);
            if (!fs.existsSync(fullPath)) {
                fs.mkdirSync(fullPath, { recursive: true });
                console.log(`📁 Created directory: assets/${dir}`);
            }
        });
        
        // Configure multer storage
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                // Type will be available in req.body after multer processes the form
                // For now, use a temporary path and move files in the upload handler
                const tempPath = path.join(__dirname, 'assets', 'temp');
                if (!fs.existsSync(tempPath)) {
                    fs.mkdirSync(tempPath, { recursive: true });
                }
                cb(null, tempPath);
            },
            filename: (req, file, cb) => {
                // Keep original filename with timestamp prefix to avoid conflicts
                const timestamp = Date.now();
                const originalName = file.originalname;
                cb(null, `${timestamp}_${originalName}`);
            }
        });
        
        // File filter to validate file types - more permissive, validation happens later
        const fileFilter = (req, file, cb) => {
            // Allow most common file types, validate type match in upload handler
            const allowedTypes = [
                'image/jpeg', 'image/png', 'image/svg+xml', 
                'text/html', 'application/octet-stream'
            ];
            
            if (allowedTypes.includes(file.mimetype) || 
                file.originalname.endsWith('.svg') || 
                file.originalname.endsWith('.html')) {
                cb(null, true);
            } else {
                cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
            }
        };
        
        // Initialize multer with configuration
        this.upload = multer({
            storage: storage,
            fileFilter: fileFilter,
            limits: {
                fileSize: 10 * 1024 * 1024 // 10MB limit
            }
        });
        
        console.log('✅ File upload configuration initialized');
    }
    
    // =========================================================================
    // 🔧 MIDDLEWARE INITIALIZATION
    // =========================================================================
    
    /**
     * Setup Express middleware for request processing
     * - CORS for cross-origin requests
     * - JSON parsing with large payload support
     * - Static file serving for frontend
     * - Request logging for debugging
     */
    initializeMiddleware() {
        console.log('🔧 Initializing middleware...');
        
        // CORS Configuration - Allow all origins for development
        this.app.use(cors({
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            credentials: true
        }));

        // Body parsing middleware
        this.app.use(express.json({ 
            limit: '50mb',  // Support large quotation data
            extended: true 
        }));
        this.app.use(express.urlencoded({ 
            extended: true, 
            limit: '50mb' 
        }));

        // Static file serving for frontend
        this.app.use('/', express.static(path.join(__dirname, 'frontend'), {
            index: 'index.html',
            maxAge: '1d'  // Cache static files for 1 day
        }));

        // Request logging middleware
        this.app.use((req, res, next) => {
            const timestamp = new Date().toISOString();
            const clientIP = req.ip || req.connection.remoteAddress;
            console.log(`📡 [${timestamp}] ${req.method} ${req.path} - ${clientIP}`);
            
            // Add ngrok bypass header for all responses
            res.setHeader('ngrok-skip-browser-warning', 'true');
            
            next();
        });

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            console.error('❌ Server Error:', err);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                timestamp: new Date().toISOString()
            });
        });

        console.log('✅ Middleware initialized');
    }

    // =========================================================================
    // 🛣️ ROUTE INITIALIZATION 
    // =========================================================================
    
    /**
     * Initialize all API routes and endpoints
     * - Make.com webhook endpoints
     * - Quotation processing endpoints  
     * - Session management endpoints
     * - Health and monitoring endpoints
     */
    initializeRoutes() {
        console.log('🛣️ Initializing routes...');

        // ===== MAKE.COM WEBHOOK ENDPOINTS =====
        
        /**
         * Module Update Endpoint - Receives workflow progress from Make.com
         * URL: POST /module-update
         * Purpose: Track individual module completion in Make.com scenarios
         */
        this.app.post('/module-update', this.handleModuleUpdate.bind(this));
        
        /**
         * Workflow Completion Endpoint - Receives final results from Make.com
         * URL: POST /workflow-complete  
         * Purpose: Handle final quotation data and broadcast completion
         */
        this.app.post('/workflow-complete', this.handleWorkflowComplete.bind(this));
        
        
        /**
         * Asset Upload Endpoint - Upload logos, signatures, templates
         * URL: POST /upload-asset  
         * Purpose: Handle file uploads for quotation assets
         */
        this.app.post('/upload-asset', this.handleAssetUpload.bind(this));

        /**
         * Asset List Endpoint - List assets by type (logo, signature, template)
         * URL: GET /assets/:type
         * Purpose: Retrieve stored asset files for auto-fetch functionality
         */
        this.app.get('/assets/:type', this.handleListAssets.bind(this));

        /**
         * List Generated Files - Get list of available generated files
         * URL: GET /assets/generated
         * Purpose: List all generated quotation files for auto-detection
         * IMPORTANT: This must come BEFORE the /assets/generated/:filename route
         */
        this.app.get('/assets/generated', this.handleListGeneratedFiles.bind(this));
        
        /**
         * Generated Files Serving - Serve generated quotation files
         * URL: GET /assets/generated/:filename
         * Purpose: Serve generated HTML/PDF/Excel files for download/preview
         * IMPORTANT: This must come BEFORE the general /assets/:type/:filename route
         */
        this.app.get('/assets/generated/:filename', this.handleServeGeneratedFile.bind(this));
        
        /**
         * Asset Delete Endpoint - Remove specific asset
         * URL: DELETE /assets/:type/:filename
         * Purpose: Remove stored asset files from server
         */
        this.app.delete('/assets/:type/:filename', this.handleDeleteAsset.bind(this));
        
        /**
         * Static Asset Serving - Serve asset files directly
         * URL: GET /assets/:type/:filename
         * Purpose: Serve uploaded asset files for preview/download
         */
        this.app.get('/assets/:type/:filename', this.handleServeAsset.bind(this));
        
        /**
         * Configuration Endpoint - Serve app configuration
         * URL: GET /config/app-config.json
         * Purpose: Provide frontend with environment-specific configuration
         */
        this.app.get('/config/app-config.json', this.handleServeConfig.bind(this));

        // ===== QUOTATION PROCESSING ENDPOINTS =====
        
        /**
         * Quotation Generation Endpoint - Process new quotation requests
         * URL: POST /api/quotation-generation
         * Purpose: Handle quotation generation from UI or external sources
         */
        this.app.post('/api/quotation-generation', this.handleQuotationGeneration.bind(this));
        
        /**
         * Save Quotation Endpoint - Save edited quotation content
         * URL: POST /api/save-quotation
         * Purpose: Save modified quotation HTML back to file system
         */
        this.app.post('/api/save-quotation', this.handleSaveQuotation.bind(this));

        /**
         * Update Pricing Variables Endpoint - Update pricing variables in data files
         * URL: POST /api/update-pricing-variables
         * Purpose: Save pricing variables to existing quotation data files
         */
        this.app.post('/api/update-pricing-variables', this.handleUpdatePricingVariables.bind(this));

        /**
         * Update Latest JSON Endpoint - Update latest.json to reflect currently viewed quotation
         * URL: POST /api/update-latest-json
         * Purpose: Update latest.json when user selects/views a different quotation
         */
        this.app.post('/api/update-latest-json', this.handleUpdateLatestJson.bind(this));

        // ===== SESSION MANAGEMENT ENDPOINTS =====
        
        /**
         * Session Data Endpoint - Retrieve session information
         * URL: GET /api/session/:sessionId
         * Purpose: Get current session data for debugging or recovery
         */
        this.app.get('/api/session/:sessionId', this.handleGetSession.bind(this));
        
        /**
         * Active Sessions Endpoint - List all active sessions
         * URL: GET /api/sessions
         * Purpose: Monitor active sessions for debugging
         */
        this.app.get('/api/sessions', this.handleGetSessions.bind(this));

        // ===== SYSTEM ENDPOINTS =====
        
        /**
         * Health Check Endpoint - System status monitoring
         * URL: GET /health
         * Purpose: Monitor server health and statistics
         */
        this.app.get('/health', this.handleHealthCheck.bind(this));
        
        /**
         * System Statistics Endpoint - Detailed system information
         * URL: GET /api/stats
         * Purpose: Get detailed server statistics and performance metrics
         */
        this.app.get('/api/stats', this.handleSystemStats.bind(this));


        /**
         * Main UI Endpoint - Serve dashboard
         * URL: GET /
         * Purpose: Serve main quotation dashboard interface
         */
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
        });

        /**
         * Debug SSE Endpoint - SSE connection troubleshooting tool
         * URL: GET /debug-sse
         * Purpose: Debug SSE connectivity issues
         */
        this.app.get('/debug-sse', (req, res) => {
            res.sendFile(path.join(__dirname, 'debug-sse.html'));
        });

        /**
         * Test Connection Page - Simple SSE connection test
         * URL: GET /test-connection
         * Purpose: Simple page to test SSE connectivity
         */
        this.app.get('/test-connection', (req, res) => {
            res.sendFile(path.join(__dirname, 'test-connection.html'));
        });

        /**
         * Test Preview Page - Test quotation preview auto-detection
         * URL: GET /test-preview
         * Purpose: Test auto-detection and preview functionality
         */
        this.app.get('/test-preview', (req, res) => {
            res.sendFile(path.join(__dirname, 'test-preview.html'));
        });

        /**
         * Test Iframe Page - Test HTML loading in iframe
         * URL: GET /test-iframe
         * Purpose: Test if generated HTML files work properly in iframes
         */
        this.app.get('/test-iframe', (req, res) => {
            res.sendFile(path.join(__dirname, 'test-iframe.html'));
        });

        /**
         * Quotation Redirect Handler - Handle direct quotation URLs
         * URL: GET /quotation_:filename
         * Purpose: Redirect malformed quotation URLs to correct /assets/generated/ path
         */
        this.app.get('/quotation_:filename', (req, res) => {
            try {
                const filename = `quotation_${req.params.filename}`;
                console.log(`🔄 Redirecting quotation URL: ${req.path} → /assets/generated/${filename}`);
                
                // Use 301 permanent redirect to fix browser URL
                res.redirect(301, `/assets/generated/${filename}`);
                
            } catch (error) {
                console.error('❌ Quotation redirect error:', error);
                res.status(404).json({
                    success: false,
                    error: 'Quotation file not found',
                    timestamp: new Date().toISOString()
                });
            }
        });

        console.log('✅ Routes initialized');
    }

    // =========================================================================
    // 📡 SERVER-SENT EVENTS (SSE) INITIALIZATION
    // =========================================================================
    
    /**
     * Initialize SSE endpoint for real-time UI communication
     * - Establishes persistent connections to UI panels
     * - Manages client lifecycle and heartbeat
     * - Handles connection cleanup and error recovery
     */
    initializeSSE() {
        console.log('📡 Initializing SSE endpoint...');
        
        /**
         * SSE Events Endpoint - Real-time communication with UI
         * URL: GET /events
         * Purpose: Establish persistent connection for real-time updates
         */
        this.app.get('/events', (req, res) => {
            console.log('🔗 New SSE client connecting...');
            
            // Set optimized SSE headers for faster response
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control',
                'X-Accel-Buffering': 'no',  // Disable proxy buffering
                'Transfer-Encoding': 'chunked',  // Enable chunked transfer for immediate response
                'ngrok-skip-browser-warning': 'true'  // Skip ngrok browser warning for API endpoints
            });

            // Generate unique client ID
            const clientId = this.generateClientId();
            const clientInfo = {
                id: clientId,
                response: res,
                connectedAt: new Date(),
                lastPing: new Date(),
                isAlive: true
            };

            // Store client connection
            this.sseClients.set(clientId, clientInfo);
            this.stats.totalConnections++;

            console.log(`📱 SSE Client ${clientId} connected. Total: ${this.sseClients.size}`);

            // Send initial connection confirmation
            this.sendSSEMessage(res, {
                type: 'connected',
                data: {
                    client_id: clientId,
                    server_time: new Date().toISOString(),
                    total_clients: this.sseClients.size
                }
            });

            // Setup heartbeat interval for this client (optimized for faster response)
            const heartbeatInterval = setInterval(() => {
                if (this.sseClients.has(clientId)) {
                    try {
                        this.sendSSEMessage(res, {
                            type: 'heartbeat',
                            data: {
                                timestamp: new Date().toISOString(),
                                client_id: clientId
                            }
                        });
                        clientInfo.lastPing = new Date();
                    } catch (error) {
                        console.log(`💀 Client ${clientId} heartbeat failed, cleaning up`);
                        this.cleanupClient(clientId, heartbeatInterval);
                    }
                } else {
                    clearInterval(heartbeatInterval);
                }
            }, 10000); // Heartbeat every 10 seconds (reduced from 30s for faster responsiveness)

            // Handle client disconnect events
            req.on('close', () => {
                console.log(`👋 Client ${clientId} disconnected (close)`);
                this.cleanupClient(clientId, heartbeatInterval);
            });

            req.on('error', (error) => {
                console.log(`❌ Client ${clientId} error: ${error.message}`);
                this.cleanupClient(clientId, heartbeatInterval);
            });

            // Send welcome message with system status immediately (removed delay for faster connection)
            if (this.sseClients.has(clientId)) {
                this.sendSSEMessage(res, {
                    type: 'system_status',
                    data: {
                        active_sessions: this.activeSessions.size,
                        server_uptime: Date.now() - this.stats.serverStartTime.getTime(),
                        processed_today: this.stats.completedToday
                    }
                });
            }
        });

        console.log('✅ SSE endpoint initialized');
    }

    // =========================================================================
    // 🧹 CLEANUP AND MAINTENANCE INITIALIZATION
    // =========================================================================
    
    /**
     * Initialize cleanup intervals and maintenance tasks
     * - Clean up expired sessions
     * - Remove dead SSE connections
     * - Clear old module tracking data
     */
    initializeCleanup() {
        console.log('🧹 Initializing cleanup tasks...');

        // Clean up expired sessions every hour
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60 * 60 * 1000); // 1 hour

        // Clean up dead SSE connections every 5 minutes
        setInterval(() => {
            this.cleanupDeadConnections();
        }, 5 * 60 * 1000); // 5 minutes

        // Reset daily statistics at midnight
        setInterval(() => {
            const now = new Date();
            if (now.getHours() === 0 && now.getMinutes() === 0) {
                this.stats.completedToday = 0;
                console.log('📊 Daily statistics reset');
            }
        }, 60 * 1000); // Check every minute

        console.log('✅ Cleanup tasks initialized');
    }

    // =========================================================================
    // 📨 MAKE.COM WEBHOOK HANDLERS
    // =========================================================================
    
    /**
     * Handle module update notifications from Make.com workflows
     * Tracks progress of individual modules in automation scenarios
     */
    async handleModuleUpdate(req, res) {
        try {
            const {
                module_name,
                input,
                output,
                output_status,
                error
            } = req.body;

            console.log(`📥 Module Update: ${module_name} - Status: ${output_status}`);

            // Validate required fields
            if (!module_name || !output_status) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: module_name, output_status'
                });
            }

            // Validate output_status values
            if (!['success', 'failed'].includes(output_status)) {
                return res.status(400).json({
                    success: false,
                    error: 'output_status must be either "success" or "failed"'
                });
            }

            // Generate session ID for tracking with meaningful naming
            const sessionId = this.generateNamedSessionId(module_name);
            
            // Store/update session data
            if (!this.activeSessions.has(sessionId)) {
                this.activeSessions.set(sessionId, {
                    id: sessionId,
                    modules: new Map(),
                    createdAt: new Date(),
                    lastUpdate: new Date(),
                    status: 'processing'
                });
                this.stats.activeWorkflows++;
                console.log(`🆕 New session created: ${sessionId}`);
            }

            const session = this.activeSessions.get(sessionId);
            const moduleId = this.generateClientId();
            
            // Store module data
            session.modules.set(moduleId, {
                id: moduleId,
                name: module_name,
                status: output_status,
                input: input || null,
                output: output || null,
                error: error || null,
                timestamp: new Date().toISOString(),
                updatedAt: new Date()
            });
            
            session.lastUpdate = new Date();

            // Also store in global module tracking
            this.moduleSteps.set(`${sessionId}_${moduleId}`, session.modules.get(moduleId));

            // Broadcast to all connected UI clients
            const broadcastMessage = {
                type: 'module_update',
                data: {
                    session_id: sessionId,
                    module_id: moduleId,
                    module_name: module_name,
                    status: output_status,
                    input: input || null,
                    output: output || null,
                    error: error || null,
                    timestamp: new Date().toISOString(),
                    icon: this.getModuleIcon('unknown')
                }
            };

            this.broadcastToAllClients(broadcastMessage);

            // Send success response
            res.json({
                success: true,
                message: 'Module update received and broadcasted',
                session_id: sessionId,
                module_id: moduleId,
                clients_notified: this.sseClients.size,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Module update error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Handle workflow completion notifications from Make.com
     * Processes final quotation results and broadcasts completion
     */
    async handleWorkflowComplete(req, res) {
        try {
            const {
                agent_name,
                status,
                process_status,
                timestamp,
                error,
                email_body
            } = req.body;

            console.log(`🏁 Workflow Complete: ${agent_name} - Status: ${status}`);

            // Validate required fields
            if (!agent_name || !status || !process_status || timestamp === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: agent_name, status, process_status, timestamp'
                });
            }

            // Validate status values
            if (!['initialize', 'finished'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    error: 'status must be either "initialize" or "finished"'
                });
            }

            if (!['success', 'failed'].includes(process_status)) {
                return res.status(400).json({
                    success: false,
                    error: 'process_status must be either "success" or "failed"'
                });
            }

            // Generate session ID for tracking with meaningful naming
            const sessionId = this.generateNamedSessionId(agent_name);

            // Update session status
            if (!this.activeSessions.has(sessionId)) {
                this.activeSessions.set(sessionId, {
                    id: sessionId,
                    agentName: agent_name,
                    status: status,
                    processStatus: process_status,
                    processingTime: timestamp,
                    error: error || null,
                    emailBody: email_body || null,
                    createdAt: new Date(),
                    completedAt: new Date()
                });
            }

            if (status === 'finished') {
                this.stats.activeWorkflows--;
                this.stats.completedToday++;
                this.stats.totalProcessed++;
            }

            // Broadcast completion to all clients
            const completeMessage = {
                type: 'workflow_complete',
                data: {
                    session_id: sessionId,
                    agent_name: agent_name,
                    status: status,
                    process_status: process_status,
                    processing_time: timestamp,
                    error: error || null,
                    email_body: email_body || null,
                    timestamp: new Date().toISOString()
                }
            };

            this.broadcastToAllClients(completeMessage);
            
            res.json({
                success: true,
                message: 'Workflow completion broadcasted',
                clients_notified: this.sseClients.size,
                session_id: sessionId,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Workflow completion error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }


    /**
     * Handle asset upload (logos, signatures, templates)
     */
    async handleAssetUpload(req, res) {
        // Use multer middleware to handle file upload
        this.upload.single('file')(req, res, async (error) => {
            try {
                if (error) {
                    console.error('❌ Upload error:', error.message);
                    return res.status(400).json({
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
                
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        error: 'No file uploaded',
                        timestamp: new Date().toISOString()
                    });
                }
                
                const { type } = req.body;
                const file = req.file;
                
                // Validate file type matches the asset type
                const validationResult = this.validateAssetType(file, type);
                if (!validationResult.valid) {
                    // Remove the uploaded file since validation failed
                    fs.unlinkSync(file.path);
                    return res.status(400).json({
                        success: false,
                        error: validationResult.error,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Enforce single-file storage: delete existing files before saving new one
                this.deleteExistingAssets(type);
                
                // Move file from temp to correct directory
                const finalPath = this.moveAssetToCorrectDirectory(file, type);
                
                console.log(`📤 Asset uploaded successfully: ${file.filename} (${type})`);
                
                // Return success response with file details
                res.json({
                    success: true,
                    message: 'Asset uploaded successfully',
                    data: {
                        filename: file.filename,
                        originalName: file.originalname,
                        type: type,
                        size: file.size,
                        path: finalPath
                    },
                    timestamp: new Date().toISOString()
                });

            } catch (error) {
                console.error('❌ Asset upload error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
    }

    /**
     * List stored assets by type (logo, signature, template)
     */
    async handleListAssets(req, res) {
        try {
            const { type } = req.params;
            console.log(`📁 Asset list request for type: ${type}`);

            if (!['logo', 'signature', 'template'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid asset type. Must be logo, signature, or template'
                });
            }

            const fs = require('fs');
            const assetPath = path.join(__dirname, 'assets', type);
            
            // Handle template subdirectory
            const searchPath = type === 'template' ? 
                path.join(assetPath, 'custom_templates') : assetPath;

            if (!fs.existsSync(searchPath)) {
                return res.json([]);
            }

            const files = fs.readdirSync(searchPath)
                .filter(file => {
                    // Filter by file type
                    if (type === 'template') {
                        return file.endsWith('.html');
                    }
                    return /\.(png|jpg|jpeg|svg)$/i.test(file);
                })
                .map(filename => {
                    const filepath = path.join(searchPath, filename);
                    const stats = fs.statSync(filepath);
                    
                    return {
                        name: filename,
                        size: stats.size,
                        modified: stats.mtime,
                        type: type
                    };
                });

            console.log(`📁 Found ${files.length} ${type} files`);
            res.json(files);

        } catch (error) {
            console.error(`❌ List ${req.params.type} assets error:`, error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Delete stored asset file
     */
    async handleDeleteAsset(req, res) {
        try {
            const { type, filename } = req.params;
            console.log(`🗑️ Delete asset request: ${type}/${filename}`);

            if (!['logo', 'signature', 'template'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid asset type'
                });
            }

            const fs = require('fs');
            const assetPath = path.join(__dirname, 'assets', type);
            
            // Handle template subdirectory
            const searchPath = type === 'template' ? 
                path.join(assetPath, 'custom_templates') : assetPath;
            
            const filepath = path.join(searchPath, filename);

            if (!fs.existsSync(filepath)) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }

            fs.unlinkSync(filepath);
            console.log(`🗑️ Deleted asset: ${type}/${filename}`);

            res.json({
                success: true,
                message: `${filename} deleted successfully`,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`❌ Delete asset error:`, error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Serve asset files directly for preview/download
     */
    async handleServeAsset(req, res) {
        try {
            const { type, filename } = req.params;
            console.log(`📁 Serve asset request: ${type}/${filename}`);

            if (!['logo', 'signature', 'template'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid asset type'
                });
            }

            const assetPath = path.join(__dirname, 'assets', type);
            
            // Handle template subdirectory
            const searchPath = type === 'template' ? 
                path.join(assetPath, 'custom_templates') : assetPath;
            
            const filepath = path.join(searchPath, filename);

            if (!fs.existsSync(filepath)) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }

            // Send the file directly
            res.sendFile(filepath);
            console.log(`📁 Served asset: ${type}/${filename}`);

        } catch (error) {
            console.error(`❌ Serve asset error:`, error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Serve generated quotation files (HTML, PDF, Excel)
     */
    async handleServeGeneratedFile(req, res) {
        try {
            const { filename } = req.params;
            console.log(`📄 Serve generated file request: ${filename}`);

            const generatedDir = path.join(__dirname, 'assets', 'generated');
            const filepath = path.join(generatedDir, filename);

            if (!fs.existsSync(filepath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Generated file not found'
                });
            }

            // Security check: ensure file is within generated directory
            const resolvedPath = path.resolve(filepath);
            const resolvedGeneratedDir = path.resolve(generatedDir);
            
            if (!resolvedPath.startsWith(resolvedGeneratedDir)) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            // Set appropriate content type
            const ext = path.extname(filename).toLowerCase();
            let contentType = 'application/octet-stream';
            
            switch (ext) {
                case '.html':
                    contentType = 'text/html';
                    break;
                case '.pdf':
                    contentType = 'application/pdf';
                    break;
                case '.xlsx':
                    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    break;
            }
            
            res.setHeader('Content-Type', contentType);
            res.sendFile(filepath);
            console.log(`📄 Served generated file: ${filename}`);

        } catch (error) {
            console.error(`❌ Serve generated file error:`, error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Serve application configuration file
     */
    handleServeConfig(req, res) {
        try {
            console.log('⚙️ Serving app configuration');
            const configPath = path.join(__dirname, 'config', 'app-config.json');
            
            if (!fs.existsSync(configPath)) {
                console.error('❌ Configuration file not found:', configPath);
                return res.status(404).json({
                    success: false,
                    error: 'Configuration file not found'
                });
            }
            
            res.setHeader('Content-Type', 'application/json');
            res.sendFile(configPath);
            console.log('✅ Configuration served successfully');
            
        } catch (error) {
            console.error('❌ Serve config error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * List generated files for auto-detection
     */
    async handleListGeneratedFiles(req, res) {
        try {
            console.log('📁 Listing generated files for auto-detection');
            
            const generatedDir = path.join(__dirname, 'assets', 'generated');
            
            if (!fs.existsSync(generatedDir)) {
                return res.json([]);
            }
            
            const files = fs.readdirSync(generatedDir)
                .filter(file => {
                    // Only include actual generated files
                    return file.endsWith('.html') || file.endsWith('.pdf') || file.endsWith('.xlsx');
                })
                .map(filename => {
                    const filepath = path.join(generatedDir, filename);
                    const stats = fs.statSync(filepath);
                    
                    return {
                        name: filename,
                        size: stats.size,
                        modified: stats.mtime,
                        type: path.extname(filename).toLowerCase().substring(1) // Remove the dot
                    };
                })
                .sort((a, b) => b.modified - a.modified); // Sort by modification time, newest first
            
            console.log(`📁 Found ${files.length} generated files`);
            
            res.json({
                success: true,
                files: files,
                count: files.length,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`❌ List generated files error:`, error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Validate that uploaded file type matches the asset type category
     */
    validateAssetType(file, type) {
        const validTypes = {
            logo: ['image/jpeg', 'image/png', 'image/svg+xml'],
            signature: ['image/jpeg', 'image/png', 'image/svg+xml'],
            template: ['text/html']
        };
        
        // Check by MIME type
        if (validTypes[type]?.includes(file.mimetype)) {
            return { valid: true };
        }
        
        // Check by file extension for SVG files (often have wrong MIME type)
        if ((type === 'logo' || type === 'signature') && file.originalname.toLowerCase().endsWith('.svg')) {
            return { valid: true };
        }
        
        // Check for HTML templates
        if (type === 'template' && file.originalname.toLowerCase().endsWith('.html')) {
            return { valid: true };
        }
        
        return {
            valid: false,
            error: `Invalid file type for ${type}. Expected: ${validTypes[type]?.join(', ')} (got ${file.mimetype})`
        };
    }

    /**
     * Delete existing assets to enforce single-file storage
     */
    deleteExistingAssets(type) {
        try {
            let targetDir;
            
            if (type === 'template') {
                targetDir = path.join(__dirname, 'assets', 'template', 'custom_templates');
            } else {
                targetDir = path.join(__dirname, 'assets', type);
            }
            
            if (!fs.existsSync(targetDir)) {
                return;
            }
            
            const existingFiles = fs.readdirSync(targetDir);
            let deletedCount = 0;
            
            existingFiles.forEach(filename => {
                const filePath = path.join(targetDir, filename);
                
                try {
                    const stats = fs.statSync(filePath);
                    
                    if (stats.isFile()) {
                        // Only delete valid asset files
                        const isValidAsset = this.isValidAssetFile(filename, type);
                        console.log(`🔍 Checking file: ${filename}, type: ${type}, valid: ${isValidAsset}`);
                        
                        if (isValidAsset) {
                            fs.unlinkSync(filePath);
                            deletedCount++;
                            console.log(`🗑️ Deleted existing ${type} file: ${filename}`);
                        } else {
                            console.log(`⚠️ Skipped non-asset file: ${filename}`);
                        }
                    }
                } catch (fileError) {
                    console.error(`❌ Error processing file ${filename}:`, fileError.message);
                }
            });
            
            if (deletedCount > 0) {
                console.log(`🧹 Enforced single-file storage: removed ${deletedCount} existing ${type} files`);
            }
            
        } catch (error) {
            console.error(`❌ Error deleting existing ${type} assets:`, error);
            // Don't throw - allow upload to continue even if cleanup fails
        }
    }

    /**
     * Check if filename is a valid asset file for the given type
     * Supports image files (PNG, JPG, JPEG, SVG) for logo/signature and HTML for templates
     */
    isValidAssetFile(filename, type) {
        const validExtensions = {
            logo: ['.png', '.jpg', '.jpeg', '.svg'],
            signature: ['.png', '.jpg', '.jpeg', '.svg'], 
            template: ['.html', '.htm']
        };
        
        const ext = path.extname(filename).toLowerCase();
        const isValidExtension = validExtensions[type]?.includes(ext) || false;
        
        // Additional check: ensure filename is not a system file
        const isSystemFile = filename.startsWith('.') || filename.toLowerCase().includes('thumb');
        
        return isValidExtension && !isSystemFile;
    }

    /**
     * Move uploaded file from temp directory to correct asset directory
     */
    moveAssetToCorrectDirectory(file, type) {
        let targetDir;
        
        if (type === 'template') {
            targetDir = path.join(__dirname, 'assets', 'template', 'custom_templates');
        } else {
            targetDir = path.join(__dirname, 'assets', type);
        }
        
        const finalPath = path.join(targetDir, file.filename);
        
        // Move file from temp to final location
        fs.renameSync(file.path, finalPath);
        
        console.log(`📁 Moved ${file.filename} from temp to ${type} directory`);
        return finalPath;
    }


    // =========================================================================
    // 🧮 QUOTATION PROCESSING HANDLERS
    // =========================================================================
    
    /**
     * Handle quotation generation requests
     * Integrated with QuotationGenerationAPI for complete processing
     */
    async handleQuotationGeneration(req, res) {
        console.log(`🎯 POST request received at /api/quotation-generation`);
        
        // Create SSE notification broadcaster function
        const sseNotifier = (messageData) => {
            this.broadcastToAllClients(messageData);
        };
        
        // Delegate to the quotation API with SSE notification support
        await this.quotationAPI.handleHTTPRequest(req, res, sseNotifier);
        
        // AUTO-SYNC: Update latest.json after quotation generation
        setTimeout(async () => {
            await this.autoSyncLatestJson();
        }, 1000); // Brief delay to ensure file is fully written
    }

    /**
     * Handle quotation saving requests from UI editing
     */
    async handleSaveQuotation(req, res) {
        console.log(`💾 POST request received at /api/save-quotation`);
        
        try {
            const { filename, html } = req.body;
            
            if (!filename || !html) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing filename or html content'
                });
            }
            
            // Ensure the filename is safe and in generated directory
            const safeFilename = path.basename(filename);
            const filePath = path.join(__dirname, 'assets', 'generated', safeFilename);
            
            // Write the HTML content to file
            fs.writeFileSync(filePath, html, 'utf8');
            
            console.log(`💾 Quotation saved: ${safeFilename}`);
            
            // Broadcast save notification to UI
            this.broadcastToAllClients({
                type: 'quotation_saved',
                data: {
                    filename: safeFilename,
                    timestamp: new Date().toISOString()
                }
            });
            
            res.json({
                success: true,
                filename: safeFilename,
                message: 'Quotation saved successfully'
            });
            
            // AUTO-SYNC: Update latest.json after quotation save
            await this.autoSyncLatestJson();
            
        } catch (error) {
            console.error('❌ Error saving quotation:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to save quotation: ' + error.message
            });
        }
    }

    /**
     * Handle updating pricing variables in existing quotation data files
     */
    async handleUpdatePricingVariables(req, res) {
        console.log(`💾 POST request received at /api/update-pricing-variables`);
        
        try {
            const { rfq_reference, customer_name, pricing_variables } = req.body;

            if (!rfq_reference || !customer_name || !pricing_variables) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: rfq_reference, customer_name, or pricing_variables'
                });
            }

            const success = this.quotationAPI.updateQuotationPricingVariables(
                rfq_reference,
                customer_name,
                pricing_variables
            );

            if (success) {
                // Broadcast update notification to UI
                this.broadcastToAllClients({
                    type: 'pricing_variables_updated',
                    data: {
                        rfq_reference: rfq_reference,
                        customer_name: customer_name,
                        timestamp: new Date().toISOString()
                    }
                });

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
            console.error('❌ Error updating pricing variables:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Handle updating latest.json to reflect currently viewed quotation
     */
    async handleUpdateLatestJson(req, res) {
        try {
            console.log('📝 Updating latest.json for currently viewed quotation');
            
            const latestData = req.body;
            
            // Validate required fields
            if (!latestData.filename || !latestData.base_filename) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: filename and base_filename'
                });
            }
            
            // Path to latest.json
            const generatedDir = path.join(__dirname, 'assets', 'generated');
            const latestJsonPath = path.join(generatedDir, 'latest.json');
            
            // Ensure generated directory exists
            if (!fs.existsSync(generatedDir)) {
                fs.mkdirSync(generatedDir, { recursive: true });
            }
            
            // Write the updated latest.json
            fs.writeFileSync(latestJsonPath, JSON.stringify(latestData, null, 2), 'utf8');
            
            console.log('✅ latest.json updated successfully:', latestData.filename);
            
            res.json({
                success: true,
                message: 'latest.json updated successfully',
                filename: latestData.filename,
                base_filename: latestData.base_filename,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Error updating latest.json:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }


    // =========================================================================
    // 📊 SESSION MANAGEMENT HANDLERS
    // =========================================================================
    
    /**
     * Get session data for debugging and monitoring
     */
    handleGetSession(req, res) {
        try {
            const sessionId = req.params.sessionId;
            const session = this.activeSessions.get(sessionId);
            
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found',
                    session_id: sessionId,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Convert Map to Object for JSON response
            const modules = {};
            session.modules.forEach((moduleData, moduleId) => {
                modules[moduleId] = moduleData;
            });
            
            res.json({
                success: true,
                data: {
                    session_id: sessionId,
                    status: session.status,
                    modules: modules,
                    created_at: session.createdAt,
                    last_update: session.lastUpdate,
                    total_modules: session.modules.size
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Get session error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Get all active sessions for monitoring
     */
    handleGetSessions(req, res) {
        try {
            const sessions = [];
            this.activeSessions.forEach((session, sessionId) => {
                sessions.push({
                    id: sessionId,
                    status: session.status,
                    modules_count: session.modules.size,
                    created_at: session.createdAt,
                    last_update: session.lastUpdate
                });
            });
            
            res.json({
                success: true,
                data: {
                    total_sessions: sessions.length,
                    sessions: sessions
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Get sessions error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // =========================================================================
    // 🏥 HEALTH AND MONITORING HANDLERS
    // =========================================================================
    
    /**
     * Health check endpoint for monitoring systems
     */
    handleHealthCheck(req, res) {
        const uptime = Date.now() - this.stats.serverStartTime.getTime();
        const memoryUsage = process.memoryUsage();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime_ms: uptime,
            uptime_human: this.formatUptime(uptime),
            connected_clients: this.sseClients.size,
            active_sessions: this.activeSessions.size,
            memory_usage_mb: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024),
                heap_used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heap_total: Math.round(memoryUsage.heapTotal / 1024 / 1024)
            },
            system_stats: this.stats
        });
    }

    /**
     * Detailed system statistics endpoint
     */
    handleSystemStats(req, res) {
        try {
            const uptime = Date.now() - this.stats.serverStartTime.getTime();
            
            res.json({
                success: true,
                data: {
                    server_info: {
                        start_time: this.stats.serverStartTime,
                        uptime_ms: uptime,
                        uptime_human: this.formatUptime(uptime),
                        node_version: process.version,
                        platform: process.platform
                    },
                    connections: {
                        current_sse_clients: this.sseClients.size,
                        total_connections: this.stats.totalConnections
                    },
                    sessions: {
                        active_sessions: this.activeSessions.size,
                        total_module_steps: this.moduleSteps.size
                    },
                    workflows: {
                        active_workflows: this.stats.activeWorkflows,
                        completed_today: this.stats.completedToday,
                        total_processed: this.stats.totalProcessed
                    },
                    memory: process.memoryUsage()
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ System stats error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }


    // =========================================================================
    // 🛠️ UTILITY FUNCTIONS
    // =========================================================================
    
    /**
     * Check if port is available before starting server
     */
    async checkPortAvailable(port) {
        return new Promise((resolve) => {
            const net = require('net');
            const tester = net.createServer()
                .once('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                })
                .once('listening', () => {
                    tester.once('close', () => resolve(true)).close();
                })
                .listen(port, '127.0.0.1');
        });
    }
    
    /**
     * Automatically synchronize latest.json with the most recent quotation file
     * This ensures latest.json always points to an existing quotation file
     */
    async autoSyncLatestJson() {
        try {
            console.log('🔄 Auto-syncing latest.json with actual quotation files...');
            
            const generatedDir = path.join(__dirname, 'assets', 'generated');
            
            // Check if generated directory exists
            try {
                await fsp.access(generatedDir);
            } catch {
                console.log('📁 Generated directory does not exist, skipping auto-sync');
                return;
            }
            
            // Find all quotation HTML files
            const allFiles = await fsp.readdir(generatedDir);
            const quotationFiles = allFiles.filter(file => file.startsWith('quotation_') && file.endsWith('.html'));
            
            const files = [];
            for (const filename of quotationFiles) {
                const filepath = path.join(generatedDir, filename);
                const stats = await fsp.stat(filepath);
                files.push({
                    filename: filename,
                    mtime: stats.mtime,
                    size: stats.size
                });
            }
            
            // Sort by modification time, newest first
            files.sort((a, b) => b.mtime - a.mtime);
            
            if (files.length === 0) {
                console.log('📁 No quotation files found, skipping auto-sync');
                return;
            }
            
            // Get the most recent file
            const mostRecentFile = files[0];
            console.log(`✅ Most recent quotation file: ${mostRecentFile.filename}`);
            
            // Extract base filename for data file reference
            const baseFilename = mostRecentFile.filename
                .replace(/\.html$/, '') // Remove .html extension
                .replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, ''); // Remove timestamp
            
            // Create latest.json content
            const latestData = {
                filename: mostRecentFile.filename,
                generated_at: mostRecentFile.mtime.toISOString(),
                size: mostRecentFile.size,
                base_filename: baseFilename,
                data_filename: `${baseFilename}_data.json`,
                auto_synced_at: new Date().toISOString(),
                note: "Auto-synchronized with most recent quotation file"
            };
            
            // Write latest.json
            const latestJsonPath = path.join(generatedDir, 'latest.json');
            await fsp.writeFile(latestJsonPath, JSON.stringify(latestData, null, 2), 'utf8');
            
            console.log(`✅ Auto-sync completed: latest.json updated to reference ${mostRecentFile.filename}`);
            
        } catch (error) {
            console.error('❌ Error during auto-sync of latest.json:', error);
        }
    }
    
    /**
     * Load application configuration from config file
     */
    loadAppConfig() {
        try {
            const configPath = path.join(__dirname, 'config', 'app-config.json');
            
            if (!fs.existsSync(configPath)) {
                console.log('⚠️ Configuration file not found, using localhost defaults');
                return null;
            }
            
            const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const currentEnv = configData.current_environment || 'development';
            const envConfig = configData.environments?.[currentEnv];
            
            if (!envConfig) {
                console.log(`⚠️ Environment '${currentEnv}' not found in config, using localhost defaults`);
                return null;
            }
            
            console.log(`⚙️ Loaded configuration for environment: ${currentEnv}`);
            return configData;
            
        } catch (error) {
            console.error('❌ Error loading configuration:', error.message);
            return null;
        }
    }
    
    /**
     * Send SSE message to specific client
     */
    sendSSEMessage(response, messageData) {
        try {
            const message = `data: ${JSON.stringify(messageData)}\n\n`;
            response.write(message);
        } catch (error) {
            console.error('❌ Error sending SSE message:', error);
        }
    }

    /**
     * Broadcast message to all connected SSE clients
     */
    broadcastToAllClients(messageData) {
        const messageString = `data: ${JSON.stringify(messageData)}\n\n`;
        let successCount = 0;
        let failCount = 0;
        
        this.sseClients.forEach((client, clientId) => {
            try {
                if (client.isAlive) {
                    client.response.write(messageString);
                    successCount++;
                }
            } catch (error) {
                console.error(`💥 Failed to send to client ${clientId}:`, error.message);
                client.isAlive = false;
                failCount++;
            }
        });
        
        console.log(`📡 Broadcast: ${messageData.type} → ${successCount} clients (${failCount} failed)`);
        
        // Clean up failed clients
        if (failCount > 0) {
            setTimeout(() => this.cleanupDeadConnections(), 1000);
        }
    }

    /**
     * Generate unique client ID for SSE connections
     */
    generateClientId() {
        return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate unique session ID for quotation workflows
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate named session ID using SessionManager
     */
    generateNamedSessionId(sessionName) {
        return this.sessionManager.generateNamedSessionId(sessionName);
    }

    /**
     * Get appropriate icon for module type
     */
    getModuleIcon(moduleType) {
        const iconMap = {
            'gmail': '📧', 'email': '📧',
            'google-sheets': '📊', 'sheets': '📊',
            'http': '🌐', 'webhook': '🔗',
            'anthropic-claude': '🧠', 'claude': '🧠',
            'chatgpt': '🤖', 'openai': '🤖',
            'filter': '🔍', 'router': '🔀',
            'iterator': '🔄', 'aggregator': '📋',
            'text-parser': '📝', 'json-parser': '🔧',
            'microsoft-excel': '📈', 'excel': '📈',
            'google-docs': '📄', 'docs': '📄',
            'quotation': '💰', 'pricing': '🧮'
        };
        
        return iconMap[moduleType?.toLowerCase()] || '⚙️';
    }

    /**
     * Format uptime duration into human readable string
     */
    formatUptime(uptimeMs) {
        const seconds = Math.floor(uptimeMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Clean up specific SSE client
     */
    cleanupClient(clientId, heartbeatInterval) {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        
        if (this.sseClients.has(clientId)) {
            const client = this.sseClients.get(clientId);
            try {
                client.response.end();
            } catch (e) {
                // Connection already closed
            }
            this.sseClients.delete(clientId);
            console.log(`🧹 Client ${clientId} cleaned up`);
        }
    }

    /**
     * Clean up expired sessions (older than 2 hours)
     */
    cleanupExpiredSessions() {
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
            console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
        }
    }

    /**
     * Clean up dead SSE connections (inactive for 10 minutes)
     */
    cleanupDeadConnections() {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        let cleanedCount = 0;
        
        this.sseClients.forEach((client, clientId) => {
            const lastPingTime = client.lastPing?.getTime() || client.connectedAt?.getTime();
            if (!client.isAlive || (lastPingTime && lastPingTime < tenMinutesAgo)) {
                this.cleanupClient(clientId);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} dead SSE connections`);
        }
    }

    // =========================================================================
    // 🚀 SERVER LIFECYCLE MANAGEMENT
    // =========================================================================
    
    /**
     * Start the unified SSE server
     */
    async start() {
        // Check if port is available first
        const isPortAvailable = await this.checkPortAvailable(this.port);
        if (!isPortAvailable) {
            const error = new Error(`Port ${this.port} is already in use. Please wait a moment and try again, or use a different port.`);
            error.code = 'EADDRINUSE';
            throw error;
        }
        
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    // Track HTTP connections for proper cleanup
                    this.server.on('connection', (socket) => {
                        this.httpConnections.add(socket);
                        socket.on('close', () => {
                            this.httpConnections.delete(socket);
                        });
                    });

                    // Load config to show correct URLs
                    const configData = this.loadAppConfig();
                    const currentEnv = configData?.current_environment || 'localhost';
                    const envConfig = configData?.environments?.[currentEnv];
                    const baseUrl = envConfig?.API_BASE || `http://localhost:${this.port}`;
                    
                    // Enhanced environment detection logging
                    if (!configData) {
                        console.log('⚠️ No configuration found, using localhost defaults');
                    } else if (!envConfig) {
                        console.log(`⚠️ Environment '${currentEnv}' not found in config, using localhost fallback`);
                    } else {
                        const isNgrokUrl = baseUrl.includes('.ngrok-free.app') || baseUrl.includes('.ngrok.') || baseUrl.includes('.ngrok.io');
                        console.log(`📋 Configuration loaded successfully:`);
                        console.log(`   Environment: ${currentEnv}${isNgrokUrl ? ' (ngrok)' : ' (localhost)'}`);
                        console.log(`   Base URL: ${baseUrl}`);
                    }
                    
                    console.log('');
                    console.log('🚀 ===============================================');
                    console.log('🚀 UNIFIED SSE SERVER RUNNING');
                    console.log(`🔧 Environment: ${currentEnv}`);
                    console.log(`🌐 Base URL: ${baseUrl}`);
                    if (this.currentSessionName) {
                        console.log(`🏷️  Session: ${this.currentSessionName} (${this.currentSessionId})`);
                        console.log(`🔢 Process ID: ${process.pid}`);
                    }
                    console.log('🚀 ===============================================');
                    console.log(`📡 SSE Endpoint: ${baseUrl}/events`);
                    console.log(`📨 Make.com Webhooks: ${baseUrl}/module-update`);
                    console.log(`🎯 Quotation API: ${baseUrl}/api/quotation-generation`);
                    console.log(`💾 Save Quotation: ${baseUrl}/api/save-quotation`);
                    console.log(`🔄 Workflow Complete: ${baseUrl}/workflow-complete`);
                    console.log(`📤 File Upload: ${baseUrl}/upload-asset`);
                    console.log(`🌐 Main Dashboard: ${baseUrl}`);
                    console.log(`⚙️ Configuration: ${baseUrl}/config/app-config.json`);
                    console.log(`🏥 Health Check: ${baseUrl}/health`);
                    console.log(`📊 Statistics: ${baseUrl}/api/stats`);
                    console.log(`🔍 Debug SSE: ${baseUrl}/debug-sse`);
                    console.log('🚀 ===============================================');
                    console.log('');
                    
                    resolve(this);
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.error(`❌ Port ${this.port} is already in use!`);
                        console.error('💡 This usually happens when:');
                        console.error('   1. Another server process is still running');
                        console.error('   2. The previous server shutdown didn\'t complete properly');
                        console.error('   3. Another application is using port 5000');
                        console.error('');
                        console.error('🔧 Try these solutions:');
                        console.error('   1. Wait 10-15 seconds and try again');
                        console.error('   2. Kill any existing node processes: taskkill /f /im node.exe');
                        console.error(`   3. Use a different port: PORT=3001 npm start`);
                    } else {
                        console.error('❌ Server error:', error);
                    }
                    reject(error);
                });

            } catch (error) {
                console.error('❌ Failed to start server:', error);
                reject(error);
            }
        });
    }

    /**
     * Gracefully shutdown the server
     */
    async shutdown() {
        console.log('🛑 Initiating graceful shutdown...');
        
        return new Promise((resolve) => {
            // Set up force shutdown timeout
            const forceShutdownTimeout = setTimeout(() => {
                console.log('⚡ Force shutdown timeout reached, terminating immediately');
                process.exit(1);
            }, 5000); // Force shutdown after 5 seconds
            
            let shutdownSteps = 0;
            const totalSteps = 3;
            
            const checkComplete = () => {
                shutdownSteps++;
                if (shutdownSteps >= totalSteps) {
                    clearTimeout(forceShutdownTimeout);
                    console.log('👋 Unified SSE Server shutdown complete');
                    resolve();
                }
            };
            
            // Step 1: Close all SSE connections
            console.log('📡 Closing SSE connections...');
            this.sseClients.forEach((client, clientId) => {
                try {
                    this.sendSSEMessage(client.response, {
                        type: 'server_shutdown',
                        data: {
                            message: 'Server is shutting down',
                            timestamp: new Date().toISOString()
                        }
                    });
                    client.response.end();
                } catch (error) {
                    // Ignore errors during shutdown
                }
            });
            this.sseClients.clear();
            checkComplete();
            
            // Step 2: Force close all HTTP connections
            console.log('🔌 Force closing HTTP connections...');
            this.httpConnections.forEach((socket) => {
                try {
                    socket.destroy();
                } catch (error) {
                    // Ignore errors during shutdown
                }
            });
            this.httpConnections.clear();
            checkComplete();
            
            // Step 3: Close HTTP server
            console.log('🖥️ Closing HTTP server...');
            if (this.server) {
                this.server.close((err) => {
                    if (err) {
                        console.error('❌ Error closing server:', err);
                    }
                    checkComplete();
                });
            } else {
                checkComplete();
            }
        });
    }
}

// =============================================
// 🛑 GRACEFUL SHUTDOWN HANDLERS
// =============================================

let serverInstance = null;

process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    if (serverInstance) {
        await serverInstance.shutdown();
    }
    // Give a brief moment for cleanup to complete
    setTimeout(() => process.exit(0), 100);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    if (serverInstance) {
        await serverInstance.shutdown();
    }
    // Give a brief moment for cleanup to complete
    setTimeout(() => process.exit(0), 100);
});

// Handle unexpected errors during shutdown
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception during shutdown:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection during shutdown:', reason);
    process.exit(1);
});

// =============================================
// 🚀 START SERVER INSTANCE
// =============================================

async function startServer() {
    try {
        serverInstance = new UnifiedSSEServer();
        await serverInstance.start();
        console.log('✅ Server started successfully');
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start server if this file is run directly
if (require.main === module) {
    startServer();
}

module.exports = UnifiedSSEServer;