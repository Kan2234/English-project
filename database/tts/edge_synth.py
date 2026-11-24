"""Synthesize speech segments with Microsoft Edge neural voices (edge-tts).

Called by generate-audio.mjs (normally inside Docker, see that file):
    python edge_synth.py <jobs.json>

jobs.json: [{"file": "abc.mp3", "voice": "en-GB-SoniaNeural", "rate": "+0%", "pitch": "+0Hz", "text": "..."}]
Each file is written next to jobs.json. Files that already exist are skipped (cache),
so an interrupted run can simply be restarted.

The online service rate-limits (HTTP 429), so requests are throttled: at most
CONCURRENCY in flight, a minimum interval between request starts that grows after
every 429 and shrinks again after successes, and retries with exponential backoff.
"""

import asyncio
import json
import os
import random
import sys
import time

import edge_tts

CONCURRENCY = int(os.environ.get("EDGE_TTS_CONCURRENCY", "3"))
RETRIES = 8
MIN_INTERVAL = 0.6  # seconds between request starts (adaptive, see Throttle)
MAX_INTERVAL = 6.0


class Throttle:
    def __init__(self):
        self.interval = MIN_INTERVAL
        self.next_start = 0.0
        self.lock = asyncio.Lock()

    async def wait(self):
        async with self.lock:
            now = time.monotonic()
            delay = self.next_start - now
            if delay > 0:
                await asyncio.sleep(delay)
            self.next_start = time.monotonic() + self.interval

    def limited(self):
        self.interval = min(MAX_INTERVAL, self.interval * 1.6)

    def ok(self):
        self.interval = max(MIN_INTERVAL, self.interval * 0.92)


async def synth(job, out_dir, throttle, sem, stats):
    path = os.path.join(out_dir, job["file"])
    if os.path.exists(path) and os.path.getsize(path) > 0:
        stats["cached"] += 1
        return True
    tmp = path + ".part"
    async with sem:
        for attempt in range(RETRIES):
            await throttle.wait()
            try:
                com = edge_tts.Communicate(
                    job["text"], job["voice"], rate=job.get("rate", "+0%"), pitch=job.get("pitch", "+0Hz")
                )
                await com.save(tmp)
                if os.path.getsize(tmp) == 0:
                    raise RuntimeError("empty audio")
                os.replace(tmp, path)
                throttle.ok()
                stats["done"] += 1
                if stats["done"] % 25 == 0:
                    print(f"  edge-tts: {stats['done']} synthesized", flush=True)
                return True
            except Exception as e:  # network errors, 429, NoAudioReceived...
                msg = str(e).splitlines()[0][:90] if str(e) else type(e).__name__
                if "429" in msg:
                    stats["429"] += 1
                    throttle.limited()
                wait = min(60, 2 * 2**attempt) + random.uniform(0, 1.5)
                if attempt == RETRIES - 1:
                    print(f"  FAILED {job['file']} ({job['voice']}): {msg}", flush=True)
                else:
                    if "429" not in msg:
                        print(f"  retry {job['file']} in {wait:.0f}s: {msg}", flush=True)
                    await asyncio.sleep(wait)
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False


async def main(jobs_file):
    with open(jobs_file, encoding="utf-8") as f:
        jobs = json.load(f)
    out_dir = os.path.dirname(os.path.abspath(jobs_file))
    throttle, sem = Throttle(), asyncio.Semaphore(CONCURRENCY)
    stats = {"done": 0, "cached": 0, "429": 0}
    t0 = time.monotonic()
    results = await asyncio.gather(*(synth(j, out_dir, throttle, sem, stats) for j in jobs))
    failed = results.count(False)
    print(
        f"  edge-tts: {stats['done']} synthesized, {stats['cached']} cached, {failed} failed, "
        f"{stats['429']} rate-limit retries, {time.monotonic() - t0:.0f}s",
        flush=True,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1])))
