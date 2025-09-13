/**
 * SESSION MANAGER - Named Session & Process Management
 * Handles named SSE sessions, process tracking, and cleanup operations
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

class SessionManager {
    constructor() {
        this.sessionsDir = path.join(__dirname, '..', 'sessions');
        this.pidFile = path.join(this.sessionsDir, 'sse-server.pid');
        this.sessionRegistry = path.join(this.sessionsDir, 'session-registry.json');
        
        // Ensure sessions directory exists
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
            console.log('📁 Created sessions directory');
        }
        
        this.activeSessions = this.loadSessionRegistry();
    }

    /**
     * Generate a named session ID with meaningful identifier
     */
    generateNamedSessionId(sessionName = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomId = Math.random().toString(36).substr(2, 8);
        
        if (sessionName) {
            // Sanitize session name for filesystem safety
            const safeName = sessionName.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 20);
            return `${safeName}_${timestamp}_${randomId}`;
        }
        
        return `sse_session_${timestamp}_${randomId}`;
    }

    /**
     * Register a new named session
     */
    registerSession(sessionId, sessionName, processInfo = {}) {
        const sessionData = {
            id: sessionId,
            name: sessionName || 'unnamed_session',
            pid: process.pid,
            createdAt: new Date().toISOString(),
            processInfo: {
                command: processInfo.command || 'node sse_server.js',
                cwd: processInfo.cwd || process.cwd(),
                port: processInfo.port || 5000,
                ...processInfo
            },
            status: 'active'
        };

        this.activeSessions[sessionId] = sessionData;
        this.saveSessionRegistry();
        
        console.log(`📝 Registered session: ${sessionId} (${sessionName})`);
        return sessionData;
    }

    /**
     * Write PID file for current server process
     */
    writePidFile(sessionId = null, sessionName = null) {
        const pidData = {
            pid: process.pid,
            sessionId: sessionId,
            sessionName: sessionName || 'sse-server',
            startedAt: new Date().toISOString(),
            command: process.argv.join(' '),
            cwd: process.cwd(),
            port: process.env.PORT || 5000
        };

        try {
            fs.writeFileSync(this.pidFile, JSON.stringify(pidData, null, 2));
            console.log(`📋 PID file written: ${this.pidFile} (PID: ${process.pid})`);
            
            // Also register the session
            if (sessionId) {
                this.registerSession(sessionId, sessionName, pidData);
            }
            
            return pidData;
        } catch (error) {
            console.error('❌ Failed to write PID file:', error.message);
            return null;
        }
    }

    /**
     * Read PID file to get current server process info
     */
    readPidFile() {
        try {
            if (!fs.existsSync(this.pidFile)) {
                return null;
            }

            const pidData = JSON.parse(fs.readFileSync(this.pidFile, 'utf8'));
            
            // Check if process is still running
            try {
                process.kill(pidData.pid, 0);
                pidData.isRunning = true;
            } catch (error) {
                pidData.isRunning = false;
            }

            return pidData;
        } catch (error) {
            console.error('❌ Failed to read PID file:', error.message);
            return null;
        }
    }

    /**
     * Load session registry from disk
     */
    loadSessionRegistry() {
        try {
            if (!fs.existsSync(this.sessionRegistry)) {
                return {};
            }

            const registry = JSON.parse(fs.readFileSync(this.sessionRegistry, 'utf8'));
            console.log(`📚 Loaded ${Object.keys(registry).length} sessions from registry`);
            return registry;
        } catch (error) {
            console.error('❌ Failed to load session registry:', error.message);
            return {};
        }
    }

    /**
     * Save session registry to disk
     */
    saveSessionRegistry() {
        try {
            fs.writeFileSync(this.sessionRegistry, JSON.stringify(this.activeSessions, null, 2));
        } catch (error) {
            console.error('❌ Failed to save session registry:', error.message);
        }
    }

    /**
     * Get session by ID or name
     */
    getSession(identifier) {
        // Try exact ID match first
        if (this.activeSessions[identifier]) {
            return this.activeSessions[identifier];
        }

        // Try name match
        const sessionByName = Object.values(this.activeSessions).find(
            session => session.name === identifier
        );
        
        return sessionByName || null;
    }

    /**
     * List all active sessions
     */
    listSessions() {
        return Object.values(this.activeSessions).map(session => ({
            id: session.id,
            name: session.name,
            pid: session.pid,
            createdAt: session.createdAt,
            status: session.status,
            port: session.processInfo?.port
        }));
    }

    /**
     * Terminate session by ID or name
     */
    async terminateSession(identifier) {
        const session = this.getSession(identifier);
        
        if (!session) {
            console.error(`❌ Session not found: ${identifier}`);
            return false;
        }

        console.log(`🛑 Terminating session: ${session.name} (${session.id})`);
        
        try {
            // Try graceful shutdown first
            process.kill(session.pid, 'SIGTERM');
            
            // Wait and check if process is still running
            await this.sleep(2000);
            
            try {
                process.kill(session.pid, 0);
                console.log('⚠️  Process still running, forcing termination...');
                
                if (process.platform === 'win32') {
                    // Use taskkill on Windows
                    await this.executeCommand(`taskkill /PID ${session.pid} /F`);
                } else {
                    process.kill(session.pid, 'SIGKILL');
                }
            } catch (checkError) {
                // Process already terminated
                console.log('✅ Session terminated successfully');
            }
            
            // Mark session as terminated and clean up
            session.status = 'terminated';
            session.terminatedAt = new Date().toISOString();
            this.saveSessionRegistry();
            
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to terminate session ${identifier}:`, error.message);
            return false;
        }
    }

    /**
     * Clean up terminated/dead sessions
     */
    cleanupSessions() {
        let cleanedCount = 0;
        const sessionsToRemove = [];

        Object.entries(this.activeSessions).forEach(([sessionId, session]) => {
            if (session.status === 'terminated') {
                sessionsToRemove.push(sessionId);
                cleanedCount++;
                return;
            }

            // Check if process is still running
            try {
                process.kill(session.pid, 0);
                // Process is running
            } catch (error) {
                // Process is dead
                session.status = 'dead';
                session.terminatedAt = new Date().toISOString();
                sessionsToRemove.push(sessionId);
                cleanedCount++;
            }
        });

        // Remove dead sessions
        sessionsToRemove.forEach(sessionId => {
            delete this.activeSessions[sessionId];
        });

        if (cleanedCount > 0) {
            this.saveSessionRegistry();
            console.log(`🧹 Cleaned up ${cleanedCount} dead sessions`);
        }

        return cleanedCount;
    }

    /**
     * Get current server status
     */
    getServerStatus() {
        const pidData = this.readPidFile();
        const sessionCount = Object.keys(this.activeSessions).length;
        const activeCount = Object.values(this.activeSessions).filter(s => s.status === 'active').length;

        return {
            isRunning: pidData?.isRunning || false,
            currentProcess: pidData,
            totalSessions: sessionCount,
            activeSessions: activeCount,
            sessionsDir: this.sessionsDir,
            pidFile: this.pidFile
        };
    }

    /**
     * Force cleanup all processes and sessions
     */
    async forceCleanupAll() {
        console.log('🧹 Force cleanup: terminating all SSE server processes...');
        
        // Clean up PID file
        if (fs.existsSync(this.pidFile)) {
            fs.unlinkSync(this.pidFile);
            console.log('🗑️ Removed PID file');
        }

        // Mark all sessions as terminated
        Object.values(this.activeSessions).forEach(session => {
            session.status = 'force_terminated';
            session.terminatedAt = new Date().toISOString();
        });
        this.saveSessionRegistry();

        // Force kill Node.js processes on Windows
        if (process.platform === 'win32') {
            try {
                await this.executeCommand('taskkill /im node.exe /f');
                console.log('✅ All node.exe processes terminated');
            } catch (error) {
                console.log('⚠️  No node.exe processes to terminate');
            }

            try {
                await this.executeCommand('taskkill /im ngrok.exe /f');
                console.log('✅ All ngrok.exe processes terminated');
            } catch (error) {
                console.log('⚠️  No ngrok.exe processes to terminate');
            }
        }

        console.log('✅ Force cleanup completed');
        return true;
    }

    /**
     * Helper: Execute shell command
     */
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    /**
     * Helper: Sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup on exit
     */
    setupExitHandlers() {
        const cleanup = () => {
            console.log('🛑 Session manager cleanup...');
            
            // Update current session status
            Object.values(this.activeSessions).forEach(session => {
                if (session.pid === process.pid) {
                    session.status = 'graceful_shutdown';
                    session.terminatedAt = new Date().toISOString();
                }
            });
            
            this.saveSessionRegistry();
            
            // Remove PID file
            if (fs.existsSync(this.pidFile)) {
                fs.unlinkSync(this.pidFile);
            }
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('exit', cleanup);
    }
}

module.exports = SessionManager;