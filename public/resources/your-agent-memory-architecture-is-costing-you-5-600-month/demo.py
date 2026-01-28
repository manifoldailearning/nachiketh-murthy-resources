"""
learn production patterns of agentic ai : https://bootcamp.nachiketh.in

The goal is readability and architecture clarity, not production‑ready code.

Core ideas we demo:
- Short‑term memory  → key‑value store (e.g. Redis)
- Long‑term memory   → vector database (only summaries / insights)
- Pruning strategies → keep costs + latency under control
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Fake infrastructure interfaces
# ---------------------------------------------------------------------------

class FakeRedis:
    """
    Minimal in‑memory stand‑in for Redis.

    In real code you would use `redis.Redis(...)`.
    Here we keep it simple so the architecture is easy to follow.
    """

    def __init__(self) -> None:
        # We store: key -> (value, expires_at)
        self._store: Dict[str, Any] = {}
        self._ttl: Dict[str, datetime] = {}

    def setex(self, key: str, ttl_seconds: int, value: Any) -> None:
        expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
        self._store[key] = value
        self._ttl[key] = expires_at

    def get(self, key: str) -> Optional[Any]:
        expires_at = self._ttl.get(key)
        if expires_at is not None and expires_at < datetime.utcnow():
            # Key expired → behave like Redis and return None
            self._store.pop(key, None)
            self._ttl.pop(key, None)
            return None
        return self._store.get(key)

    def hset(self, key: str, mapping: Dict[str, Any]) -> None:
        """
        Very small subset of Redis HSET:
        - If key does not exist, create a dict
        - Then update fields with given mapping
        """
        if key not in self._store or not isinstance(self._store[key], dict):
            self._store[key] = {}
        self._store[key].update(mapping)

    def hgetall(self, key: str) -> Dict[str, Any]:
        value = self.get(key)
        return value if isinstance(value, dict) else {}


@dataclass
class VectorDocument:
    """Simple representation of a document stored in a vector DB."""

    id: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class FakeVectorStore:
    """
    Extremely small in‑memory stand‑in for a vector database.

    We skip real embeddings and similarity math to keep the demo readable.
    The focus is *when* and *what* to store, not how similarity works.
    """

    def __init__(self) -> None:
        self._docs: Dict[str, VectorDocument] = {}

    def add_document(self, doc: VectorDocument) -> None:
        self._docs[doc.id] = doc

    def delete(self, doc_ids: List[str]) -> None:
        for doc_id in doc_ids:
            self._docs.pop(doc_id, None)

    def all_documents(self) -> List[VectorDocument]:
        """Return all documents (no real filtering/search here)."""
        return list(self._docs.values())


# ---------------------------------------------------------------------------
# Short‑term conversation memory  (Redis / key‑value style)
# ---------------------------------------------------------------------------

class ConversationMemory:
    """
    Short‑term memory for the *current* conversation.

    Backed by a key‑value store (Redis or similar).
    - Stores last N messages
    - TTL based expiration (e.g. 1 hour)
    - Exact lookup, no embeddings
    """

    def __init__(self, redis_client: FakeRedis, ttl_seconds: int = 3600) -> None:
        self.redis = redis_client
        self.ttl_seconds = ttl_seconds

    def _conv_key(self, conv_id: str) -> str:
        return f"conv:{conv_id}"

    def save_messages(self, conv_id: str, messages: List[Dict[str, Any]]) -> None:
        """
        Persist the current conversation messages as JSON.

        Note:
        - We store the *raw* messages (no embeddings).
        - We let the key expire automatically after `ttl_seconds`.
        """
        data = json.dumps(messages)
        self.redis.setex(self._conv_key(conv_id), self.ttl_seconds, data)

    def get_messages(self, conv_id: str) -> List[Dict[str, Any]]:
        """Return previously stored messages for this conversation (or empty list)."""
        raw = self.redis.get(self._conv_key(conv_id))
        if raw is None:
            return []
        return json.loads(raw)


class SessionState:
    """
    Stores structured, short‑lived session state.

    Example fields:
    - current workflow step
    - accumulated form data
    - timestamps
    """

    def __init__(self, redis_client: FakeRedis, ttl_seconds: int = 86400) -> None:
        self.redis = redis_client
        self.ttl_seconds = ttl_seconds

    def _state_key(self, user_id: str) -> str:
        return f"user:{user_id}:session"

    def save_state(self, user_id: str, state: Dict[str, Any]) -> None:
        # We simply store the JSON blob with a TTL.
        self.redis.setex(self._state_key(user_id), self.ttl_seconds, json.dumps(state))

    def load_state(self, user_id: str) -> Dict[str, Any]:
        raw = self.redis.get(self._state_key(user_id))
        return json.loads(raw) if raw else {}


# ---------------------------------------------------------------------------
# Long‑term memory (vector DB, summaries only)
# ---------------------------------------------------------------------------

def summarize_conversation(messages: List[Dict[str, Any]]) -> str:
    """
    Stub for LLM‑based summarization.

    In real systems you would call your LLM here.
    We keep it simple for the demo.
    """
    user_turns = [m for m in messages if m.get("role") == "user"]
    assistant_turns = [m for m in messages if m.get("role") == "assistant"]
    return (
        f"Summary of conversation with {len(user_turns)} user turns and "
        f"{len(assistant_turns)} assistant turns."
    )


def is_relevant_summary(summary: str, messages: List[Dict[str, Any]]) -> bool:
    """
    Decide whether a summary is worth storing as long‑term memory.

    This encodes the "relevance‑based pruning" idea from the script:
    - Too short → probably greeting / low value
    - Too few turns → likely not meaningful
    """
    word_count = len(summary.split())
    if word_count < 10:
        # Very small summary → usually not meaningful enough.
        return False

    if len(messages) < 3:
        # Very short conversations are often just greetings or errors.
        return False

    return True


class LongTermMemory:
    """
    Long‑term memory backed by a vector store.

    We store **summaries**, not full transcripts.
    This drastically reduces cost compared to embedding every message.
    """

    def __init__(self, vector_store: FakeVectorStore) -> None:
        self.store = vector_store

    def _doc_id(self, conv_id: str) -> str:
        # In a real system you might use UUIDs. Here we keep it deterministic.
        return f"conv_summary:{conv_id}"

    def add_conversation_summary(
        self,
        conv_id: str,
        messages: List[Dict[str, Any]],
        created_at: Optional[datetime] = None,
    ) -> None:
        """
        Summarize a conversation and store it as a vector document,
        *if* it passes the relevance filter.
        """
        created_at = created_at or datetime.utcnow()
        summary = summarize_conversation(messages)

        if not is_relevant_summary(summary, messages):
            # Relevance‑based pruning:
            # we simply choose not to store low‑value memories.
            return

        doc = VectorDocument(
            id=self._doc_id(conv_id),
            content=summary,
            metadata={
                "conv_id": conv_id,
                "created_at": created_at.isoformat(),
                "turn_count": len(messages),
                # In a real system we would also track:
                # - user_id
                # - last_accessed
                # - access_count
                # - type = "conversation_summary"
            },
        )
        self.store.add_document(doc)

    # NOTE: In a real implementation you would also expose:
    # - semantic_search(query, user_id, k)
    # - update_document_for_deduplication(...)
    # - mark_accessed(memory_id) to support access‑based pruning


# ---------------------------------------------------------------------------
# Pruning strategies (time‑based + access‑based)
# ---------------------------------------------------------------------------

def prune_old_summaries(
    store: FakeVectorStore,
    older_than_days: int = 90,
) -> None:
    """
    Time‑based pruning.

    Delete summaries whose `created_at` is older than N days.
    """
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    to_delete: List[str] = []

    for doc in store.all_documents():
        created_at_str = doc.metadata.get("created_at")
        if not created_at_str:
            continue
        try:
            created_at = datetime.fromisoformat(created_at_str)
        except ValueError:
            # If parsing fails, be conservative and keep the doc.
            continue

        if created_at < cutoff:
            to_delete.append(doc.id)

    store.delete(to_delete)


def demo_flow() -> None:
    """
    End‑to‑end demo of the architecture from the script:

    1. User sends messages → store in short‑term memory (Redis style)
    2. Conversation ends   → summarize + store in long‑term memory (vector DB)
    3. Nightly job         → prune old summaries
    """
    # ----- Step 1: wire up our "infrastructure" --------------------------------
    redis_client = FakeRedis()
    vector_store = FakeVectorStore()

    short_term = ConversationMemory(redis_client=redis_client, ttl_seconds=3600)
    long_term = LongTermMemory(vector_store=vector_store)

    conv_id = "example-conv-1"

    # ----- Step 2: simulate a short conversation -------------------------------
    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": "Hi, I prefer working in Python."},
        {"role": "assistant", "content": "Great, I'll use Python examples."},
        {"role": "user", "content": "Please help me design an agent architecture."},
        {"role": "assistant", "content": "Let's start with short‑term vs long‑term memory."},
    ]

    # Store conversation in short‑term memory (Redis style).
    short_term.save_messages(conv_id, messages)

    # Later in the turn, we can retrieve it quickly:
    retrieved = short_term.get_messages(conv_id)
    print(f"[Short‑term] Retrieved {len(retrieved)} messages from Redis‑like store.")

    # ----- Step 3: conversation ends → write long‑term summary ------------------
    long_term.add_conversation_summary(conv_id=conv_id, messages=messages)

    print(f"[Long‑term] Stored {len(vector_store.all_documents())} summaries.")

    # ----- Step 4: nightly pruning job -----------------------------------------
    # For the demo, we artificially backdate the doc so pruning removes it.
    for doc in vector_store.all_documents():
        doc.metadata["created_at"] = (
            datetime.utcnow() - timedelta(days=120)
        ).isoformat()

    prune_old_summaries(store=vector_store, older_than_days=90)
    print(f"[Pruning] Summaries remaining after pruning: {len(vector_store.all_documents())}")


if __name__ == "__main__":
    # Running this file directly will walk through the demo flow.
    demo_flow()

