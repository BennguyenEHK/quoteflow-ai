#!/usr/bin/env node

/**
 * SESSION MANAGEMENT CLI
 * Command-line interface for managing named SSE sessions
 */

const SessionManager = require('../utils/session-manager');

function showUsage() {
    console.log('📋 SSE SESSION MANAGEMENT CLI');
    console.log('=' .repeat(50));
    console.log('');
    console.log('USAGE:');
    console.log('  node scripts/manage-sessions.js <command> [options]');
    console.log('');
    console.log('COMMANDS:');
    console.log('  start <name>     Start SSE server with named session');
    console.log('  list             List all active sessions');
    console.log('  status           Show current server status');
    console.log('  stop <id/name>   Stop specific session by ID or name');
    console.log('  cleanup          Clean up dead sessions');
    console.log('  kill-all         Force terminate all processes');
    console.log('  help             Show this help message');
    console.log('');
    console.log('EXAMPLES:');
    console.log('  node scripts/manage-sessions.js start "sales-demo"');
    console.log('  node scripts/manage-sessions.js list');
    console.log('  node scripts/manage-sessions.js stop sales-demo');
    console.log('  node scripts/manage-sessions.js status');
    console.log('  node scripts/manage-sessions.js kill-all');
}

async function startNamedSession(sessionName) {
    const sessionManager = new SessionManager();
    const sessionId = sessionManager.generateNamedSessionId(sessionName);
    
    console.log(`🚀 Starting named SSE session: "${sessionName}"`);
    console.log(`📝 Session ID: ${sessionId}`);
    
    // Write PID file and register session
    const pidData = sessionManager.writePidFile(sessionId, sessionName);
    
    if (!pidData) {
        console.error('❌ Failed to initialize session management');
        process.exit(1);
    }
    
    console.log('');
    console.log('📊 SESSION DETAILS:');
    console.log(`   Name: ${sessionName}`);
    console.log(`   ID: ${sessionId}`);
    console.log(`   PID: ${process.pid}`);
    console.log(`   Port: ${pidData.port}`);
    console.log(`   Started: ${pidData.startedAt}`);
    console.log('');
    
    // Setup cleanup handlers
    sessionManager.setupExitHandlers();
    
    // Start the actual SSE server
    console.log('🎯 Loading SSE server...');
    const UnifiedSSEServer = require('../sse_server');
    
    try {
        const server = new UnifiedSSEServer();
        
        // Inject session info into server
        server.sessionManager = sessionManager;
        server.currentSessionId = sessionId;
        server.currentSessionName = sessionName;
        
        await server.start();
        
        console.log('');
        console.log('✅ NAMED SESSION STARTED SUCCESSFULLY');
        console.log('=' .repeat(50));
        console.log(`🏷️  Session Name: ${sessionName}`);
        console.log(`🆔 Session ID: ${sessionId}`);
        console.log(`🔢 Process ID: ${process.pid}`);
        console.log('');
        console.log('📋 MANAGEMENT COMMANDS:');
        console.log(`   Stop this session: node scripts/manage-sessions.js stop "${sessionName}"`);
        console.log(`   List sessions: node scripts/manage-sessions.js list`);
        console.log(`   Server status: node scripts/manage-sessions.js status`);
        console.log('');
        console.log('⌨️  Press Ctrl+C to stop gracefully');
        
    } catch (error) {
        console.error('❌ Failed to start SSE server:', error.message);
        process.exit(1);
    }
}

async function listSessions() {
    const sessionManager = new SessionManager();
    const sessions = sessionManager.listSessions();
    
    console.log('📋 ACTIVE SSE SESSIONS');
    console.log('=' .repeat(50));
    
    if (sessions.length === 0) {
        console.log('⭕ No active sessions found');
        return;
    }
    
    sessions.forEach((session, index) => {
        console.log(`${index + 1}. ${session.name}`);
        console.log(`   ID: ${session.id}`);
        console.log(`   PID: ${session.pid}`);
        console.log(`   Port: ${session.port || 'N/A'}`);
        console.log(`   Started: ${new Date(session.createdAt).toLocaleString()}`);
        console.log(`   Status: ${session.status}`);
        console.log('');
    });
    
    console.log(`📊 Total: ${sessions.length} sessions`);
}

