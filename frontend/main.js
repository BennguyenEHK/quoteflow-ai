// ============================================
// 🚀 AI QUOTATION AGENT - MAIN CONTROLLER
// ============================================

// Import panel components
import { ChatInputPanel } from './components/chat-input.js';
import { ResultPreviewPanel } from './components/result-preview.js';
import { WorkflowTrackerPanel } from './components/workflow-tracker.js';
import { FileManagerPanel } from './components/file-manager.js';
import { FormulaInputPanel } from './components/formula-input.js';

// Global Configuration - Load from config file
window.CONFIG = null;
window.configLoader = null;

// Global State
let eventSource = null;
let currentSessionId = null;

// Panel instances
let panels = {};

// Smart session restoration check (non-blocking)
function checkSessionRestoration() {
    if (window.resultPreviewPanel && window.resultPreviewPanel.initialized) {
        console.log('✅ Session restoration confirmed ready');
        return true;
    }
    console.log('🔄 Session restoration not yet complete, but continuing...');
    return false;
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 DOM loaded, initializing application...');
    try {
        // Load configuration first
        await loadConfiguration();
        console.log('✅ Configuration loaded');
        
        initializePanels();
        console.log('✅ Panels initialized');
        
        initializeGlobalUtilities();
        console.log('✅ Global utilities initialized');
        
        initializeZoomControls();
        console.log('✅ Zoom controls initialized');
        
        // Quick non-blocking session check, then connect SSE after config validation
        checkSessionRestoration();
        console.log('⚡ Starting SSE connection with config validation for ngrok compatibility');
        
        // CRITICAL FIX: Ensure config is properly loaded before SSE connection
        await initializeSSEConnection();
        
    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
    }
});

async function loadConfiguration() {
    console.log('🔧 Loading application configuration...');
    
    try {
        // Load config directly without external import
        const response = await fetch('/config/app-config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status} ${response.statusText}`);
        }
        
        const configData = await response.json();
        let currentEnvironment = configData.current_environment || 'localhost';
        
        // SMART ENVIRONMENT DETECTION: Override config if running on localhost
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalhost && currentEnvironment !== 'localhost') {
            console.log('🔍 Detected localhost access, overriding environment to "localhost"');
            currentEnvironment = 'localhost';
        }
        
        const envConfig = configData.environments[currentEnvironment];
        if (!envConfig) {
            console.warn(`⚠️ Environment '${currentEnvironment}' not found, falling back to localhost`);
            currentEnvironment = 'localhost';
        }
        
        const finalConfig = configData.environments[currentEnvironment] || configData.environments['localhost'];
        
        // Set global configuration with enhanced metadata
        window.CONFIG = {
            ...finalConfig,
            // Add fallback and connection settings from config
            fallback_urls: configData.fallback_urls || {},
            connection_settings: configData.connection_settings || {}
        };
        
        // CRITICAL FIX: Enhanced config validation and logging for ngrok debugging
        console.log('🔧 Final SSE Configuration Loaded:');
        console.log(`   Environment: ${currentEnvironment}`);
        console.log(`   SSE URL: ${window.CONFIG.SSE_URL}`);
        console.log(`   API Base: ${window.CONFIG.API_BASE}`);
        console.log(`   Current Origin: ${window.location.origin}`);
        console.log(`   Is Ngrok URL: ${window.location.origin.includes('ngrok')}`);
        console.log(`   URL Match Check: ${window.CONFIG.API_BASE === window.location.origin}`);
        
        window.configLoader = {
            currentEnvironment: currentEnvironment,
            config: window.CONFIG,
            isLocalhost: isLocalhost,
            detectedAuto: isLocalhost && configData.current_environment !== 'localhost'
        };
        
        console.log('📋 Configuration environment:', currentEnvironment);
        console.log('🏠 Running on localhost:', isLocalhost);
        console.log('🔧 Auto-detected environment:', window.configLoader.detectedAuto);
        console.log('⚙️ Final configuration:', window.CONFIG);
        console.log('🔧 SSE URL will be:', window.CONFIG.SSE_URL);
        console.log('🔧 API Base will be:', window.CONFIG.API_BASE);
        
    } catch (error) {
        console.error('❌ Failed to load configuration:', error);
        
        // Enhanced fallback configuration
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const fallbackConfig = {
            SSE_URL: isLocalhost ? 'http://localhost:5000/events' : `${window.location.origin}/events`,
            API_BASE: isLocalhost ? 'http://localhost:5000' : window.location.origin,
            WEBHOOK_URL: 'https://hook.eu2.make.com/diqqb34gtjqmrh4mke8tgta9zvgn2cip',
            RETRY_INTERVAL: isLocalhost ? 1000 : 5000,
            AUTO_DETECT_HOST: true,
            fallback_urls: {
                SSE_FALLBACKS: ['http://localhost:5000/events', 'http://127.0.0.1:5000/events'],
                API_FALLBACKS: ['http://localhost:5000', 'http://127.0.0.1:5000']
            },
            connection_settings: {
                ENABLE_SMART_FALLBACK: true,
                MAX_RETRY_ATTEMPTS: 3,
                FALLBACK_DELAY: 1000
            }
        };
        
        window.CONFIG = fallbackConfig;
        window.configLoader = {
            currentEnvironment: 'fallback',
            config: fallbackConfig,
            isLocalhost: isLocalhost,
            detectedAuto: false
        };
        
        console.log('⚠️ Using enhanced fallback configuration:', fallbackConfig);
    }
}

