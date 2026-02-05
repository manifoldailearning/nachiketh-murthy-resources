"""
Join community: community.nachiketh.in
Structured Learning with production patterns: bootcamp.nachiketh.in


Production Agent Failures - Real Code Examples
Layer 5 Orchestration Failures

This file shows the WRONG implementations that caused production failures,
followed by the CORRECT implementations.
"""

import asyncio
import uuid
from typing import Optional

# ============================================================================
# FAILURE #1: THE SLACK MESSAGE STORM
# 1,200 duplicate messages in 6 hours
# ============================================================================

# ❌ WRONG IMPLEMENTATION (What they had)
async def send_summary_WRONG(channel: str, message: str):
    """
    This code looks fine, but it caused 1,200 duplicate messages.
    
    The issue: No idempotency key
    When Slack API was slow, timeouts would trigger retries.
    But the first message had already been sent.
    """
    response = await slack.chat_postMessage(
        channel=channel,
        text=message
    )
    return response


# Their retry logic (also WRONG)
async def send_with_retry_WRONG(channel: str, message: str):
    """
    5 retries × 240 channels = 1,200 duplicate messages
    
    Why this failed:
    - Slack API was slow, not failing
    - Timeout after 30 seconds triggered retry
    - Original message had already sent
    - No idempotency to deduplicate
    """
    for attempt in range(5):
        try:
            result = await send_summary_WRONG(channel, message)
            break
        except Exception as e:
            if attempt < 4:
                await asyncio.sleep(2)  # Fixed 2-second wait


# ✅ CORRECT IMPLEMENTATION
async def send_summary_CORRECT(
    channel: str, 
    message: str, 
    idempotency_key: str
):
    """
    With idempotency key, Slack deduplicates automatically.
    Same key = same message, sent only once.
    """
    response = await slack.chat_postMessage(
        channel=channel,
        text=message,
        metadata={
            "event_type": "daily_summary",
            "event_payload": {
                "idempotency_key": idempotency_key
            }
        }
    )
    return response


# ============================================================================
# FAILURE #2: THE STRIPE DUPLICATE CHARGE DISASTER
# 847 duplicate charges = $84,000 sent twice
# ============================================================================

# ❌ WRONG IMPLEMENTATION
async def process_refund_WRONG(charge_id: str, amount: int):
    """
    What's missing? Idempotency key.
    
    The issue:
    - Agent timeout waiting for Stripe response
    - Refund succeeded on Stripe's side
    - Agent thought it failed, so it retried
    - 847 retries = 847 duplicate refunds = $84,000 duplicated
    """
    refund = await stripe.Refund.create(
        charge=charge_id,
        amount=amount
    )
    return refund


# ✅ CORRECT IMPLEMENTATION
async def process_refund_CORRECT(charge_id: str, amount: int):
    """
    Stripe has built-in idempotency support.
    
    With same key, Stripe returns original refund.
    No duplicate, even on retry.
    """
    idempotency_key = str(uuid.uuid4())
    
    refund = await stripe.Refund.create(
        charge=charge_id,
        amount=amount,
        idempotency_key=idempotency_key
    )
    return refund


# ============================================================================
# FAILURE #3: THE DATABASE WRITE CASCADE
# 3,400 duplicate tickets in one day
# ============================================================================

# ❌ WRONG IMPLEMENTATION (Had idempotency, but wrong approach)
async def create_ticket_WRONG(email_id: str, content: str):
    """
    The issue: Race condition
    
    200 emails processed concurrently
    For email #1, three agent instances check DB at same time
    All three see no existing ticket
    All three create one
    
    Result: 200 emails × 17 average concurrent = 3,400 duplicates
    """
    # Check if ticket exists
    existing = await db.query(
        "SELECT * FROM tickets WHERE email_id = ?", 
        email_id
    )
    
    if existing:
        return existing
    
    # Create new ticket
    ticket = await db.insert(
        "INSERT INTO tickets (email_id, content) VALUES (?, ?)",
        email_id, 
        content
    )
    return ticket


# ✅ CORRECT IMPLEMENTATION
async def create_ticket_CORRECT(email_id: str, content: str):
    """
    Database enforces uniqueness via UNIQUE constraint.
    Application handles conflict gracefully.
    
    No race condition - DB is source of truth.
    """
    try:
        # Try to insert directly
        ticket = await db.insert(
            "INSERT INTO tickets (email_id, content) VALUES (?, ?)",
            email_id, 
            content
        )
        return ticket
        
    except UniqueViolationError:
        # Ticket already exists, fetch it
        existing = await db.query(
            "SELECT * FROM tickets WHERE email_id = ?",
            email_id
        )
        return existing


# ============================================================================
# KEY LESSONS FROM THESE FAILURES
# ============================================================================

"""
1. IDEMPOTENCY IS NOT OPTIONAL
   - Every external action needs an idempotency key
   - APIs, messages, payments, database writes
   - Same key = same action = deduplicated

2. CHECK-THEN-ACT IS A RACE CONDITION
   - Don't check if exists, then create
   - Try to create, handle conflict
   - Let the database/API enforce uniqueness

3. RETRY LOGIC WITHOUT IDEMPOTENCY = DISASTER
   - Retries amplify the problem
   - 5 retries × 240 channels = 1,200 messages
   - Always combine retry + idempotency

4. TIMEOUTS MATTER
   - Slow API ≠ failed API
   - Lower timeouts (2-5s) with retries
   - Better than high timeout (30s+) without retries
"""


# ============================================================================
# NEXT: See pattern_1_exponential_backoff.py for retry implementation
# ============================================================================
