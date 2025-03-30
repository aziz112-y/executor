// Get DOM elements
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const machineKeyInput = document.getElementById('machine-key-input');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const logContent = document.getElementById('log-content');

// Connection state
let isConnected = false;

// Helper function to add a log entry
function addLogEntry(message) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = message;
  logContent.appendChild(entry);
  
  // Auto-scroll to bottom
  logContent.scrollTop = logContent.scrollHeight;
  
  // If logs are hidden, show them
  if (logContent.classList.contains('hidden')) {
    toggleLogs();
  }
}

// Function to toggle logs visibility
function toggleLogs() {
  const toggleIcon = document.getElementById('toggle-icon');
  
  if (logContent.classList.contains('hidden')) {
    logContent.classList.remove('hidden');
    toggleIcon.style.transform = 'rotate(0deg)';
  } else {
    logContent.classList.add('hidden');
    toggleIcon.style.transform = 'rotate(-90deg)';
  }
}

// Function to update connection status UI
function updateStatusUI(status) {
  statusIndicator.classList.remove('connected-indicator', 'disconnected-indicator', 'error-indicator');
  
  switch (status) {
    case 'connected':
      statusIndicator.classList.add('connected-indicator');
      statusText.textContent = 'Status: Connected';
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
      machineKeyInput.disabled = true;
      isConnected = true;
      break;
    case 'disconnected':
      statusIndicator.classList.add('disconnected-indicator');
      statusText.textContent = 'Status: Disconnected';
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      machineKeyInput.disabled = false;
      isConnected = false;
      break;
    case 'error':
      statusIndicator.classList.add('error-indicator');
      statusText.textContent = 'Status: Connection Error';
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      machineKeyInput.disabled = false;
      isConnected = false;
      break;
    default:
      statusIndicator.classList.add('disconnected-indicator');
      statusText.textContent = 'Status: Disconnected';
      isConnected = false;
  }
}

// Initialize with disconnected status
updateStatusUI('disconnected');

// Check if window.api is defined
if (typeof window.api === 'undefined') {
  addLogEntry('Error: window.api is not defined!');
} else {
  // Connect button event listener
  connectBtn.addEventListener('click', async () => {
    const machineKey = machineKeyInput.value.trim();
    
    if (!machineKey) {
      addLogEntry('Error: Machine API Key is required');
      return;
    }
    
    try {
      connectBtn.disabled = true;
      addLogEntry(`Connecting with key: ${machineKey}...`);
      
      // Ensure connect function exists on window.api
      if (typeof window.api.connect !== 'function') {
        addLogEntry('Error: connect method is not defined in window.api');
        return;
      }
      
      const result = await window.api.connect(machineKey);
      
      if (result.success) {
        addLogEntry('Connection request sent successfully');
        updateStatusUI('connected');
      } else {
        addLogEntry(`Connection failed: ${result.error}`);
        updateStatusUI('error');
      }
    } catch (error) {
      addLogEntry(`Error: ${error.message}`);
      updateStatusUI('error');
      connectBtn.disabled = false;
    }
  });

  // Disconnect button event listener
  disconnectBtn.addEventListener('click', async () => {
    try {
      disconnectBtn.disabled = true;
      addLogEntry('Disconnecting...');
      
      // Ensure disconnect function exists on window.api
      if (typeof window.api.disconnect !== 'function') {
        addLogEntry('Error: disconnect method is not defined in window.api');
        return;
      }
      
      const result = await window.api.disconnect();
      
      if (result.success) {
        addLogEntry('Disconnected successfully');
        updateStatusUI('disconnected');
      } else {
        addLogEntry(`Disconnection failed: ${result.error}`);
      }
    } catch (error) {
      addLogEntry(`Error: ${error.message}`);
      updateStatusUI('error');
    }
  });

  // Listen for log messages from main process
  window.api.onLogMessage((message) => {
    addLogEntry(message);
  });

  // Listen for connection status updates from main process
  window.api.onConnectionStatus((status) => {
    updateStatusUI(status);
  });
}
