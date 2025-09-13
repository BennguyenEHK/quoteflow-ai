#!/usr/bin/env node

// Simple ngrok starter with proper cleanup
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config', 'app-config.json');

console.log('🌐 Starting Ngrok & Updating Configuration');
console.log('='.repeat(45));

let ngrokProcess = null;
let sseServerProcess = null;
let ngrokUrl = null;

// Enhanced cleanup function with taskkill commands
function cleanup() {
    console.log('\n🧹 Cleaning up processes...');
    
    if (sseServerProcess) {
        console.log('🛑 Stopping SSE server...');
        try {
            sseServerProcess.kill('SIGTERM');
            setTimeout(() => {
                if (sseServerProcess && !sseServerProcess.killed) {
                    sseServerProcess.kill('SIGKILL');
                }
            }, 3000);
        } catch (error) {
            console.log('⚠️  Error stopping SSE server:', error.message);
        }
    }
    
    if (ngrokProcess) {
        console.log('🛑 Stopping ngrok...');
        try {
            ngrokProcess.kill('SIGTERM');
            setTimeout(() => {
                if (ngrokProcess && !ngrokProcess.killed) {
                    ngrokProcess.kill('SIGKILL');
                }
            }, 3000);
        } catch (error) {
            console.log('⚠️  Error stopping ngrok:', error.message);
        }
    }
    
    // Force kill remaining ngrok processes on Windows (if graceful shutdown failed)
    if (process.platform === 'win32') {
        console.log('🔨 Force killing remaining ngrok processes...');
        
        exec('taskkill /im ngrok.exe /f', (error) => {
            if (error) {
                console.log('⚠️  No ngrok processes to kill or taskkill failed');
            } else {
                console.log('✅ All ngrok.exe processes killed');
            }
        });
        
        // Note: Individual node processes are handled by graceful shutdown above
        // We don't force-kill all node.exe to avoid terminating other Node.js applications
    }
    
    console.log('✅ Cleanup completed');
    setTimeout(() => process.exit(0), 2000);
}

// Handle cleanup on exit
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// Handle Windows Ctrl+C and other close events
if (process.platform === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.on('SIGINT', cleanup);
}

function updateConfigWithNgrokUrl(newNgrokUrl) {
    try {
        console.log(`🔧 Updating configuration with: ${newNgrokUrl}`);
        
        // Remove trailing slash if present
        newNgrokUrl = newNgrokUrl.replace(/\/$/, '');
        
        // Read current config
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // SMART ENVIRONMENT DETECTION
        let currentEnv = configData.current_environment || 'development';
        let targetEnv = currentEnv;
        let environmentSwitched = false;
        
        console.log(`🔍 Current environment: ${currentEnv}`);
        
        // Special case: If currently on localhost, switch to development for ngrok
        if (currentEnv === 'localhost') {
            targetEnv = 'development';
            configData.current_environment = 'development';
            environmentSwitched = true;
            console.log(`📋 Switching from localhost → development for ngrok compatibility`);
        }
        
        // Validate target environment exists
        if (!configData.environments[targetEnv]) {
            console.log(`⚠️  Target environment '${targetEnv}' not found, falling back to development`);
            targetEnv = 'development';
            configData.current_environment = 'development';
            environmentSwitched = true;
        }
        
        // Update the target environment with ngrok URLs
        if (configData.environments[targetEnv]) {
            const oldUrl = configData.environments[targetEnv].API_BASE;
            configData.environments[targetEnv].SSE_URL = `${newNgrokUrl}/events`;
            configData.environments[targetEnv].API_BASE = newNgrokUrl;
            
            console.log(`✅ Updated '${targetEnv}' environment:`);
            console.log(`   Old: ${oldUrl}`);
            console.log(`   New: ${newNgrokUrl}`);
            
            if (environmentSwitched) {
                console.log(`🔄 Active environment switched to: ${targetEnv}`);
            }
        } else {
            throw new Error(`Environment '${targetEnv}' not found in configuration`);
        }
        
        // Write back to file
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
        
        console.log('');
        console.log('📡 CONFIGURATION UPDATE SUCCESSFUL');
        console.log(`   ✅ Environment: ${targetEnv}${environmentSwitched ? ' (switched)' : ''}`);
        console.log(`   🌐 Frontend Access: ${newNgrokUrl}`);
        console.log(`   📡 SSE Connection: ${newNgrokUrl}/events`);
        console.log('');
        console.log('📋 Make.com Webhook URLs:');
        console.log(`   Module Update: ${newNgrokUrl}/module-update`);
        console.log(`   Workflow Complete: ${newNgrokUrl}/workflow-complete`);
        console.log(`   Quotation Generation: ${newNgrokUrl}/api/quotation-generation`);
        console.log('');
        console.log('🔧 Ngrok dashboard: http://127.0.0.1:4040');
        console.log('');
        console.log('ℹ️ SSE Server will automatically use the updated URLs');
        
        return true;
    } catch (error) {
        console.error('❌ Error updating configuration:', error.message);
        return false;
    }
}

