import asyncio
import json
import threading
from typing import Any, Callable, Dict, List, Optional
import websockets

from notifier.logger import log
from notifier.config import WS_URL, WS_URL_FALLBACK

class NotificationClient:
    def __init__(
        self,
        on_message: Callable[[Dict[str, Any]], None],
        on_status: Callable[[str], None],
    ) -> None:
        self._on_message = on_message
        self._on_status = on_status
        self._ws_urls = [WS_URL, WS_URL_FALLBACK]
        self._stop_event: Optional[asyncio.Event] = None
        self._thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._loop and self._stop_event:
            self._loop.call_soon_threadsafe(self._stop_event.set)
        if self._thread:
            self._thread.join(timeout=2)

    def _run_loop(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._stop_event = asyncio.Event()

        def _handle_msg(msg: Dict[str, Any]) -> None:
            msg_type = msg.get("type")
            if msg_type == "_CONNECTED":
                self._on_status("ONLINE")
            elif msg_type == "_DISCONNECTED":
                self._on_status("OFFLINE")
            else:
                self._on_message(msg)

        try:
            self._loop.run_until_complete(
                self._listen(self._ws_urls, _handle_msg, self._stop_event)
            )
        finally:
            self._loop.close()

    async def _listen(
        self,
        ws_urls: List[str],
        on_message: Callable[[Dict[str, Any]], None],
        stop_event: asyncio.Event,
        reconnect_delay: float = 5.0,
    ) -> None:
        url_index = 0
        while not stop_event.is_set():
            current_url = ws_urls[url_index % len(ws_urls)]
            try:
                log.info("Attempting WS connection to %s …", current_url)
                async with websockets.connect(
                    current_url,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=10,
                ) as websocket:
                    log.info("Connected to %s", current_url)
                    on_message({"type": "_CONNECTED", "url": current_url})
                    
                    while not stop_event.is_set():
                        try:
                            raw = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                            try:
                                data = json.loads(raw)
                                log.info("WS message received: %s", data.get("type"))
                                on_message(data)
                            except json.JSONDecodeError as exc:
                                log.error("Failed to decode WS message: %s", exc)
                        except asyncio.TimeoutError:
                            pass
                            
            except Exception as exc:
                log.error("WS connection to %s failed: %s", current_url, exc)
                on_message({"type": "_DISCONNECTED", "error": str(exc)})
                url_index += 1
                if not stop_event.is_set():
                    await asyncio.sleep(reconnect_delay)
