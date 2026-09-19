
from __future__ import annotations

import json
import logging
import math
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel


# ENVIRONMENT / LOGGING


load_dotenv()

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("price-service")


# LLM CONFIGURATION


GROQ_API_KEY = os.getenv("GROQ_API_KEY")
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "https://api.groq.com/openai/v1/chat/completions")
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))
# gpt-oss models spend part of max_tokens on hidden reasoning, so keep this generous
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1200"))
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "20"))
LLM_RETRIES = int(os.getenv("LLM_RETRIES", "2"))
# optional: "low" | "medium" | "high" (only sent when set, because not every model accepts it)
LLM_REASONING_EFFORT = os.getenv("LLM_REASONING_EFFORT")

OLLAMA_URL = os.getenv("OLLAMA_URL")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama2")
USE_OLLAMA_FALLBACK = os.getenv("USE_OLLAMA_FALLBACK", "false").lower() in ("1", "true", "yes")


# HOLIDAY / EVENT ENGINE


try:
    from utils.holiday_engine import get_event_context
except Exception:

    def get_event_context(source: str = "amazon"):
        return {"date": None, "platform": source, "is_sale_event": 0, "event_type": "regular"}



# FASTAPI APP + HEALTH ROUTES


SERVICE_VERSION = "2.2.0"

app = FastAPI(title="Price Prediction Service", version=SERVICE_VERSION)


@app.get("/")
def root():
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}



# LOAD ML MODEL


MODEL_PATH = os.getenv("MODEL_PATH", "xgboost_price_model.pkl")
ENCODERS_PATH = os.getenv("ENCODERS_PATH", "label_encoders.pkl")

try:
    model = joblib.load(MODEL_PATH)
except Exception as e:
    raise RuntimeError(f"Failed to load model '{MODEL_PATH}': {e}")

try:
    encoders = joblib.load(ENCODERS_PATH)
except Exception as e:
    encoders = {}
    log.warning("Failed to load encoders '%s', continuing with empty encoders: %s", ENCODERS_PATH, e)


def _model_feature_names() -> List[str]:
    names = getattr(model, "feature_names_in_", None)
    if names is not None:
        return list(names)
    try:
        return list(model.get_booster().feature_names or [])
    except Exception:
        return []


MODEL_FEATURES = _model_feature_names()


# REQUEST MODEL



class ProductInput(BaseModel):
    product: Dict[str, Any]



# SMALL HELPERS


IST = timezone(timedelta(hours=5, minutes=30))
RANKS = ["Low", "Medium", "High"]
VALID_ACTIONS = {"BUY NOW", "WAIT"}


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        f = float(value)
        return f if math.isfinite(f) else default
    except (TypeError, ValueError):
        return default


def ordinal(n: float) -> str:
    n = int(round(n))
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def encode(col: str, value: Any) -> int:
    le = encoders.get(col)
    if not le:
        return 0
    value = str(value)
    try:
        if hasattr(le, "classes_") and value in le.classes_:
            return int(le.transform([value])[0])
    except Exception:
        return 0
    return 0



# TIMESTAMP PARSING + PRICE HISTORY EXTRACTION


TS_KEYS = (
    "date", "timestamp", "time", "ts", "createdAt", "created_at", "checkedAt",
    "checked_at", "scrapedAt", "scraped_at", "recordedAt", "recorded_at", "updatedAt",
)
PRICE_KEYS = ("price", "currentPrice", "amount", "value")


def parse_ts(value: Any) -> Optional[datetime]:
    """Parse ISO strings / epoch seconds / epoch ms / datetime -> tz-aware IST datetime.
    Naive timestamps are assumed to be UTC."""
    if value is None or value == "" or isinstance(value, bool):
        return None
    try:
        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, (int, float)):
            x = float(value)
            if x > 1e11:  # milliseconds
                x /= 1000.0
            dt = datetime.fromtimestamp(x, tz=timezone.utc)
        else:
            s = str(value).strip()
            if re.fullmatch(r"\d{9,13}(\.\d+)?", s):
                return parse_ts(float(s))
            ts = pd.to_datetime(s, utc=True, errors="coerce")
            if pd.isna(ts):
                return None
            dt = ts.to_pydatetime()
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(IST)
    except Exception:
        return None


def extract_price_points(
    history: List[Any], current_price: float, now: datetime, price_ts: Optional[datetime] = None
) -> Tuple[List[Tuple[Optional[datetime], float]], Dict[str, Any]]:
    """Return [(timestamp|None, price), ...] with the current price as the last point."""
    points: List[Tuple[Optional[datetime], float]] = []

    for item in history or []:
        try:
            if isinstance(item, dict):
                price = next((to_float(item[k], -1) for k in PRICE_KEYS if k in item), -1)
                ts = next((parse_ts(item[k]) for k in TS_KEYS if item.get(k) not in (None, "")), None)
            else:
                price, ts = to_float(item, -1), None
            if price > 0:
                points.append((ts, price))
        except Exception:
            continue

    if points and all(t is not None for t, _ in points):
        points.sort(key=lambda p: p[0])

    last_hist = next((t for t, _ in reversed(points) if t is not None), None)
    freshest = [t for t in (last_hist, price_ts) if t is not None]
    meta = {
        "historyCount": len(points),
        "lastHistoryTs": max(freshest) if freshest else None,  # when the price was last really checked
    }

    if not points or points[-1][1] != current_price:
        stamp = price_ts or now
        if last_hist is not None and stamp < last_hist:
            stamp = last_hist
        points.append((stamp, current_price))

    return points, meta



# TIME-SERIES ANALYSIS


WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def analyze_series(
    points: List[Tuple[Optional[datetime], float]], current_price: float, now: datetime
) -> Dict[str, Any]:
    prices = np.array([p for _, p in points], dtype=float)
    stamps = [t for t, _ in points]
    n = len(prices)

    has_ts = n >= 2 and all(t is not None for t in stamps)
    days = (
        np.array([(t - stamps[0]).total_seconds() / 86400.0 for t in stamps])
        if has_ts
        else np.arange(n, dtype=float)
    )
    if has_ts and (days[-1] - days[0]) < 1e-6:
        has_ts, days = False, np.arange(n, dtype=float)

    mean = float(np.mean(prices))
    median = float(np.median(prices))
    std = float(np.std(prices))
    lo, hi = float(np.min(prices)), float(np.max(prices))
    cv = std / mean * 100 if mean > 0 else 0.0

    def slope_of(x: np.ndarray, y: np.ndarray) -> float:
        if len(y) < 3 or (x[-1] - x[0]) < 1e-9:
            return 0.0
        try:
            return float(np.polyfit(x, y, 1)[0])
        except Exception:
            return 0.0

    slope = slope_of(days, prices)
    mask = days >= (days[-1] - 7) if has_ts else np.arange(n) >= max(0, n - 7)
    recent_slope = slope_of(days[mask], prices[mask])
    slope_pct = slope / mean * 100 if mean > 0 else 0.0
    recent_slope_pct = recent_slope / mean * 100 if mean > 0 else 0.0
    trend_pct = 0.6 * recent_slope_pct + 0.4 * slope_pct  # recent data weighs more

    def change_over(d: int) -> Optional[float]:
        if has_ts:
            target = now - timedelta(days=d)
            idx = [i for i, t in enumerate(stamps) if t <= target]
            if not idx:
                return None
            ref = prices[idx[-1]]
        else:
            if n - 1 - d < 0:
                return None
            ref = prices[n - 1 - d]
        return float((current_price - ref) / ref * 100) if ref > 0 else None

    def window_mean(d: int) -> Optional[float]:
        if has_ts:
            vals = [p for t, p in points if (now - t).total_seconds() <= d * 86400]
        else:
            vals = list(prices[-d:])
        return float(np.mean(vals)) if vals else None

    # price change behaviour
    diffs = np.diff(prices) if n >= 2 else np.array([])
    prev = prices[:-1] if n >= 2 else np.array([])
    moved = np.abs(diffs) > 1e-9
    drops_mask, rises_mask = diffs < -1e-9, diffs > 1e-9
    avg_drop_pct = (
        float(np.mean(-diffs[drops_mask] / prev[drops_mask]) * 100) if drops_mask.any() else 0.0
    )

    # last real price change
    j = next((i for i in range(n - 1, -1, -1) if abs(prices[i] - prices[-1]) > 1e-9), None)
    if j is None:
        days_since_change = float(days[-1] - days[0])
    else:
        k = j + 1
        days_since_change = (
            (now - stamps[k]).total_seconds() / 86400.0 if has_ts else float(n - 1 - k)
        )

    idx_min = n - 1 - int(np.argmin(prices[::-1]))  # latest occurrence of the minimum
    days_since_low = (
        (now - stamps[idx_min]).total_seconds() / 86400.0 if has_ts else float(n - 1 - idx_min)
    )

    spike = None
    if len(diffs) >= 5:
        dstd = float(np.std(diffs))
        if dstd > 0 and abs(diffs[-1]) > 3 * dstd:
            spike = "up" if diffs[-1] > 0 else "down"

    weekday = None
    if has_ts and n >= 14:
        df = pd.DataFrame({"wd": [t.weekday() for t in stamps], "p": prices})
        g = df.groupby("wd")["p"].mean()
        if len(g) >= 3:
            weekday = {
                "cheapestWeekday": WEEKDAYS[int(g.idxmin())],
                "priciestWeekday": WEEKDAYS[int(g.idxmax())],
                "todayVsOverallAvgPct": round(float((g.get(now.weekday(), mean) / mean - 1) * 100), 2),
            }

    interval_h = float(np.median(np.diff(days)) * 24) if has_ts and n >= 2 else None

    direction = "falling" if trend_pct < -0.3 else "rising" if trend_pct > 0.3 else "flat"

    def r(x: Optional[float], d: int = 2) -> Optional[float]:
        return None if x is None else round(float(x), d)

    return {
        "observations": n,
        "hasTimestamps": has_ts,
        "timeBasis": "timestamps" if has_ts else "observation_index",
        "spanDays": r(days[-1] - days[0]) if has_ts else None,
        "medianIntervalHours": r(interval_h),
        "mean": r(mean), "median": r(median), "min": r(lo), "max": r(hi),
        "std": r(std), "cvPercent": r(cv),
        "percentileRank": r(float(np.mean(prices <= current_price) * 100), 1),
        "pctFromMin": r((current_price - lo) / lo * 100 if lo > 0 else 0.0),
        "pctFromMax": r((current_price - hi) / hi * 100 if hi > 0 else 0.0),
        "pctVsAvg": r((current_price - mean) / mean * 100 if mean > 0 else 0.0),
        "zScore": r((current_price - mean) / std if std > 0 else 0.0),
        "sma7": r(window_mean(7)), "sma30": r(window_mean(30)),
        "change7dPct": r(change_over(7)), "change30dPct": r(change_over(30)),
        "slopePctPerDay": r(slope_pct, 3), "recentSlopePctPerDay": r(recent_slope_pct, 3),
        "trendPct": r(trend_pct, 3),
        "direction": direction,
        "lastChange": r(float(diffs[-1])) if len(diffs) else 0.0,
        "priceChanges": int(moved.sum()),
        "dropCount": int(drops_mask.sum()), "riseCount": int(rises_mask.sum()),
        "avgDropPct": r(avg_drop_pct),
        "daysSinceLow": r(days_since_low, 1),
        "daysSinceLastChange": r(days_since_change, 1),
        "recentSpike": spike,
        "weekdayProfile": weekday,
    }


