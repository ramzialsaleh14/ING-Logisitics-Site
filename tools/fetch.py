"""Polite fetcher with retry.

ing-logistics.com sits behind a Cloudflare JS challenge that rate-limits by TLS
fingerprint: Python's urllib is blocked outright while curl.exe passes roughly
half the time. So we drive curl.exe in a retry loop.
"""
import os
import subprocess
import sys
import time

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
BASE = "https://ing-logistics.com"


def fetch(url, tries=30, referer=None):
    """Return the response body bytes, retrying through the intermittent 403s."""
    last = "no attempt"
    for _ in range(tries):
        cmd = ["curl.exe", "-s", "-L", "--compressed", "--max-time", "40",
               "-A", UA,
               "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
               "-H", "Accept-Language: en-US,en;q=0.9",
               "-w", "\n%{http_code}"]
        if referer:
            cmd += ["-H", f"Referer: {referer}"]
        cmd.append(url)
        try:
            p = subprocess.run(cmd, capture_output=True)
            body = p.stdout
            code = body.rsplit(b"\n", 1)[-1].decode(errors="replace").strip()
            body = body.rsplit(b"\n", 1)[0]
            if code == "200" and b"Just a moment" not in body[:3000]:
                return body
            last = f"http {code} ({len(body)}b)"
        except Exception as e:
            last = repr(e)[:120]
        time.sleep(0.8)
    raise RuntimeError(f"failed {url}: {last}")


def save(url, out, referer=None):
    d = fetch(url, referer=referer)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "wb") as f:
        f.write(d)
    print(f"{url} -> {out} ({len(d)} bytes)")
    return d


if __name__ == "__main__":
    save(sys.argv[1], sys.argv[2])
