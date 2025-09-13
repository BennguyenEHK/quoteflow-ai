// MASTER-AGENT CHATBOX COMPONENT

export class ChatInputPanel {
    constructor() {
        this.isProcessing = false;
        this.messageHistory = [];
        this.currentSessionId = null;
        this.userInfo = null;
        this.initializeElements();
        this.bindEvents();
        this.loadUserInfo();
    }

    initializeElements() {
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.chatStatus = document.getElementById('chatStatus');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatFileInput = document.getElementById('chatFileInput');
        this.clearBtn = document.getElementById('clearBtn');
        this.uploadBtn = document.getElementById('uploadBtn');
    }

    bindEvents() {
        this.chatInput.addEventListener('input', this.autoResizeTextarea.bind(this));
        this.chatInput.addEventListener('keypress', this.handleKeyPress.bind(this));
        this.sendBtn.addEventListener('click', this.sendMessage.bind(this));
        this.chatFileInput.addEventListener('change', this.handleFileUpload.bind(this));
        this.clearBtn.addEventListener('click', this.clearChat.bind(this));
        this.uploadBtn.addEventListener('click', () => this.chatFileInput.click());
    }

    handleKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    autoResizeTextarea() {
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + 'px';
    }

    async sendMessage() {
        const messageText = this.chatInput.value.trim();
        if (!messageText || this.isProcessing) return;
        
        // Generate session ID for first message
        if (!this.currentSessionId) {
            this.currentSessionId = this.generateSessionId();
        }

        // Add user message to chat
        this.addUserMessage(messageText);
        this.chatInput.value = '';
        this.autoResizeTextarea();
        
        this.setProcessingState(true);
        this.showTypingIndicator();
        
        try {
            const response = await fetch(window.CONFIG.WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_message: messageText,
                    timestamp: new Date().toISOString(),
                    session_id: this.currentSessionId,
                    message_history: this.messageHistory.slice(-5), // Send last 5 messages for context
                    pricing_variables: window.formulaVariables
                })
            });
            
            if (response.ok) {
                console.log('✅ Message sent successfully');
                this.updateChatStatus('Message sent - processing response...');
                
                // Read and parse the webhook response
                const responseText = await response.text();
                console.log('📥 Webhook response:', responseText);
                
                // Parse the agent response from the webhook
                let agentMessage = this.parseWebhookResponse(responseText);
                if (agentMessage) {
                    // Add the agent's response to chat
                    this.addAgentMessage(agentMessage);
                } else {
                    this.addSystemMessage('Agent response received but could not be parsed', 'error');
                }
                
                // Create workflow tracking for this session
                if (window.workflowTracker) {
                    window.workflowTracker.createWorkflowItem(this.currentSessionId, 'Agent Processing');
                }
            } else {
                this.updateChatStatus(`Error: HTTP ${response.status}`);
                this.addSystemMessage(`Connection error: ${response.status}`, 'error');
            }
            
        } catch (error) {
            console.error('❌ Message send error:', error);
            this.updateChatStatus(`Connection Error: ${error.message}`);
            this.addSystemMessage(`Failed to send message: ${error.message}`, 'error');
        } finally {
            this.setProcessingState(false);
            this.hideTypingIndicator();
        }
    }

    addUserMessage(message) {
        const messageData = {
            type: 'user',
            content: message,
            timestamp: new Date()
        };
        
        this.messageHistory.push(messageData);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'user-message';
        messageDiv.innerHTML = `
            <div class="message-content">${this.escapeHtml(message)}</div>
            <div class="message-avatar">👤</div>
            <div class="message-time">${this.formatTime(messageData.timestamp)}</div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addAgentMessage(message, type = 'response') {
        const messageData = {
            type: 'agent',
            content: message,
            timestamp: new Date()
        };
        
        this.messageHistory.push(messageData);
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `agent-message ${type}`;
        messageDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">${this.formatMessage(message)}</div>
            <div class="message-time">${this.formatTime(messageData.timestamp)}</div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        this.updateChatStatus('Ready to chat');
        this.hideTypingIndicator();
    }

    addSystemMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `system-message ${type}`;
        messageDiv.innerHTML = `
            <div class="message-content">
                <span class="system-icon">${type === 'error' ? '⚠️' : 'ℹ️'}</span>
                ${this.escapeHtml(message)}
            </div>
            <div class="message-time">${this.formatTime(new Date())}</div>
        `;
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    // Handle webhook responses from agent
    handleAgentResponse(data) {
        const { message, type = 'response' } = data;
        if (message) {
            this.addAgentMessage(message, type);
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileContent = `[File: ${file.name}]\n\n${e.target.result}`;
            this.addUserMessage(fileContent);
            this.updateChatStatus(`File attached: ${file.name}`);
        };
        reader.readAsText(file);
    }

    updateChatStatus(message) {
        this.chatStatus.textContent = message;
        // Auto-clear status after 5 seconds unless it's an error
        if (!message.includes('Error') && !message.includes('error')) {
            setTimeout(() => {
                if (this.chatStatus.textContent === message) {
                    this.chatStatus.textContent = 'Ready to chat';
                }
            }, 5000);
        }
    }

    // Legacy method for compatibility with workflow tracker
    updateSubmissionStatus(message) {
        this.updateChatStatus(message);
    }

    setProcessingState(processing) {
        this.isProcessing = processing;
        this.sendBtn.disabled = processing;
        this.chatInput.disabled = processing;
        
        if (processing) {
            this.sendBtn.textContent = '⏳ Sending...';
        } else {
            this.sendBtn.textContent = '➤ Send';
        }
    }

    clearChat() {
        // Keep welcome message, clear others
        const welcomeMessage = this.chatMessages.querySelector('.welcome-message');
        this.chatMessages.innerHTML = '';
        if (welcomeMessage) {
            this.chatMessages.appendChild(welcomeMessage);
        }
        
        this.messageHistory = [];
        this.currentSessionId = null;
        this.updateChatStatus('Chat cleared - ready for new conversation');
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    generateSessionId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async loadUserInfo() {
        try {
            const response = await fetch('/user_info.json');
            if (response.ok) {
                this.userInfo = await response.json();
                console.log('👤 User info loaded:', this.userInfo);
            } else {
                console.warn('⚠️ Could not load user info, using defaults');
                this.userInfo = { user_name: "", email_address: "", phone_number: "", password: "" };
            }
        } catch (error) {
            console.error('❌ Error loading user info:', error);
            this.userInfo = { user_name: "", email_address: "", phone_number: "", password: "" };
        }
        
        // Update welcome message after loading user info
        this.updateWelcomeMessage();
    }

    updateWelcomeMessage() {
        // Get user name, default to "Manager" if empty
        const userName = (this.userInfo?.user_name && this.userInfo.user_name.trim()) 
            ? this.userInfo.user_name.trim() 
            : "Manager";
        
        // Find welcome message element and update it
        const welcomeMessage = document.querySelector('.welcome-message .message-content');
        if (welcomeMessage) {
            welcomeMessage.textContent = `Hello ${userName}! I'm your AI quotation agent, I am ready to assist`;
        }
        
        console.log(`💬 Welcome message updated for user: ${userName}`);
    }

    showTypingIndicator() {
        this.hideTypingIndicator(); // Remove any existing indicator
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'agent-message typing-indicator';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <span>AI processing...</span>
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    formatMessage(text) {
        // Format message content with basic markdown support
        let formatted = this.escapeHtml(text);
        
        // Convert line breaks to <br>
        formatted = formatted.replace(/\n/g, '<br>');
        
        // Convert **bold** to bold
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Convert *italic* to italic
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Convert `code` to code
        formatted = formatted.replace(/`(.*?)`/g, '<code style="background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-family: monospace;">$1</code>');
        
        return formatted;
    }

    parseWebhookResponse(responseText) {
        console.log('🔍 Parsing webhook response:', responseText);
        
        // Try to parse as JSON first (if Make.com returns JSON)
        try {
            const jsonResponse = JSON.parse(responseText);
            if (jsonResponse.message) {
                return jsonResponse.message;
            }
            if (jsonResponse.response) {
                return jsonResponse.response;
            }
            if (jsonResponse.ai_response) {
                return jsonResponse.ai_response;
            }
        } catch (e) {
            // Not JSON, continue with text parsing
        }
        
        // Parse the current format: "the user message content is: [original message]"
        // This suggests Make.com is just echoing back the input
        // We need to check if there's actually an AI response in the text
        
        // Look for common AI response patterns
        const patterns = [
            // Pattern 1: Direct AI response (if Make.com returns pure AI text)
            /^(?!the user message content is:).+/i,
            
            // Pattern 2: AI response after "AI Response:" or similar
            /(?:AI Response:|Agent Response:|Response:)\s*(.+)/is,
            
            // Pattern 3: Everything after the echo (if format changes)
            /the user message content is:.*?(?:AI Response:|Response:|Answer:)\s*(.+)/is,
            
            // Pattern 4: If it's just echoing, return a default message
            /the user message content is:\s*(.+)/i
        ];
        
        for (let pattern of patterns) {
            const match = responseText.match(pattern);
            if (match) {
                let response = match[1] || match[0];
                response = response.trim();
                
                // If it's just echoing the user message, don't show it as AI response
                if (response.toLowerCase().includes('the user message content is:')) {
                    continue;
                }
                
                // If we found a real response, return it
                if (response && response.length > 0) {
                    return response;
                }
            }
        }
        
        // If no patterns match, check if Make.com is actually returning an AI response
        // For now, let's assume the webhook should return the AI response directly
        // You may need to adjust your Make.com scenario to return the AI response properly
        
        if (responseText && !responseText.includes('the user message content is:')) {
            // This might be a direct AI response
            return responseText.trim();
        }
        
        // If we get here, the webhook is probably just echoing the input
        // Return null so we can show an error message
        console.warn('⚠️ Webhook appears to be echoing input instead of returning AI response');
        console.warn('⚠️ Make.com scenario may need to be updated to return actual AI response');
        return null;
    }
}