function initializePanels() {
    console.log('🏗️ Starting panel initialization...');
    
    console.log('🗨️ Creating ChatInputPanel...');
    panels.chatInput = new ChatInputPanel();
    
    console.log('📋 Creating ResultPreviewPanel...');
    panels.resultPreview = new ResultPreviewPanel();
    
    console.log('⚙️ Creating WorkflowTrackerPanel...');
    panels.workflowTracker = new WorkflowTrackerPanel();
    
    console.log('📁 Creating FileManagerPanel...');
    panels.fileManager = new FileManagerPanel();
    
    console.log('🧮 Creating FormulaInputPanel...');
    panels.formulaInput = new FormulaInputPanel();
    
    // Make panels globally accessible
    window.chatInput = panels.chatInput;
    window.resultPreview = panels.resultPreview;
    window.workflowTracker = panels.workflowTracker;
    window.fileManager = panels.fileManager;
    window.formulaInput = panels.formulaInput;
    
    console.log('✅ All panels created and made globally accessible');
}

// ============================================
// 🔗 SSE CONNECTION MANAGEMENT
// ============================================

/**
 * Initialize SSE connection with proper config validation and retry logic
 * This function ensures config is loaded before attempting SSE connection
 * @returns {Promise<void>} Resolves when connection attempt is made
 */
