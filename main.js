const { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

let mainWindow = null;
let updateWindow = null;
let errorWindow = null;
let backendProcess = null;
let tray = null;
let retryAttempts = 0;
let retryCountdown = 10;
let isConnected = false;
let reconnectInterval = null;

const CURRENT_VERSION = "1.0.0";
const VERSION_URL = "https://raw.githubusercontent.com/conscious-stage/executor-download/refs/heads/main/version.json";

// 🌐 Check internet connection
function checkInternetConnection() {
    return new Promise((resolve) => {
        require("dns").resolve("google.com", (err) => {
            resolve(!err);
        });
    });
}
function createUpdateWindow(downloadUrl) {
    updateWindow = new BrowserWindow({
        width: 350, height: 350, resizable: false, modal: true, show: false,
        icon: path.join(__dirname, 'renderer/assets/icon.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    updateWindow.loadFile(path.join(__dirname, 'renderer/update.html'));
    updateWindow.once('ready-to-show', () => updateWindow.show());
    updateWindow.webContents.once('did-finish-load', () => {
        updateWindow.webContents.send('set-download-url', downloadUrl);
    });
    updateWindow.removeMenu();
}
// 🛠 Function to check for updates
async function checkForUpdates() {
    try {
        const response = await new Promise((resolve, reject) => {
            https.get(VERSION_URL, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const versionData = JSON.parse(data);
                        resolve(versionData);
                    } catch (error) {
                        reject("Error parsing version data.");
                    }
                });
            }).on('error', reject);
        });

        if (response.latest !== CURRENT_VERSION) {
            return response;
        }
        return null;
    } catch (error) {
        console.error('Update check failed:', error);
        return null;
    }
}

// 🔄 Monitor and Auto-Reconnect Internet
function monitorInternetConnection() {
    reconnectInterval = setInterval(async () => {
        const online = await checkInternetConnection();
        if (online && !isConnected) {
            console.log("✅ Connection restored! Reloading...");
            if (mainWindow && !mainWindow.isDestroyed()) {
            } else {
                createWindow();
            }
            isConnected = true;
        } else if (!online && isConnected) {
            console.log("❌ Connection lost!");
            if (mainWindow) {
                mainWindow.close();
                mainWindow = null;
            }
            createErrorWindow();
            isConnected = false;
        }
    }, 5000); // Check every 5 seconds
}

// 🏁 Retry logic for launching app
async function attemptLaunch() {
    let isConnected = await checkInternetConnection();

    if (!isConnected) {
        retryAttempts++;
        if (!errorWindow) {
            createErrorWindow();
        }

        if (errorWindow && errorWindow.webContents) {
            errorWindow.webContents.send('update-retry-info', {
                attempt: retryAttempts,
                countdown: retryCountdown
            });
        }

        if (retryCountdown > 0) {
            retryCountdown--;
        } else {
            retryCountdown = 10;
        }

        console.log(`❌ No Internet. Retrying in ${retryCountdown} seconds...`);
        startBackendProcess();
        isConnected=false;
        setTimeout(attemptLaunch, retryCountdown * 1000);
    } else {
        console.log("✅ Internet Connected. Checking for updates...");
        try {
            const updateInfo = await checkForUpdates();
            if (updateInfo) {
                createUpdateWindow(updateInfo.download_url);
            } else {
                createWindow();
                createTray();
                if (errorWindow) {
                    errorWindow.close(); // Close error window once reconnected
                    errorWindow = null; // Reset the error window
                }
                isConnected = true;
                monitorInternetConnection(); // Start monitoring connection
            }
        } catch (error) {
            console.error("Error checking for updates:", error);
            createWindow();
            createTray();
            if (errorWindow) {
                errorWindow.close(); // Close error window on error as well
                errorWindow = null; // Reset the error window
            }
            isConnected = true;
            monitorInternetConnection();
        }
    }
}


// 🏁 Initialize the app
app.whenReady().then(attemptLaunch);

// 🖼 Function to create the main window
function createWindow() {
    if (mainWindow) return;

    mainWindow = new BrowserWindow({
        width: 700,
        height: 510,
        resizable: false,
        icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: '#131313'
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.insertCSS('body { overflow: hidden; }');
    });

    mainWindow.on('close', (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    mainWindow.removeMenu();
}

// 🖼 Function to create the error window
function createErrorWindow() {
    if (errorWindow) return;

    errorWindow = new BrowserWindow({
        width: 400,
        height: 400,
        resizable: false,
        modal: true,
        show: false,
        icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    errorWindow.loadFile(path.join(__dirname, 'renderer', 'error.html'));

    errorWindow.once('ready-to-show', () => {
        errorWindow.show();
    });

    errorWindow.removeMenu();
}

// 🏁 Function to create the tray icon
function createTray() {
    if (tray) return;

    tray = new Tray(path.join(__dirname, 'renderer', 'assets', '32x32.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open', click: () => mainWindow.show() },
        { label: 'Disconnect', click: () => stopBackendProcess() },
        { label: 'Quit', click: () => { stopBackendProcess();isConnected=false; app.quit(); app.exit(0); } }
    ]);
    tray.setToolTip('Executor');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow.show());
}

// 🛑 Stop backend process
function stopBackendProcess() {
    if (backendProcess) {
        console.log('Stopping backend process...');
        backendProcess.kill();
        backendProcess = null;
    }
}

// 🏁 Quit when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        stopBackendProcess();
        app.quit();
    }
});

// 🖥 Function to start the backend process
function startBackendProcess(machineKey) {
    let backendPath = app.isPackaged
        ? path.join(process.resourcesPath, 'backend', 'server.bin')
        : path.join(__dirname, 'backend', 'server.bin');

    if (!fs.existsSync(backendPath)) {
        console.error(`Error: Backend binary not found at ${backendPath}`);
        return false;
    }

    backendProcess = spawn(backendPath, [machineKey]);

    backendProcess.stdout.on('data', (data) => {
        console.log("Backend:", data.toString());
    });

    backendProcess.stderr.on('data', (data) => {
        console.error("Backend Error:", data.toString());
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('connection-status', 'error');
        }
    });

    backendProcess.on('close', (code) => {
        console.log('Backend process exited with code', code);
        backendProcess = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('connection-status', 'disconnected');
        }
        isConnected = false;
    });

    return true;
}

ipcMain.handle('disconnect', async () => {
    stopBackendProcess();
    isConnected = false;
    return { success: true };
});

ipcMain.handle('exit', async () => {
    stopBackendProcess();
    isConnected = false;
    return { success: true };
});

ipcMain.handle('connect', async (event, machineKey) => {
    console.log(`Connecting with key: ${machineKey}...`);

    if (!machineKey || typeof machineKey !== 'string') {
        return { success: false, message: 'Invalid machine key' };
    }

    const started = startBackendProcess(machineKey);
    
    if (started) {
        return { success: true, message: 'Connected successfully' };
    } else {
        return { success: false, message: 'Failed to start backend process' };
    }
});
ipcMain.handle('open-external-url', async (event, url) => {
    return shell.openExternal(url);
  });
  