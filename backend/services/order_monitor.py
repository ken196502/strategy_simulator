"""
Order monitoring service that periodically checks and executes pending orders.
Simulates background order processing in a real trading system.
"""
import asyncio
import threading
from sqlalchemy.orm import Session
from database.connection import SessionLocal
from services.order_service import get_pending_orders, execute_order
import logging

logger = logging.getLogger(__name__)


class OrderMonitor:
    def __init__(self, check_interval: float = 5.0):
        """
        Initialize order monitor.
        
        Args:
            check_interval: Seconds between order execution checks
        """
        self.check_interval = check_interval
        self.running = False
        self.thread = None
        
    def start(self):
        """Start the background order monitoring thread."""
        if self.running:
            return
            
        self.running = True
        self.thread = threading.Thread(target=self._run_monitor, daemon=True)
        self.thread.start()
        logger.info(f"Order monitor started with {self.check_interval}s interval")
        
    def stop(self):
        """Stop the background order monitoring thread."""
        self.running = False
        if self.thread:
            self.thread.join(timeout=10)
        logger.info("Order monitor stopped")
        
    def _run_monitor(self):
        """Background thread function that checks pending orders."""
        while self.running:
            try:
                self._check_pending_orders()
            except Exception as e:
                logger.error(f"Error in order monitor: {e}")
            
            # Sleep but check running status periodically
            for _ in range(int(self.check_interval * 10)):
                if not self.running:
                    break
                threading.Event().wait(0.1)
                
    def _check_pending_orders(self):
        """Check and try to execute all pending orders."""
        db: Session = SessionLocal()
        try:
            pending_orders = get_pending_orders(db)
            if not pending_orders:
                return
                
            logger.debug(f"Checking {len(pending_orders)} pending orders")
            
            executed_count = 0
            for order in pending_orders:
                try:
                    if execute_order(db, order):
                        executed_count += 1
                        logger.info(f"Executed order {order.order_no}: {order.side} {order.quantity} {order.symbol}")
                except Exception as e:
                    logger.error(f"Failed to execute order {order.order_no}: {e}")
                    
            if executed_count > 0:
                logger.info(f"Executed {executed_count} orders")
                
        finally:
            db.close()


# Global monitor instance
_monitor = None


def start_order_monitor(check_interval: float = 5.0):
    """Start the global order monitor."""
    global _monitor
    if _monitor is None:
        _monitor = OrderMonitor(check_interval)
    _monitor.start()


def stop_order_monitor():
    """Stop the global order monitor."""
    global _monitor
    if _monitor is not None:
        _monitor.stop()


def check_pending_orders_once():
    """Manually trigger a single check of pending orders (for testing)."""
    monitor = OrderMonitor()
    monitor._check_pending_orders()
