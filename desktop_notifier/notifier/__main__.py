"""
Entry point for running the notifier as a module::

    python -m notifier

This performs a single-instance check, then starts the NotifierAgent.
"""

from notifier.system import check_single_instance
from notifier.agent import NotifierAgent


def main() -> None:
    """Launch the PWMS Dispatch Notifier application."""
    # Acquire the mutex — exits immediately if another instance is running.
    # The returned handle must be kept alive for the duration of the process.
    _instance_mutex = check_single_instance()  # noqa: F841

    agent = NotifierAgent()
    agent.start()


if __name__ == "__main__":
    main()
