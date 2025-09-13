// Fixed to always show iframe for quotation preview and enable buttons properly
export class ResultPreviewPanel {
    constructor() {
        console.log('🚀 ResultPreviewPanel constructor called - FILE IS LOADING');
        this.currentQuotationData = null;
        this.isEditMode = false;
        this.isViewMode = true; // Default to clean view mode
        this.iframeRef = null;
        this.currentFilename = 'quotation.html';
        this.isShowingFullQuotation = false;
        this.initialized = false;
        this.initializationPromise = null;
        this.isProcessingQuotation = false; // Flag to prevent conflicts
        this.sessionRestorationInProgress = false; // Flag for session restoration coordination
        this.displayMode = 'quotation'; // 'quotation' or 'email' - exclusive display
        
        // Initialize synchronously first
        this.initializeElements();
        this.bindEvents();
        
        console.log('✅ ResultPreviewPanel base initialization complete');
        
        // Start async initialization and store the promise
        this.initializationPromise = this.initializeAsync();
    }
    
    async initializeAsync() {
        try {
            console.log('🔄 Starting async initialization...');
            
            // Wait for essential components with proper polling
            let attempts = 0;
            const maxAttempts = 20; // 10 seconds total
            
            while (attempts < maxAttempts) {
                // Check if all required elements are available
                if (this.previewContainer && this.emptyPreview && this.previewContent && window.CONFIG) {
                    console.log('✅ All dependencies ready after', attempts, 'attempts');
                    break;
                }
                
                console.log('⏳ Waiting for dependencies... attempt', attempts + 1);
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
                
                // Re-initialize elements in case they appeared later
                this.initializeElements();
            }
            
            if (attempts >= maxAttempts) {
                console.error('❌ Failed to initialize after maximum attempts');
                return;
            }
            
            console.log('🔍 Dependencies ready, checking for existing quotation...');
            // Only auto-load if no quotation is being processed
            if (!this.isProcessingQuotation && !this.isShowingFullQuotation) {
                await this.checkAndLoadExistingQuotation();
            } else {
                console.log('⏸️ Skipping auto-load - quotation processing in progress or already displayed');
            }
            
            this.initialized = true;
            console.log('✅ ResultPreviewPanel fully initialized');
            
        } catch (error) {
            console.error('❌ Error in async initialization:', error);
            // One retry attempt
            if (!this.initializationRetried) {
                this.initializationRetried = true;
                console.log('🔄 Retrying initialization once...');
                setTimeout(() => this.initializeAsync(), 2000);
            }
        }
    }

    initializeElements() {
        console.log('🔍 Initializing ResultPreviewPanel elements...');
        this.previewContainer = document.getElementById('previewContainer');
        this.emptyPreview = document.getElementById('emptyPreview');
        this.previewContent = document.getElementById('previewContent');
        this.quotationRef = document.getElementById('quotationRef');
        this.quotationDate = document.getElementById('quotationDate');
        this.customerInfo = document.getElementById('customerInfo');
        this.itemsTable = document.getElementById('itemsTable');
        this.totalValue = document.getElementById('totalValue');
        this.editBtn = document.getElementById('editBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.pricingWarningBox = document.getElementById('pricingWarningBox');
        
        console.log('🔍 Elements found:', {
            previewContainer: !!this.previewContainer,
            emptyPreview: !!this.emptyPreview,
            previewContent: !!this.previewContent,
            editBtn: !!this.editBtn,
            downloadBtn: !!this.downloadBtn
        });
        
        // Check if previewContent is currently visible (this might explain the issue)
        if (this.previewContent) {
            console.log('🔍 previewContent current display:', this.previewContent.style.display);
            console.log('🔍 previewContent computed display:', window.getComputedStyle(this.previewContent).display);
        }
        
        // Add manual test button for debugging
        this.addDebugButton();
    }

    bindEvents() {
        if (this.editBtn) this.editBtn.addEventListener('click', this.toggleEditMode.bind(this));
        if (this.downloadBtn) this.downloadBtn.addEventListener('click', this.downloadQuotation.bind(this));
    }


    
    // ENHANCED: Intelligent auto-loading with session persistence for UI reload
    async checkAndLoadExistingQuotation() {
        console.log('🔍 Checking for quotation auto-loading with session persistence...');
        
        // Don't auto-load if quotation processing is in progress or already displayed
        if (this.isProcessingQuotation || this.isShowingFullQuotation) {
            console.log('⏸️ Skipping check - quotation already processing or displayed');
            return;
        }
        
        // Load available quotations for search functionality first
        await this.loadAvailableQuotations();
        
        // Check for session-persisted quotation (from page reload)
        this.sessionRestorationInProgress = true;
        const lastViewedQuotation = this.getLastViewedQuotationFromSession();
        if (lastViewedQuotation) {
            console.log('📂 Found last viewed quotation in session storage:', lastViewedQuotation);
            
            // Verify the quotation file still exists
            const exists = await this.verifyQuotationFileExists(lastViewedQuotation.filename);
            if (exists) {
                console.log('✅ Last viewed quotation file exists, restoring automatically');
                
                // Restore the last viewed quotation
                await this.loadQuotationFromSession(lastViewedQuotation);
                window.showNotification(`🔄 Restored last viewed quotation: ${lastViewedQuotation.displayName}`, 'info');
                return;
            } else {
                console.log('❌ Last viewed quotation file no longer exists, clearing session');
                this.clearLastViewedQuotationFromSession();
            }
        }
        
        // Fallback: Try to load the most recent quotation from latest.json
        console.log('🔍 No valid session data, checking for most recent quotation...');
        try {
            console.log('🔗 Attempting to fetch latest.json...');
            const latestResponse = await fetch('/assets/generated/latest.json');
            const latestData = await latestResponse.json();
            
            if (latestData.filename) {
                console.log('📋 Found most recent quotation:', latestData.filename);
                console.log('✅ Auto-loading: latest.json fetched successfully');
                
                const exists = await this.verifyQuotationFileExists(latestData.filename);
                if (exists) {
                    await this.loadSpecificQuotation(latestData.filename);
                    window.showNotification('📋 Loaded most recent quotation automatically', 'success');
                    return;
                } else {
                    console.log('⚠️ Latest quotation file no longer exists:', latestData.filename);
                    window.showNotification('⚠️ Latest quotation file no longer available', 'warning');
                }
            } else {
                console.log('⚠️ latest.json exists but has no filename field');
                window.showNotification('⚠️ Latest quotation data is incomplete', 'warning');
            }
        } catch (error) {
            console.log('❌ Auto-loading failed:', error.message);
            
            if (error.message.includes('HTTP 404') || error.message.includes('Not Found')) {
                console.log('ℹ️ latest.json not found - no quotations have been generated yet');
                // This is normal for first-time usage, don't show error notification
            } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
                console.log('🌐 Network error accessing latest.json');
                window.showNotification('🌐 Network error loading latest quotation', 'warning');
            } else {
                console.log('⚠️ Unexpected error accessing latest.json:', error.message);
                window.showNotification('⚠️ Unable to load latest quotation automatically', 'warning');
            }
        }
        
        // Show search interface guidance if no quotation could be auto-loaded
        if (!this.currentFilename) {
            console.log('💡 No quotation auto-loaded - users can search and select from available quotations');
            window.showNotification('💡 Use search bar to select a quotation', 'info');
        }
        
        // Reset session restoration flag
        this.sessionRestorationInProgress = false;
    }
    
    async tryFilenamePatternDetection() {
        console.log('🔍 Attempting smart filename detection...');
        
        // First try the current known file
        const currentKnownFile = 'quotation_quotation_1755155020231_qh2ixl6go_2025-08-14T07-03-40-359Z.html';
        
        const filesToTry = [currentKnownFile];
        
        // Generate possible recent filenames based on timestamps
        const now = Date.now();
        const testTimes = [];
        
        // Generate timestamps for the last hour
        for (let minutesAgo = 0; minutesAgo <= 60; minutesAgo += 5) {
            const testTime = now - (minutesAgo * 60 * 1000);
            testTimes.push(testTime);
        }
        
        // Generate possible filenames with common session ID patterns
        for (const testTime of testTimes) {
            const timestamp = new Date(testTime).toISOString().replace(/[:.]/g, '-');
            // Common session ID patterns (random strings)
            const commonPatterns = ['qh2ixl6go', 'tvjolaaln', 'cvr37nr9o', 'wjvloquyd', 'gjs7y4ve3', 'w0mkalr66'];
            
            for (const pattern of commonPatterns) {
                const possibleFile = `quotation_quotation_${testTime}_${pattern}_${timestamp}.html`;
                if (!filesToTry.includes(possibleFile)) {
                    filesToTry.push(possibleFile);
                }
            }
            
            if (filesToTry.length > 30) break; // Don't test too many files
        }
        
        console.log(`🔍 Testing ${filesToTry.length} possible filenames...`);
        
        // Test each possible file
        for (const filename of filesToTry) {
            try {
                const testUrl = `/assets/generated/${filename}`;
                const testResponse = await fetch(testUrl, { method: 'HEAD' });
                
                if (testResponse.ok) {
                    console.log('✅ Found accessible quotation file:', filename);
                    this.currentFilename = filename;
                    this.isShowingFullQuotation = true;
                    this.displayFullQuotationHTML();
                    this.enablePreviewActions();
                    return;
                }
            } catch (e) {
                // Continue testing other files
            }
        }
        
        console.log('📝 No accessible quotation files found via pattern detection');
    }