function extractNgrokUrl(data) {
    const lines = data.toString().split('\n');
    
    for (const line of lines) {
        // Look for ngrok URL pattern
        if (line.includes('https://') && line.includes('.ngrok-free.app')) {
            const match = line.match(/(https:\/\/[a-z0-9]+\.ngrok-free\.app)/);
            if (match) {
                return match[1];
            }
        }
        
        // Alternative pattern for different ngrok output formats
        if (line.includes('Web Interface') && line.includes('http://127.0.0.1:4040')) {
            console.log('🌐 Ngrok web interface: http://127.0.0.1:4040');
        }
    }
    
    return null;
}

function startNgrok() {
    return new Promise((resolve, reject) => {
        console.log('🌐 Starting ngrok tunnel on port 5000...');
        
        // Use cmd to run ngrok on Windows for better PATH handling
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'cmd' : 'ngrok';
        const args = isWindows ? ['/c', 'ngrok', 'http', '5000'] : ['http', '5000'];
        
        console.log(`🔧 Running: ${command} ${args.join(' ')}`);
        
        // Start ngrok process
        ngrokProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let urlFound = false;
        
        // Check ngrok output for URL
        ngrokProcess.stdout.on('data', (data) => {
            const output = data.toString();
            
            if (!urlFound) {
                const url = extractNgrokUrl(output);
                if (url) {
                    ngrokUrl = url;
                    urlFound = true;
                    console.log(`🎉 Ngrok URL detected: ${ngrokUrl}`);
                    resolve(ngrokUrl);
                }
            }
        });
        
        ngrokProcess.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if (output && !output.includes('lvl=info')) {
                console.error(`[Ngrok] ${output}`);
            }
        });
        
        ngrokProcess.on('close', (code) => {
            if (code !== 0 && !urlFound) {
                reject(new Error(`Ngrok process exited with code ${code}`));
            }
        });
        
        ngrokProcess.on('error', (error) => {
            if (error.code === 'ENOENT') {
                reject(new Error('Command not found. Please ensure ngrok is installed and in PATH'));
            } else {
                reject(error);
            }
        });
        
        // Fallback: Try to get URL from ngrok API after a delay
        setTimeout(async () => {
            if (!urlFound) {
                console.log('⏳ URL not found in output, trying ngrok API...');
                try {
                    const response = await fetch('http://127.0.0.1:4040/api/tunnels');
                    const data = await response.json();
                    
                    if (data.tunnels && data.tunnels.length > 0) {
                        const httpsUrl = data.tunnels.find(t => t.public_url.startsWith('https://'));
                        if (httpsUrl) {
                            ngrokUrl = httpsUrl.public_url;
                            urlFound = true;
                            console.log(`🎉 Ngrok URL found via API: ${ngrokUrl}`);
                            resolve(ngrokUrl);
                        }
                    }
                } catch (apiError) {
                    console.log('⚠️  Could not fetch from ngrok API');
                }
            }
        }, 5000);
        
        // Ultimate timeout
        setTimeout(() => {
            if (!urlFound) {
                reject(new Error('Timeout waiting for ngrok URL'));
            }
        }, 30000);
    });
}