def assess_data_quality(stats: Dict[str, Any], meta: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    n = meta["historyCount"]
    notes: List[str] = []
    level = 2

    if n < 3:
        level = 0
        notes.append("fewer than 3 historical points")
    elif n < 7:
        level = min(level, 1)
        notes.append("short price history")
    if n >= 3 and not stats["hasTimestamps"]:
        level = min(level, 1)
        notes.append("no usable timestamps; assuming evenly spaced observations")

    hours_since = None
    stale = False
    if meta.get("lastHistoryTs") is not None:
        hours_since = (now - meta["lastHistoryTs"]).total_seconds() / 3600.0
        if hours_since > 72:
            stale = True
            level = min(level, 1)
            notes.append("the latest price check is more than 3 days old")
        if hours_since > 336:
            level = 0
            notes.append("the price data is more than 14 days old and may be outdated")

    return {
        "level": ["low", "medium", "high"][level],
        "historyPoints": n,
        "hasTimestamps": stats["hasTimestamps"],
        "spanDays": stats["spanDays"],
        "hoursSinceLastObservation": None if hours_since is None else round(hours_since, 1),
        "stale": stale,
        "notes": notes,
    }



# TIME / CALENDAR CONTEXT



def build_time_context(now: datetime) -> Dict[str, Any]:
    month_end = (now.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    days_to_month_end = (month_end.date() - now.date()).days
    festive = (now.month == 9 and now.day >= 15) or now.month == 10 or (now.month == 11 and now.day <= 20)
    hour = now.hour
    part = "night" if hour < 5 else "morning" if hour < 12 else "afternoon" if hour < 17 else "evening" if hour < 21 else "night"
    return {
        "nowIST": now.strftime("%Y-%m-%d %H:%M"),
        "weekday": WEEKDAYS[now.weekday()],
        "isWeekend": now.weekday() >= 5,
        "dayPart": part,
        "month": now.month,
        "dayOfMonth": now.day,
        "daysToMonthEnd": days_to_month_end,
        "isFestiveSeason": bool(festive),
    }



# FAKE DISCOUNT DETECTION



def detect_fake_discount(product: Dict[str, Any], avg_price: float, history_points: int) -> str:
    try:
        mrp = float(product.get("mrp", 0) or 0)
        current = float(product.get("currentPrice", 0) or 0)
    except Exception:
        return "Unknown"

    # with almost no history, "avg == current" says nothing, so do not accuse
    if mrp == 0 or history_points < 5:
        return "Unknown"

    discount = (mrp - current) / mrp * 100
    if discount > 40 and abs(current - avg_price) < max(1.0, avg_price * 0.05):
        return "Fake"
    return "Genuine"



# RULE ENGINE (deterministic, explainable)



def compute_rule_engine(
    stats: Dict[str, Any],
    tctx: Dict[str, Any],
    event: Dict[str, Any],
    discount_check: str,
    discount_pct: float,
    expected_drop_pct: float,
    dq: Dict[str, Any],
) -> Dict[str, Any]:
    """Score 0-100. Above 50 favours BUY NOW, below 50 favours WAIT."""
    n = stats["observations"]
    hist_w = {"low": 0.4, "medium": 0.75, "high": 1.0}[dq["level"]]
    factors: List[Dict[str, Any]] = []

    def add(name: str, impact: float, note: str, history: bool = False) -> None:
        impact = round(impact * (hist_w if history else 1.0), 1)
        if abs(impact) >= 0.5:
            factors.append({"factor": name, "impact": impact, "note": note})

    unit = "day" if stats["hasTimestamps"] else "observation"
    at_low = n >= 3 and stats["max"] > stats["min"] * 1.01 and stats["pctFromMin"] <= 2

    if n >= 3:
        pct = stats["percentileRank"]
        add("price_position", (50 - pct) * 0.3,
            f"the price sits at the {ordinal(pct)} percentile of its recorded history", True)

        if stats["max"] > stats["min"] * 1.01:
            if at_low:
                add("near_low", 10, "it is within 2% of its lowest recorded price", True)
                if stats["lastChange"] < 0:
                    add("recent_drop", 6, "the price has just dropped to its lowest recorded level", True)
            if stats["pctFromMax"] >= -2:
                add("near_high", -10, "it is within 2% of its highest recorded price", True)

        tp = stats["trendPct"]
        # a trend from 3-4 untimed points is noise, so require timestamps or 5+ observations
        if abs(tp) >= 0.1 and (stats["hasTimestamps"] or n >= 5):
            impact = clamp(tp * 10, -15, 15)
            if at_low and impact < 0:
                impact *= 0.5  # the fall is what brought it to the low; further drops are limited
            add("trend", impact,
                f"the price trend is {stats['direction']} at about {abs(tp):.2f}% per {unit}", True)

    if n >= 8 and stats["sma7"] and stats["sma30"]:
        if stats["sma7"] < stats["sma30"] * 0.97:
            add("sma_cross", -5, "the 7-day average is below the 30-day average, confirming a downtrend", True)
        elif stats["sma7"] > stats["sma30"] * 1.03:
            add("sma_cross", 5, "the 7-day average is above the 30-day average, showing rising prices", True)

    if stats["recentSpike"] == "up":
        add("spike", -4, "the latest price jumped sharply, which often partly reverses", True)
    elif stats["recentSpike"] == "down":
        add("spike", 4, "the price just dropped sharply", True)

    if event.get("is_sale_event"):
        if at_low:
            add("sale_event", -8, "a sale event is active, although the price is already at its recorded low")
        else:
            add("sale_event", -20, f"a {str(event.get('event_type', 'sale')).replace('_', ' ')} event is active or imminent")
    elif tctx["isFestiveSeason"]:
        add("festive_season", -6, "it is festive season and deeper discounts often appear")

    add("model_drop", -clamp(expected_drop_pct * 1.2, -12, 20),
        "the price model expects the price to fall"
        if expected_drop_pct > 0 else "the price model does not expect a drop", True)

    if discount_check == "Fake":
        add("discount_quality", -5, "the advertised discount looks inflated compared with the usual price")
    elif discount_check == "Genuine" and discount_pct >= 25:
        add("discount_quality", 4, f"the {discount_pct:.0f}% discount is backed by the price history")

    if n >= 5 and stats["cvPercent"] >= 8:
        if stats["pctVsAvg"] > 0:
            add("volatility", -5,
                f"prices swing widely ({stats['cvPercent']:.0f}% variation) and the current price is above average", True)
        else:
            add("volatility", 4,
                "prices swing widely but the current price is below average", True)

    score = clamp(50 + sum(f["impact"] for f in factors), 0, 100)
    action = "BUY NOW" if score >= 58 else "WAIT" if score <= 42 else "NEUTRAL"

    margin = abs(score - 50)
    conf_idx = 2 if margin >= 24 else 1 if margin >= 12 else 0
    cap = {"low": 0, "medium": 1, "high": 2}[dq["level"]]
    conf_idx = min(conf_idx, cap)

    factors.sort(key=lambda f: abs(f["impact"]), reverse=True)
    return {
        "score": round(score, 1),
        "ruleAction": action,
        "confidence": RANKS[conf_idx],
        "confidenceCap": RANKS[cap],
        "factors": factors,
    }


def rule_action_resolved(rule: Dict[str, Any]) -> str:
    if rule["ruleAction"] in VALID_ACTIONS:
        return rule["ruleAction"]
    return "BUY NOW" if rule["score"] >= 50 else "WAIT"


def build_rule_explanation(action: str, rule: Dict[str, Any]) -> str:
    supporting = [f for f in rule["factors"] if (f["impact"] > 0) == (action == "BUY NOW")][:3]
    notes = [f["note"] for f in supporting] or [f["note"] for f in rule["factors"][:2]]
    lead = "Buying now looks reasonable" if action == "BUY NOW" else "Waiting looks better"
    if not notes:
        return f"{lead} because there is no strong signal either way."
    if len(notes) == 1:
        return f"{lead} because {notes[0]}."
    return f"{lead} because {', '.join(notes[:-1])} and {notes[-1]}."


def short_insight(event: Dict[str, Any], stats: Dict[str, Any], tctx: Dict[str, Any]) -> str:
    if event.get("is_sale_event") == 1:
        return "Sale imminent"
    if stats["observations"] >= 3 and stats["max"] > stats["min"] * 1.01 and stats["pctFromMin"] <= 2:
        return "Near low"
    if stats["direction"] == "falling":
        return "Price falling"
    if stats["cvPercent"] >= 12:
        return "High volatility"
    if tctx["isFestiveSeason"]:
        return "Festive season"
    return "Monitor"



# ADVANCED PROMPT ENGINEERING


SYSTEM_PROMPT = """You are PriceSense, a senior e-commerce pricing analyst for Indian online shoppers.
Your job: decide whether the shopper should BUY NOW or WAIT for one product, using only the structured data provided.

# HOW TO READ THE INPUT
- product: current price, MRP, discount, rating, platform.
- timeSeries: statistics computed from the price history. percentileRank = share of history at or below the current price (low = cheap). pctFromMin / pctFromMax / pctVsAvg = distance of the current price from the lowest / highest / average price. trendPct = time-weighted trend in percent per day (negative = falling). change7dPct / change30dPct = price change over those windows. sma7 vs sma30 = short vs long moving average. cvPercent = volatility. daysSinceLow and daysSinceLastChange describe timing. recentSpike flags a sudden jump or drop.
- timeContext: current IST time, weekday, festive season flag, days to month end.
- event: whether a sale event is active or imminent.
- ruleEngine: a deterministic prior. score > 50 favours BUY NOW, < 50 favours WAIT. factors show why. Treat it as advice, not as an order.
- dataQuality: reliability of the history. Weak data must lower your confidence.
- recentPrices: last observations as [time, price] pairs.

# DECISION FRAMEWORK (reason silently, in this order)
1. PRICE POSITION: is the current price cheap or expensive versus its own history (percentile, pctFromMin, pctVsAvg)?
2. TREND AND MOMENTUM: is the price falling, rising or flat (trendPct, change7dPct, change30dPct, sma7 vs sma30, recentSpike)?
3. TIMING: sale event, festive season, weekday profile, how long the price has been unchanged.
4. DEAL QUALITY: is the discount genuine (discountCheck) and is volatility high enough that a dip is likely?
5. DATA RELIABILITY: how much history exists, is it fresh, does it have timestamps?

# PRIORITY RULES
- An active or imminent sale event normally outweighs everything except a price already at its historical low.
- Price within about 2% of its lowest recorded price and not clearly falling -> lean BUY NOW.
- Clearly falling trend (direction "falling" and change7dPct below -2) -> lean WAIT unless the price is already at the low.
- Rising trend with no sale event and a price below average -> lean BUY NOW, because waiting is likely to cost more.
- If signals conflict, follow the stronger, better-supported group and lower the confidence.
- If the price is already at or within 2% of its recorded low, a sale event alone is NOT enough to WAIT: further drops are usually small. Prefer BUY NOW unless the trend is clearly falling on 5+ observations.
- A recent sharp drop that reached the recorded low is a buying signal, not a reason to wait.
- With fewer than 5 observations, do not cite a per-observation trend as evidence.
- If dataQuality.stale is true, the current price itself may be outdated: cap confidence at "Low", add a riskFlag about old data and use revisitInDays of 2 or less.
- If product.inStock is false, the item cannot be bought at this price: choose WAIT and mention availability.
- event.daysUntil tells how many days remain before a sale event starts; a sale 7 or more days away is a weak reason to wait.
- You may disagree with ruleEngine only when you can name a specific data point that justifies it.

# CONFIDENCE CALIBRATION
- High: at least three independent signals agree AND dataQuality.level is "high".
- Medium: signals mostly agree, or data quality is "medium".
- Low: signals conflict, or dataQuality.level is "low", or the history is very short.
- Never output a confidence above dataQuality.confidenceCap in ruleEngine.

# OUTPUT CONTRACT
Return exactly ONE JSON object and nothing else (no markdown, no code fences, no text before or after):
{
  "action": "BUY NOW" | "WAIT",
  "confidence": "Low" | "Medium" | "High",
  "explanation": "2-3 plain English sentences that cite at least two concrete numbers from the data",
  "insight": "1-3 word English label",
  "keyFactors": ["up to 3 short phrases, max 12 words each"],
  "riskFlags": ["up to 3 short phrases, or an empty list"],
  "revisitInDays": integer from 0 to 30 (0 when action is BUY NOW; otherwise when to check the price again)
}

# HARD PROHIBITIONS
- English only.
- Never state, estimate or hint at a future or predicted price in currency. Percentages that appear in the input may be cited.
- Never invent numbers, sales, dates or facts that are not in the input.
- Never mention machine-learning models, model predictions or predicted drop percentages.
- Never output your reasoning or chain of thought.
- Only quote percentages and rupee amounts that appear in the input. Never mention prediction models or forecasts.
- Never guarantee an outcome; use calibrated wording such as "likely" or "suggests"."""


_FEW_SHOTS: List[Tuple[Dict[str, Any], Dict[str, Any]]] = [
    (
        {
            "product": {"platform": "amazon", "currentPrice": 24999, "mrp": 32999, "discountPercent": 24.2},
            "discountCheck": "Genuine",
            "timeSeries": {"observations": 30, "timeBasis": "timestamps", "percentileRank": 88.0,
                           "pctFromMin": 9.5, "pctVsAvg": 4.1, "trendPct": -0.85, "direction": "falling",
                           "change7dPct": -3.4, "sma7": 25400, "sma30": 26100, "cvPercent": 4.2,
                           "daysSinceLow": 12.0, "recentSpike": None},
            "timeContext": {"weekday": "Sat", "isFestiveSeason": True, "daysToMonthEnd": 11},
            "event": {"eventType": "festival_sale", "isSaleEvent": True},
            "ruleEngine": {"score": 24.0, "ruleAction": "WAIT", "confidenceCap": "High"},
            "dataQuality": {"level": "high"},
        },
        {
            "action": "WAIT", "confidence": "High",
            "explanation": "A festival sale is active or imminent and the price has fallen 3.4% over the last 7 days. It still sits at the 88th percentile of its history, about 9.5% above its recorded low, so a better price is likely soon.",
            "insight": "Sale imminent",
            "keyFactors": ["Festival sale active or imminent", "Falling 7-day trend", "Price near top of range"],
            "riskFlags": ["Stock may run out during the sale"],
            "revisitInDays": 2,
        },
    ),
    (
        {
            "product": {"platform": "flipkart", "currentPrice": 1199, "mrp": 1999, "discountPercent": 40.0},
            "discountCheck": "Genuine",
            "timeSeries": {"observations": 21, "timeBasis": "timestamps", "percentileRank": 9.0,
                           "pctFromMin": 0.8, "pctVsAvg": -11.5, "trendPct": 0.42, "direction": "rising",
                           "change7dPct": 5.2, "sma7": 1185, "sma30": 1330, "cvPercent": 9.1,
                           "daysSinceLow": 1.0, "recentSpike": None},
            "timeContext": {"weekday": "Tue", "isFestiveSeason": False, "daysToMonthEnd": 20},
            "event": {"eventType": "regular", "isSaleEvent": False},
            "ruleEngine": {"score": 78.0, "ruleAction": "BUY NOW", "confidenceCap": "High"},
            "dataQuality": {"level": "high"},
        },
        {
            "action": "BUY NOW", "confidence": "High",
            "explanation": "The price is within 0.8% of its lowest recorded level and cheaper than 91% of its history. It has started rising again (+5.2% in 7 days) and no sale event is expected, so waiting would likely cost more.",
            "insight": "Near low",
            "keyFactors": ["Within 1% of historical low", "Price now rising", "No sale event ahead"],
            "riskFlags": [],
            "revisitInDays": 0,
        },
    ),
    (
        {
            "product": {"platform": "amazon", "currentPrice": 4599, "mrp": 6999, "discountPercent": 34.3},
            "discountCheck": "Unknown",
            "timeSeries": {"observations": 3, "timeBasis": "observation_index", "percentileRank": 67.0,
                           "pctFromMin": 2.2, "pctVsAvg": 1.0, "trendPct": 0.0, "direction": "flat",
                           "change7dPct": None, "cvPercent": 1.5},
            "timeContext": {"weekday": "Wed", "isFestiveSeason": False, "daysToMonthEnd": 9},
            "event": {"eventType": "regular", "isSaleEvent": False},
            "ruleEngine": {"score": 47.5, "ruleAction": "NEUTRAL", "confidenceCap": "Low"},
            "dataQuality": {"level": "low", "notes": ["fewer than 3 historical points"]},
        },
        {
            "action": "WAIT", "confidence": "Low",
            "explanation": "Only 3 price points are available, so the trend cannot be trusted. The price is flat and just 1.0% above its average, so nothing here makes buying urgent; checking again in a few days is safer.",
            "insight": "Limited data",
            "keyFactors": ["Very short price history", "Flat trend", "No sale signal"],
            "riskFlags": ["Limited price history"],
            "revisitInDays": 3,
        },
    ),
]


_FEW_SHOTS.append((
    {
        "product": {"platform": "amazon", "currentPrice": 2999, "mrp": 6799, "discountPercent": 55.9},
        "discountCheck": "Unknown",
        "timeSeries": {"observations": 4, "timeBasis": "observation_index", "percentileRank": 25.0,
                       "pctFromMin": 0.0, "pctVsAvg": -5.2, "direction": "falling", "change7dPct": None,
                       "cvPercent": 5.1, "recentSpike": None},
        "timeContext": {"weekday": "Sat", "isFestiveSeason": True, "daysToMonthEnd": 11},
        "event": {"eventType": "festival_sale", "isSaleEvent": True},
        "ruleEngine": {"score": 56.0, "ruleAction": "NEUTRAL", "confidenceCap": "Medium"},
        "dataQuality": {"level": "medium", "notes": ["short price history"]},
    },
    {
        "action": "BUY NOW", "confidence": "Medium",
        "explanation": "The price has just dropped to its lowest recorded level, 5.2% below its average, and the discount is about 56% off MRP. A sale is active, but with the price already at its recorded low there is little room left to fall.",
        "insight": "At recorded low",
        "keyFactors": ["Price at lowest recorded level", "Little room left to fall", "Deep discount vs MRP"],
        "riskFlags": ["Short price history", "Sale may trim the price slightly"],
        "revisitInDays": 0,
    },
))


def _days_until(date_str: Any) -> Optional[int]:
    try:
        d = datetime.strptime(str(date_str)[:10], "%Y-%m-%d").date()
        return (d - datetime.now(IST).date()).days
    except Exception:
        return None


def build_llm_context(
    product: Dict[str, Any],
    current_price: float,
    mrp: float,
    discount_pct: float,
    rating: float,
    review_count: float,
    discount_check: str,
    stats: Dict[str, Any],
    tctx: Dict[str, Any],
    event: Dict[str, Any],
    rule: Dict[str, Any],
    dq: Dict[str, Any],
    points: List[Tuple[Optional[datetime], float]],
) -> Dict[str, Any]:
    recent = []
    tail = points[-25:]
    for i, (t, p) in enumerate(tail):
        label = t.strftime("%Y-%m-%d %H:%M") if t is not None else f"#{len(points) - len(tail) + i}"
        recent.append([label, round(p, 2)])

    keep = ("observations", "timeBasis", "spanDays", "medianIntervalHours", "mean", "median", "min", "max",
            "cvPercent", "percentileRank", "pctFromMin", "pctFromMax", "pctVsAvg", "zScore", "sma7", "sma30",
            "change7dPct", "change30dPct", "trendPct", "direction", "priceChanges", "dropCount", "riseCount",
            "avgDropPct", "daysSinceLow", "daysSinceLastChange", "recentSpike", "weekdayProfile")

    return {
        "product": {
            "category": product.get("category", "Unknown"),
            "platform": product.get("source", "amazon"),
            "currentPrice": round(current_price, 2),
            "mrp": round(mrp, 2),
            "discountPercent": round(discount_pct, 1),
            "rating": rating,
            "reviewCount": int(review_count),
            "inStock": product.get("inStock"),
        },
        "discountCheck": discount_check,
        "timeSeries": {k: stats.get(k) for k in keep},
        "timeContext": tctx,
        "event": {
            "eventType": event.get("event_type", "regular"),
            "isSaleEvent": bool(event.get("is_sale_event")),
            "date": event.get("date"),
            "daysUntil": _days_until(event.get("date")),
        },
        "ruleEngine": {
            "score": rule["score"],
            "ruleAction": rule["ruleAction"],
            "confidenceCap": rule["confidenceCap"],
            "factors": [{"factor": f["factor"], "impact": f["impact"]} for f in rule["factors"][:6]],
        },
        "dataQuality": dq,
        "recentPrices": recent,
    }


def build_messages(ctx: Dict[str, Any]) -> List[Dict[str, str]]:
    dump = lambda o: json.dumps(o, separators=(",", ":"), ensure_ascii=False, default=str)
    messages: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for example_in, example_out in _FEW_SHOTS:
        messages.append({"role": "user", "content": f"DATA:\n{dump(example_in)}\nReturn the JSON object only."})
        messages.append({"role": "assistant", "content": dump(example_out)})
    messages.append({
        "role": "user",
        "content": f"DATA:\n{dump(ctx)}\nAnalyze every lens of the framework, then return the JSON object only.",
    })
    return messages



# LLM RESPONSE PARSING



def extract_json_from_text(text: Optional[str]) -> Optional[Dict[str, Any]]:
    if not text or not isinstance(text, str):
        return None

    s = re.sub(r"<think>.*?</think>", "", text, flags=re.S | re.I).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", s, flags=re.S | re.I)
    if fence:
        s = fence.group(1).strip()

    first, last = s.find("{"), s.rfind("}")
    if first == -1 or last < first:
        return None
    candidate = s[first:last + 1]

    try:
        return json.loads(candidate)
    except Exception:
        pass
    try:
        fixed = re.sub(r'([{\s,])([a-zA-Z0-9_]+)\s*:', r'\1"\2":', candidate).replace("'", '"')
        return json.loads(fixed)
    except Exception:
        return None


def parse_kv_text(text: Optional[str]) -> Optional[Dict[str, Any]]:
    """Last-resort parser for 'Action: WAIT' style answers."""
    if not text or not isinstance(text, str):
        return None

    result: Dict[str, Any] = {}
    for line in [ln.strip() for ln in re.split(r"[\r\n]+", text) if ln.strip()]:
        m = re.match(r"^\s*\*{0,2}([A-Za-z ]{3,30})\*{0,2}\s*[:\-]\s*(.+)$", line)
        if not m:
            continue
        key, value = m.group(1).strip().lower(), m.group(2).strip()
        if "action" in key:
            result["action"] = value.upper()
        elif "confidence" in key:
            result["confidence"] = value.title()
        elif "explanation" in key or "reason" in key:
            result["explanation"] = value
        elif "insight" in key or "note" in key or "summary" in key:
            result["insight"] = value

    if not result:
        a = re.search(r"\b(BUY NOW|WAIT)\b", text, re.I)
        if a:
            result["action"] = a.group(0).upper()
        c = re.search(r"Confidence\s*[:\-]\s*(Low|Medium|High)", text, re.I)
        if c:
            result["confidence"] = c.group(1).title()
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            if len(sentence.strip()) > 15 and "action" not in sentence.lower() and "confidence" not in sentence.lower():
                result["explanation"] = sentence.strip()
                break

    return result or None



# OUTPUT SANITISING (English only, no future price)


_FUTURE_PRICE_RE = re.compile(
    r"(?:future|predicted|forecast(?:ed)?|projected|target)\s+(?:price|value|cost)"
    r"|\b(?:drop|fall|decline|reach|hit)s?\s+(?:to|at|around|near)\s+(?:rs\.?|inr|₹|\$)?\s*\d",
    re.I,
)


def is_english(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return not letters or sum(c.isascii() for c in letters) / len(letters) >= 0.9


def scrub_text(text: Any, max_len: int = 500) -> str:
    if not isinstance(text, str):
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    kept = " ".join(s for s in sentences if not _FUTURE_PRICE_RE.search(s)).strip()
    if not kept or not is_english(kept):
        return ""
    return kept[:max_len]


def clean_list(value: Any, limit: int = 3, max_len: int = 90) -> List[str]:
    if not isinstance(value, list):
        return []
    out = [scrub_text(v, max_len) for v in value]
    return [v for v in out if v][:limit]


def normalize_llm_output(parsed: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not parsed or not isinstance(parsed, dict):
        return None

    action = str(parsed.get("action", "")).strip().upper().replace("_", " ")
    if action == "BUY":
        action = "BUY NOW"
    if action not in VALID_ACTIONS:
        return None

    conf = str(parsed.get("confidence", "")).strip().title()
    insight = scrub_text(parsed.get("insight"), 30)
    if len(insight.split()) > 3:
        insight = ""

    try:
        revisit = int(clamp(int(float(parsed.get("revisitInDays"))), 0, 30))
    except (TypeError, ValueError):
        revisit = None

    return {
        "action": action,
        "confidence": conf if conf in RANKS else None,
        "explanation": scrub_text(parsed.get("explanation")),
        "insight": insight,
        "keyFactors": clean_list(parsed.get("keyFactors")),
        "riskFlags": clean_list(parsed.get("riskFlags")),
        "revisitInDays": revisit,
    }


def _collect_numbers(o: Any, out: set) -> None:
    if isinstance(o, bool):
        return
    if isinstance(o, (int, float)):
        out.add(abs(float(o)))
    elif isinstance(o, dict):
        for v in o.values():
            _collect_numbers(v, out)
    elif isinstance(o, (list, tuple)):
        for v in o:
            _collect_numbers(v, out)


def is_grounded(text: str, ctx: Dict[str, Any]) -> bool:
    """Every % value and rupee amount in the text must exist in the data sent to the LLM
    (or be 100 minus a percentile). Anything else is treated as invented."""
    if not text:
        return True
    nums: set = set()
    _collect_numbers(ctx, nums)
    nums |= {100 - x for x in list(nums) if 0 <= x <= 100}

    def known(v: float, rel: float, absolute: float) -> bool:
        return any(abs(v - x) <= max(absolute, x * rel) for x in nums)

    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*%", text):
        if not known(float(m.group(1)), 0.02, 0.6):
            return False
    for m in re.finditer(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)", text, re.I):
        try:
            if not known(float(m.group(1).replace(",", "")), 0.005, 1.0):
                return False
        except ValueError:
            return False
    return True



# LLM PROVIDERS



def call_groq(messages: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    if not GROQ_API_KEY:
        log.info("GROQ_API_KEY missing; skipping GROQ call.")
        return None

    body: Dict[str, Any] = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": LLM_TEMPERATURE,
        "max_tokens": LLM_MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }
    if LLM_REASONING_EFFORT:
        body["reasoning_effort"] = LLM_REASONING_EFFORT

    for attempt in range(LLM_RETRIES + 1):
        try:
            resp = requests.post(
                LLM_ENDPOINT,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json=body,
                timeout=LLM_TIMEOUT,
            )
            log.info("GROQ STATUS: %s", resp.status_code)

            if resp.status_code == 400 and "response_format" in body:
                log.warning("GROQ rejected response_format; retrying without it: %s", resp.text[:300])
                body.pop("response_format", None)
                continue
            if resp.status_code in (429, 500, 502, 503, 504):
                time.sleep(0.6 * (attempt + 1))
                continue
            if resp.status_code != 200:
                log.warning("GROQ ERROR BODY: %s", resp.text[:500])
                return None

            data = resp.json()
            choice = (data.get("choices") or [{}])[0]
            raw = (choice.get("message") or {}).get("content") or choice.get("text")

            parsed = extract_json_from_text(raw) or parse_kv_text(raw)
            if parsed:
                return {"parsed": parsed}
            log.warning("GROQ returned unparseable content; retrying.")
        except Exception as e:
            log.warning("GROQ CALL EXCEPTION: %s", e)
            time.sleep(0.5)

    return None


def call_ollama(messages: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    if not OLLAMA_URL:
        return None

    prompt = "\n\n".join(f"{m['role'].upper()}:\n{m['content']}" for m in messages) + "\n\nASSISTANT:\n"
    try:
        resp = requests.post(
            f"{OLLAMA_URL.rstrip('/')}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,  # Ollama streams NDJSON by default, which breaks resp.json()
                "format": "json",
                "options": {"temperature": LLM_TEMPERATURE, "num_predict": 500},
            },
            timeout=max(LLM_TIMEOUT, 30),
        )
        log.info("OLLAMA STATUS: %s", resp.status_code)
        if resp.status_code != 200:
            log.warning("OLLAMA BODY: %s", resp.text[:500])
            return None

        data = resp.json()
        raw = data.get("response") if isinstance(data, dict) else None
        parsed = extract_json_from_text(raw) or parse_kv_text(raw)
        return {"parsed": parsed} if parsed else None
    except Exception as e:
        log.warning("OLLAMA CALL EXCEPTION: %s", e)
        return None


def call_llm_analytical(ctx: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    messages = build_messages(ctx)

    groq = call_groq(messages)
    if groq and groq.get("parsed"):
        return {"provider": "groq", **groq}

    if USE_OLLAMA_FALLBACK and OLLAMA_URL:
        log.info("GROQ failed/unparseable. Trying Ollama fallback.")
        ollama = call_ollama(messages)
        if ollama and ollama.get("parsed"):
            return {"provider": "ollama", **ollama}

    return None



# RECONCILE LLM WITH RULE ENGINE



def reconcile(llm: Optional[Dict[str, Any]], rule: Dict[str, Any], provider: Optional[str]) -> Dict[str, Any]:
    rule_act = rule_action_resolved(rule)
    cap = RANKS.index(rule["confidenceCap"])
    rule_conf = RANKS.index(rule["confidence"])
    risk_flags: List[str] = []

    # --- no usable LLM answer: rules only ---
    if not llm:
        return {
            "action": rule_act,
            "confidence": RANKS[rule_conf],
            "explanation": build_rule_explanation(rule_act, rule),
            "insight": "",
            "keyFactors": [f["note"][:90] for f in rule["factors"][:3]],
            "riskFlags": risk_flags,
            "revisitInDays": None,
            "source": "fallback",
        }

    action = llm["action"]
    conf_idx = RANKS.index(llm["confidence"]) if llm["confidence"] in RANKS else rule_conf
    explanation = llm["explanation"]
    source = provider or "llm"

    disagrees = rule["ruleAction"] in VALID_ACTIONS and action != rule["ruleAction"]
    if disagrees:
        if abs(rule["score"] - 50) >= 20 and rule["confidenceCap"] != "Low":
            # strong deterministic signal: the guardrail wins
            action = rule["ruleAction"]
            conf_idx = rule_conf
            explanation = build_rule_explanation(action, rule)
            source = "rules_guardrail"
            risk_flags.append("AI opinion overridden by strong price signals")
        else:
            conf_idx = max(0, conf_idx - 1)
            risk_flags.append("Signals are mixed")

    conf_idx = min(conf_idx, cap)
    if not explanation:
        explanation = build_rule_explanation(action, rule)

    return {
        "action": action,
        "confidence": RANKS[conf_idx],
        "explanation": explanation,
        "insight": llm["insight"] if source != "rules_guardrail" else "",
        "keyFactors": llm["keyFactors"] if source != "rules_guardrail" else [f["note"][:90] for f in rule["factors"][:3]],
        "riskFlags": (llm["riskFlags"] if source != "rules_guardrail" else []) + risk_flags,
        "revisitInDays": llm["revisitInDays"],
        "source": source,
    }



# MAIN PREDICTION ENDPOINT



@app.post("/predict")
def predict(data: ProductInput):
    product = data.product or {}
    now = datetime.now(IST)

   
    # PRODUCT VALUES
   
    current_price = to_float(product.get("currentPrice"), 0.0)
    if current_price <= 0:
        return {"success": False, "message": "currentPrice must be a positive number"}

    mrp = to_float(product.get("mrp"), current_price) or current_price
    rating = to_float(product.get("rating"), 4.0) or 4.0
    review_count = to_float(product.get("reviewCount"), 500.0) or 500.0
    discount_percent = (mrp - current_price) / mrp * 100 if mrp > 0 else 0.0

   
    # TIME / EVENT CONTEXT
   
    tctx = build_time_context(now)
    try:
        event = get_event_context(product.get("source", "amazon")) or {}
    except Exception as e:
        log.warning("Event engine failed: %s", e)
        event = {}

   
    # PRICE HISTORY + TIME-SERIES ANALYSIS
   
    price_ts = parse_ts(product.get("lastChecked") or product.get("checkedAt") or product.get("updatedAt"))
    if price_ts is not None and price_ts > now:
        price_ts = now
    points, meta = extract_price_points(product.get("history", []) or [], current_price, now, price_ts)
    prices = [p for _, p in points]
    stats = analyze_series(points, current_price, now)
    dq = assess_data_quality(stats, meta, now)

    avg_price = stats["mean"]
    min_price, max_price = stats["min"], stats["max"]
    volatility = stats["std"]
    trend = stats["lastChange"]

   
    # ML MODEL
   
    row = {
        "price": current_price,
        "discount_percent": discount_percent,
        "quantity_sold": 100,
        "rating": rating,
        "review_count": review_count,
        "product_category": encode("product_category", product.get("category", "Electronics")),
        "customer_region": encode("customer_region", "India"),
        "payment_method": encode("payment_method", "UPI"),
        "platform": encode("platform", product.get("source", "amazon")),
        "is_sale_event": event.get("is_sale_event", 0),
        "event_type": encode("event_type", event.get("event_type", "regular")),
        "is_weekend": 1 if now.weekday() >= 5 else 0,
        "year": now.year,
        "month": now.month,
        "day": now.day,
        "weekday": now.weekday(),
    }
    input_df = pd.DataFrame([row])
    if MODEL_FEATURES:
        input_df = input_df.reindex(columns=MODEL_FEATURES, fill_value=0)

    model_valid = True
    try:
        predicted_price = float(model.predict(input_df)[0])
    except Exception as e:
        log.error("MODEL PREDICT ERROR (continuing without ML): %s", e)
        predicted_price = current_price
        model_valid = False

    if not math.isfinite(predicted_price) or predicted_price <= 0:
        predicted_price = current_price
        model_valid = False

   
    # INTERNAL FUTURE PRICE (never returned, never sent to the LLM)
   
    # trend projection only when the trend is trustworthy
    trend_ok = stats["hasTimestamps"] or stats["observations"] >= 5
    slope_per_step = (stats["trendPct"] or 0.0) / 100 * avg_price if trend_ok else 0.0
    slope_projection = current_price + slope_per_step * 7

    # sanity-check the ML output: a price >35% away from the current one means wrong scale or bad features
    model_trusted = (
        model_valid
        and abs(predicted_price - current_price) / current_price <= 0.35
        and (stats["observations"] < 3 or min_price * 0.6 <= predicted_price <= max_price * 1.4)
    )
    if not model_trusted:
        log.warning("ML output %.2f is implausible for current price %.2f; ignoring it", predicted_price, current_price)
    w_model = 0.25 if model_trusted else 0.0

    future_price_internal = (
        predicted_price * w_model
        + avg_price * 0.35
        + current_price * (0.25 + (0.25 - w_model))
        + slope_projection * 0.15
    )
    future_price_internal = max(current_price * 0.8, min(future_price_internal, current_price * 1.2))

    # signed: positive = model expects a drop
    expected_drop_signed = (current_price - future_price_internal) / current_price * 100

    # a drop bigger than the room down to the recorded low (+ small allowance) is not plausible
    if stats["observations"] >= 3:
        room = max(0.0, (current_price - min_price) / current_price * 100)
        allowance = 5.0 if event.get("is_sale_event") else 3.0
        expected_drop_signed = min(expected_drop_signed, room + allowance)
    else:
        expected_drop_signed = min(expected_drop_signed, 8.0)

    # untrusted ML output must have no influence at all (rules, response or LLM)
    if not model_trusted:
        expected_drop_signed = 0.0
    expected_drop_percent = max(0.0, expected_drop_signed)

   
    # DISCOUNT CHECK + RULE ENGINE
   
    discount_check = detect_fake_discount(product, avg_price, meta["historyCount"])
    rule = compute_rule_engine(stats, tctx, event, discount_check, discount_percent, expected_drop_signed, dq)
    # the LLM never sees anything derived from the ML model
    rule_llm = compute_rule_engine(stats, tctx, event, discount_check, discount_percent, 0.0, dq)

   
    # LLM ANALYSIS (advanced prompt) + GUARDRAILS
   
    ctx = build_llm_context(
        product, current_price, mrp, discount_percent, rating, review_count,
        discount_check, stats, tctx, event, rule_llm, dq, points,
    )
    llm_response = call_llm_analytical(ctx)
    llm_norm = normalize_llm_output(llm_response.get("parsed")) if llm_response else None
    if llm_norm:
        if not is_grounded(llm_norm["explanation"], ctx):
            log.warning("LLM explanation had numbers not in the data; using the rule explanation instead")
            llm_norm["explanation"] = ""
        for key in ("keyFactors", "riskFlags"):
            llm_norm[key] = [t for t in llm_norm[key] if is_grounded(t, ctx)]
    final = reconcile(llm_norm, rule, llm_response.get("provider") if llm_response else None)

    if not final["explanation"]:
        final["explanation"] = build_rule_explanation(final["action"], rule)

    in_stock = product.get("inStock")
    availability = "out_of_stock" if in_stock is False else "in_stock" if in_stock is True else "unknown"

    if availability == "out_of_stock":
        final["action"] = "WAIT"
        final["confidence"] = "Low"
        final["explanation"] = (
            "This item is currently out of stock, so the listed price may not be available. "
            "Check again when it is back in stock before deciding."
        )
        final["keyFactors"] = ["Item is out of stock"] + [k for k in final["keyFactors"] if k][:2]
        final["riskFlags"] = ["Item is out of stock"] + final["riskFlags"]
        final["insight"] = "Out of stock"
        final["source"] = "availability_guardrail"
        final["revisitInDays"] = 3

    if dq["stale"] and "Price data is old; re-check before buying" not in final["riskFlags"]:
        final["riskFlags"] = (final["riskFlags"] + ["Price data is old; re-check before buying"])[:4]
        final["confidence"] = "Low" if dq["level"] == "low" else final["confidence"]

    revisit = final["revisitInDays"]
    if final["action"] == "BUY NOW":
        revisit = 0
    elif revisit is None:
        revisit = 1 if event.get("is_sale_event") else 3 if stats["direction"] == "falling" else 7

    insight = final["insight"] or short_insight(event, stats, tctx)

   
    # FINAL RESPONSE

    return {
        "success": True,
        "currentPrice": current_price,
        "finalDecision": final["action"],
        "confidence": final["confidence"],
        "explanation": final["explanation"],
        "insight": insight,
        "keyFactors": final["keyFactors"],
        "riskFlags": final["riskFlags"],
        "revisitInDays": revisit,
        "explainSource": final["source"],
        "availability": availability,
        "serviceVersion": SERVICE_VERSION,
        "expectedDropPercent": round(expected_drop_percent, 2),
        "priceTrend": round(trend, 2),
        "volatility": round(volatility, 2),
        "eventContext": event,
        "discountCheck": discount_check,
        "avgHistoricalPrice": round(avg_price, 2),
        "lowestHistoricalPrice": round(min_price, 2),
        "highestHistoricalPrice": round(max_price, 2),
        "analysis": {
            "timeSeries": stats,
            "timeContext": tctx,
            "dataQuality": dq,
            "modelOutputTrusted": model_trusted,
            "ruleEngine": {
                "score": rule["score"],
                "ruleAction": rule["ruleAction"],
                "factors": rule["factors"],
            },
        },
        "generatedAt": now.isoformat(),
    }
