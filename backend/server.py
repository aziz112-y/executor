import sys
import socketio
import logging
import platform
import json
import base64
import pyautogui
import re
from datetime import datetime
from io import BytesIO
from PIL import ImageGrab, Image  # ImageGrab works on Windows/macOS
import time

# Platform-specific imports
if platform.system() == "Linux":
    import pyscreenshot as ImageGrab  # Use pyscreenshot on Linux

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
# Ensure logs are written to stdout
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
stream_handler.setFormatter(formatter)
logger.addHandler(stream_handler)

def parse_command(command_string):
    m = re.match(r"(\w+)\((.*)\)", command_string)
    if not m:
        return None, None
    action = m.group(1).lower()
    args_str = m.group(2).strip()
    if action in ["click", "move", "right_click", "left_click_drag", "double_click", "middle_click", "cursor_position"]:
        parts = args_str.split(",")
        if len(parts) == 2:  # For "move", "click", "right_click", etc.
            try:
                x = int(parts[0].strip())
                y = int(parts[1].strip())
                return action, (x, y)
            except ValueError:
                return action, None
        elif action == "cursor_position":
            return action, None  # No params needed for cursor position
        else:
            return action, None  # No extra parameters needed
    elif action == "type":
        m_text = re.match(r"['\"](.*)['\"]", args_str)
        if m_text:
            text = m_text.group(1)
        else:
            text = args_str
        return action, text
    elif action == "press":
        m_text = re.match(r"['\"](.*)['\"]", args_str)
        if m_text:
            keys = m_text.group(1)
        else:
            keys = args_str
        return action, keys
    else:
        return action, args_str
        
def capture_screen_with_cursor():
    user_platform = platform.system()
    
    if user_platform == "Windows":
        screenshot = pyautogui.screenshot()
    elif user_platform == "Linux":
        import Xlib.display
        import Xlib.X
        import Xlib.Xutil
        display = Xlib.display.Display()
        screen = display.screen()
        size = (screen.width_in_pixels, screen.height_in_pixels)
        screenshot = ImageGrab.grab(bbox=(0, 0, size[0], size[1]))

        # Add cursor to screenshot (this is an example; you'd need to get the actual cursor image)
        cursor = Image.open("cursor_image.png")  # Example: Replace with cursor image if necessary
        cursor_position = pyautogui.position()  # Use pyautogui to get cursor position
        screenshot.paste(cursor, (cursor_position[0], cursor_position[1]), cursor)  # Paste cursor over the screenshot
    
    elif user_platform == "Darwin":  # (Mac OS)
        screenshot = subprocess.run(["screencapture", "-C", "-"], capture_output=True)
        screenshot = Image.open(screenshot.stdout)  # Open the image from subprocess output
    
    else:
        print(f"The platform you're using ({user_platform}) is not currently supported")
        return None

    return screenshot


