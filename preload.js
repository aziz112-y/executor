const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
    connect: (machineKey) => ipcRenderer.invoke('connect', machineKey),
    disconnect: () => ipcRenderer.invoke('disconnect'),
    onLogMessage: (callback) => ipcRenderer.on('log-message', (_, message) => callback(message)),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_, status) => callback(status)),
    openDownloadLink: (url) => ipcRenderer.send('open-download-link', url) // ✅ Ensure it's sending the event correctly
});

console.log("Preload script executing...");

try {
  contextBridge.exposeInMainWorld('electron', {
    onDownloadUrl: (callback) => {
      console.log("Registering onDownloadUrl handler");
      ipcRenderer.on('set-download-url', (event, url) => {
        console.log("Received URL in preload:", url);
        callback(url);
      });
    },
    openExternal: (url) => {
      console.log("openExternal called with:", url);
      return ipcRenderer.invoke('open-external-url', url);
    }
  });
  console.log("API successfully exposed!");
} catch (error) {
  console.error("Error exposing API:", error);
}
console.log("Preload script completed, exposed API:", Object.keys(contextBridge.exposeInMainWorld).length > 0 ? "OK" : "Failed");
