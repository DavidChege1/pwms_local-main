import os
import pystray
from PIL import Image, ImageDraw
import threading
from typing import Callable, Optional

from notifier.config import APP_NAME, config
from notifier.logger import log

def create_default_icon() -> Image.Image:
    image = Image.new("RGB", (64, 64), color=(79, 70, 229))  # Indigo #4f46e5
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((14, 14, 50, 50), radius=8, fill=(255, 255, 255))
    return image

class TrayIcon:
    def __init__(
        self,
        on_show: Callable[[], None],
        on_exit: Callable[[], None],
    ) -> None:
        self._on_show = on_show
        self._on_exit = on_exit
        self._icon: Optional[pystray.Icon] = None

    def start(self) -> None:
        dashboard_url = f"http://{config['server_ip']}:9091"

        menu = pystray.Menu(
            pystray.MenuItem("Show Orders", lambda: self._on_show()),
            pystray.MenuItem("Open Dashboard (Web)", lambda: os.system(f"start {dashboard_url}")),
            pystray.MenuItem("Exit", lambda: self._on_exit()),
        )

        self._icon = pystray.Icon(APP_NAME, create_default_icon(), APP_NAME, menu)
        log.info("System tray icon started.")
        threading.Thread(target=self._icon.run, daemon=True).start()

    def stop(self) -> None:
        if self._icon:
            self._icon.stop()
            log.info("System tray icon stopped.")