    async handleEmailContentPriority(workflowData) {
        console.log('📧 PRIORITY: Handling email content from workflow_complete');
        
        // Store email content for immediate display
        if (!this.currentQuotationData) {
            this.currentQuotationData = {};
        }
        
        this.currentQuotationData.emailContent = workflowData.email_body;
        
        // EXCLUSIVE: Switch to email display mode
        this.displayMode = 'email';
        console.log('🔄 Switching to EXCLUSIVE email display mode');
        
        // Hide quotation, show email in full size
        this.displayEmailExclusive();
        
        window.showNotification('📧 Email content displayed exclusively', 'success');
    }

    displayEmailExclusive() {
        console.log('📧 Displaying email content exclusively');
        
        // Ensure we have all required elements
        if (!this.previewContainer || !this.emptyPreview || !this.previewContent) {
            console.error('❌ Required DOM elements not found for email display');
            return;
        }
        
        // Hide empty preview and show content
        this.emptyPreview.style.display = 'none';
        this.previewContent.style.display = 'flex';
        this.previewContent.style.flexDirection = 'column';
        this.previewContent.style.flex = '1';
        this.previewContent.style.minHeight = '0';
        
        // Create exclusive email display (full container)
        this.previewContent.innerHTML = `
            <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; background: #f8f9fa; flex-shrink: 0;">
                <div style="font-size: 11px; color: #28a745; margin: 0;">
                    ✅ Email content loaded exclusively
                </div>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: white;">
                <div style="padding: 20px; overflow-y: auto; flex: 1;">
                    <div style="background: #f0f8ff; border-left: 4px solid #0066cc; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 16px 0; color: #0066cc; font-size: 18px;">
                            📧 Email Content
                        </h3>
                        <div style="font-size: 14px; line-height: 1.6; color: #333; white-space: pre-wrap; max-height: none;">${this.currentQuotationData.emailContent}</div>
                    </div>
                </div>
            </div>
        `;
        
        this.enablePreviewActions();
        console.log('✅ Email displayed exclusively with full size and scrolling');
    }

    switchToQuotationMode() {
        console.log('🔄 Switching back to quotation mode');
        this.displayMode = 'quotation';
        
        // Re-display quotation
        if (this.currentFilename) {
            this.displayFullQuotationHTML();
        } else {
            // Show empty state if no quotation available
            this.emptyPreview.style.display = 'block';
            this.previewContent.style.display = 'none';
        }
        
        window.showNotification('📋 Switched to quotation display', 'info');
    }

    updateEmailContentDisplay() {
        // Deprecated - replaced by displayEmailExclusive
        console.warn('⚠️ updateEmailContentDisplay is deprecated, use displayEmailExclusive instead');
    }

    async handleQuotationGenerated(data) {
        console.log('📋 Quotation generated data received - ALWAYS show full HTML');
        console.log('🔍 Panel initialized status:', this.initialized);
        
        // Set processing flag to prevent conflicts
        this.isProcessingQuotation = true;
        console.log('🔒 Setting quotation processing flag to prevent conflicts');
        
        // Ensure initialization is complete before proceeding
        if (this.initializationPromise) {
            console.log('⏳ Waiting for initialization to complete...');
            try {
                await this.initializationPromise;
            } catch (error) {
                console.error('❌ Initialization failed:', error);
            }
        }
        
        // Double-check initialization status
        if (!this.initialized) {
            console.log('⚠️ Panel still not initialized, forcing retry...');
            // Force re-initialization
            this.initializationPromise = this.initializeAsync();
            await this.initializationPromise;
        }
        
        // CRITICAL FIX: Handle nested data structure for both generate and update actions
        const actualData = data.data || data; // Handle both direct and nested data structures
        const { quotation_data, calculated_pricing, preview_data, session_id, html_content, generated_files, email_content, action_type } = actualData;
        
        console.log('🎯 Action type for quotation display:', action_type);
        console.log('📊 Data structure available:', {
            has_quotation_data: !!quotation_data,
            has_calculated_pricing: !!calculated_pricing,
            has_preview_data: !!preview_data,
            has_generated_files: !!generated_files,
            action_type: action_type
        });

        // CRITICAL FIX: Validate that update actions have complete data
        if (action_type === 'update') {
            console.log('🔄 Processing UPDATE action for quotation preview');
            
            // Check if we have the minimum required data for display
            const hasMinimumData = quotation_data || preview_data || generated_files;
            if (!hasMinimumData) {
                console.error('❌ UPDATE action missing required data for quotation preview');
                window.showNotification('⚠️ Update action received but missing quotation data', 'warning');
                return;
            }
            
            console.log('✅ UPDATE action has sufficient data for quotation preview');
        } else if (action_type === 'generate') {
            console.log('🆕 Processing GENERATE action for quotation preview');
        } else {
            console.log(`🔍 Processing ${action_type || 'UNKNOWN'} action for quotation preview`);
        }
        
        this.currentQuotationData = {
            sessionId: session_id,
            quotationData: quotation_data,
            calculatedPricing: calculated_pricing,
            previewData: preview_data,
            htmlContent: html_content,
            generatedFiles: generated_files,
            emailContent: email_content
        };
        
        // Set filename from generated files or use default
        if (generated_files?.html?.filename) {
            this.currentFilename = generated_files.html.filename;
        } else {
            // Try to extract filename from preview_data or session
            const timestamp = Date.now();
            this.currentFilename = `quotation_${session_id || timestamp}.html`;
        }
        
        // Mark that we're showing full quotation to prevent interference
        this.isShowingFullQuotation = true;
        
        // EXCLUSIVE: Switch to quotation mode and display
        this.displayMode = 'quotation';
        this.displayFullQuotationHTML();
        this.enablePreviewActions();
        
        // Clear processing flag after successful display
        this.isProcessingQuotation = false;
        console.log('🔓 Clearing quotation processing flag - display complete');
        
        // Save to session storage for persistence across page reloads
        this.saveLastViewedQuotationToSession();
        
        window.showNotification('✅ Full quotation loaded!', 'success');
    }

    displayFullQuotationHTML() {
        console.log('🖼️ Displaying full HTML quotation in iframe with filename:', this.currentFilename);
        
        // Ensure we have all required elements
        if (!this.previewContainer || !this.emptyPreview || !this.previewContent) {
            console.error('❌ Required DOM elements not found for display');
            return;
        }
        
        // CRITICAL: Force hide empty preview and show content with flex
        this.emptyPreview.style.display = 'none';
        this.previewContent.style.display = 'flex';
        this.previewContent.style.flexDirection = 'column';
        this.previewContent.style.flex = '1';
        this.previewContent.style.minHeight = '0';
        
        console.log('✅ DOM state set - emptyPreview hidden, previewContent visible');
        
        // Detect filename using proven test-iframe logic
        this.detectAndLoadQuotationFile();
    }

    async detectAndLoadQuotationFile() {
        console.log('🔍 Auto-detecting quotation file - prioritizing current filename...');
        
        let detectedFile = null;
        let fileUrl = null;
        
        // PRIORITY 1: Use current filename if available (from recent generation or selection)
        if (this.currentFilename) {
            fileUrl = `/assets/generated/${this.currentFilename}`;
            console.log('🎯 Using current filename (priority):', this.currentFilename);
            
            // Verify file exists before proceeding
            try {
                const response = await fetch(fileUrl, { method: 'HEAD' });
                if (response.ok) {
                    console.log('✅ Current file is accessible:', response.status, response.statusText);
                    this.createStableIframe(fileUrl);
                    return;
                } else {
                    console.log('⚠️ Current file not accessible, trying fallback methods');
                }
            } catch (error) {
                console.log('⚠️ Error accessing current file, trying fallback:', error.message);
            }
        }
        
        // FALLBACK 1: Try latest.json index file
        try {
            const indexResponse = await fetch('/assets/generated/latest.json');
            const indexData = await indexResponse.json();
            console.log('✅ Found latest.json index file:', indexData.filename);
            detectedFile = indexData.filename;
            fileUrl = `/assets/generated/${detectedFile}`;
            
            // Verify file exists
            const exists = await this.verifyQuotationFileExists(indexData.filename);
            if (exists) {
                console.log('✅ Index file is accessible');
                this.currentFilename = detectedFile;
                this.createStableIframe(fileUrl);
                return;
            } else {
                console.log('❌ Index file not accessible');
            }
        } catch (error) {
            console.log('⚠️ Could not load latest.json index:', error.message);
        }
        
        // FALLBACK 2: No file available
        console.error('❌ No quotation file available to display');
        this.showNoFileError();
    }

