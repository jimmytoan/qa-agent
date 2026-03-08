import asyncio
import os
from asyncio import Task, Queue

# Maps run_id -> asyncio Task for individual browser-use runs
RUN_TASKS: dict[str, Task] = {}

# Maps suite_run_id -> asyncio Task for suite-level finalization
SUITE_RUN_TASKS: dict[int, Task] = {}

# Semaphore limiting how many browser instances run concurrently.
# Controlled by the MAX_CONCURRENT_RUNS environment variable (default: 3).
_max_concurrent = int(os.getenv('MAX_CONCURRENT_RUNS', '3'))
BROWSER_SEMAPHORE: asyncio.Semaphore = asyncio.Semaphore(_max_concurrent)

# Maps run_id -> Queue of SSE event dicts. None sentinel = stream closed.
RUN_EVENTS: dict[str, Queue] = {}
