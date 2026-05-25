"""
Main Window Module
==================

The primary dispatch hub interface.  Displays a card-based list of
dispatch orders grouped by SAP document number, with search, status
badges, and connection indicators.

Architecture:
    ``MainWindow`` is a ``CTkToplevel`` that receives order data
    from the agent and renders it.  It communicates back via callbacks
    (e.g. ``on_order_click``) — it never calls networking functions directly.
"""

from __future__ import annotations

import customtkinter as ctk
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

from notifier.config import APP_NAME, PC_NAME
from notifier.ui.theme import Colors, Fonts, Spacing


class MainWindow:
    """Manages the dispatch hub top-level window.

    Args:
        root:           The CTk root window (parent).
        on_order_click: Callback with list of order dicts for approval.
        on_sync:        Callback when user presses Sync.
    """

    def __init__(
        self,
        root: ctk.CTk,
        on_order_click: Callable[[List[Dict[str, Any]]], None],
        on_sync: Callable[[], None],
    ) -> None:
        self._root = root
        self._on_order_click = on_order_click
        self._on_sync = on_sync
        self._window: Optional[ctk.CTkToplevel] = None
        self._search_var = ctk.StringVar()
        self._orders: List[Dict[str, Any]] = []
        self._status_badge: Optional[ctk.CTkLabel] = None
        self._pending_badge: Optional[ctk.CTkLabel] = None
        self._scroll_frame: Optional[ctk.CTkScrollableFrame] = None
        self._last_status: str = "OFFLINE"  # Cache status for late window creation

    def show(self) -> None:
        """Show the main window, creating it if needed."""
        if self._window is None or not self._window.winfo_exists():
            self._build()
        self._window.deiconify()
        self._window.lift()
        self._window.focus_force()

    def hide(self) -> None:
        """Hide the main window without destroying it."""
        if self._window and self._window.winfo_exists():
            self._window.withdraw()

    def update_orders(self, orders: List[Dict[str, Any]]) -> None:
        """Replace order data and refresh display."""
        self._orders = orders
        self._refresh()

    def update_status(self, status: str) -> None:
        """Update the connection status badge."""
        self._last_status = status  # Always cache the latest status
        if not self._status_badge:
            return
        colour_map = {
            "ONLINE": Colors.ONLINE,
            "CONNECTING": Colors.CONNECTING,
            "OFFLINE": Colors.OFFLINE,
        }
        colour = colour_map.get(status, Colors.OFFLINE)
        self._status_badge.configure(text=f"  ● {status}  ", text_color=colour)

    def _build(self) -> None:
        """Construct the entire window layout."""
        self._window = ctk.CTkToplevel(self._root)
        self._window.title(APP_NAME)
        self._window.geometry("1150x700")
        self._window.configure(fg_color=Colors.BG_PRIMARY)
        self._window.protocol("WM_DELETE_WINDOW", self.hide)
        self._build_header()
        self._build_column_headers()
        self._build_scroll_area()
        # Apply the cached status so it reflects the actual connection state
        self.update_status(self._last_status)
        self._refresh()

    def _build_header(self) -> None:
        """Build the top header bar."""
        header = ctk.CTkFrame(self._window, fg_color=Colors.BG_SECONDARY, corner_radius=0, height=70)
        header.pack(fill="x", pady=(0, 2))
        header.pack_propagate(False)

        left = ctk.CTkFrame(header, fg_color="transparent")
        left.pack(side="left", padx=Spacing.XL)

        ctk.CTkLabel(left, text="PWMS Dispatch Hub", font=Fonts.HEADING_LG, text_color=Colors.TEXT_PRIMARY).pack(side="left")

        self._status_badge = ctk.CTkLabel(left, text="  ● OFFLINE  ", font=Fonts.BADGE, text_color=Colors.OFFLINE, fg_color=Colors.BG_PRIMARY, corner_radius=12)
        self._status_badge.pack(side="left", padx=(Spacing.LG, Spacing.SM))

        self._pending_badge = ctk.CTkLabel(left, text="  0 PENDING  ", font=Fonts.BADGE, text_color=Colors.WARNING, fg_color=Colors.WARNING_BG, corner_radius=12)
        self._pending_badge.pack(side="left", padx=Spacing.XS)

        ctk.CTkLabel(left, text=f"  📍 {PC_NAME}", font=Fonts.CAPTION, text_color=Colors.TEXT_SECONDARY).pack(side="left", padx=(Spacing.LG, 0))

        right = ctk.CTkFrame(header, fg_color="transparent")
        right.pack(side="right", padx=Spacing.XL)

        self._search_var.trace_add("write", lambda *_: self._refresh())
        ctk.CTkEntry(right, textvariable=self._search_var, placeholder_text="Search orders…", width=220, height=36, font=Fonts.BODY, fg_color=Colors.BG_INPUT, border_color=Colors.BORDER, text_color=Colors.TEXT_PRIMARY, corner_radius=18).pack(side="left", padx=(0, Spacing.SM))

        ctk.CTkButton(right, text="↻ Sync", command=self._on_sync, font=Fonts.BODY_BOLD, fg_color=Colors.ACCENT, hover_color=Colors.ACCENT_HOVER, text_color=Colors.TEXT_ON_ACCENT, corner_radius=18, height=36, width=100).pack(side="left")

    def _build_column_headers(self) -> None:
        """Build the column header row above the card list."""
        col_header = ctk.CTkFrame(self._window, fg_color=Colors.BG_SECONDARY, corner_radius=0, height=40)
        col_header.pack(fill="x", padx=Spacing.XL, pady=(Spacing.LG, 0))
        col_header.pack_propagate(False)

        for text, width in [("SAP Doc #", 100), ("Customer", 200), ("Items", 60), ("Total Qty", 100), ("Status", 100), ("Date", 90), ("Time", 80), ("User", 100)]:
            ctk.CTkLabel(col_header, text=text, font=Fonts.CAPTION_BOLD, text_color=Colors.TEXT_SECONDARY, width=width, anchor="w").pack(side="left", padx=Spacing.SM)

    def _build_scroll_area(self) -> None:
        """Build the scrollable card list area."""
        self._scroll_frame = ctk.CTkScrollableFrame(self._window, fg_color=Colors.BG_PRIMARY, corner_radius=0)
        self._scroll_frame.pack(fill="both", expand=True, padx=Spacing.XL, pady=(0, Spacing.LG))

    def _refresh(self) -> None:
        """Re-render the order cards based on current data and search filter."""
        if not self._scroll_frame or not self._scroll_frame.winfo_exists():
            return

        for child in self._scroll_frame.winfo_children():
            child.destroy()

        grouped = self._group_orders()
        query = self._search_var.get().lower()

        pending_count = sum(1 for o in self._orders if o.get("Status") == "PENDING")
        if self._pending_badge:
            self._pending_badge.configure(
                text=f"  {pending_count} PENDING  ",
                text_color=Colors.WARNING if pending_count > 0 else Colors.TEXT_SECONDARY,
                fg_color=Colors.WARNING_BG if pending_count > 0 else Colors.BG_PRIMARY,
            )

        if not grouped:
            ctk.CTkLabel(self._scroll_frame, text="No dispatch orders found", font=Fonts.BODY, text_color=Colors.TEXT_SECONDARY).pack(pady=60)
            return

        for doc_num, group in grouped.items():
            if query and not self._matches_query(group, query):
                continue
            self._render_group_card(doc_num, group)

    def _group_orders(self) -> Dict[str, Dict[str, Any]]:
        """Group orders by DocNum and compute aggregate status."""
        grouped: Dict[str, Dict[str, Any]] = {}
        for o in self._orders:
            doc_num = str(o.get("DocNum", ""))
            if doc_num not in grouped:
                grouped[doc_num] = {"DocNum": doc_num, "Customer": o.get("Customer", ""), "items": [], "Status": "APPROVED", "Time": o.get("TimeSent", "")}
            grouped[doc_num]["items"].append(o)

        for group in grouped.values():
            statuses = [i.get("Status", "UNKNOWN") for i in group["items"]]
            if "PENDING" in statuses:
                group["Status"] = "PENDING"
            elif all(s == "APPROVED" for s in statuses):
                group["Status"] = "APPROVED"
            elif "REJECTED" in statuses:
                group["Status"] = "REJECTED"
        return grouped

    @staticmethod
    def _matches_query(group: Dict[str, Any], query: str) -> bool:
        """Check if any field in the group matches the search query."""
        if query in group["DocNum"].lower():
            return True
        if query in group["Customer"].lower():
            return True
        return any(
            query in str(i.get("ProductCode", "")).lower() or query in str(i.get("Description", "")).lower()
            for i in group["items"]
        )

    def _render_group_card(self, doc_num: str, group: Dict[str, Any]) -> None:
        """Render a single group card in the scroll frame."""
        items = group["items"]
        status = group["Status"]

        card = ctk.CTkFrame(self._scroll_frame, fg_color=Colors.BG_CARD, corner_radius=10, border_width=1, border_color=Colors.BORDER)
        card.pack(fill="x", pady=(0, Spacing.SM))

        pending_items = [i for i in items if i.get("Status") == "PENDING"]
        if pending_items:
            card.configure(cursor="hand2")
            card.bind("<Enter>", lambda e, c=card: c.configure(fg_color=Colors.BG_CARD_HOVER))
            card.bind("<Leave>", lambda e, c=card: c.configure(fg_color=Colors.BG_CARD))
            card.bind("<Button-1>", lambda e, pi=pending_items: self._on_order_click(pi))

        summary = ctk.CTkFrame(card, fg_color="transparent")
        summary.pack(fill="x", padx=Spacing.CARD_PAD, pady=Spacing.CARD_PAD)

        doc_lbl = ctk.CTkLabel(summary, text=doc_num, font=Fonts.HEADING_SM, text_color=Colors.ACCENT, width=100, anchor="w")
        doc_lbl.pack(side="left", padx=(0, Spacing.SM))

        cust_lbl = ctk.CTkLabel(summary, text=group["Customer"], font=Fonts.BODY, text_color=Colors.TEXT_PRIMARY, width=200, anchor="w")
        cust_lbl.pack(side="left", padx=Spacing.SM)

        ctk.CTkLabel(summary, text=f"{len(items)} items", font=Fonts.BODY, text_color=Colors.TEXT_SECONDARY, width=60, anchor="w").pack(side="left", padx=Spacing.SM)

        # Total quantity across all items in this group
        total_qty = sum(float(i.get("Quantity", 0) or 0) for i in items)
        try:
            qty_text = f"{total_qty:,.0f}"
        except (ValueError, TypeError):
            qty_text = str(total_qty)
        ctk.CTkLabel(summary, text=qty_text, font=Fonts.BODY_BOLD, text_color=Colors.SUCCESS, width=100, anchor="w").pack(side="left", padx=Spacing.SM)

        s_color, s_bg = self._status_colors(status)
        ctk.CTkLabel(summary, text=f"  {status}  ", font=Fonts.BADGE, text_color=s_color, fg_color=s_bg, corner_radius=10, width=100).pack(side="left", padx=Spacing.SM)

        date_str, time_str = self._format_time(group["Time"])
        ctk.CTkLabel(summary, text=date_str, font=Fonts.CAPTION, text_color=Colors.TEXT_SECONDARY, width=90, anchor="w").pack(side="left", padx=Spacing.SM)
        ctk.CTkLabel(summary, text=time_str, font=Fonts.CAPTION, text_color=Colors.TEXT_SECONDARY, width=80, anchor="w").pack(side="left", padx=Spacing.SM)

        # Show who processed the order (or Recipient for PENDING)
        if status != "PENDING":
            processor = self._extract_processor(items[0].get("Comments", ""))
            if processor:
                ctk.CTkLabel(
                    summary, text=f"👤 {processor}",
                    font=Fonts.CAPTION_BOLD, text_color=Colors.ACCENT,
                    width=100, anchor="w"
                ).pack(side="left", padx=Spacing.SM)
        else:
            recipient = items[0].get("Recipient", "dispatch")
            ctk.CTkLabel(
                summary, text=f"📡 {recipient}",
                font=Fonts.CAPTION_BOLD, text_color=Colors.WARNING,
                width=100, anchor="w"
            ).pack(side="left", padx=Spacing.SM)

        # Bind click to all labels in summary
        for widget in summary.winfo_children():
            if pending_items:
                widget.bind("<Button-1>", lambda e, pi=pending_items: self._on_order_click(pi))

        # Expandable details for all orders
        details_frame = ctk.CTkFrame(card, fg_color="transparent")
        details_visible = [False]

        def toggle(event=None, df=details_frame, dv=details_visible, its=items):
            if dv[0]:
                df.pack_forget()
                dv[0] = False
            else:
                df.pack(fill="x", padx=(Spacing.CARD_PAD + Spacing.LG, Spacing.CARD_PAD), pady=(0, Spacing.CARD_PAD))
                self._render_item_details(df, its)
                dv[0] = True

        expand_btn = ctk.CTkLabel(summary, text="▸ Details", font=Fonts.CAPTION_BOLD, text_color=Colors.ACCENT, cursor="hand2")
        expand_btn.pack(side="right", padx=Spacing.SM)
        expand_btn.bind("<Button-1>", toggle)

    def _render_item_details(self, parent: ctk.CTkFrame, items: List[Dict[str, Any]]) -> None:
        """Render individual item rows inside an expanded group card."""
        for child in parent.winfo_children():
            child.destroy()

        ctk.CTkFrame(parent, fg_color=Colors.BORDER, height=1, corner_radius=0).pack(fill="x", pady=(0, Spacing.SM))

        # Consolidate items by ProductCode before rendering
        display_items: Dict[str, Dict[str, Any]] = {}
        for item in items:
            code = item.get("ProductCode", "Unknown")
            if code not in display_items:
                display_items[code] = item.copy()
                try:
                    display_items[code]["Quantity"] = float(item.get("Quantity", 0))
                except (ValueError, TypeError):
                    display_items[code]["Quantity"] = 0
            else:
                try:
                    display_items[code]["Quantity"] += float(item.get("Quantity", 0))
                except (ValueError, TypeError):
                    pass

        for item in display_items.values():
            row = ctk.CTkFrame(parent, fg_color="transparent", height=30)
            row.pack(fill="x", pady=2)
            row.pack_propagate(False)

            i_status = item.get("Status", "UNKNOWN")
            i_color, _ = self._status_colors(i_status)

            ctk.CTkLabel(row, text=item.get("ProductCode", ""), font=Fonts.BODY_BOLD, text_color=Colors.TEXT_PRIMARY, width=120, anchor="w").pack(side="left")
            ctk.CTkLabel(row, text=item.get("Description", ""), font=Fonts.BODY_SM, text_color=Colors.TEXT_SECONDARY, anchor="w").pack(side="left", fill="x", expand=True, padx=Spacing.SM)

            qty = item.get("Quantity", 0)
            try:
                qty_text = f"{float(qty):,.0f}"
            except (ValueError, TypeError):
                qty_text = str(qty)

            ctk.CTkLabel(row, text=f"Qty: {qty_text}", font=Fonts.BODY_BOLD, text_color=Colors.SUCCESS, width=100, anchor="e").pack(side="right", padx=(Spacing.SM, 0))
            ctk.CTkLabel(row, text=i_status, font=Fonts.CAPTION_BOLD, text_color=i_color, width=80, anchor="center").pack(side="right")

    @staticmethod
    def _status_colors(status: str) -> tuple:
        """Return (text_color, bg_color) for a status badge."""
        mapping = {
            "APPROVED": (Colors.SUCCESS, Colors.SUCCESS_BG),
            "PENDING": (Colors.WARNING, Colors.WARNING_BG),
            "REJECTED": (Colors.DANGER, Colors.DANGER_BG),
        }
        return mapping.get(status, (Colors.TEXT_SECONDARY, Colors.BG_PRIMARY))

    @staticmethod
    def _format_time(full_ts: str) -> tuple:
        """Parse an ISO timestamp into (date_str, time_str) in EAT (UTC+3)."""
        try:
            ts_clean = full_ts.replace("Z", "").replace("T", " ")
            if "." in ts_clean:
                ts_clean = ts_clean.split(".")[0]
            dt = datetime.strptime(ts_clean, "%Y-%m-%d %H:%M:%S")
            eat_dt = dt + timedelta(hours=3)
            return eat_dt.strftime("%Y-%m-%d"), eat_dt.strftime("%I:%M %p")
        except (ValueError, AttributeError):
            if "T" in full_ts:
                parts = full_ts.split("T")
                return parts[0], parts[1].split("Z")[0]
            return "", full_ts
    @staticmethod
    def _extract_processor(comments: str) -> str:
        """Extract the PC name from the standardized comment suffix."""
        if not comments:
            return ""
        if "by " in comments:
            try:
                # Extracts "NAME" from "Notes (Updated by NAME)"
                return comments.split("by ")[-1].rstrip(")")
            except IndexError:
                pass
        return ""