    showFileNotFoundError(filename) {
        console.error(`❌ File not found: ${filename}`);
        
        // Show error in the preview area
        if (this.iframeRef) {
            this.iframeRef.style.display = 'none';
        }
        
        if (this.emptyPreview) {
            this.emptyPreview.style.display = 'flex';
            this.emptyPreview.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #dc3545;">
                    <h3>❌ Quotation Not Found</h3>
                    <p>The selected quotation file "${filename}" could not be loaded.</p>
                    <p>Please try selecting another quotation or generate a new one.</p>
                </div>
            `;
        }
        
        if (this.previewContent) {
            this.previewContent.style.display = 'none';
        }
        
        window.showNotification(`❌ Quotation "${filename}" not found`, 'error');
    }

    /**
     * Update latest.json to reflect the currently viewed quotation
     */
    async updateLatestJsonForCurrentView(filename, baseFilename) {
        try {
            console.log(`📝 Updating latest.json to reflect current view: ${filename}`);
            
            // Get file stats for the currently viewed quotation
            let fileSize = 0;
            
            try {
                const fileResponse = await fetch(`/assets/generated/${filename}`, { method: 'HEAD' });
                const contentLength = fileResponse.headers.get('content-length');
                fileSize = contentLength ? parseInt(contentLength) : 0;
            } catch (error) {
                console.log('⚠️ Could not get file size for latest.json update:', error.message);
                fileSize = 0;
            }
            
            // Create latest.json data reflecting the CURRENTLY VIEWED quotation
            const latestData = {
                filename: filename,
                generated_at: new Date().toISOString(),
                size: fileSize,
                base_filename: baseFilename,
                data_filename: `${baseFilename}_data.json`,
                view_updated_at: new Date().toISOString(), // Track when user last viewed this
                note: "Updated to reflect currently viewed quotation"
            };
            
            // Update latest.json via API
            const updateResponse = await fetch('/api/update-latest-json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(latestData)
            });
            
            if (updateResponse.ok) {
                console.log('✅ latest.json updated successfully to reflect current view');
            } else {
                console.error('❌ Failed to update latest.json:', updateResponse.statusText);
            }
            
        } catch (error) {
            console.error('❌ Error updating latest.json for current view:', error);
        }
    }

    createStableIframe(fileUrl) {
        console.log('🔗 Creating stable iframe with URL:', fileUrl);
        
        // Check if this file has been edited and prefer edited version
        const isEdited = localStorage.getItem(`edited_${this.currentFilename}`) === 'true';
        if (isEdited) {
            console.log('📝 Detected edited version, will load saved content');
        }
        
        // EXCLUSIVE: No email section in quotation mode
        const emailSection = '';
        
        // Conditional search container - only show for quotation display mode
        const searchContainer = this.displayMode === 'quotation' ? `
            <!-- Search Bar for Quotations - Fixed Size with Vertical Scrolling -->
            <div id="quotationSearchContainer" style="height: 120px; max-height: 120px; overflow-y: auto; padding: 4px 8px; border-bottom: 1px solid #e0e0e0; background: #f8f9fa; flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                    <div style="flex: 1; position: relative;">
                        <input type="text" id="quotationSearchInput" placeholder="🔍 Search quotations by RFQ or customer..." 
                               style="width: 100%; padding: 6px 28px 6px 26px; border: 1px solid #007bff; border-radius: 16px; font-size: 12px; background: white; outline: none; transition: all 0.3s;"
                               onfocus="this.style.borderColor='#0056b3'" onblur="this.style.borderColor='#007bff'">
                        <div style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: #6c757d; font-size: 12px;">🔍</div>
                        <button id="clearSearchBtn" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #6c757d; font-size: 14px; cursor: pointer; opacity: 0; transition: opacity 0.2s;" onclick="this.style.opacity='0.7'" onmouseout="this.style.opacity='0.5'">×</button>
                    </div>
                    <button id="refreshQuotationsBtn" style="padding: 6px 10px; background: #28a745; color: white; border: none; border-radius: 12px; font-size: 10px; cursor: pointer; transition: all 0.2s; white-space: nowrap;" 
                            onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">🔄 Refresh</button>
                </div>
                
                <!-- Search Results Dropdown - Now scrolls within fixed container -->
                <div id="quotationSearchResults" style="position: relative; z-index: 1000; background: white; border: 1px solid #dee2e6; border-radius: 8px; max-height: 100%; overflow-y: auto; display: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></div>
                
                <!-- Current Quotation Indicator -->
                <div id="currentQuotationIndicator" style="font-size: 9px; color: #6c757d; margin-top: 2px; font-style: italic;"></div>
            </div>` : '';
        
        // Create enhanced preview content with full-size iframe including conditional search bar
        this.previewContent.innerHTML = `
            ${searchContainer}
            
            <div style="padding: 6px 8px; border-bottom: 1px solid #e0e0e0; background: #f8f9fa; flex-shrink: 0;">
                <div id="loadingStatus" style="font-size: 11px; color: #ffc107; margin: 0;">
                    ⏳ Loading quotation: ${this.currentFilename} ${isEdited ? '(edited)' : ''}
                </div>
                ${emailSection}
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
                <iframe id="quotation-iframe" style="
                    width: 100%;
                    height: 100%;
                    min-height: 600px;
                    border: none;
                    background: white;
                    display: block;
                    flex: 1;
                " src="about:blank"></iframe>
            </div>
        `;
        
        this.iframeRef = document.getElementById('quotation-iframe');
        const statusDiv = document.getElementById('loadingStatus');
        
        // Initialize search functionality
        this.initializeSearchFunctionality();
        
        // Set up event handlers before loading
        this.iframeRef.onload = () => {
            console.log('✅ Quotation iframe loaded successfully');
            statusDiv.innerHTML = `✅ Quotation loaded successfully ${isEdited ? '(edited version)' : ''}`;
            statusDiv.style.color = '#28a745';
            
            this.enablePreviewActions();
            
            // CRITICAL: Ensure clean preview mode by removing any edit styling
            this.ensureCleanPreviewMode();
            
            // Test iframe content access
            try {
                const iframeDoc = this.iframeRef.contentDocument || this.iframeRef.contentWindow.document;
                if (iframeDoc) {
                    console.log('📄 Iframe document title:', iframeDoc.title);
                    console.log('📄 Iframe body exists:', !!iframeDoc.body);
                    if (iframeDoc.body) {
                        const contentLength = iframeDoc.body.innerHTML.length;
                        console.log('📄 Iframe body content length:', contentLength);
                        if (contentLength > 0) {
                            statusDiv.innerHTML = `✅ Quotation loaded with full content ${isEdited ? '(edited version)' : ''}`;
                        }
                    }
                } else {
                    console.log('⚠️ Cannot access iframe document (cross-origin)');
                }
            } catch (e) {
                console.log('⚠️ Cross-origin access restriction:', e.message);
            }
            
            // Stability check
            setTimeout(() => {
                this.ensureStableDisplay();
            }, 1000);
        };

        this.iframeRef.onerror = () => {
            console.error('❌ Failed to load quotation from:', fileUrl);
            statusDiv.innerHTML = '❌ Failed to load quotation';
            statusDiv.style.color = '#d32f2f';
            this.showLoadError(fileUrl);
        };

        // Load the quotation (edited versions are automatically served by backend)
        console.log('🔗 Setting iframe src to:', fileUrl);
        this.iframeRef.src = fileUrl;
    }

    showLoadError(fileUrl) {
        const contentDiv = this.previewContent.querySelector('div:last-child');
        const fullUrl = `${window.location.origin}${fileUrl}`;
        
        contentDiv.innerHTML = `
            <div style="padding: 20px; color: #d32f2f; text-align: center;">
                <h4>❌ Error Loading Quotation</h4>
                <p>Could not load: ${fileUrl}</p>
                <p>Full URL: ${fullUrl}</p>
                <p>Please check if the file exists and try again.</p>
                <button onclick="window.open('${fileUrl}')" style="margin: 5px; padding: 8px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">🔍 Test Direct</button>
                <button onclick="location.reload()" style="margin: 5px; padding: 8px 15px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">🔄 Retry</button>
                <button onclick="window.testQuotationPreview()" style="margin: 5px; padding: 8px 15px; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">🐛 Debug Test</button>
            </div>
        `;
    }

    showNoFileError() {
        this.previewContent.innerHTML = `
            <div style="padding: 20px; color: #d32f2f; text-align: center;">
                <h4>❌ No Quotation File Available</h4>
                <p>No quotation file has been generated yet.</p>
                <button onclick="location.reload()" style="margin: 5px; padding: 8px 15px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">🔄 Refresh</button>
            </div>
        `;
    }

    // Note: bindIframeControls removed - using header buttons instead
    
    ensureCleanPreviewMode() {
        console.log('🧹 Ensuring clean preview mode - removing edit styling');
        
        try {
            const iframeDoc = this.iframeRef?.contentDocument || this.iframeRef?.contentWindow?.document;
            if (iframeDoc) {
                // Remove all editing-related styling
                const editableElements = iframeDoc.querySelectorAll('[contenteditable="true"]');
                editableElements.forEach(el => {
                    el.contentEditable = 'false';
                    el.style.border = '';
                    el.style.padding = '';
                    el.style.borderRadius = '';
                    el.style.backgroundColor = '';
                    el.style.transition = '';
                    
                    // Remove event listeners by cloning
                    const newEl = el.cloneNode(true);
                    el.parentNode?.replaceChild(newEl, el);
                });
                
                // Remove any dashed borders or edit indicators
                const styledElements = iframeDoc.querySelectorAll('[style*="border"], [style*="dashed"]');
                styledElements.forEach(el => {
                    if (el.style.border.includes('dashed')) {
                        el.style.border = '';
                    }
                });
                
                console.log('✅ Clean preview mode enforced');
            }
        } catch (error) {
            console.log('ℹ️ Could not access iframe content for cleaning (cross-origin)');
        }
    }

    ensureStableDisplay() {
        console.log('🔍 Stability check - ensuring quotation display persists');
        
        // Check if our display state is still correct
        if (this.isShowingFullQuotation && this.previewContent) {
            // Force correct display state with flex
            if (this.emptyPreview) {
                this.emptyPreview.style.display = 'none';
            }
            this.previewContent.style.display = 'flex';
            this.previewContent.style.flexDirection = 'column';
            this.previewContent.style.flex = '1';
            this.previewContent.style.minHeight = '0';
            
            // Verify iframe is still there and properly sized
            if (this.iframeRef && this.iframeRef.parentNode) {
                console.log('✅ Stability check passed - quotation display stable');
                // Ensure iframe maintains full size
                this.iframeRef.style.width = '100%';
                this.iframeRef.style.height = '100%';
                this.iframeRef.style.flex = '1';
            } else {
                console.warn('⚠️ Stability check failed - iframe missing, may need to redisplay');
            }
        }
    }

    enablePreviewActions() {
        // Enable the main header buttons in default view mode
        if (this.editBtn) {
            this.editBtn.disabled = false;
            this.editBtn.style.opacity = '1';
            this.editBtn.style.cursor = 'pointer';
            this.editBtn.textContent = '✏️ Edit'; // Ensure default text
            this.editBtn.style.background = '#007bff'; // Default blue
        }
        if (this.downloadBtn) {
            this.downloadBtn.disabled = false;
            this.downloadBtn.style.opacity = '1';
            this.downloadBtn.style.cursor = 'pointer';
        }
        // Ensure we start in clean view mode
        this.isEditMode = false;
        this.isViewMode = true;
        console.log('✅ Preview actions enabled in view mode');
    }

    toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        this.isViewMode = !this.isEditMode;
        const headerEditBtn = this.editBtn; // Use header button
        
        if (this.isEditMode) {
            this.enableInPlaceEditing();
            if (headerEditBtn) {
                headerEditBtn.textContent = '💾 Save';
                headerEditBtn.style.background = '#28a745';
            }
            window.showNotification('✏️ Edit mode enabled - Click on content to edit', 'info');
        } else {
            this.saveAndReturnToPreview(headerEditBtn);
        }
    }

    async saveAndReturnToPreview(headerEditBtn) {
        // Save the changes first
        await this.saveEditedQuotation();
        
        // Return to clean view mode
        this.disableInPlaceEditing();
        this.isViewMode = true;
        if (headerEditBtn) {
            headerEditBtn.textContent = '✏️ Edit';
            headerEditBtn.style.background = '#007bff';
        }
        window.showNotification('👁️ Changes saved - returned to clean view mode', 'success');
    }

    enableInPlaceEditing() {
        if (!this.iframeRef?.contentDocument && !this.iframeRef?.contentWindow) {
            console.warn('⚠️ Cannot access iframe content for editing');
            window.showNotification('⚠️ Edit mode requires same-origin content', 'warning');
            return;
        }
        
        try {
            const doc = this.iframeRef.contentDocument || this.iframeRef.contentWindow.document;
            
            if (!doc) {
                throw new Error('Cannot access iframe document');
            }
            
            // Enhanced selector to target editable elements
            const editableSelectors = [
                'p', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                'span:not(.no-edit):not([class*="icon"])', 
                'div:not([class*="header"]):not([class*="footer"])',
                '.editable', '[data-editable="true"]'
            ];
            
            const elements = doc.querySelectorAll(editableSelectors.join(', '));
            let editableCount = 0;
            
            elements.forEach(el => {
                // Skip elements with images, icons, or specific classes
                if (!el.querySelector('img') && 
                    !el.classList.contains('no-edit') && 
                    !el.classList.contains('logo') &&
                    el.textContent.trim().length > 0) {
                    
                    el.contentEditable = 'true';
                    el.style.border = '1px dashed #007bff';
                    el.style.padding = '2px';
                    el.style.borderRadius = '2px';
                    el.style.transition = 'all 0.2s ease';
                    
                    // Add hover effect
                    el.addEventListener('mouseenter', function() {
                        this.style.backgroundColor = '#f0f8ff';
                    });
                    
                    el.addEventListener('mouseleave', function() {
                        this.style.backgroundColor = '';
                    });
                    
                    editableCount++;
                }
            });
            
            console.log(`✏️ Enabled editing for ${editableCount} elements`);
            window.showNotification(`✏️ Edit mode: ${editableCount} elements editable`, 'success');
            
        } catch (error) {
            console.error('❌ Cannot enable editing:', error);
            window.showNotification('❌ Cannot enable editing - content may be cross-origin', 'warning');
            
            // Fallback: offer to open in new window for editing
            const fallbackBtn = document.createElement('button');
            fallbackBtn.innerHTML = '🔧 Edit in New Window';
            fallbackBtn.style.cssText = 'position: fixed; top: 50px; right: 10px; z-index: 9999; padding: 10px; background: #ffc107; color: black; border: none; border-radius: 4px;';
            fallbackBtn.onclick = () => {
                const editUrl = `/assets/generated/${this.currentFilename}`;
                const editWindow = window.open(editUrl, '_blank', 'width=1200,height=800,scrollbars=yes');
                if (editWindow) {
                    window.showNotification('🔧 Opening quotation for editing in new window', 'info');
                } else {
                    window.showNotification('❌ Popup blocked', 'error');
                }
                document.body.removeChild(fallbackBtn);
            };
            document.body.appendChild(fallbackBtn);
            
            setTimeout(() => {
                if (document.body.contains(fallbackBtn)) {
                    document.body.removeChild(fallbackBtn);
                }
            }, 5000);
        }
    }

    disableInPlaceEditing() {
        if (!this.iframeRef?.contentDocument) return;
        
        try {
            const doc = this.iframeRef.contentDocument;
            const elements = doc.querySelectorAll('[contenteditable="true"]');
            
            elements.forEach(el => {
                el.contentEditable = 'false';
                el.style.border = '';
                el.style.padding = '';
            });
            
            console.log('👁️ Disabled editing mode');
        } catch (error) {
            console.error('❌ Cannot disable editing:', error);
        }
    }

    async saveEditedQuotation() {
        if (!this.iframeRef?.contentDocument) {
            window.showNotification('❌ No content to save', 'error');
            return;
        }
        
        try {
            const doc = this.iframeRef.contentDocument;
            const html = doc.documentElement.outerHTML;
            
            const response = await fetch('/api/save-quotation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.currentFilename,
                    html: html
                })
            });
            
            if (response.ok) {
                console.log('✅ Edited quotation saved successfully');
                window.showNotification('💾 Changes saved!', 'success');
                
                // Mark as edited for reload preference
                localStorage.setItem(`edited_${this.currentFilename}`, 'true');
            } else {
                throw new Error(`Save failed: ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Save error:', error);
            window.showNotification('❌ Failed to save changes', 'error');
        }
    }

