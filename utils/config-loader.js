// Configuration loader utility for both frontend and backend
class ConfigLoader {
    constructor() {
        this.config = null;
        this.currentEnvironment = null;
    }
    
    async loadConfig() {
        try {
            const response = await fetch('/config/app-config.json');
            if (!response.ok) {
                throw new Error(`Failed to load config: ${response.status}`);
            }
            
            const configData = await response.json();
            this.currentEnvironment = configData.current_environment;
            this.config = configData.environments[this.currentEnvironment];
            
            console.log('📋 Config loaded for environment:', this.currentEnvironment);
            console.log('⚙️ Configuration:', this.config);
            
            return this.processConfig();
        } catch (error) {
            console.error('❌ Failed to load configuration:', error);
            // Fallback to auto-detect
            return this.getFallbackConfig();
        }
    }
    
    processConfig() {
        const processed = { ...this.config };
        
        // Configuration is now simple - no auto-detection needed
        // All URLs are explicit in the config file
        
        console.log('✅ Loaded configuration:', processed);
        return processed;
    }
    
    getFallbackConfig() {
        console.log('⚠️ Using fallback configuration');
        
        return {
            SSE_URL: 'https://d0e653a5df23.ngrok-free.app/events',
            API_BASE: 'https://d0e653a5df23.ngrok-free.app',
            WEBHOOK_URL: 'https://hook.eu2.make.com/diqqb34gtjqmrh4mke8tgta9zvgn2cip',
            RETRY_INTERVAL: 5000,
            AUTO_DETECT_HOST: false
        };
    }
    
    // Utility methods for easy access
    getSSEUrl() {
        return this.config?.SSE_URL || `${window.location.origin}/events`;
    }
    
    getAPIBase() {
        return this.config?.API_BASE || window.location.origin;
    }
    
    getWebhookUrl() {
        return this.config?.WEBHOOK_URL || '';
    }
    
    getMakeWebhookUrl() {
        return this.config?.API_BASE || 'https://d0e653a5df23.ngrok-free.app';
    }
    
    getRetryInterval() {
        return this.config?.RETRY_INTERVAL || 5000;
    }
    
    isProduction() {
        return this.currentEnvironment === 'production';
    }
    
    isDevelopment() {
        return this.currentEnvironment === 'development';
    }
    
    isNgrok() {
        return this.currentEnvironment === 'ngrok';
    }
}

// Export for both browser and Node.js environments
if (typeof window !== 'undefined') {
    // Browser environment
    window.ConfigLoader = ConfigLoader;
} else {
    // Node.js environment
    module.exports = ConfigLoader;
}