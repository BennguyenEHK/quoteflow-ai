#!/usr/bin/env node

/**
 * Port Cleanup Utility
 * Helps identify and clean up processes using port 3000
 */

const { exec, spawn } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const DEFAULT_PORT = process.env.PORT || 5000;

class PortCleanup {
    constructor(port = DEFAULT_PORT) {
        this.port = port;
    }

    /**
     * Check if port is in use
     */
    async checkPortInUse() {
        try {
            const { stdout } = await execAsync(`netstat -ano | findstr :${this.port}`);
            if (stdout.trim()) {
                const lines = stdout.trim().split('\n');
                const processes = new Set();
                
                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 5) {
                        const pid = parts[4];
                        if (pid && pid !== '0') {
                            processes.add(pid);
                        }
                    }
                });

                return Array.from(processes);
            }
            return [];
        } catch (error) {
            // No processes using the port
            return [];
        }
    }

    /**
     * Get process details by PID
     */
    async getProcessInfo(pid) {
        try {
            const { stdout } = await execAsync(`tasklist | findstr ${pid}`);
            if (stdout.trim()) {
                const parts = stdout.trim().split(/\s+/);
                return {
                    pid: pid,
                    name: parts[0],
                    sessionName: parts[2],
                    sessionId: parts[3],
                    memUsage: parts[4]
                };
            }
        } catch (error) {
            return { pid: pid, name: 'Unknown', error: error.message };
        }
        return null;
    }

    /**
     * Kill process by PID
     */
    async killProcess(pid) {
        try {
            await execAsync(`taskkill /f /pid ${pid}`);
            console.log(`✅ Successfully killed process ${pid}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to kill process ${pid}: ${error.message}`);
            return false;
        }
    }

    /**
     * Kill all Node.js processes
     */
    async killAllNodeProcesses() {
        try {
            await execAsync('taskkill /f /im node.exe');
            console.log('✅ Successfully killed all Node.js processes');
            return true;
        } catch (error) {
            if (error.message.includes('not found')) {
                console.log('ℹ️ No Node.js processes found running');
                return true;
            }
            console.error(`❌ Failed to kill Node.js processes: ${error.message}`);
            return false;
        }
    }

    /**
     * Main command handler
     */
    async run(command) {
        console.log(`🔍 Port Cleanup Utility - Port ${this.port}`);
        console.log('='.repeat(50));

        switch (command) {
            case 'check':
                await this.checkCommand();
                break;
            case 'kill':
                await this.killCommand();
                break;
            case 'kill-all':
                await this.killAllCommand();
                break;
            case 'help':
            default:
                this.showHelp();
                break;
        }
    }

    async checkCommand() {
        console.log(`📊 Checking port ${this.port} usage...`);
        
        const pids = await this.checkPortInUse();
        
        if (pids.length === 0) {
            console.log(`✅ Port ${this.port} is available`);
            return;
        }

        console.log(`⚠️ Port ${this.port} is being used by ${pids.length} process(es):`);
        console.log('');

        for (const pid of pids) {
            const info = await this.getProcessInfo(pid);
            if (info) {
                console.log(`  PID: ${info.pid}`);
                console.log(`  Name: ${info.name}`);
                if (info.memUsage) {
                    console.log(`  Memory: ${info.memUsage}`);
                }
                console.log('  ---');
            }
        }
    }

    async killCommand() {
        console.log(`🗡️ Killing processes using port ${this.port}...`);
        
        const pids = await this.checkPortInUse();
        
        if (pids.length === 0) {
            console.log(`✅ No processes using port ${this.port}`);
            return;
        }

        let killed = 0;
        for (const pid of pids) {
            const info = await this.getProcessInfo(pid);
            console.log(`🎯 Attempting to kill ${info?.name || 'Unknown'} (PID: ${pid})`);
            
            if (await this.killProcess(pid)) {
                killed++;
            }
        }

        console.log(`\n🎉 Killed ${killed}/${pids.length} processes`);
        
        // Wait a moment and check again
        console.log('⏳ Waiting 2 seconds to verify...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const remainingPids = await this.checkPortInUse();
        if (remainingPids.length === 0) {
            console.log(`✅ Port ${this.port} is now available!`);
        } else {
            console.log(`⚠️ ${remainingPids.length} process(es) still using port ${this.port}`);
        }
    }

    async killAllCommand() {
        console.log('🗡️ Killing ALL Node.js processes...');
        console.log('⚠️ This will terminate all running Node.js applications!');
        
        // Show current Node.js processes first
        try {
            const { stdout } = await execAsync('tasklist | findstr node.exe');
            if (stdout.trim()) {
                console.log('\n📋 Current Node.js processes:');
                console.log(stdout);
            }
        } catch (error) {
            console.log('ℹ️ No Node.js processes found');
            return;
        }

        await this.killAllNodeProcesses();
        
        // Wait a moment and verify
        console.log('⏳ Waiting 2 seconds to verify...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const remainingPids = await this.checkPortInUse();
        if (remainingPids.length === 0) {
            console.log(`✅ Port ${this.port} is now available!`);
        } else {
            console.log(`⚠️ ${remainingPids.length} process(es) still using port ${this.port} (non-Node.js processes)`);
        }
    }

    showHelp() {
        console.log(`
📖 Usage: node port-cleanup.js [command]

Commands:
  check      Check what processes are using port ${this.port}
  kill       Kill processes specifically using port ${this.port}
  kill-all   Kill ALL Node.js processes (use with caution!)
  help       Show this help message

Examples:
  node scripts/port-cleanup.js check
  node scripts/port-cleanup.js kill
  node scripts/port-cleanup.js kill-all

Environment:
  PORT=${this.port} (set PORT environment variable to check different port)
        `);
    }
}

// Run if called directly
if (require.main === module) {
    const command = process.argv[2] || 'help';
    const port = process.env.PORT || 5000;
    
    const cleanup = new PortCleanup(port);
    cleanup.run(command).catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
    });
}

module.exports = PortCleanup;