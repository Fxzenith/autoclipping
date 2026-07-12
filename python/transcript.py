#!/usr/bin/env python3
"""Fetch a YouTube transcript and write data/transcript.json."""

import argparse
import json
import os
import re
import sys
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import YouTubeTranscriptApi


def video_id_from_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.strip("/")

    if "youtu.be" in host and path:
        return path.split("/")[0]

    if "youtube.com" in host:
        if path.startswith("shorts/") or path.startswith("live/"):
            return path.split("/")[1]

        query = parse_qs(parsed.query)
        if "v" in query and query["v"]:
            return query["v"][0]

    match = re.search(r"(?:v=|youtu\.be/|shorts/|live/)([A-Za-z0-9_-]{11})", url)
    if match:
        return match.group(1)

    raise ValueError("Could not parse video id from URL")


def fetch_transcript(video_id: str):
    api = YouTubeTranscriptApi()

    if hasattr(api, "fetch"):
        return api.fetch(video_id)

    return YouTubeTranscriptApi.get_transcript(video_id)


def normalize_transcript(transcript):
    entries = []

    for item in transcript:
        if hasattr(item, "get"):
            start = float(item.get("start", 0.0))
            duration = float(item.get("duration", 0.0))
            text = str(item.get("text", "")).strip()
        else:
            start = float(getattr(item, "start", 0.0))
            duration = float(getattr(item, "duration", 0.0))
            text = str(getattr(item, "text", "")).strip()
        end = start + duration
        entries.append({"start": round(start, 3), "end": round(end, 3), "text": text})

    entries.sort(key=lambda item: item["start"])
    return entries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="YouTube video url")
    parser.add_argument("--id", help="YouTube video id")
    parser.add_argument("--out", default="data/transcript.json", help="Output JSON path")
    args = parser.parse_args()

    if args.url:
        video_id = video_id_from_url(args.url)
    elif args.id:
        video_id = args.id
    else:
        parser.error("--url or --id required")

    out_dir = os.path.dirname(args.out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    try:
        transcript = fetch_transcript(video_id)
    except Exception as exc:
        print(f"Failed to fetch transcript for {video_id}: {exc}", file=sys.stderr)
        return 1

    entries = normalize_transcript(transcript)
    source_url = args.url if args.url else f"https://youtube.com/watch?v={video_id}"
    payload = {
        "video_id": video_id,
        "source_url": source_url,
        "transcript": entries,
    }

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)

    print(f"Wrote transcript to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())