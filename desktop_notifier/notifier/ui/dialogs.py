"""
Dialogs Module
==============

Modal approval / rejection dialogs for dispatch orders.

Supports both single-item and batch (multi-item) modes.
Dialogs are ``CTkToplevel`` windows styled with the application
dark theme and communicate results via callbacks.
"""

from __future__ import annotations

import customtkinter as ctk
from typing import Any, Callable, Dict, List, Optional

from notifier.config import PC_NAME
from notifier.ui.theme import Colors, Fonts, Spacing
from notifier.logger import log


class ApprovalDialog:
    """An approval / rejection dialog for one or more dispatch items.

    Args:
        root:       The CTk root or parent window.
        items:      List of dispatch signal dicts to present.
        on_submit:  ``callback(items, status, comments)`` invoked when the
                    user clicks Approve or Reject.
        on_close:   ``callback(tracking_id)`` invoked when the dialog closes.
    """

    def __init__(
        self,
        root: ctk.CTk,
        items: List[Dict[str, Any]],
        on_submit: Callable[[List[Dict], str, str], None],
        on_close: Callable[[str], None],
    ) -> None:
        self._root = root
        self._items = items if isinstance(items, list) else [items]
        self._on_submit = on_submit
        self._on_close = on_close
        self._is_batch = len(self._items) > 1

        self._tracking_id = (
            f"group_{self._items[0].get('DocNum')}"
            if self._is_batch
            else str(self._items[0].get("id"))
        )
        self._dialog: Optional[ctk.CTkToplevel] = None
        self._comment_entry: Optional[ctk.CTkEntry] = None
        self._buttons: List[ctk.CTkButton] = []

    @property
    def tracking_id(self) -> str:
        """Unique ID for tracking this dialog instance."""
        return self._tracking_id

    def show(self) -> None:
        """Build and display the dialog."""
        self._dialog = ctk.CTkToplevel(self._root)
        title = (
            f"SAP Batch Assistant — #{self._items[0].get('DocNum')}"
            if self._is_batch
            else f"SAP Posting Assistant — #{self._items[0].get('DocNum')}"
        )
        self._dialog.title(title)
        self._dialog.geometry("580x680")
        self._dialog.configure(fg_color=Colors.DIALOG_BG)
        self._dialog.attributes("-topmost", True)

        # Wire the X button to our handler (prevents orphaned dialog state)
        self._dialog.protocol("WM_DELETE_WINDOW", self._on_x_click)
        # NOTE: grab_set() removed — it was blocking title bar buttons
        # (minimize, close) from functioning on Windows

        main = ctk.CTkFrame(self._dialog, fg_color="transparent")
        main.pack(fill="both", expand=True, padx=Spacing.XXL, pady=Spacing.XL)

        self._build_header(main)
        self._build_order_info(main)
        self._build_item_list(main)
        self._build_footer(main)

    def close(self) -> None:
        """Programmatically close the dialog."""
        self._close()

    def lift(self) -> None:
        """Bring the dialog to the front."""
        if self._dialog and self._dialog.winfo_exists():
            self._dialog.lift()

    def _on_x_click(self) -> None:
        """Handle user clicking the 'X' button — close the dialog properly."""
        log.info("Dialog %s closed via X button.", self._tracking_id)
        self._close()

    def _close(self) -> None:
        """Internal close handler used by buttons or agent."""
        if self._dialog and self._dialog.winfo_exists():
            self._dialog.destroy()
        self._on_close(self._tracking_id)

    def _build_header(self, parent: ctk.CTkFrame) -> None:
        """Title and subtitle."""
        title_text = "Batch Posting Assistant" if self._is_batch else "Dispatch Sync Assistant"
        ctk.CTkLabel(
            parent, text=title_text,
            font=Fonts.HEADING, text_color=Colors.ACCENT,
        ).pack(pady=(0, Spacing.XS))

        count = len(self._items)
        subtitle = (
            f"There are {count} items for this order ready for SAP."
            if self._is_batch
            else "An order is ready for SAP. Please update once posted."
        )
        ctk.CTkLabel(
            parent, text=subtitle,
            font=Fonts.BODY, text_color=Colors.TEXT_SECONDARY,
        ).pack(pady=(0, Spacing.LG))

    def _build_order_info(self, parent: ctk.CTkFrame) -> None:
        """SAP Doc # and Customer info card."""
        info = ctk.CTkFrame(parent, fg_color=Colors.BG_PRIMARY, corner_radius=10)
        info.pack(fill="x", pady=(0, Spacing.LG))

        inner = ctk.CTkFrame(info, fg_color="transparent")
        inner.pack(fill="x", padx=Spacing.LG, pady=Spacing.MD)

        # Row 1: Doc #
        row1 = ctk.CTkFrame(inner, fg_color="transparent")
        row1.pack(fill="x", pady=2)
        ctk.CTkLabel(row1, text="SAP Doc #:", font=Fonts.CAPTION_BOLD, text_color=Colors.TEXT_SECONDARY, width=100, anchor="w").pack(side="left")
        ctk.CTkLabel(row1, text=str(self._items[0].get("DocNum", "N/A")), font=Fonts.HEADING_SM, text_color=Colors.ACCENT).pack(side="left")

        # Row 2: Customer
        row2 = ctk.CTkFrame(inner, fg_color="transparent")
        row2.pack(fill="x", pady=2)
        ctk.CTkLabel(row2, text="Customer:", font=Fonts.CAPTION_BOLD, text_color=Colors.TEXT_SECONDARY, width=100, anchor="w").pack(side="left")
        ctk.CTkLabel(row2, text=self._items[0].get("Customer", "N/A"), font=Fonts.BODY_BOLD, text_color=Colors.TEXT_PRIMARY).pack(side="left")

    def _build_item_list(self, parent: ctk.CTkFrame) -> None:
        """Scrollable list of items (consolidated for display)."""
        ctk.CTkLabel(
            parent, text="Items to Process:", font=Fonts.CAPTION_BOLD,
            text_color=Colors.TEXT_SECONDARY, anchor="w",
        ).pack(fill="x", pady=(0, Spacing.XS))

        scroll = ctk.CTkScrollableFrame(
            parent, fg_color=Colors.BG_PRIMARY, corner_radius=8,
            height=250,
        )
        scroll.pack(fill="both", expand=True, pady=(0, Spacing.LG))

        # Consolidate items by ProductCode
        display_items: Dict[str, Dict[str, Any]] = {}
        for item in self._items:
            code = item.get("ProductCode", "Unknown")
            if code not in display_items:
                display_items[code] = item.copy()
            else:
                try:
                    current_qty = float(display_items[code].get("Quantity", 0))
                    new_qty = float(item.get("Quantity", 0))
                    display_items[code]["Quantity"] = current_qty + new_qty
                except (ValueError, TypeError):
                    pass

        for item in display_items.values():
            card = ctk.CTkFrame(scroll, fg_color=Colors.BG_CARD, corner_radius=8, border_width=1, border_color=Colors.BORDER)
            card.pack(fill="x", pady=3, padx=2)

            inner = ctk.CTkFrame(card, fg_color="transparent")
            inner.pack(fill="x", padx=Spacing.MD, pady=Spacing.SM)

            qty = item.get("Quantity", 0)
            try:
                qty_text = f"{float(qty):,.0f}"
            except (ValueError, TypeError):
                qty_text = str(qty)

            ctk.CTkLabel(inner, text=f"Qty: {qty_text}", font=Fonts.BODY_BOLD, text_color=Colors.SUCCESS).pack(side="right", padx=Spacing.SM)

            left = ctk.CTkFrame(inner, fg_color="transparent")
            left.pack(side="left", fill="both", expand=True)

            ctk.CTkLabel(left, text=item.get("ProductCode", "Unknown"), font=Fonts.BODY_BOLD, text_color=Colors.TEXT_PRIMARY, anchor="w").pack(fill="x")
            ctk.CTkLabel(left, text=item.get("Description", ""), font=Fonts.CAPTION, text_color=Colors.TEXT_SECONDARY, anchor="w").pack(fill="x")

    def _build_footer(self, parent: ctk.CTkFrame) -> None:
        """Notes entry and action buttons."""
        ctk.CTkLabel(
            parent, text="Notes for Planner (optional):",
            font=Fonts.CAPTION_BOLD, text_color=Colors.TEXT_SECONDARY, anchor="w",
        ).pack(fill="x", pady=(0, Spacing.XS))

        self._comment_entry = ctk.CTkEntry(
            parent, placeholder_text="Add a note…",
            font=Fonts.BODY, height=38,
            fg_color=Colors.BG_INPUT, border_color=Colors.BORDER,
            text_color=Colors.TEXT_PRIMARY, corner_radius=10,
        )
        self._comment_entry.pack(fill="x", pady=(0, Spacing.LG))

        btn_frame = ctk.CTkFrame(parent, fg_color="transparent")
        btn_frame.pack(fill="x")

        reject_text = "Reject Batch" if self._is_batch else "Return to Planner"
        approve_text = "Approve Batch" if self._is_batch else "I've Updated SAP"

        btn_reject = ctk.CTkButton(
            btn_frame, text=reject_text,
            command=lambda: self._submit("REJECTED"),
            font=Fonts.BODY_BOLD,
            fg_color=Colors.BG_PRIMARY, hover_color=Colors.BG_CARD_HOVER,
            text_color=Colors.TEXT_SECONDARY,
            corner_radius=10, height=42, width=160,
        )
        btn_reject.pack(side="left")
        self._buttons.append(btn_reject)

        btn_approve = ctk.CTkButton(
            btn_frame, text=approve_text,
            command=lambda: self._submit("APPROVED"),
            font=Fonts.BODY_BOLD,
            fg_color=Colors.ACCENT, hover_color=Colors.ACCENT_HOVER,
            text_color=Colors.TEXT_ON_ACCENT,
            corner_radius=10, height=42, width=180,
        )
        btn_approve.pack(side="right")
        self._buttons.append(btn_approve)

    def _submit(self, status: str) -> None:
        """Collect comments and invoke the on_submit callback."""
        # Disable buttons to prevent double-submit
        for btn in self._buttons:
            btn.configure(state="disabled")

        suffix = "(Batch Updated" if self._is_batch else "(Updated"
        comments = f"{self._comment_entry.get()} {suffix} by {PC_NAME})"
        log.info("Dialog submit: %s — status=%s, items=%d", self._tracking_id, status, len(self._items))
        self._on_submit(self._items, status, comments)
        self._close()