function startSSEServer() {
    return new Promise((resolve, reject) => {
        console.log('🚀 Starting SSE server on port 5000...');
        
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'cmd' : 'node';
        const args = isWindows ? ['/c', 'node', 'sse_server.js'] : ['sse_server.js'];
        
        console.log(`🔧 Running: ${command} ${args.join(' ')}`);
        
        // Start SSE server process
        sseServerProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: __dirname
        });
        
        let serverStarted = false;
        
        // Monitor SSE server output
        sseServerProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[SSE Server] ${output.trim()}`);
            
            // Check if server started successfully
            if (!serverStarted && (output.includes('Server running') || output.includes('listening') || output.includes('started') || output.includes('port 5000'))) {
                serverStarted = true;
                console.log('✅ SSE Server started successfully!');
                console.log(`🌐 Frontend accessible at: ${ngrokUrl}`);
                console.log(`📡 SSE connection: ${ngrokUrl}/events`);
                resolve();
            }
        });
        
        sseServerProcess.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if (output) {
                console.error(`[SSE Server Error] ${output}`);
            }
        });
        
        sseServerProcess.on('close', (code) => {
            if (code !== 0 && !serverStarted) {
                console.error(`❌ SSE Server process exited with code ${code}`);
                reject(new Error(`SSE Server exited with code ${code}`));
            } else {
                console.log('🛑 SSE Server stopped');
            }
        });
        
        sseServerProcess.on('error', (error) => {
            console.error('❌ Failed to start SSE server:', error.message);
            reject(error);
        });
        
        // Fallback timeout
        setTimeout(() => {
            if (!serverStarted) {
                console.log('⏳ SSE Server taking longer than expected, but continuing...');
                console.log(`🌐 Try accessing: ${ngrokUrl}`);
                resolve();
            }
        }, 10000);
    });
}

async function main() {
    try {
        // Start ngrok and get URL
        const detectedUrl = await startNgrok();
        
        // Update configuration
        if (!updateConfigWithNgrokUrl(detectedUrl)) {
            throw new Error('Failed to update configuration');
        }
        
        // Start SSE Server automatically
        console.log('');
        console.log('🚀 Starting SSE Server automatically...');
        await startSSEServer();
        
        // Keep both processes running
        console.log('');
        console.log('🔄 Both ngrok and SSE server are running...');
        console.log('⌨️  Press Ctrl+C to stop all processes');
        console.log('');
        console.log('📊 Service Status:');
        console.log(`   ✅ Ngrok Tunnel: ${detectedUrl}`);
        console.log(`   ✅ SSE Server: http://localhost:5000`);
        console.log(`   ✅ Frontend: ${detectedUrl}`);
        console.log(`   ✅ API Endpoints: ${detectedUrl}/api/*`);
        console.log('');
        
        // Keep the script running and monitor processes
        const heartbeatInterval = setInterval(async () => {
            // Check if processes are still running
            if (ngrokProcess && ngrokProcess.killed) {
                console.error('❌ Ngrok process died unexpectedly');
                cleanup();
                return;
            }
            
            if (sseServerProcess && sseServerProcess.killed) {
                console.error('❌ SSE Server process died unexpectedly');
                cleanup();
                return;
            }
        }, 5000);
        
        // Clean up interval on exit
        process.on('exit', () => {
            clearInterval(heartbeatInterval);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        if (error.message.includes('Command not found') || error.message.includes('ngrok')) {
            console.log('');
            console.log('💡 Ngrok Installation Instructions:');
            console.log('   1. Download: https://ngrok.com/download');
            console.log('   2. Extract to a folder (e.g., C:\\ngrok\\)');
            console.log('   3. Add to PATH or move to system folder');
            console.log('   4. Or install via: npm install -g ngrok');
            console.log('   5. Or install via: choco install ngrok');
            console.log('');
            console.log('🔧 Test installation: ngrok --version');
        }
        
        cleanup();
        process.exit(1);
    }
}

// Add fetch polyfill for older Node.js versions
if (!globalThis.fetch) {
    try {
        const fetch = require('node-fetch');
        globalThis.fetch = fetch;
    } catch (e) {
        // node-fetch not available, will use API fallback
    }
}

main();