class ScreenCaptureClient:
    def __init__(self, machine_key, server_url="https://api-cs.consciousstage.com"):
        self.machine_key = machine_key
        self.server_url = server_url
        self.sio = socketio.Client()
        self.setup_socket_handlers()
        # Configure PyAutoGUI
        pyautogui.FAILSAFE = True
        # Handle platform-specific imports
        if platform.system() == "Linux":
            import pyscreenshot as ImageGrab
    def setup_socket_handlers(self):
        
        @self.sio.on('connect')
        def on_connect():
            self.sio.emit('join_machine_room', {'machineKey': self.machine_key, 'isMachine': True})
        
        @self.sio.on('disconnect')
        def on_disconnect():
            logger.info('Disconnected from server')
            
        @self.sio.on('request_screenshot')
        def on_request_screenshot(data):
            logger.info('Screenshot requested')
            self.capture_and_send_screenshot()

        @self.sio.on('perform_action')
        def on_perform_action(data):
            command = data.get("command")
            if command:
                logger.info(f"Performing action: {command}")
                action_type, params = parse_command(command)
                if action_type is None or params is None:
                    logger.error(f"Could not parse command: {command}")
                else:
                    success = self.perform_action(action_type, params)
                    if success:
                        logger.info(f"Action {action_type} performed successfully.")
                    else:
                        logger.error(f"Action {action_type} failed.")
            else:
                logger.error("No command provided in perform_action event")
            self.capture_and_send_screenshot()

    def perform_action(self, action_type, params=None):
        print(f"Performing action: {action_type} with params: {params}")
        try:
            if action_type == "move":
                x, y = params
                pyautogui.moveTo(x=x, y=y)
                time.sleep(0.5)
                return True
            elif action_type == "click":
                x, y = params
                pyautogui.click(x=x, y=y)
                time.sleep(0.5)
                return True
            elif action_type == "right_click":
                x, y = params
                pyautogui.rightClick(x=x, y=y)
                time.sleep(0.5)
                return True
            elif action_type == "left_click_drag":
                start_x, start_y = params[0]
                end_x, end_y = params[1]
                pyautogui.moveTo(start_x, start_y)
                pyautogui.mouseDown()
                pyautogui.moveTo(end_x, end_y)
                pyautogui.mouseUp()
                time.sleep(0.5)
                return True
            elif action_type == "double_click":
                x, y = params
                pyautogui.doubleClick(x=x, y=y)
                time.sleep(0.5)
                return True
            elif action_type == "middle_click":
                x, y = params
                pyautogui.middleClick(x=x, y=y)
                time.sleep(0.5)
                return True
            elif action_type == "type":
                text = params
                pyautogui.write(text)
                time.sleep(0.5)
                return True
            elif action_type == "press":
                keys = params.lower().split("+")
                if "super" in keys:
                    keys.remove("super")
                    if platform.system() == "Windows":
                        keys.insert(0, "win")
                    elif platform.system() == "Darwin":
                        keys.insert(0, "command")
                    elif platform.system() == "Linux":
                        keys.insert(0, "win")
                pyautogui.hotkey(*keys)
                time.sleep(0.5)
                return True
            else:
                logger.error(f"Unknown action type: {action_type}")
                return False
        except Exception as e:
            logger.error(f"Error performing action {action_type}: {e}")
            return False

    def capture_screenshot(self):
        try:
            screenshot = capture_screen_with_cursor()
            return screenshot
        except Exception as e:
            print(f"Error capturing screenshot: {str(e)}")
            return None    
            
    def compress_image(self, image, quality=70, max_size=(1280, 720)):
        """
        Compress the image by reducing quality and resizing if necessary.
        
        Args:
            image: PIL Image object
            quality: JPEG quality (0-100)
            max_size: Maximum dimensions (width, height)
            
        Returns:
            Compressed PIL Image object
        """
        try:
            # Check if image needs resizing
            original_size = image.size
            width, height = original_size
            
            # Resize if image is larger than max_size
            if width > max_size[0] or height > max_size[1]:
                # Calculate aspect ratio
                aspect_ratio = width / height
                
                if width > height:
                    new_width = max_size[0]
                    new_height = int(new_width / aspect_ratio)
                else:
                    new_height = max_size[1]
                    new_width = int(new_height * aspect_ratio)
                
                # Resize image
                image = image.resize((new_width, new_height), Image.LANCZOS)
                logger.info(f'Resized image from {original_size} to {image.size}')
            
            # Return the image (it will be compressed when saved)
            return image
            
        except Exception as e:
            logger.error(f'Error compressing image: {str(e)}')
            # Return the original image if compression fails
            return image
            
    def capture_and_send_screenshot(self):
        try:
            screenshot = self.capture_screenshot()
            if screenshot:
                # Compress the screenshot before sending
                compressed_screenshot = self.compress_image(screenshot)
                
                buffer = BytesIO()
                # Save as JPEG with quality setting for further compression
                compressed_screenshot.save(buffer, format='JPEG', quality=70, optimize=True)
                
                # Get the size of the compressed image in bytes
                file_size = buffer.tell()
                buffer.seek(0)
                
                b64_screenshot = base64.b64encode(buffer.getvalue()).decode('utf-8')
                
                metadata = {
                    'timestamp': datetime.now().isoformat(),
                    'platform': platform.system(),
                    'resolution': compressed_screenshot.size,
                    'original_resolution': screenshot.size,
                    'file_size_kb': round(file_size / 1024, 2),
                    'format': 'JPEG'
                }
                
                logger.info(f'Screenshot compressed: {metadata["file_size_kb"]} KB, resolution: {metadata["resolution"]}')
                
                self.sio.emit('screenshot_data', {
                    'machineKey': self.machine_key,
                    'screenshot': b64_screenshot,
                    'metadata': metadata
                })
                logger.info('Screenshot sent successfully')
            else:
                self.sio.emit('screenshot_error', {
                    'machineKey': self.machine_key,
                    'error': 'Failed to capture screenshot',
                    'timestamp': datetime.now().isoformat()
                })
        except Exception as e:
            error_msg = f'Error in capture_and_send_screenshot: {str(e)}'
            logger.error(error_msg)
            self.sio.emit('screenshot_error', {
                'machineKey': self.machine_key,
                'error': error_msg,
                'timestamp': datetime.now().isoformat()
            })

    def connect(self):
        try:
            self.sio.connect(
                self.server_url,
                headers={'machine-key': self.machine_key},
                wait_timeout=10
            )
        except Exception as e:
            logger.error(f'Connection error: {str(e)}')

    def disconnect(self):
        try:
            logger.info(f"Attempting to disconnect from server for machine: {self.machine_key}")
            self.sio.disconnect()
            logger.info(f"Disconnected from server for machine: {self.machine_key}")
        except Exception as e:
            logger.error(f'Error during disconnection: {str(e)}')

    def run(self):
        try:
            self.connect()
            self.sio.wait()
        except KeyboardInterrupt:
            logger.info("Shutting down client...")
            self.sio.disconnect()
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            self.sio.disconnect()

def main():
     # Get machine key from command line argument
     if len(sys.argv) > 1:
         machine_key = sys.argv[1]
     else:
         print("No machine key provided")
         return
         
     try:
         client = ScreenCaptureClient(machine_key)
         client.run()
     except Exception as e:
         print(f"Client crashed: {e} - Restarting in 5 seconds...")
         time.sleep(5)

if __name__ == "__main__":
    main()

"""
**Testing without GUI**

def main():
    machine_key = input("enter machine key: ")
    try:
        client = ScreenCaptureClient(machine_key)
        client.run()
    except Exception as e:
        logger.error(f"Client crashed: {e} - Restarting in 5 seconds...")
        time.sleep(5)

if __name__ == "__main__":
    main()