    async saveQuotation() {
        return this.saveEditedQuotation();
    }

    downloadQuotation() {
        if (!this.currentFilename) {
            window.showNotification('❌ No quotation to download', 'error');
            return;
        }
        
        // If currently in edit mode, save and return to view mode first
        const wasInEditMode = this.isEditMode;
        if (wasInEditMode) {
            this.saveAndReturnToPreview(this.editBtn);
            // Brief delay to ensure save completes
            setTimeout(() => this.performDownload(), 500);
            return;
        }
        
        this.performDownload();
    }

    performDownload() {
        
        const url = `/assets/generated/${this.currentFilename}`;
        console.log('📄 Opening clean preview for PDF download:', url);
        
        // Enhanced print handling with clean preview format
        try {
            const printWindow = window.open(url, '_blank', 'width=1200,height=800,scrollbars=yes');
            
            if (printWindow) {
                console.log('✅ Print window opened successfully');
                
                printWindow.onload = () => {
                    console.log('📄 Print window loaded, ensuring clean format');
                    
                    // Ensure no edit styling in print window
                    try {
                        const printDoc = printWindow.document;
                        const editableElements = printDoc.querySelectorAll('[contenteditable="true"]');
                        editableElements.forEach(el => {
                            el.contentEditable = 'false';
                            el.style.border = '';
                            el.style.padding = '';
                            el.style.borderRadius = '';
                            el.style.backgroundColor = '';
                        });
                    } catch (e) {
                        console.log('ℹ️ Could not clean edit styling (cross-origin)');
                    }
                    
                    printWindow.focus();
                    
                    // Small delay to ensure clean content is rendered
                    setTimeout(() => {
                        printWindow.print();
                    }, 500);
                };
                
                // Fallback for blocked popups
                setTimeout(() => {
                    if (printWindow.closed || !printWindow.location) {
                        console.warn('⚠️ Print window may have been blocked');
                        window.showNotification('⚠️ Popup may be blocked - try allowing popups', 'warning');
                    }
                }, 1000);
                
                window.showNotification('📄 Opening clean preview for printing...', 'info');
            } else {
                throw new Error('Popup blocked');
            }
        } catch (error) {
            console.error('❌ Print window failed:', error);
            // Fallback: direct navigation to print
            window.showNotification('📄 Opening quotation in new tab for printing', 'info');
            window.open(url, '_blank');
        }
    }

