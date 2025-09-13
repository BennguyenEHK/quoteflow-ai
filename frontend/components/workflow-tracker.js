// WORKFLOW TRACKER PANEL COMPONENT

export class WorkflowTrackerPanel {
    constructor() {
        this.activeWorkflows = new Map();
        this.workflowWraps = new Map(); // Track workflow wraps
        this.stats = {
            activeWorkflows: 0,
            completedToday: 0,
            totalProcessed: 0
        };
        this.initializeElements();
    }

    initializeElements() {
        this.workflowContainer = document.getElementById('workflowContainer');
        this.workflowEmpty = document.getElementById('workflowEmpty');
        this.activeWorkflowsList = document.getElementById('activeWorkflowsList');
        this.activeWorkflowsCount = document.getElementById('activeWorkflows');
        this.completedTodayCount = document.getElementById('completedToday');
    }

    // New workflowWrap function
    workflowWrap(data) {
        const { agent_name, status, session_id } = data;
        console.log(`📦 WorkflowWrap: ${agent_name} - ${status} (session: ${session_id})`);
        
        try {
            if (status === 'initialize') {
                // Create new workflow wrap
                const wrapData = {
                    agentName: agent_name,
                    sessionId: session_id || this.generateSessionId(),
                    modules: [],
                    startTime: new Date(),
                    isExpanded: false
                };
                
                console.log(`🆕 Creating new workflow wrap:`, wrapData);
                this.workflowWraps.set(wrapData.sessionId, wrapData);
                this.createWorkflowWrapBar(wrapData);
                
            } else if (status === 'finished') {
                // Close current workflow wrap
                const wrapData = this.workflowWraps.get(session_id);
                if (wrapData) {
                    console.log(`🏁 Closing workflow wrap: ${session_id}`);
                    this.closeWorkflowWrap(session_id);
                    this.stats.completedToday++;
                    this.updateStatistics();
                } else {
                    console.warn(`⚠️ No workflow wrap found for session: ${session_id}`);
                }
            } else {
                console.log(`ℹ️ Unknown workflow status: ${status}`);
            }
        } catch (error) {
            console.error('❌ Error in workflowWrap:', error, 'Data:', data);
        }
    }

    createWorkflowWrapBar(wrapData) {
        if (this.workflowEmpty) {
            this.workflowEmpty.style.display = 'none';
        }

        const wrapDiv = document.createElement('div');
        wrapDiv.className = 'workflow-wrap-bar';
        wrapDiv.id = `wrap-${wrapData.sessionId}`;
        
        wrapDiv.innerHTML = `
            <div class="wrap-header" onclick="window.workflowTracker.toggleWrapExpansion('${wrapData.sessionId}')">
                <div class="wrap-title">🤖 ${wrapData.agentName}</div>
                <div class="wrap-status">Active</div>
                <div class="wrap-toggle">▼</div>
            </div>
            <div class="wrap-modules" style="display: none;"></div>
            <div class="wrap-footer">
                <small>Started: ${this.formatTime(wrapData.startTime)}</small>
            </div>
        `;

        this.activeWorkflowsList.appendChild(wrapDiv);
        this.stats.activeWorkflows++;
        this.updateStatistics();
    }

    // Handle module updates within workflow wraps
    handleModuleUpdate(data) {
        // Extract data from the SSE message format: data.data contains the actual payload
        const actualData = data.data || data;
        const { module_name, input, output, output_status, error } = actualData;
        console.log(`📦 Module update received:`, actualData);
        
        // Find active workflow wrap to add this module to
        const activeWrap = Array.from(this.workflowWraps.values())
            .find(wrap => wrap.modules.length === 0 || wrap.modules[wrap.modules.length - 1].status !== 'finished');
            
        if (activeWrap) {
            const moduleData = {
                name: module_name,
                input: input,
                output: output,
                status: output_status,
                error: error,
                timestamp: new Date()
            };
            
            console.log(`📦 Adding module to workflow ${activeWrap.sessionId}:`, moduleData);
            activeWrap.modules.push(moduleData);
            this.updateWrapModules(activeWrap.sessionId);
        } else {
            console.warn(`⚠️ No active workflow wrap found for module: ${module_name}`);
        }
    }