async function showStatus() {
    const sessionManager = new SessionManager();
    const status = sessionManager.getServerStatus();
    
    console.log('📊 SSE SERVER STATUS');
    console.log('=' .repeat(50));
    
    if (status.currentProcess) {
        console.log('🟢 SERVER RUNNING');
        console.log(`   Session: ${status.currentProcess.sessionName}`);
        console.log(`   ID: ${status.currentProcess.sessionId}`);
        console.log(`   PID: ${status.currentProcess.pid}`);
        console.log(`   Port: ${status.currentProcess.port}`);
        console.log(`   Started: ${new Date(status.currentProcess.startedAt).toLocaleString()}`);
        console.log(`   Running: ${status.isRunning ? '✅ Yes' : '❌ No'}`);
    } else {
        console.log('🔴 NO SERVER PROCESS FOUND');
    }
    
    console.log('');
    console.log('📋 SESSION SUMMARY:');
    console.log(`   Total Sessions: ${status.totalSessions}`);
    console.log(`   Active Sessions: ${status.activeSessions}`);
    console.log(`   Sessions Directory: ${status.sessionsDir}`);
    console.log(`   PID File: ${status.pidFile}`);
}

async function stopSession(identifier) {
    const sessionManager = new SessionManager();
    
    console.log(`🛑 Stopping session: ${identifier}`);
    
    const success = await sessionManager.terminateSession(identifier);
    
    if (success) {
        console.log(`✅ Session "${identifier}" stopped successfully`);
    } else {
        console.error(`❌ Failed to stop session "${identifier}"`);
        process.exit(1);
    }
}

async function cleanupSessions() {
    const sessionManager = new SessionManager();
    
    console.log('🧹 Cleaning up dead sessions...');
    
    const cleanedCount = sessionManager.cleanupSessions();
    
    if (cleanedCount > 0) {
        console.log(`✅ Cleaned up ${cleanedCount} dead sessions`);
    } else {
        console.log('📋 No dead sessions found');
    }
}

async function killAll() {
    const sessionManager = new SessionManager();
    
    console.log('⚠️  WARNING: This will forcefully terminate ALL SSE server processes!');
    console.log('⏳ Starting force cleanup in 3 seconds... (Ctrl+C to cancel)');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const success = await sessionManager.forceCleanupAll();
    
    if (success) {
        console.log('✅ All processes terminated successfully');
    } else {
        console.error('❌ Some processes may still be running');
        process.exit(1);
    }
}

async function main() {
    const [,, command, ...args] = process.argv;
    
    if (!command || command === 'help') {
        showUsage();
        return;
    }
    
    try {
        switch (command) {
            case 'start':
                const sessionName = args[0];
                if (!sessionName) {
                    console.error('❌ Session name is required');
                    console.log('Usage: node scripts/manage-sessions.js start <name>');
                    process.exit(1);
                }
                await startNamedSession(sessionName);
                break;
                
            case 'list':
                await listSessions();
                break;
                
            case 'status':
                await showStatus();
                break;
                
            case 'stop':
                const identifier = args[0];
                if (!identifier) {
                    console.error('❌ Session ID or name is required');
                    console.log('Usage: node scripts/manage-sessions.js stop <id/name>');
                    process.exit(1);
                }
                await stopSession(identifier);
                break;
                
            case 'cleanup':
                await cleanupSessions();
                break;
                
            case 'kill-all':
                await killAll();
                break;
                
            default:
                console.error(`❌ Unknown command: ${command}`);
                showUsage();
                process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();