    // IMPORTANT: Block displayQuotationPreview when showing full quotation
    displayQuotationPreview(previewData) {
        // If we're already showing the full quotation, don't revert to table view
        if (this.isShowingFullQuotation) {
            console.log('🚫 Ignoring displayQuotationPreview - full quotation is displayed');
            return;
        }
        
        console.log('📊 Displaying fallback table preview');
        this.emptyPreview.style.display = 'none';
        this.previewContent.style.display = 'flex';
        this.previewContent.style.flexDirection = 'column';
        this.previewContent.style.flex = '1';
        
        this.quotationRef.textContent = previewData.rfq_reference || 'N/A';
        this.quotationDate.textContent = this.formatDate(new Date());
        
        const customerData = previewData.customer_info || {};
        this.customerInfo.innerHTML = `
            <div><strong>Company:</strong> ${customerData.company_name || 'N/A'}</div>
            <div><strong>Contact:</strong> ${customerData.contact_person || 'N/A'}</div>
            <div><strong>Email:</strong> ${customerData.email || 'N/A'}</div>
        `;
        
        this.displayItemsTable(previewData.items || []);
        
        const total = previewData.pricing_summary?.subtotal || 0;
        this.totalValue.textContent = this.formatCurrency(total);
    }

    displayItemsTable(items) {
        if (!items.length) {
            this.itemsTable.innerHTML = '<div class="no-items">No items available</div>';
            return;
        }
        
        let tableHTML = `
            <table class="preview-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        items.forEach(item => {
            tableHTML += `
                <tr>
                    <td>${item.item_no}</td>
                    <td>${item.description}</td>
                    <td>${item.quantity}</td>
                    <td>${this.formatCurrency(item.calculated_unit_price || item.original_unit_price)}</td>
                    <td>${this.formatCurrency(item.calculated_ext_price || 0)}</td>
                </tr>
            `;
        });
        
        tableHTML += '</tbody></table>';
        this.itemsTable.innerHTML = tableHTML;
    }

    handleCalculationComplete(data) {
        // If we're showing full quotation, don't interfere
        if (this.isShowingFullQuotation) {
            console.log('📊 Calculation complete - maintaining full quotation display');
            return;
        }
        
        console.log('📊 Calculation complete - updating table view');
        this.lastCalculationData = data;
    }

    formatDate(date) {
        return date.toLocaleDateString();
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount) + ' VND';
    }
    
    addDebugButton() {
        // Debug functionality available via console only
        window.testQuotationPreview = async () => {
            console.log('🐛 Console test triggered - using latest.json');
            await this.testWithLatestFile();
        };
    }
    
    async testWithLatestFile() {
        try {
            // Load the latest file from latest.json
            const indexResponse = await fetch('/assets/generated/latest.json');
            const indexData = await indexResponse.json();
            console.log('🔍 Found latest file:', indexData.filename);
            
            this.currentFilename = indexData.filename;
            this.isShowingFullQuotation = true;
            this.displayFullQuotationHTML();
            this.enablePreviewActions();
        } catch (error) {
            console.error('❌ Error in testWithLatestFile:', error);
        }
    }
    
    cleanup() {
        console.log('🧹 Cleanup called - resetting quotation display state');
        this.isDisplayingHTML = false;
        this.isShowingFullQuotation = false;
        this.isProcessingQuotation = false;
        this.iframeRef = null;
    }

    // =========================================================================
    // 🔍 QUOTATION SEARCH FUNCTIONALITY
    // =========================================================================

    /**
     * Initialize the quotation search functionality
     */
    initializeSearchFunctionality() {
        console.log('🔍 Initializing quotation search functionality...');
        
        // Available quotations cache
        this.availableQuotations = {};
        this.filteredQuotations = [];
        
        // Get search elements
        this.searchInput = document.getElementById('quotationSearchInput');
        this.searchResults = document.getElementById('quotationSearchResults');
        this.refreshBtn = document.getElementById('refreshQuotationsBtn');
        this.clearBtn = document.getElementById('clearSearchBtn');
        this.currentIndicator = document.getElementById('currentQuotationIndicator');
        
        if (!this.searchInput) {
            console.warn('⚠️ Search input not found - search functionality disabled');
            return;
        }
        
        // Bind events
        this.searchInput.addEventListener('input', this.handleSearchInput.bind(this));
        this.searchInput.addEventListener('focus', this.showSearchResults.bind(this));
        this.searchInput.addEventListener('blur', this.hideSearchResultsDelayed.bind(this));
        
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', this.refreshQuotationsList.bind(this));
        }
        
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', this.clearSearch.bind(this));
        }
        
        // Load available quotations
        this.loadAvailableQuotations();
        
        // Update current quotation indicator
        this.updateCurrentQuotationIndicator();
        
        console.log('✅ Quotation search initialized');
    }

    /**
     * Load available quotations from quotations-index.json
     */
    async loadAvailableQuotations() {
        try {
            console.log('📋 Loading available quotations...');
            
            const response = await fetch('/assets/generated/quotations-index.json');
            this.availableQuotations = await response.json();
            console.log('✅ Loaded quotations:', Object.keys(this.availableQuotations).length);
            
            // Show search suggestions when no search term
            if (this.searchInput && this.searchInput.value.trim() === '') {
                this.showAllQuotations();
            }
        } catch (error) {
            if (error.message.includes('HTTP 404') || error.message.includes('Not Found')) {
                console.log('📋 No quotations index found - will be created when quotations are generated');
            } else {
                console.log('❌ Error loading quotations index:', error.message);
            }
            this.availableQuotations = {};
        }
    }

    /**
     * Handle search input changes
     */
    handleSearchInput(event) {
        const searchTerm = event.target.value.toLowerCase().trim();
        
        // Show/hide clear button
        if (this.clearBtn) {
            this.clearBtn.style.opacity = searchTerm ? '0.5' : '0';
        }
        
        // Filter quotations
        if (searchTerm === '') {
            this.showAllQuotations();
        } else {
            this.filterQuotations(searchTerm);
        }
    }

    /**
     * Filter quotations based on search term
     */
    filterQuotations(searchTerm) {
        this.filteredQuotations = Object.entries(this.availableQuotations).filter(([baseFilename, quotationInfo]) => {
            const rfq = quotationInfo.rfq_reference?.toLowerCase() || '';
            const customer = quotationInfo.customer_name?.toLowerCase() || '';
            const filename = baseFilename.toLowerCase();
            
            return rfq.includes(searchTerm) || 
                   customer.includes(searchTerm) || 
                   filename.includes(searchTerm);
        });
        
        this.displaySearchResults();
    }

    /**
     * Show all available quotations
     */
    showAllQuotations() {
        this.filteredQuotations = Object.entries(this.availableQuotations);
        this.displaySearchResults();
    }

    /**
     * Display search results in dropdown
     */
    displaySearchResults() {
        if (!this.searchResults) return;
        
        if (this.filteredQuotations.length === 0) {
            this.searchResults.innerHTML = `
                <div style="padding: 16px; text-align: center; color: #6c757d; font-style: italic;">
                    🔍 No quotations found matching your search
                </div>`;
            this.searchResults.style.display = 'block';
            return;
        }
        
        const resultsHTML = this.filteredQuotations
            .sort(([,a], [,b]) => new Date(b.last_updated) - new Date(a.last_updated)) // Sort by most recent
            .slice(0, 10) // Limit to 10 results
            .map(([baseFilename, quotationInfo]) => {
                const isCurrentQuotation = this.currentFilename?.includes(baseFilename);
                const lastUpdated = new Date(quotationInfo.last_updated).toLocaleDateString();
                
                return `
                    <div class="search-result-item" data-base-filename="${baseFilename}" data-filename="${quotationInfo.filename}"
                         style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; cursor: pointer; transition: background-color 0.2s; ${isCurrentQuotation ? 'background-color: #e3f2fd; border-left: 4px solid #2196f3;' : ''}"
                         onmouseover="this.style.backgroundColor='#f8f9fa'" 
                         onmouseout="this.style.backgroundColor='${isCurrentQuotation ? '#e3f2fd' : 'white'}'">
                        <div style="display: flex; align-items: center; justify-content: between;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600; color: #212529; margin-bottom: 2px;">
                                    ${isCurrentQuotation ? '📂 ' : '📄 '}${quotationInfo.rfq_reference || 'Unknown RFQ'}
                                </div>
                                <div style="font-size: 12px; color: #6c757d; margin-bottom: 2px;">
                                    👤 ${quotationInfo.customer_name || 'Unknown Customer'}
                                </div>
                                <div style="font-size: 11px; color: #868e96;">
                                    📅 Updated: ${lastUpdated}
                                </div>
                            </div>
                            ${isCurrentQuotation ? '<div style="color: #2196f3; font-size: 12px; font-weight: 600;">CURRENT</div>' : ''}
                        </div>
                    </div>`;
            }).join('');
        
        this.searchResults.innerHTML = resultsHTML;
        this.searchResults.style.display = 'block';
        
        // Add click events to search results
        this.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur event from hiding results
                const baseFilename = item.dataset.baseFilename;
                const filename = item.dataset.filename;
                this.selectQuotation(baseFilename, filename);
            });
        });
    }

    /**
     * FAIL-SAFE: Verify that formula variables were actually loaded into the UI
     * @param {Object} expectedVariables - The pricing variables that should have been loaded
     */
    verifyVariableLoadingSuccess(expectedVariables) {
        try {
            console.log('🔍 Verifying formula variable loading success...');
            
            if (!expectedVariables || !window.formulaInput) {
                console.log('⚠️ No variables to verify or formula input not available');
                return true;
            }
            
            // Count how many non-empty inputs exist
            const variableInputs = document.querySelectorAll('input[data-item][data-variable-type]');
            const populatedInputs = Array.from(variableInputs).filter(input => 
                input.value && input.value !== '' && input.value !== '0'
            );
            
            console.log(`📊 Variable Loading Verification: ${populatedInputs.length}/${variableInputs.length} inputs populated`);
            
            // If we have expected variables but very few populated inputs, something went wrong
            const hasExpectedVariables = (
                expectedVariables.format_version === "2.0" && 
                (expectedVariables.per_item || expectedVariables.global_fallback)
            ) || (expectedVariables.shipping_cost !== undefined);
            
            if (hasExpectedVariables && populatedInputs.length === 0) {
                console.warn('⚠️ Variable loading verification failed - expected variables but no inputs populated');
                window.showNotification('⚠️ Formula variables may not have loaded properly. Try switching quotations again.', 'warning');
                return false;
            } else if (populatedInputs.length > 0) {
                console.log(`✅ Variable loading verification passed - ${populatedInputs.length} variables loaded`);
                return true;
            } else {
                console.log('ℹ️ No variables expected or found - verification neutral');
                return true;
            }
            
        } catch (error) {
            console.error('❌ Error during variable loading verification:', error);
            return false;
        }
    }

    /**
     * Clear current quotation state to prevent conflicts when switching quotations
     */
    clearCurrentQuotationState() {
        console.log('🔄 Clearing current quotation state for clean switch');
        
        // Clear current quotation data
        this.currentQuotationData = null;
        this.currentFilename = null;
        this.isShowingFullQuotation = false;
        this.isProcessingQuotation = false;
        
        // Clear iframe reference
        this.iframeRef = null;
        
        // Reset display mode to default
        this.displayMode = 'quotation';
        
        // Clear any processing flags
        this.isEditMode = false;
        this.isViewMode = true;
        
        // CRITICAL FIX: Preserve the preview container structure
        // Don't clear innerHTML as it destroys the layout needed for new quotations
        // The displayFullQuotationHTML() method will properly populate the container
        
        console.log('✅ Quotation state cleared successfully');
    }

    /**
     * Select and load a quotation
     */
    async selectQuotation(baseFilename, filename) {
        console.log(`🎯 Selected quotation: ${baseFilename} (${filename})`);
        
        try {
            // CRITICAL FIX: Clear current quotation state before loading new quotation
            this.clearCurrentQuotationState();
            
            // Update current filename and load the quotation
            this.currentFilename = filename;
            this.isShowingFullQuotation = true;
            
            // Hide search results
            this.hideSearchResults();
            
            // Clear search input
            if (this.searchInput) {
                this.searchInput.value = '';
                if (this.clearBtn) this.clearBtn.style.opacity = '0';
            }
            
            // Load the selected quotation data
            await this.loadQuotationData(baseFilename);
            
            // Update latest.json to reflect the currently viewed quotation
            await this.updateLatestJsonForCurrentView(filename, baseFilename);
            
            // Display the quotation
            this.displayFullQuotationHTML();
            this.enablePreviewActions();
            
            // Update indicator
            this.updateCurrentQuotationIndicator();
            
            // Save to session storage for persistence across page reloads
            this.saveLastViewedQuotationToSession();
            
            window.showNotification(`📋 Loaded quotation: ${baseFilename}`, 'success');
            
        } catch (error) {
            console.error('❌ Error selecting quotation:', error);
            window.showNotification('❌ Error loading selected quotation', 'error');
        }
    }

    /**
     * Load quotation data from saved JSON file using priority-based fetching
     */
    async loadQuotationData(baseFilename) {
        try {
            console.log(`🔍 Loading quotation data for: ${baseFilename}`);
            
            // CRITICAL FIX: Use the proper priority-based data fetching method
            // This ensures we load data from the CURRENTLY DISPLAYED quotation
            let quotationData = null;
            
            if (window.formulaInput && window.formulaInput.fetchCurrentQuotationData) {
                console.log('🎯 Using priority-based fetchCurrentQuotationData method');
                
                let fetchResult = null;
                try {
                    fetchResult = await window.formulaInput.fetchCurrentQuotationData();
                    
                    // Construct the full quotation data structure from fetch result
                    if (fetchResult && fetchResult.quotationData) {
                        // Try to find the corresponding data file that contains pricing_variables
                        const currentHtmlFilename = window.resultPreview?.currentFilename;
                        if (currentHtmlFilename) {
                            const derivedBaseFilename = currentHtmlFilename
                                .replace(/\.html$/, '')
                                .replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '');
                            
                            const dataFilename = `${derivedBaseFilename}_data.json`;
                            console.log(`📁 Loading full data file: ${dataFilename}`);
                            
                            try {
                                const dataResponse = await fetch(`/assets/generated/${dataFilename}`);
                                quotationData = await dataResponse.json();
                                console.log('✅ Loaded full quotation data with pricing variables');
                            } catch (fetchError) {
                                console.log('⚠️ Could not load full data file:', fetchError.message);
                            }
                        }
                        
                        // Fallback: construct minimal structure from fetch result
                        if (!quotationData) {
                            quotationData = {
                                quotation_data: fetchResult.quotationData,
                                session_info: {
                                    id: fetchResult.sessionId
                                },
                                pricing_variables: null // Will be null if not found in data file
                            };
                            console.log('⚠️ Using minimal structure from fetchCurrentQuotationData (no pricing variables available)');
                        }
                    }
                } catch (error) {
                    console.log('⚠️ Priority-based fetch failed, falling back to direct file access:', error.message);
                }
            }
            
            // FALLBACK: If priority-based fetching failed, use the original direct method
            if (!quotationData) {
                console.log('🔄 Falling back to direct file access method');
                const dataFilename = `${baseFilename}_data.json`;
                
                try {
                    const response = await fetch(`/assets/generated/${dataFilename}`);
                    quotationData = await response.json();
                    console.log('📊 Loaded quotation data via fallback method');
                } catch (fallbackError) {
                    throw new Error(`Failed to load data file: ${dataFilename} (${fallbackError.message})`);
                }
            }
            
            if (quotationData) {
                console.log('📊 Final loaded quotation data:', {
                    hasQuotationData: !!quotationData.quotation_data,
                    hasPricingVariables: !!quotationData.pricing_variables,
                    source: quotationData.source || 'file_system'
                });
                
                // CRITICAL FIX: Synchronous quotation data and variables loading coordination
                if (window.formulaInput && quotationData.quotation_data) {
                    console.log('🔄 Starting synchronized quotation data and variables loading...');
                    
                    // CRITICAL: Signal that we will load saved variables to prevent clearing
                    window.formulaInput.willLoadSavedVariables = !!quotationData.pricing_variables;
                    
                    // Load the quotation data structure first
                    window.formulaInput.loadQuotationData(quotationData.quotation_data);
                    
                    // ENHANCED: Use unified reloading engine for optimal variable restoration
                    if (quotationData.pricing_variables) {
                        console.log('💾 Using Unified Formula Variable Reloading Engine for optimal restoration');
                        console.log('📊 Variables format:', {
                            hasFormatVersion: !!quotationData.pricing_variables.format_version,
                            hasPerItem: !!quotationData.pricing_variables.per_item,
                            hasGlobalFallback: !!quotationData.pricing_variables.global_fallback
                        });
                        
                        // ENHANCED: Add fail-safe variable reloading mechanism with retry logic
                        // Use setTimeout to allow DOM elements to be fully created
                        setTimeout(async () => {
                            try {
                                console.log('🎯 Starting unified variable reloading with enhanced coordination...');
                                const reloadResult = await window.formulaInput.reloadFormulaVariables();
                                
                                if (reloadResult) {
                                    console.log('✅ Formula variables reloaded successfully via unified engine');
                                    
                                    // FAIL-SAFE: Verify variables actually loaded by checking form inputs
                                    setTimeout(() => {
                                        this.verifyVariableLoadingSuccess(quotationData.pricing_variables);
                                    }, 300);
                                    
                                } else {
                                    console.warn('⚠️ Unified reloading returned false - attempting retry mechanism');
                                    
                                    // RETRY MECHANISM: Try again with additional delay for complex UI states
                                    setTimeout(async () => {
                                        console.log('🔄 Executing retry attempt for variable reloading...');
                                        try {
                                            const retryResult = await window.formulaInput.reloadFormulaVariables();
                                            if (retryResult) {
                                                console.log('✅ Retry successful - variables loaded on second attempt');
                                            } else {
                                                console.warn('⚠️ Retry also failed - variables may need manual attention');
                                            }
                                        } catch (retryError) {
                                            console.error('❌ Retry attempt failed:', retryError);
                                        }
                                    }, 400);
                                }
                            } catch (error) {
                                console.error('❌ Error during unified variable reloading:', error);
                                // Fallback notification for user awareness
                                window.showNotification('⚠️ Some formula variables may not have loaded properly', 'warning');
                            }
                        }, 200); // Initial delay for UI coordination
                        
                    } else {
                        console.log('ℹ️ No saved pricing variables found for this quotation');
                    }
                    
                    // Reset the flag after loading (immediate reset since we use setTimeout for actual loading)
                    window.formulaInput.willLoadSavedVariables = false;
                }
                
                return quotationData;
            } else {
                console.log('⚠️ No saved data found for quotation:', baseFilename);
                return null;
            }
        } catch (error) {
            console.error('❌ Error loading quotation data:', error);
            return null;
        }
    }

    /**
     * Load quotation by specific filename from quotations index
     * This function enables quotation switching with automatic pricing variables parsing
     * @param {string} filename - HTML filename from quotations index (e.g., "quotation_RFQ-123_Company_2025-08-23T12-00-00-000Z.html")
     * @param {boolean} autoDisplayQuotation - Whether to automatically display the quotation (default: true)
     * @returns {Promise<boolean>} True if quotation was loaded and displayed successfully
     */
    async loadQuotationByFilename(filename, autoDisplayQuotation = true) {
        try {
            console.log('🔄 Loading quotation by filename:', filename);
            
            // Clear current quotation state to prevent conflicts
            this.clearCurrentQuotationState();
            
            // Extract base filename from the HTML filename
            // Remove timestamp and .html extension to get base filename
            // Example: "quotation_RFQ-123_Company_2025-08-23T12-00-00-000Z.html" → "quotation_RFQ-123_Company"
            const baseFilename = filename
                .replace(/\.html$/, '') // Remove .html extension
                .replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, ''); // Remove timestamp
                
            console.log('📁 Extracted base filename:', baseFilename);
            
            // Load quotation data and pricing variables
            console.log('📊 Loading quotation data and pricing variables...');
            const quotationData = await this.loadQuotationData(baseFilename);
            
            if (!quotationData) {
                console.error('❌ Failed to load quotation data for:', baseFilename);
                window.showNotification('❌ Failed to load quotation data', 'error');
                return false;
            }
            
            // Store the current quotation data for reference
            this.currentQuotationData = quotationData;
            this.currentFilename = filename;
            
            if (autoDisplayQuotation) {
                // Display the quotation HTML
                console.log('🖥️ Displaying quotation HTML...');
                const quotationUrl = `${window.CONFIG.API_BASE}/assets/generated/${filename}`;
                
                // Create iframe to display quotation
                const iframe = document.createElement('iframe');
                iframe.src = quotationUrl;
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.style.flex = '1';
                iframe.onload = () => {
                    console.log('✅ Quotation iframe loaded successfully');
                    this.enforceCleanPreviewMode();
                };
                
                // CRITICAL FIX: Instead of replacing previewContainer content,
                // use the existing displayFullQuotationHTML method which handles the layout correctly
                console.log('🖥️ Using displayFullQuotationHTML for proper layout management');
                this.displayFullQuotationHTML();
                console.log('✅ Quotation displayed successfully via displayFullQuotationHTML');
            }
            
            console.log('✅ Quotation loaded successfully by filename:', filename);
            window.showNotification(`✅ Loaded quotation: ${quotationData.quotation_data?.rfq_reference || 'Unknown'}`, 'success');
            
            // 🎯 QUOTATION SWITCHING: Load stored potential_profit values after quotation switch
            if (window.formulaInput && window.formulaInput.loadAndDisplayStoredProfitValues) {
                setTimeout(async () => {
                    console.log('🔄 Quotation switching: Loading stored potential_profit values...');
                    const storedValuesLoaded = await window.formulaInput.loadAndDisplayStoredProfitValues();
                    if (storedValuesLoaded) {
                        console.log('✅ Stored potential_profit values loaded after quotation switch');
                    } else {
                        console.log('ℹ️ No stored potential_profit values found for this quotation');
                    }
                }, 300); // Brief delay to ensure quotation data is fully processed
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Error loading quotation by filename:', error);
            window.showNotification(`❌ Failed to load quotation: ${error.message}`, 'error');
            return false;
        }
    }

    /**
     * Clear current quotation state to prevent conflicts when switching quotations
     */
    clearCurrentQuotationState() {
        console.log('🔄 Clearing current quotation state for clean switch');
        
        // Clear current quotation data
        this.currentQuotationData = null;
        this.currentFilename = null;
        this.isShowingFullQuotation = false;
        this.isProcessingQuotation = false;
        
        // Clear iframe reference
        this.iframeRef = null;
        
        // CRITICAL FIX: Don't destroy the preview container structure
        // Instead, just reset the display states appropriately
        // The preview container will be repopulated by displayFullQuotationHTML()
        
        console.log('✅ Quotation state cleared for clean switch');
    }

    /**
     * Wait for formula UI elements to be ready for variable loading
     * @returns {Promise} Resolves when UI is ready for variable loading
     */
    async waitForFormulaUIReadiness() {
        return new Promise((resolve, reject) => {
            const maxAttempts = 20; // 5 seconds total
            let attempts = 0;
            
            const checkReadiness = () => {
                attempts++;
                
                // Check if formula input component is ready
                if (!window.formulaInput) {
                    if (attempts >= maxAttempts) {
                        reject(new Error('Formula input component not available'));
                        return;
                    }
                    setTimeout(checkReadiness, 250);
                    return;
                }
                
                // Check if item variables container exists and has content
                const container = window.formulaInput.itemVariablesContainer;
                if (!container) {
                    if (attempts >= maxAttempts) {
                        reject(new Error('Item variables container not found'));
                        return;
                    }
                    setTimeout(checkReadiness, 250);
                    return;
                }
                
                // Check if formula input elements are present
                const inputElements = container.querySelectorAll('input[data-item]');
                if (inputElements.length === 0) {
                    if (attempts >= maxAttempts) {
                        reject(new Error('Formula input elements not found'));
                        return;
                    }
                    setTimeout(checkReadiness, 250);
                    return;
                }
                
                console.log(`✅ Formula UI ready after ${attempts} attempts (${inputElements.length} input elements found)`);
                resolve();
            };
            
            // Start checking
            checkReadiness();
        });
    }

    /**
     * Show search results dropdown
     */
    showSearchResults() {
        if (this.searchResults && this.filteredQuotations.length > 0) {
            this.searchResults.style.display = 'block';
        }
    }

    /**
     * Hide search results dropdown with delay
     */
    hideSearchResultsDelayed() {
        setTimeout(() => {
            this.hideSearchResults();
        }, 200); // Delay to allow clicks on search results
    }

    /**
     * Hide search results dropdown immediately
     */
    hideSearchResults() {
        if (this.searchResults) {
            this.searchResults.style.display = 'none';
        }
    }

    /**
     * Clear search input
     */
    clearSearch() {
        if (this.searchInput) {
            this.searchInput.value = '';
            this.searchInput.focus();
        }
        if (this.clearBtn) {
            this.clearBtn.style.opacity = '0';
        }
        this.showAllQuotations();
    }

    /**
     * Refresh quotations list
     */
    async refreshQuotationsList() {
        console.log('🔄 Refreshing quotations list...');
        
        if (this.refreshBtn) {
            this.refreshBtn.style.transform = 'rotate(360deg)';
            setTimeout(() => {
                this.refreshBtn.style.transform = 'scale(1)';
            }, 300);
        }
        
        await this.loadAvailableQuotations();
        this.updateCurrentQuotationIndicator();
        
        window.showNotification('🔄 Quotations list refreshed', 'info');
    }

    /**
     * Update current quotation indicator
     */
    updateCurrentQuotationIndicator() {
        if (!this.currentIndicator) return;
        
        if (this.currentFilename) {
            // Extract base filename from current filename
            const baseFilename = this.currentFilename.replace(/(_\d{4}-\d{2}-\d{2}T.*\.html)$/, '');
            const quotationInfo = this.availableQuotations[baseFilename];
            
            if (quotationInfo) {
                this.currentIndicator.innerHTML = `
                    📂 Currently viewing: <strong>${quotationInfo.rfq_reference}</strong> 
                    (${quotationInfo.customer_name}) - Updated: ${new Date(quotationInfo.last_updated).toLocaleDateString()}
                `;
            } else {
                this.currentIndicator.innerHTML = `📂 Currently viewing: ${this.currentFilename}`;
            }
        } else {
            this.currentIndicator.innerHTML = '📂 No quotation loaded';
        }
    }

    // ============================================
    // 💾 SESSION PERSISTENCE FOR UI RELOAD
    // ============================================

    /**
     * Save current quotation to session storage for persistence across page reloads
     * Called whenever a quotation is successfully loaded
     */
    saveLastViewedQuotationToSession() {
        if (!this.currentFilename) return;
        
        try {
            const sessionData = {
                filename: this.currentFilename,
                displayName: this.getQuotationDisplayName(this.currentFilename),
                timestamp: Date.now(),
                isShowingFullQuotation: this.isShowingFullQuotation
            };
            
            sessionStorage.setItem('lastViewedQuotation', JSON.stringify(sessionData));
            console.log('💾 Saved last viewed quotation to session storage:', sessionData);
        } catch (error) {
            console.warn('⚠️ Failed to save quotation to session storage:', error);
        }
    }

    /**
     * Get last viewed quotation from session storage
     * @returns {Object|null} Session data or null if none exists
     */
    getLastViewedQuotationFromSession() {
        try {
            const sessionData = sessionStorage.getItem('lastViewedQuotation');
            if (!sessionData) return null;
            
            const parsed = JSON.parse(sessionData);
            
            // Only consider session data from the last 24 hours to avoid stale data
            const twentyFourHours = 24 * 60 * 60 * 1000;
            if (Date.now() - parsed.timestamp > twentyFourHours) {
                console.log('🕐 Session data too old, clearing...');
                this.clearLastViewedQuotationFromSession();
                return null;
            }
            
            return parsed;
        } catch (error) {
            console.warn('⚠️ Failed to retrieve quotation from session storage:', error);
            return null;
        }
    }

    /**
     * Clear last viewed quotation from session storage
     */
    clearLastViewedQuotationFromSession() {
        try {
            sessionStorage.removeItem('lastViewedQuotation');
            console.log('🗑️ Cleared last viewed quotation from session storage');
        } catch (error) {
            console.warn('⚠️ Failed to clear session storage:', error);
        }
    }

    /**
     * Verify if a quotation file exists on the server
     * @param {string} filename - The filename to check
     * @returns {boolean} True if file exists
     */
    async verifyQuotationFileExists(filename) {
        try {
            console.log(`🔍 Verifying quotation file exists: ${filename}`);
            const response = await fetch(`/assets/generated/${filename}`, {
                method: 'HEAD'
            });
            console.log(`✅ File verification successful: ${filename}`);
            return true;
        } catch (error) {
            if (error.message.includes('HTTP 404') || error.message.includes('Not Found')) {
                console.log(`📁 File not found: ${filename}`);
            } else {
                console.log(`📁 File check failed for ${filename}:`, error.message);
            }
            return false;
        }
    }

    /**
     * Load quotation from session data
     * @param {Object} sessionData - Session data with filename and display info
     */
    async loadQuotationFromSession(sessionData) {
        try {
            console.log(`🔄 Restoring quotation from session: ${sessionData.filename}`);
            
            // Use existing loadSpecificQuotation method but don't save to session again
            this.isRestoringFromSession = true;
            await this.loadSpecificQuotation(sessionData.filename);
            this.isRestoringFromSession = false;
            
            // Restore any additional state
            if (sessionData.isShowingFullQuotation) {
                this.isShowingFullQuotation = true;
            }
            
            console.log('✅ Successfully restored quotation from session storage');
        } catch (error) {
            console.error('❌ Failed to load quotation from session:', error);
            this.clearLastViewedQuotationFromSession();
            this.isRestoringFromSession = false;
        }
    }

    /**
     * Load a specific quotation file by filename
     * @param {string} filename - The quotation filename to load
     */
    async loadSpecificQuotation(filename) {
        try {
            console.log(`📂 Loading specific quotation: ${filename}`);
            
            // Clear current state
            this.clearCurrentQuotationState();
            
            // Extract base filename from the HTML filename for JSON data loading
            // Remove timestamp and .html extension to get base filename
            // Example: "quotation_RFQ-123_Company_2025-08-23T12-00-00-000Z.html" → "quotation_RFQ-123_Company"
            const baseFilename = filename
                .replace(/\.html$/, '') // Remove .html extension
                .replace(/_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, ''); // Remove timestamp
                
            console.log('📁 Extracted base filename for data loading:', baseFilename);
            
            // Load quotation data and pricing variables (CRITICAL FIX for pricing variables reload)
            console.log('📊 Loading quotation data and pricing variables...');
            const quotationData = await this.loadQuotationData(baseFilename);
            
            if (quotationData) {
                // Store the current quotation data for reference
                this.currentQuotationData = quotationData;
                console.log('✅ Successfully loaded quotation data including pricing variables');
            } else {
                console.warn('⚠️ Failed to load quotation data - pricing variables may not be available');
            }
            
            // Set the current filename and display quotation using proper flow
            this.currentFilename = filename;
            this.isShowingFullQuotation = true;
            this.displayMode = 'quotation';
            this.displayFullQuotationHTML();
            this.enablePreviewActions();
            
            // Update UI indicators
            this.updateCurrentQuotationIndicator();
            
            // Save to session storage (unless we're already restoring from session)
            if (!this.isRestoringFromSession) {
                this.saveLastViewedQuotationToSession();
            }
            
            console.log(`✅ Successfully loaded quotation with full data: ${filename}`);
        } catch (error) {
            console.error(`❌ Failed to load quotation ${filename}:`, error);
            throw error;
        }
    }

    /**
     * Get display name for a quotation file
     * @param {string} filename - The quotation filename
     * @returns {string} User-friendly display name
     */
    getQuotationDisplayName(filename) {
        // Try to extract from available quotations first
        const baseFilename = filename.replace(/(_\d{4}-\d{2}-\d{2}T.*\.html)$/, '');
        const quotationInfo = this.availableQuotations[baseFilename];
        
        if (quotationInfo) {
            return `${quotationInfo.rfq_reference} (${quotationInfo.customer_name})`;
        }
        
        // Fallback to filename parsing
        const match = filename.match(/quotation_(.+?)_(.+?)_\d{4}-\d{2}-\d{2}T/);
        if (match) {
            const [, rfq, customer] = match;
            return `${rfq} (${customer})`;
        }
        
        return filename;
    }
}

// Add validation helpers to window for testing
window.quotationTest = {
    testOpen: () => {
        const w = window.open('/assets/generated/quotation.html');
        w.onload = () => console.log('opened');
        return w;
    },
    
    testDownload: () => {
        const w2 = window.open('/assets/generated/quotation.html');
        w2.onload = () => { w2.focus(); w2.print(); };
        return w2;
    },
    
    testEditCapture: () => {
        const iframe = document.querySelector('#quotation-iframe');
        const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
        if(doc) {
            doc.querySelectorAll('p, span, td, .editable').forEach(e => e.textContent = 'TEST');
            console.log(doc.documentElement.outerHTML.slice(0,200));
            return true;
        }
        return false;
    }
};





         