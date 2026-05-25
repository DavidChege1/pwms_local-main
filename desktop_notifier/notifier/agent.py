"""
Agent Module
============

The central orchestrator of the PWMS Desktop Notifier.  Manages the
WebSocket connection, fetches data from the API, and controls the
UI windows (Main Window, Tray, and Approval Dialogs).

Architecture:
    The ``NotifierAgent`` runs the Tkinter main loop and manages
    background threads for networking and the system tray.  All
    background-to-UI communication is handled via a thread-safe
    queue (``_ui_tasks``) to prevent threading errors.
"""

from __future__ import annotations

import queue
import threading
import time
from typing import Any, Dict, List, Optional
from tkinter import messagebox

from notifier.networking.api import fetch_dispatch_history, update_dispatch_status
from notifier.networking.websocket import NotificationClient
from notifier.ui.main_window import MainWindow
from notifier.ui.dialogs import ApprovalDialog
from notifier.ui.theme import setup_theme
from notifier.tray.icon import TrayIcon
from notifier.config import API_BASE_URL, PC_NAME, APP_NAME
from notifier.logger import log, setup_logging


class NotifierAgent:
    """The main application controller."""

    def __init__(self) -> None:
        setup_logging()
        log.info("--- Notifier Started (PC: %s) ---", PC_NAME)

        # Core State
        self._root = setup_theme()
        self._status = "OFFLINE"
        self._orders: List[Dict[str, Any]] = []
        self._active_dialogs: Dict[str, ApprovalDialog] = {}
        self._order_queue: List[str] = []  # IDs of orders needing popups

        # Thread-safe UI Task Queue
        self._ui_tasks: List[Dict[str, Any]] = []
        self._queue_lock = threading.Lock()

        # Components
        self._main_window = MainWindow(
            root=self._root,
            on_order_click=self._show_approval_dialog,
            on_sync=self._fetch_history,
        )
        self._ws_client = NotificationClient(
            on_message=self._handle_ws_message,
            on_status=self._handle_ws_status,
        )
        self._tray = TrayIcon(
            on_show=self._show_window,
            on_exit=self.stop,
        )

        # Initialization
        self._root.protocol("WM_DELETE_WINDOW", self._main_window.hide)
        self._root.withdraw()  # Root remains hidden; we use Toplevel windows

    def start(self) -> None:
        """Launch all background threads and enter the main loop."""
        self._ws_client.start()
        self._tray.start()
        
        # Initial fetch and start periodic background sync (every 30s)
        self._periodic_sync()

        # Start the UI task poller
        self._poll_queue()

        log.info("Entering Tk main loop.")
        self._root.mainloop()

    def _periodic_sync(self) -> None:
        """Fetch history and schedule next run."""
        self._fetch_history()
        # Schedule next sync in 30 seconds
        if self._root:
            self._root.after(30000, self._periodic_sync)

    def stop(self) -> None:
        """Gracefully shut down all components."""
        log.info("Shutting down…")
        self._ws_client.stop()
        self._tray.stop()
        if self._root:
            self._root.quit()
            self._root.destroy()

    # ------------------------------------------------------------------
    # Networking Handlers (Background Threads)
    # ------------------------------------------------------------------

    def _handle_ws_message(self, message: Dict[str, Any]) -> None:
        """Callback from WebSocket thread."""
        msg_type = message.get("type")
        data = message.get("data", {})

        if msg_type == "BULK_ORDER":
            log.info("WS message received: BULK_ORDER")
            self._enqueue_task("_fetch_history")
            self._enqueue_task("_play_alert", {"bulk": True})
        elif msg_type == "STATUS_UPDATE":
            log.info("WS message received: STATUS_UPDATE")
            self._enqueue_task("_handle_remote_update", data)
            self._enqueue_task("_fetch_history")

    def _handle_ws_status(self, status: str) -> None:
        """Callback from WebSocket thread regarding connection health."""
        self._enqueue_task("_set_status", status)

    def _fetch_history(self) -> None:
        """Fetch current dispatch history from the API."""
        def _do_fetch():
            try:
                orders = fetch_dispatch_history(API_BASE_URL)
                self._enqueue_task("_update_orders", orders)
            except Exception as e:
                log.error("Failed to fetch dispatch history: %s", e)

        threading.Thread(target=_do_fetch, daemon=True).start()

    # ------------------------------------------------------------------
    # UI Task Queue (Main Thread)
    # ------------------------------------------------------------------

    def _enqueue_task(self, task_type: str, data: Any = None) -> None:
        """Add a task to be executed by the main UI thread."""
        with self._queue_lock:
            # Deduplicate history fetches
            if task_type == "_fetch_history":
                if any(t["type"] == "_fetch_history" for t in self._ui_tasks):
                    return
            self._ui_tasks.append({"type": task_type, "data": data})

    def _poll_queue(self) -> None:
        """Regularly check the queue for background tasks to process."""
        with self._queue_lock:
            tasks = list(self._ui_tasks)
            self._ui_tasks.clear()

        for task in tasks:
            t_type = task["type"]
            t_data = task["data"]

            try:
                if t_type == "_fetch_history":
                    self._fetch_history()
                elif t_type == "_update_orders":
                    self._handle_new_data(t_data)
                elif t_type == "_handle_remote_update":
                    self._handle_remote_update(t_data)
                elif t_type == "_set_status":
                    self._set_status(t_data)
                elif t_type == "_play_alert":
                    self._play_alert_sound(t_data.get("bulk", False))
            except Exception as e:
                log.error("Error executing UI task %s: %s", t_type, e)

        if self._root:
            self._root.after(100, self._poll_queue)

    # ------------------------------------------------------------------
    # Application Logic (Main Thread)
    # ------------------------------------------------------------------

    def _handle_new_data(self, orders: List[Dict[str, Any]]) -> None:
        """Process freshly fetched order data."""
        self._orders = orders
        self._main_window.update_orders(self._orders)

        # Identify new PENDING orders that aren't already being handled
        pending_ids = [str(o["id"]) for o in orders if o.get("Status") == "PENDING"]
        for oid in pending_ids:
            if oid not in self._order_queue and not self._is_id_in_active_dialogs(oid):
                self._order_queue.append(oid)

        if self._order_queue:
            self._process_queue()

    def _is_id_in_active_dialogs(self, order_id: str) -> bool:
        """Check if an order ID is already part of an open dialog."""
        for dialog in self._active_dialogs.values():
            if any(str(item.get("id")) == str(order_id) for item in dialog._items):
                return True
        return False

    def _process_queue(self) -> None:
        """Show the next grouped dialog from the order queue."""
        if not self._order_queue:
            return

        # Look for pending items in our current state
        pending = [o for o in self._orders if str(o.get("id")) in self._order_queue]
        if not pending:
            self._order_queue.clear()
            return

        # Group by DocNum from first pending
        first = pending[0]
        doc_num = first.get("DocNum")
        group = [o for o in pending if str(o.get("DocNum")) == str(doc_num)]

        # Remove from queue
        for item in group:
            if str(item["id"]) in self._order_queue:
                self._order_queue.remove(str(item["id"]))

        if group:
            self._show_approval_dialog(group)

    def _show_approval_dialog(self, items: List[Dict[str, Any]]) -> None:
        """Open an approval dialog for the given items."""
        dialog = ApprovalDialog(
            root=self._root,
            items=items,
            on_submit=self._handle_approval_submit,
            on_close=self._handle_dialog_close,
        )

        if dialog.tracking_id in self._active_dialogs:
            self._active_dialogs[dialog.tracking_id].lift()
            return

        self._active_dialogs[dialog.tracking_id] = dialog
        dialog.show()

    def _handle_approval_submit(
        self,
        items: List[Dict[str, Any]],
        status: str,
        comments: str,
    ) -> None:
        """Process an approve/reject action from a dialog."""
        success_count = 0
        for item in items:
            if update_dispatch_status(API_BASE_URL, item["id"], status, comments):
                success_count += 1

        if success_count == len(items):
            doc = items[0].get("DocNum")
            msg = (
                f"All {len(items)} items in Doc #{doc} marked as {status}."
                if len(items) > 1
                else f"Order #{doc} marked as {status}."
            )
            messagebox.showinfo("Success", msg)
        else:
            messagebox.showwarning(
                "Partial Success",
                f"Updated {success_count}/{len(items)} items.",
            )

        self._fetch_history()

    def _handle_dialog_close(self, tracking_id: str) -> None:
        """Clean up after a dialog closes and check the queue."""
        self._active_dialogs.pop(tracking_id, None)
        # Use root.after here — this is called from main thread (UI click)
        if self._root:
            self._root.after(100, self._process_queue)

    def _handle_remote_update(self, order: Dict[str, Any]) -> None:
        """Close local dialog if another station processed the order."""
        order_id = str(order.get("id"))
        doc_num = str(order.get("DocNum"))
        status = order.get("status")

        # Check for single-item dialog OR group dialog for this DocNum
        tracking_id = None
        if order_id in self._active_dialogs:
            tracking_id = order_id
        elif f"group_{doc_num}" in self._active_dialogs:
            tracking_id = f"group_{doc_num}"

        if tracking_id:
            if status == "CANCELLED":
                messagebox.showwarning(
                    "Order Recalled",
                    f"⚠️ The Planner has RECALLED Order #{doc_num}.\n\nPlease ignore this request.",
                )
            else:
                messagebox.showinfo(
                    "Order Processed",
                    f"✅ SAP Doc #{doc_num} processed by another station.",
                )
            self._active_dialogs[tracking_id].close()

    # ------------------------------------------------------------------
    # Archive
    # ------------------------------------------------------------------

    def _confirm_archive(self) -> None:
        """Prompt and execute archive-all."""
        if messagebox.askyesno(
            "Archive History",
            "Archive all history? This clears the list on all PCs but keeps a server log.",
        ):
            # Not implemented in simple API; placeholder for full system
            messagebox.showinfo("Archive", "Archive command sent.")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _show_window(self) -> None:
        """Show the main orders window."""
        if self._main_window:
            self._main_window.show()

    def _set_status(self, status: str) -> None:
        """Update connection status and propagate to UI (main thread only)."""
        self._status = status
        if self._main_window:
            self._main_window.update_status(status)

    @staticmethod
    def _play_alert_sound(bulk: bool = False) -> None:
        """Play a notification sound."""
        # Optional: Use winsound or similar here.
        pass