async function initializeSSEConnection() {
    console.log('🔧 Initializing SSE connection with config validation...');
    
    // CRITICAL FIX: Wait for config to be fully loaded
    const maxConfigWaitAttempts = 10; // 5 seconds total
    let configWaitAttempts = 0;
    
    while (!window.CONFIG && configWaitAttempts < maxConfigWaitAttempts) {
        console.log(`⏳ Waiting for config to load... attempt ${configWaitAttempts + 1}/${maxConfigWaitAttempts}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        configWaitAttempts++;
    }
    
    if (!window.CONFIG) {
        console.warn('⚠️ Config not loaded after maximum wait time, proceeding with fallback logic');
    } else {
        console.log('✅ Config validated and ready for SSE connection');
        
        // Additional validation for ngrok environments
        if (window.location.origin.includes('ngrok')) {
            console.log('🔍 Ngrok environment detected - validating config URLs...');
            
            if (window.CONFIG.SSE_URL && window.CONFIG.SSE_URL.includes(window.location.host)) {
                console.log('✅ Config SSE URL matches current ngrok host - optimal configuration');
            } else {
                console.warn('⚠️ Config SSE URL mismatch detected - will use current origin as primary');
                console.log(`   Config URL: ${window.CONFIG.SSE_URL}`);
                console.log(`   Current Origin: ${window.location.origin}`);
            }
        }
    }
    
    // Now attempt SSE connection with validated config
    connectSSE();
}

/**
 * Get effective SSE URL with intelligent priority system and smart fallback logic
 * Prioritizes localhost when detected, handles ngrok scenarios, and provides comprehensive fallbacks
 * @returns {Array<string>} Array of SSE URLs to try in order of priority
 */
function getEffectiveSSEUrls() {
    // CRITICAL FIX: Validate config is loaded before proceeding
    if (!window.CONFIG) {
        console.warn('⚠️ Config not loaded, using emergency fallback URLs only');
        return [
            `${window.location.origin}/events`, // Current origin (works for ngrok)
            'http://localhost:5000/events',
            'http://127.0.0.1:5000/events'
        ];
    }
    
    const isLocalhost = window.configLoader?.isLocalhost || false;
    const smartFallback = window.CONFIG?.connection_settings?.ENABLE_SMART_FALLBACK || true;
    const isNgrokEnvironment = window.location.origin.includes('ngrok');
    
    console.log('🔍 Building SSE URL list with enhanced validation:');
    console.log(`   Localhost mode: ${isLocalhost}`);
    console.log(`   Ngrok environment: ${isNgrokEnvironment}`);
    console.log(`   Config SSE URL: ${window.CONFIG.SSE_URL}`);
    
    let urls = [];
    
    if (isNgrokEnvironment) {
        // NGROK PRIORITY: Special handling for ngrok URLs
        console.log('🌐 Ngrok environment detected - using ngrok-optimized URL priority');
        urls = [
            // Priority 1: Current origin /events (ensures ngrok URL is used)
            `${window.location.origin}/events`,
            // Priority 2: Configured SSE_URL (should match current origin)
            window.CONFIG?.SSE_URL,
            // Priority 3: Localhost fallbacks (for local testing)
            'http://localhost:5000/events',
            'http://127.0.0.1:5000/events'
        ];
    } else if (isLocalhost || window.configLoader?.currentEnvironment === 'localhost') {
        // LOCALHOST PRIORITY: When running on localhost, try local URLs first
        console.log('🏠 Localhost mode - prioritizing local connections');
        urls = [
            // Priority 1: Direct localhost connection (fastest)
            'http://localhost:5000/events',
            // Priority 2: Current origin (may be same as localhost)
            `${window.location.origin}/events`,
            // Priority 3: Configured URL as backup
            window.CONFIG?.SSE_URL,
            // Priority 4: Additional localhost fallbacks
            'http://127.0.0.1:5000/events'
        ];
    } else {
        // REMOTE PRIORITY: When running on external domain, try configured URL first
        console.log('🌐 Remote mode - prioritizing configured URL');
        urls = [
            // Priority 1: Configured SSE_URL (remote or cloud)
            window.CONFIG?.SSE_URL,
            // Priority 2: Current origin /events endpoint
            `${window.location.origin}/events`,
            // Priority 3: Localhost fallbacks (in case remote is down)
            'http://localhost:5000/events',
            'http://127.0.0.1:5000/events'
        ];
    }
    
    // Add configured fallback URLs if available
    if (smartFallback && window.CONFIG?.fallback_urls?.SSE_FALLBACKS) {
        console.log('📡 Adding configured fallback URLs');
        urls = [...urls, ...window.CONFIG.fallback_urls.SSE_FALLBACKS];
    }
    
    // Remove duplicates and filter out empty/null values
    const uniqueUrls = [...new Set(urls.filter(Boolean))];
    
    console.log('📋 Final SSE URL priority list:', uniqueUrls);
    return uniqueUrls;
}

function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    updateConnectionStatus('connecting');
    console.log('🔌 Attempting to connect to SSE with smart URL fallback...');
    console.log('🔌 Current page origin:', window.location.origin);
    console.log('🔌 Config environment:', window.configLoader?.currentEnvironment);
    
    // Connect with smart URL fallback
    attemptSSEConnection();
}

function attemptSSEConnection() {
    const sseUrls = getEffectiveSSEUrls();
    console.log('🔌 SSE URLs to try:', sseUrls);
    
    // Start with first URL
    attemptSSEConnectionWithUrl(sseUrls, 0);
}

function attemptSSEConnectionWithUrl(urls, urlIndex, retryCount = 0) {
    const maxRetryAttempts = window.CONFIG?.connection_settings?.MAX_RETRY_ATTEMPTS || 3;
    const fallbackDelay = window.CONFIG?.connection_settings?.FALLBACK_DELAY || 1000;
    const connectionTimeout = window.CONFIG?.connection_settings?.CONNECTION_TIMEOUT || 5000;
    
    if (urlIndex >= urls.length) {
        if (retryCount < maxRetryAttempts) {
            console.log(`🔄 Retry attempt ${retryCount + 1}/${maxRetryAttempts} - restarting URL list`);
            setTimeout(() => {
                attemptSSEConnectionWithUrl(urls, 0, retryCount + 1);
            }, window.CONFIG?.RETRY_INTERVAL || 2000);
            return;
        }
        
        console.error('❌ All SSE URLs failed after all retry attempts.');
        updateConnectionStatus('disconnected', 'All connection attempts failed');
        
        // Final retry after longer delay
        setTimeout(() => {
            console.log('🔄 Final retry - attempting full connection cycle...');
            connectSSE();
        }, (window.CONFIG?.RETRY_INTERVAL || 2000) * 2);
        return;
    }
    
    const currentUrl = urls[urlIndex];
    const isLocalhostUrl = currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1');
    const isNgrokUrl = currentUrl.includes('ngrok');
    
    try {
        // CRITICAL FIX: Enhanced debugging for ngrok connections
        console.log(`🔌 [Retry: ${retryCount}/${maxRetryAttempts}] Connecting to URL (${urlIndex + 1}/${urls.length}):`, currentUrl);
        console.log(`🔌 [Debug] Current page origin: ${window.location.origin}`);
        console.log(`🔌 [Debug] Config SSE URL: ${window.CONFIG?.SSE_URL}`);
        console.log(`🔌 [Debug] Config environment: ${window.configLoader?.currentEnvironment}`);
        console.log(`🔌 [Debug] URL type: ${isNgrokUrl ? 'Ngrok' : isLocalhostUrl ? 'Localhost' : 'Remote'}`);
        console.log(`🔌 [Debug] Expected to work: ${currentUrl === `${window.location.origin}/events` ? 'YES' : 'Maybe'}`);
        
        // Set shorter timeout for localhost URLs
        const urlTimeout = isLocalhostUrl ? 3000 : connectionTimeout;
        
        eventSource = new EventSource(currentUrl);
        
        // Connection timeout handler
        const timeoutHandler = setTimeout(() => {
            if (eventSource && eventSource.readyState === EventSource.CONNECTING) {
                console.log(`⏱️ Connection timeout (${urlTimeout}ms) for ${currentUrl}`);
                eventSource.close();
                updateConnectionStatus('disconnected', `Timeout for ${currentUrl}`);
                
                // Try next URL
                setTimeout(() => {
                    attemptSSEConnectionWithUrl(urls, urlIndex + 1, retryCount);
                }, fallbackDelay);
            }
        }, urlTimeout);
        
        eventSource.onopen = function(event) {
            clearTimeout(timeoutHandler);
            console.log(`✅ SSE Connected successfully to: ${currentUrl}`);
            console.log(`🎯 Connection established on retry ${retryCount}, URL ${urlIndex + 1}`);
            
            // Enhanced connection status with environment detection
            const connectionType = isNgrokUrl ? 'ngrok tunnel' : isLocalhostUrl ? 'localhost' : 'remote';
            updateConnectionStatus('connected', `Connected to ${connectionType} server`);
            
            // CRITICAL FIX: Send test message to verify connection is working
            console.log('🔍 Testing SSE connection with heartbeat request...');
        };
        
        eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                // Only log non-heartbeat messages for cleaner output
                if (data.type !== 'heartbeat' && data.type !== 'system_status') {
                    console.log('📨 SSE Message received:', data.type, data);
                }
                handleSSEMessage(data);
            } catch (error) {
                console.error('❌ Error parsing SSE message:', error, 'Raw data:', event.data);
            }
        };

        eventSource.onerror = function(event) {
            clearTimeout(timeoutHandler);
            console.log(`💥 Connection error for ${currentUrl} (${urlIndex + 1}/${urls.length})`);
            
            // Enhanced error handling based on readyState
            switch(eventSource.readyState) {
                case EventSource.CONNECTING:
                    console.log('🔄 Still connecting - giving more time...');
                    updateConnectionStatus('connecting', `Connecting to ${currentUrl}...`);
                    return; // Don't immediately try next URL
                    
                case EventSource.OPEN:
                    console.log('✅ Connection was open - temporary issue, will reconnect');
                    updateConnectionStatus('connected');
                    return;
                    
                case EventSource.CLOSED:
                    console.log(`❌ Connection closed for: ${currentUrl}`);
                    updateConnectionStatus('disconnected', `Failed: ${currentUrl}`);
                    
                    // Close and try next URL
                    try { eventSource.close(); } catch (e) { /* already closed */ }
                    
                    setTimeout(() => {
                        console.log(`🔄 Trying next URL (${urlIndex + 2}/${urls.length})...`);
                        attemptSSEConnectionWithUrl(urls, urlIndex + 1, retryCount);
                    }, fallbackDelay);
                    break;
            }
        };
        
        console.log(`🔌 EventSource created for ${currentUrl}, readyState:`, eventSource.readyState);
        
    } catch (error) {
        console.error(`❌ Failed to create EventSource for ${currentUrl}:`, error);
        updateConnectionStatus('disconnected', `Error: ${error.message}`);
        
        // Try next URL
        setTimeout(() => {
            console.log(`🔄 Trying next URL after exception (${urlIndex + 2}/${urls.length})...`);
            attemptSSEConnectionWithUrl(urls, urlIndex + 1, retryCount);
        }, fallbackDelay);
    }
}

function handleSSEMessage(data) {
    // Optimized logging - only log important events to improve performance
    if (data.type !== 'heartbeat' && data.type !== 'system_status') {
        console.log('📨 SSE:', data.type);
    }
    
    switch (data.type) {
        case 'workflow_start':
            panels.workflowTracker.handleWorkflowStart(data);
            break;
        case 'workflow_complete':
            panels.workflowTracker.handleWorkflowComplete(data);
            
            // PRIORITY: Handle email_body if present in workflow_complete
            if (data.data && data.data.email_body) {
                panels.resultPreview.handleEmailContentPriority(data.data);
            }
            break;
        case 'workflow_error':
            panels.workflowTracker.handleWorkflowError(data);
            break;
        case 'module_update':
            panels.workflowTracker.handleModuleUpdate(data);
            break;
        case 'quotation_generated':
            console.log('📋 Quotation generated - updating UI');
            // Handle async method properly
            panels.resultPreview.handleQuotationGenerated(data).catch(error => {
                console.error('❌ Error in handleQuotationGenerated:', error);
            });
            
            // Update formula input panel with quotation data
            if (data.data && data.data.quotation_data) {
                panels.formulaInput.onQuotationDataUpdated(data.data.quotation_data);
            }
            break;
        case 'quotation_workflow_complete':
            // Handle workflow completion without interfering with quotation display
            break;
        case 'calculation_complete':
            panels.resultPreview.handleCalculationComplete(data);
            break;
        case 'file_generated':
            panels.fileManager.handleFileGenerated(data);
            break;
        case 'agent_response':
            panels.chatInput.handleAgentResponse(data.data || data);
            break;
        case 'heartbeat':
            // Silent heartbeat processing
            break;
        case 'system_status':
            // Silent system status processing
            break;
        default:
            console.log('🤷 Unknown SSE message type:', data.type);
    }
}

// ============================================
// 🛠️ GLOBAL UTILITIES
// ============================================

function initializeGlobalUtilities() {
    // Connection status elements
    const statusDot = document.getElementById('statusDot');
    const connectionStatus = document.getElementById('connectionStatus');
    
    // Make utility functions globally accessible
    window.updateConnectionStatus = function(status, details = '') {
        statusDot.classList.remove('connected', 'connecting', 'disconnected');
        statusDot.classList.add(status);
        
        switch (status) {
            case 'connected':
                connectionStatus.textContent = 'Connected';
                statusDot.title = 'SSE connection established';
                break;
            case 'connecting':
                connectionStatus.textContent = 'Connecting...';
                statusDot.title = details || 'Attempting SSE connection';
                break;
            case 'disconnected':
                connectionStatus.textContent = 'Disconnected';
                statusDot.title = details || 'SSE connection failed';
                break;
        }
        
        // Log connection status changes
        console.log(`🔌 Connection status: ${status}${details ? ' - ' + details : ''}`);
    };
    
    window.showNotification = function(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.getElementById('notificationContainer').appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };
}

function updateConnectionStatus(status) {
    window.updateConnectionStatus(status);
}

// ============================================
// 🧹 CLEANUP
// ============================================

window.addEventListener('beforeunload', function() {
    if (eventSource) {
        eventSource.close();
        console.log('🔌 SSE Connection closed');
    }
});

// ============================================
// 🔍 ZOOM CONTROLS
// ============================================

function initializeZoomControls() {
    console.log('🔍 Initializing zoom toggle controls for all panels...');
    
    // Define panel mappings with new toggle buttons
    const panelMappings = [
        { 
            toggleId: 'chatZoomToggle', 
            panelSelector: '.chat-input-panel',
            name: 'Chat Panel'
        },
        { 
            toggleId: 'previewZoomToggle', 
            panelSelector: '.result-preview-panel',
            name: 'Preview Panel'
        },
        { 
            toggleId: 'workflowZoomToggle', 
            panelSelector: '.workflow-tracker-panel',
            name: 'Workflow Panel'
        },
        { 
            toggleId: 'fileZoomToggle', 
            panelSelector: '.file-manager-panel',
            name: 'File Manager Panel'
        },
        { 
            toggleId: 'formulaZoomToggle', 
            panelSelector: '.formula-input-panel',
            name: 'Formula Panel'
        }
    ];
    
    // Initialize each panel's zoom toggle
    panelMappings.forEach(mapping => {
        const toggleBtn = document.getElementById(mapping.toggleId);
        const panel = document.querySelector(mapping.panelSelector);
        
        if (toggleBtn && panel) {
            // Track zoom state for each panel
            panel.zoomState = 'normal'; // normal or zoomed-out
            
            // Toggle functionality
            toggleBtn.addEventListener('click', () => {
                const isCurrentlyZoomedOut = panel.classList.contains('panel-zoomed-out');
                
                if (isCurrentlyZoomedOut) {
                    // Zoom back in (return to normal)
                    panel.classList.remove('panel-zoomed-out');
                    panel.classList.add('panel-zoomed-in');
                    panel.zoomState = 'normal';
                    
                    // Update button state
                    toggleBtn.classList.remove('zoomed-out');
                    
                    console.log(`🔍 ${mapping.name} zoomed back to normal size`);
                    window.showNotification(`↗️ ${mapping.name} restored to normal size`, 'info');
                } else {
                    // Zoom out (scale to match full website width)
                    panel.classList.remove('panel-zoomed-in');
                    panel.classList.add('panel-zoomed-out');
                    panel.zoomState = 'zoomed-out';
                    
                    // Update button state
                    toggleBtn.classList.add('zoomed-out');
                    
                    console.log(`🔍 ${mapping.name} zoomed out to full width`);
                    window.showNotification(`↙️ ${mapping.name} scaled to full width`, 'info');
                }
            });
            
            console.log(`✅ Zoom toggle initialized for ${mapping.name}`);
        } else {
            console.warn(`⚠️ Missing zoom elements for ${mapping.name}:`, {
                toggle: !!toggleBtn,
                panel: !!panel
            });
        }
    });
    
    // Global zoom functions for testing
    window.toggleAllPanelsZoom = function() {
        const allPanels = document.querySelectorAll('.chat-input-panel, .result-preview-panel, .workflow-tracker-panel, .file-manager-panel, .formula-input-panel');
        const allToggleBtns = document.querySelectorAll('.zoom-toggle-btn');
        
        // Check current state of first panel to determine action
        const firstPanel = allPanels[0];
        const shouldZoomOut = !firstPanel.classList.contains('panel-zoomed-out');
        
        allPanels.forEach(panel => {
            if (shouldZoomOut) {
                panel.classList.remove('panel-zoomed-in');
                panel.classList.add('panel-zoomed-out');
                panel.zoomState = 'zoomed-out';
            } else {
                panel.classList.remove('panel-zoomed-out');
                panel.classList.add('panel-zoomed-in');
                panel.zoomState = 'normal';
            }
        });
        
        allToggleBtns.forEach(btn => {
            if (shouldZoomOut) {
                btn.classList.add('zoomed-out');
            } else {
                btn.classList.remove('zoomed-out');
            }
        });
        
        window.showNotification(`🔍 All panels ${shouldZoomOut ? 'zoomed out' : 'restored to normal'}`, 'info');
    };
    
    window.resetAllZoom = function() {
        const allPanels = document.querySelectorAll('.chat-input-panel, .result-preview-panel, .workflow-tracker-panel, .file-manager-panel, .formula-input-panel');
        const allToggleBtns = document.querySelectorAll('.zoom-toggle-btn');
        
        allPanels.forEach(panel => {
            panel.classList.remove('panel-zoomed-out', 'panel-zoomed-in');
            panel.zoomState = 'normal';
        });
        
        allToggleBtns.forEach(btn => {
            btn.classList.remove('zoomed-out');
        });
        
        window.showNotification('🔍 All panels reset to normal zoom', 'info');
    };
    
    console.log('✅ Zoom toggle controls fully initialized with global functions');
}

// Export for debugging
window.panels = panels;

// ============================================
// 🧪 TESTING AND DEBUGGING UTILITIES
// ============================================

/**
 * Global testing function to verify SSE connection and ngrok compatibility
 * Available in console as: window.testSSEConnection()
 */
window.testSSEConnection = function() {
    console.log('🧪 Starting SSE Connection Test...');
    console.log('='.repeat(50));
    
    // Test 1: Config validation
    console.log('📋 Test 1: Configuration Validation');
    console.log('   Config loaded:', !!window.CONFIG);
    console.log('   Current environment:', window.configLoader?.currentEnvironment);
    console.log('   Current origin:', window.location.origin);
    console.log('   Is ngrok URL:', window.location.origin.includes('ngrok'));
    
    if (window.CONFIG) {
        console.log('   Config SSE URL:', window.CONFIG.SSE_URL);
        console.log('   Config API Base:', window.CONFIG.API_BASE);
        console.log('   URL Match:', window.CONFIG.API_BASE === window.location.origin);
    }
    
    console.log('');
    
    // Test 2: URL Generation
    console.log('📡 Test 2: SSE URL Generation');
    const testUrls = getEffectiveSSEUrls();
    testUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
    });
    
    console.log('');
    
    // Test 3: Manual connection test
    console.log('🔌 Test 3: Manual SSE Connection Test');
    const testUrl = testUrls[0];
    console.log('   Testing URL:', testUrl);
    
    const testEventSource = new EventSource(testUrl);
    
    testEventSource.onopen = function() {
        console.log('   ✅ Manual SSE connection successful!');
        testEventSource.close();
    };
    
    testEventSource.onerror = function(error) {
        console.log('   ❌ Manual SSE connection failed:', error);
        testEventSource.close();
    };
    
    testEventSource.onmessage = function(event) {
        console.log('   📨 Received SSE message:', event.data);
    };
    
    // Cleanup after 5 seconds
    setTimeout(() => {
        if (testEventSource.readyState !== EventSource.CLOSED) {
            testEventSource.close();
            console.log('   🧹 Test connection closed');
        }
    }, 5000);
    
    console.log('='.repeat(50));
    console.log('🧪 SSE Connection Test Complete');
};