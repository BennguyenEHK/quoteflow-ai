#!/usr/bin/env node

// Script to display current configuration and Make.com webhook URLs
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'config', 'app-config.json');

function showConfiguration() {
    try {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const currentEnv = configData.current_environment;
        const currentConfig = configData.environments[currentEnv];
        
        console.log('📋 CURRENT CONFIGURATION');
        console.log('=' .repeat(50));
        console.log(`Environment: ${currentEnv}`);
        console.log('');
        
        console.log('🌐 UNIFIED URLS (Frontend + Make.com use same URLs):');
        console.log(`   Frontend Access: ${currentConfig.API_BASE}`);
        console.log(`   SSE Connection: ${currentConfig.SSE_URL}`);
        console.log(`   API Base: ${currentConfig.API_BASE}`);
        console.log('');
        
        console.log('📡 MAKE.COM WEBHOOK ENDPOINTS:');
        const baseUrl = currentConfig.API_BASE;
        console.log(`   Module Update: ${baseUrl}/module-update`);
        console.log(`   Workflow Complete: ${baseUrl}/workflow-complete`);
        console.log(`   Quotation Generation: ${baseUrl}/api/quotation-generation`);
        console.log('');
        
        console.log('⚙️  DEPLOYMENT STATUS:');
        if (currentEnv === 'development') {
            console.log('   🌐 UNIFIED: All services use ngrok URLs');
            console.log('   ✅ EXTERNAL ACCESS: Make.com can reach all endpoints');
            console.log('   🚀 CLOUD READY: Same pattern as production deployment');
        } else if (currentEnv === 'production') {
            console.log('   ✅ PRODUCTION: Ready for cloud deployment');
            console.log('   🌍 LIVE: Using production domain');
        }
        
        console.log('');
        console.log('🔧 QUICK ACTIONS:');
        console.log('   📝 Update ngrok URL: node scripts/update-ngrok.js <new-url>');
        console.log('   📋 Show config: node scripts/show-config.js');
        console.log('   🚀 Start server: npm start');
        
    } catch (error) {
        console.error('❌ Error reading configuration:', error.message);
        process.exit(1);
    }
}

showConfiguration();