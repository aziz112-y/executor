#!/bin/bash

set -e  # Exit if any command fails

echo "⚙️ Running post-installation script..."

# Ensure dependencies are installed
echo "🔍 Checking dependencies..."
REQUIRED_PACKAGES=("libc6" "libexpat1")

for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if ! dpkg -s "$pkg" &>/dev/null; then
        echo "⚠️ Package $pkg is missing. Installing..."
        sudo apt update
        sudo apt install -y "$pkg"
    else
        echo "✅ $pkg is already installed."
    fi
done

# Make backend executable
chmod +x /opt/Executor/resources/backend/server.bin

# Create a systemd service for the backend
SERVICE_FILE="/etc/systemd/system/executor-backend.service"

if [ ! -f "$SERVICE_FILE" ]; then
    echo "📝 Creating systemd service..."
    sudo bash -c "cat > $SERVICE_FILE" <<EOL
[Unit]
Description=Executor Backend Service
After=network.target

[Service]
ExecStart=/opt/Executor/resources/backend/server.bin
Restart=always
User=$(whoami)
WorkingDirectory=/opt/Executor/resources/backend/
StandardOutput=syslog
StandardError=syslog

[Install]
WantedBy=multi-user.target
EOL

    sudo systemctl daemon-reload
    sudo systemctl enable executor-backend.service
    sudo systemctl start executor-backend.service
    echo "✅ Service executor-backend started."
else
    echo "✅ Systemd service already exists."
fi

sudo chown root /opt/Executor/chrome-sandbox
sudo chmod 4755 /opt/Executor/chrome-sandbox

echo "✅ Installation Complete!"