    updateWrapModules(sessionId) {
        const wrapData = this.workflowWraps.get(sessionId);
        if (!wrapData) return;

        const wrapElement = document.getElementById(`wrap-${sessionId}`);
        const modulesContainer = wrapElement.querySelector('.wrap-modules');
        
        modulesContainer.innerHTML = wrapData.modules.map((module, index) => `
            <div class="module-box ${module.status}" onclick="window.workflowTracker.toggleModuleDetails('${sessionId}', ${index})">
                <div class="module-header">
                    <span class="module-name">${module.name}</span>
                    <span class="module-status">${module.status === 'success' ? '✅' : '❌'}</span>
                </div>
                <div class="module-details" style="display: none;">
                    <div class="module-io">
                        <div><strong>Input:</strong> <pre>${JSON.stringify(module.input, null, 2)}</pre></div>
                        <div><strong>Output:</strong> <pre>${JSON.stringify(module.output, null, 2)}</pre></div>
                        ${module.error ? `<div class="module-error"><strong>Error:</strong> ${module.error}</div>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    toggleWrapExpansion(sessionId) {
        const wrapData = this.workflowWraps.get(sessionId);
        if (!wrapData) return;

        const wrapElement = document.getElementById(`wrap-${sessionId}`);
        const modulesContainer = wrapElement.querySelector('.wrap-modules');
        const toggleIcon = wrapElement.querySelector('.wrap-toggle');
        
        wrapData.isExpanded = !wrapData.isExpanded;
        
        if (wrapData.isExpanded) {
            modulesContainer.style.display = 'block';
            toggleIcon.textContent = '▲';
        } else {
            modulesContainer.style.display = 'none';
            toggleIcon.textContent = '▼';
        }
    }

    toggleModuleDetails(sessionId, moduleIndex) {
        const wrapElement = document.getElementById(`wrap-${sessionId}`);
        const moduleBoxes = wrapElement.querySelectorAll('.module-box');
        const moduleDetails = moduleBoxes[moduleIndex].querySelector('.module-details');
        
        const isVisible = moduleDetails.style.display === 'block';
        moduleDetails.style.display = isVisible ? 'none' : 'block';
    }

    closeWorkflowWrap(sessionId) {
        const wrapElement = document.getElementById(`wrap-${sessionId}`);
        if (wrapElement) {
            const statusElement = wrapElement.querySelector('.wrap-status');
            statusElement.textContent = 'Completed';
            wrapElement.classList.add('completed');
        }
        this.stats.activeWorkflows--;
    }

    // Updated handlers to use new workflow wrap system
    handleWorkflowComplete(data) {
        // Extract data from the SSE message format: data.data contains the actual payload
        const actualData = data.data || data;
        const { agent_name, status, session_id } = actualData;
        console.log(`🏁 Workflow complete received:`, data);
        console.log(`🏁 Agent: ${agent_name}, Status: ${status}, Session: ${session_id}`);
        
        try {
            this.workflowWrap(actualData);
            
            if (status === 'finished') {
                console.log('✅ Workflow finished - updating UI status');
                if (window.chatInput && typeof window.chatInput.updateSubmissionStatus === 'function') {
                    window.chatInput.updateSubmissionStatus('RFQ processing completed successfully!');
                }
                // Note: Success notification handled by result-preview component to avoid duplicates
            } else if (status === 'initialize') {
                console.log('🚀 Workflow initializing - creating new workflow wrap');
            }
        } catch (error) {
            console.error('❌ Error handling workflow complete:', error);
        }
    }

    // Legacy methods for backward compatibility
    createWorkflowItem(sessionId, title) {
        if (this.workflowEmpty) {
            this.workflowEmpty.style.display = 'none';
        }
        
        const workflowData = {
            id: sessionId,
            title: title,
            status: 'processing',
            progress: 0,
            startTime: new Date()
        };
        
        this.activeWorkflows.set(sessionId, workflowData);
        
        const workflowDiv = document.createElement('div');
        workflowDiv.className = 'workflow-item processing';
        workflowDiv.id = `workflow-${sessionId}`;
        
        workflowDiv.innerHTML = `
            <div class="workflow-header">
                <div class="workflow-title">🔄 ${title}</div>
                <div class="workflow-status">Processing</div>
            </div>
            <div class="workflow-progress">
                <div class="workflow-progress-fill" style="width: 0%"></div>
            </div>
            <div class="workflow-details">
                <small>Started: ${this.formatTime(workflowData.startTime)}</small>
            </div>
        `;
        
        this.activeWorkflowsList.appendChild(workflowDiv);
        this.stats.activeWorkflows++;
        this.updateStatistics();
    }

    handleWorkflowStart(data) {
        // Extract data from the SSE message format: data.data contains the actual payload
        const actualData = data.data || data;
        const { session_id, message } = actualData;
        console.log(`🚀 Workflow started: ${session_id}`);
        
        if (!this.activeWorkflows.has(session_id)) {
            this.createWorkflowItem(session_id, message || 'Automated Workflow');
        }
        
        if (window.chatInput && typeof window.chatInput.updateSubmissionStatus === 'function') {
            window.chatInput.updateSubmissionStatus('Workflow started - processing your RFQ...');
        }
    }

    handleWorkflowError(data) {
        // Extract data from the SSE message format: data.data contains the actual payload
        const actualData = data.data || data;
        const { session_id, error_message } = actualData;
        console.log(`❌ Workflow error: ${session_id}`);
        
        this.updateWorkflowStatus(session_id, 'error');
        if (window.chatInput && typeof window.chatInput.updateSubmissionStatus === 'function') {
            window.chatInput.updateSubmissionStatus(`Error: ${error_message}`);
        }
        if (window.showNotification && typeof window.showNotification === 'function') {
            window.showNotification('❌ Workflow processing failed', 'error');
        }
    }

    updateWorkflowStatus(sessionId, status) {
        const workflowElement = document.getElementById(`workflow-${sessionId}`);
        if (!workflowElement) return;
        
        const workflowData = this.activeWorkflows.get(sessionId);
        if (workflowData) {
            workflowData.status = status;
            
            workflowElement.className = `workflow-item ${status}`;
            const statusElement = workflowElement.querySelector('.workflow-status');
            const progressFill = workflowElement.querySelector('.workflow-progress-fill');
            
            if (status === 'completed') {
                statusElement.textContent = 'Completed';
                progressFill.style.width = '100%';
                this.stats.activeWorkflows--;
                this.stats.completedToday++;
            } else if (status === 'error') {
                statusElement.textContent = 'Error';
                progressFill.style.width = '100%';
                progressFill.style.backgroundColor = '#ef4444';
                this.stats.activeWorkflows--;
            }
            
            this.updateStatistics();
        }
    }

    updateStatistics() {
        this.activeWorkflowsCount.textContent = `${this.stats.activeWorkflows} Active`;
        this.completedTodayCount.textContent = `${this.stats.completedToday} Completed`;
    }

    generateSessionId() {
        return 'wrap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }
}