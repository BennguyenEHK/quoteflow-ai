#!/usr/bin/env node

/**
 * Quick Fix Script for Ngrok Configuration Issues
 * 
 * This script resets the configuration to localhost and provides
 * clear instructions for proper ngrok setup.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Ngrok Configuration Fix Tool');
console.log('='.repeat(40));

const configPath = path.join(__dirname, 'config', 'app-config.json');

try {
    // Read current configuration
    if (!fs.existsSync(configPath)) {
        console.error('❌ Configuration file not found:', configPath);
        process.exit(1);
    }
    
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    console.log('📋 Current configuration:');
    console.log(`   Environment: ${configData.current_environment}`);
    
    if (configData.environments[configData.current_environment]) {
        const currentEnvConfig = configData.environments[configData.current_environment];
        console.log(`   API Base: ${currentEnvConfig.API_BASE}`);
        console.log(`   SSE URL: ${currentEnvConfig.SSE_URL}`);
        
        // Check if current environment has ngrok URLs
        if (currentEnvConfig.API_BASE.includes('ngrok')) {
            console.log('');
            console.log('⚠️  ISSUE DETECTED: Using potentially stale ngrok URLs');
            console.log('');
            
            // Reset to localhost for immediate fix
            configData.current_environment = 'localhost';
            
            // Write back the updated configuration
            fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
            
            console.log('✅ FIXED: Reset environment to localhost');
            console.log('');
            console.log('🎯 IMMEDIATE SOLUTIONS:');
            console.log('');
            console.log('   1. LOCALHOST ACCESS (Works Now):');
            console.log('      npm start');
            console.log('      → http://localhost:3000');
            console.log('');
            console.log('   2. FRESH NGROK TUNNEL (External Access):');
            console.log('      npm run ngrok');
            console.log('      → Will get new working ngrok URL');
            console.log('');
            console.log('📖 For detailed instructions: see NGROK_INSTRUCTIONS.md');
            
        } else {
            console.log('✅ Configuration looks good - no ngrok URLs detected');
            console.log('');
            console.log('💡 To start the server:');
            console.log('   npm start  (localhost)');
            console.log('   npm run ngrok  (with external access)');
        }
    }
    
} catch (error) {
    console.error('❌ Error fixing configuration:', error.message);
    console.log('');
    console.log('🔧 Manual fix:');
    console.log('   1. Edit config/app-config.json');
    console.log('   2. Set "current_environment": "localhost"');
    console.log('   3. Run: npm start');
}

console.log('');
console.log('🚀 Ready to go! Run your server now.');
console.log('='.repeat(40));