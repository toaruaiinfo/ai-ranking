#!/usr/bin/env python3
"""Hugging Face の lmarena-ai/leaderboard-dataset から部門別ランキングを取得し、
data/rankings.json を更新する。

- 認証不要の datasets-server「/filter」API を使う
- 取得・検証に失敗したら既存の rankings.json は上書きしない（終了コード 1）
- ランキング内容（fetched_at 以外）に変化があったかを GITHUB_OUTPUT の changed=true/false で返す

標準ライブラリのみ使用。
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUT_FILE = DATA_DIR / "rankings.json"
NAME_MAP_FILE = DATA_DIR / "name-map.json"

DATASET = "lmarena-ai/leaderboard-dataset"
API = "https://datasets-server.huggingface.co/filter"
TOP_N = 8
FETCH_N = 30  # 同点の並べ替え用に多めに取る
JST = timezone(timedelta(hours=9))

# arena.ai の標準表示に合わせた config（2026-11-22 に確認）
#   Text は style control 版が標準、Document は通常版が標準
CATEGORIES = [
    {"key": "daily", "label": "普段使い", "board": "Text", "config": "text_style_control"},
    {"key": "work", "label": "業務使い", "board": "Document", "config": "document"},
    {"key": "code", "label": "コーディング", "board": "WebDev", "config": "webdev"},
    {"key": "video", "label": "動画生成", "board": "Text to Video", "config": "text_to_video"},
]


def http_get_json(url: str, retries: int = 5) -> dict:
    last: Exception | None = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ai-ranking-site/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            wait = 5 * (2 ** i)
            print(f"  retry {i + 1}/{retries} in {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"取得失敗: {url}: {last}")


def fetch_overall(config: str) -> list[dict]:
    q = urllib.parse.urlencode({
        "dataset": DATASET,
        "config": config,
        "split": "latest",
        "where": "\"category\"='overall'",
        "orderby": "\"rating\" DESC",
        "offset": 0,
        "length": FETCH_N,
    })
    data = http_get_json(f"{API}?{q}")
    if "error" in data:
        raise RuntimeError(f"{config}: {data['error']}")
    return [r["row"] for r in data.get("rows", [])]


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def build() -> dict:
    name_map = load_json(NAME_MAP_FILE, {})
    cats = []
    for c in CATEGORIES:
        print(f"fetch {c['config']} ...", file=sys.stderr)
        rows = fetch_overall(c["config"])
        rows = [r for r in rows if r.get("category") == "overall" and isinstance(r.get("rating"), (int, float))]
        rows.sort(key=lambda r: (-r["rating"], r.get("rank") or 1e9, -(r.get("vote_count") or 0)))
        top = rows[:TOP_N]
        dates = sorted({str(r.get("leaderboard_publish_date") or "") for r in top} - {""})
        models = [
            {
                "rank": i + 1,
                "name": name_map.get(r["model_name"], r["model_name"]),
                "org": r.get("organization") or "",
                "score": round(r["rating"]),
                "votes": int(r.get("vote_count") or 0),
            }
            for i, r in enumerate(top)
        ]
        cats.append({
            "key": c["key"],
            "label": c["label"],
            "board": c["board"],
            "published": dates[-1] if dates else "",
            "models": models,
        })
        time.sleep(2)  # API への負荷を抑える
    return {
        "fetched_at": datetime.now(JST).isoformat(timespec="seconds"),
        "source": DATASET,
        "categories": cats,
    }


def validate(data: dict) -> None:
    cats = data.get("categories", [])
    keys = {c["key"] for c in cats}
    need = {c["key"] for c in CATEGORIES}
    if keys != need:
        raise ValueError(f"部門が足りません: {need - keys}")
    for c in cats:
        if len(c["models"]) < 3:
            raise ValueError(f"{c['key']}: データが3件未満です")
        for m in c["models"]:
            if not isinstance(m["score"], (int, float)) or isinstance(m["score"], bool):
                raise ValueError(f"{c['key']}: score が数値ではありません: {m}")
            if not m["name"]:
                raise ValueError(f"{c['key']}: モデル名が空です")


def set_output(name: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{name}={value}\n")


def main() -> int:
    try:
        new = build()
        validate(new)
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}\n既存の rankings.json はそのままにします。", file=sys.stderr)
        set_output("changed", "false")
        return 1

    old = load_json(OUT_FILE, {})
    changed = old.get("categories") != new["categories"]
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(OUT_FILE)
    set_output("changed", "true" if changed else "false")
    print(f"OK: changed={changed}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
