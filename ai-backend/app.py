from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
from datetime import datetime
import requests
import os
from dotenv import load_dotenv
import json
import re
import time
from typing import Optional, Dict, Any


load_dotenv()


GROQ_API_KEY = os.getenv("GROQ_API_KEY")

LLM_ENDPOINT = os.getenv(
    "LLM_ENDPOINT",
    "https://api.groq.com/openai/v1/chat/completions"
)

LLM_MODEL = os.getenv(
    "LLM_MODEL",
    "openai/gpt-oss-20b"
)

OLLAMA_URL = os.getenv("OLLAMA_URL")

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "llama2"
)

USE_OLLAMA_FALLBACK = (
    os.getenv(
        "USE_OLLAMA_FALLBACK",
        "false"
    ).lower()
    in ("1", "true", "yes")
)


try:
    from utils.holiday_engine import get_event_context

except Exception:

    def get_event_context(
        source: str = "amazon"
    ):
        return {
            "date": None,
            "platform": source,
            "is_sale_event": 0,
            "event_type": "regular"
        }



app = FastAPI()



MODEL_PATH = os.getenv(
    "MODEL_PATH",
    "xgboost_price_model.pkl"
)

ENCODERS_PATH = os.getenv(
    "ENCODERS_PATH",
    "label_encoders.pkl"
)


try:

    model = joblib.load(
        MODEL_PATH
    )

except Exception as e:

    raise RuntimeError(
        f"Failed to load model '{MODEL_PATH}': {e}"
    )


try:

    encoders = joblib.load(
        ENCODERS_PATH
    )

except Exception as e:

    encoders = {}

    print(
        f"Warning: failed to load encoders "
        f"'{ENCODERS_PATH}', continuing with empty encoders. "
        f"Error: {e}"
    )



class ProductInput(BaseModel):

    product: Dict[str, Any]


def encode(
    col: str,
    value: Any
) -> int:

    le = encoders.get(col)

    if not le:
        return 0

    value = str(value)

    try:

        if (
            hasattr(le, "classes_")
            and value in le.classes_
        ):

            return int(
                le.transform([value])[0]
            )

    except Exception:

        return 0

    return 0




def detect_fake_discount(
    product: Dict[str, Any],
    avg_price: float
) -> str:

    mrp = product.get(
        "mrp",
        0
    ) or 0

    current = product.get(
        "currentPrice",
        0
    ) or 0

    try:

        mrp = float(mrp)
        current = float(current)

    except Exception:

        return "Unknown"

    if mrp == 0:

        return "Unknown"

    discount = (
        (mrp - current) /
        mrp
    ) * 100

    if (
        discount > 40
        and abs(
            current - avg_price
        ) < max(
            1.0,
            avg_price * 0.05
        )
    ):

        return "Fake"

    return "Genuine"



def get_confidence(
    drop_percent: float,
    trend: float,
    volatility: float,
    event: Dict[str, Any]
) -> str:

    score = 0

    if drop_percent > 15:
        score += 2

    if abs(trend) > 500:
        score += 1

    if volatility > 300:
        score += 1

    if event.get("is_sale_event"):
        score += 2

    if score >= 4:

        return "High"

    elif score >= 2:

        return "Medium"

    return "Low"



def extract_json_from_text(
    text: Optional[str]
) -> Optional[Dict[str, Any]]:

    if not text or not isinstance(text, str):

        return None

    s = text.strip()

    if (
        s.startswith("```")
        and s.endswith("```")
    ):

        parts = s.split("```")

        for part in reversed(parts):

            part = part.strip()

            if part:

                s = part

                break

    first = s.find("{")

    last = s.rfind("}")

    if (
        first == -1
        or last == -1
        or last < first
    ):

        return None

    candidate = s[
        first:last + 1
    ]

    try:

        return json.loads(
            candidate
        )

    except Exception:

        try:

            fixed = re.sub(
                r'([{\s,])([a-zA-Z0-9_]+)\s*:',
                r'\1"\2":',
                candidate
            )

            fixed = fixed.replace(
                "'",
                '"'
            )

            return json.loads(
                fixed
            )

        except Exception:

            return None


# ============================================================
# PARSE KEY VALUE RESPONSE
# ============================================================

def parse_kv_text(
    text: Optional[str]
) -> Optional[Dict[str, Any]]:

    if (
        not text
        or not isinstance(text, str)
    ):

        return None

    lines = [
        line.strip()
        for line in re.split(
            r'[\r\n]+',
            text
        )
        if line.strip()
    ]

    result: Dict[str, Any] = {}

    for line in lines:

        match = re.match(
            r'^\s\*?([A-Za-z ]{3,30})\s*\*?\s*[:\-]\s*(.+)$',
            line
        )

        if match:

            key = (
                match.group(1)
                .strip()
                .lower()
            )

            value = (
                match.group(2)
                .strip()
            )

            if "action" in key:

                result["action"] = (
                    value.upper()
                )

            elif "confidence" in key:

                result["confidence"] = (
                    value.title()
                )

            elif (
                "explanation" in key
                or "reason" in key
            ):

                result["explanation"] = value

            elif (
                "insight" in key
                or "note" in key
                or "summary" in key
            ):

                result["insight"] = value

    if result:

        return result


    action_match = re.search(
        r'\b(BUY NOW|WAIT)\b',
        text,
        re.IGNORECASE
    )

    if action_match:

        result["action"] = (
            action_match.group(0)
            .upper()
        )


    confidence_match = re.search(
        r'Confidence\s*[:\-]\s*(Low|Medium|High)',
        text,
        re.IGNORECASE
    )

    if confidence_match:

        result["confidence"] = (
            confidence_match.group(1)
            .title()
        )


    sentences = re.split(
        r'(?<=[.!?])\s+',
        text
    )

    for sentence in sentences:

        if (
            len(sentence.strip()) > 15
            and "action"
            not in sentence.lower()
            and "confidence"
            not in sentence.lower()
        ):

            result.setdefault(
                "explanation",
                sentence.strip()
            )

            break


    return (
        result
        if result
        else None
    )



def call_groq(
    payload: Dict[str, Any]
) -> Optional[Dict[str, Any]]:

    if not GROQ_API_KEY:

        print(
            "GROQ_API_KEY missing; skipping GROQ call."
        )

        return None


    system_instruction = (
        "You are an expert ecommerce pricing analyst. "
        "Think step-by-step internally but do not output "
        "chain-of-thought. "
        "Use only the provided data. "
        "Return strict JSON. "
        "Use English only. "
        "Do not include future numeric price predictions."
    )


    event = (
        payload.get(
            "eventContext"
        )
        or {}
    )

    event_type = event.get(
        "event_type",
        "unknown"
    )

    is_sale_event = event.get(
        "is_sale_event",
        0
    )

    historical_prices = payload.get(
        "prices",
        []
    )


    user_data = (
        "DATA:\n"
        f"- Current Price: {payload.get('currentPrice')}\n"
        f"- Expected Drop Percent: {payload.get('expectedDropPercent')}\n"
        f"- Price Trend: {payload.get('priceTrend')}\n"
        f"- Volatility: {payload.get('volatility')}\n"
        f"- Event Type: {event_type}\n"
        f"- Is Sale Event: {is_sale_event}\n"
        f"- Historical Prices: "
        f"{json.dumps(historical_prices)}\n\n"

        "INSTRUCTIONS:\n"

        "Return exactly one JSON object:\n"

        "{\n"
        '  "action": "BUY NOW" or "WAIT",\n'
        '  "confidence": "Low", "Medium", or "High",\n'
        '  "explanation": "1-3 sentence English explanation",\n'
        '  "insight": "1-2 word English insight"\n'
        "}\n\n"

        "Do not output a future price.\n"
        "Do not output chain-of-thought.\n"
        "Use English only."
    )


    body = {

        "model": LLM_MODEL,

        "messages": [

            {
                "role": "system",
                "content":
                    system_instruction
            },

            {
                "role": "user",
                "content":
                    user_data
            }

        ],

        "max_tokens": 400
    }


    for attempt in range(2):

        try:

            response = requests.post(

                LLM_ENDPOINT,

                headers={
                    "Authorization":
                        f"Bearer {GROQ_API_KEY}",

                    "Content-Type":
                        "application/json"
                },

                json=body,

                timeout=15
            )


            print(
                "GROQ STATUS:",
                response.status_code
            )


            if response.status_code != 200:

                print(
                    "GROQ ERROR BODY:",
                    response.text[:1000]
                )

                time.sleep(0.5)

                continue


            data = response.json()

            raw = None


            try:

                raw = (
                    data
                    .get("choices", [])[0]
                    .get("message", {})
                    .get("content")
                )

            except Exception:

                try:

                    raw = (
                        data
                        .get("choices", [])[0]
                        .get("text")
                    )

                except Exception:

                    raw = None


            parsed = extract_json_from_text(
                raw
            )


            if (
                parsed
                and isinstance(
                    parsed,
                    dict
                )
            ):

                if "action" in parsed:

                    parsed["action"] = (
                        parsed["action"]
                        .upper()
                    )

                return {
                    "parsed": parsed
                }


            kv = parse_kv_text(
                raw
            )


            if kv:

                if "action" in kv:

                    kv["action"] = (
                        kv["action"]
                        .upper()
                    )

                if "confidence" in kv:

                    kv["confidence"] = (
                        kv["confidence"]
                        .title()
                    )

                return {
                    "parsed": kv
                }


            return {
                "parsed": None
            }


        except Exception as e:

            print(
                "GROQ CALL EXCEPTION:",
                str(e)
            )

            time.sleep(0.5)


    return None



def call_ollama(
    payload: Dict[str, Any]
) -> Optional[Dict[str, Any]]:

    if not OLLAMA_URL:

        return None


    event = (
        payload.get(
            "eventContext"
        )
        or {}
    )

    event_type = event.get(
        "event_type",
        "unknown"
    )

    is_sale_event = event.get(
        "is_sale_event",
        0
    )

    historical_prices = payload.get(
        "prices",
        []
    )


    prompt = (

        "You are an expert ecommerce pricing analyst. "

        "Use only the provided data. "

        "Return exactly one JSON object. "

        "Use English only. "

        "Do not output a future price. "

        "\n\nDATA:\n"

        f"- Current Price: "
        f"{payload.get('currentPrice')}\n"

        f"- Expected Drop Percent: "
        f"{payload.get('expectedDropPercent')}\n"

        f"- Price Trend: "
        f"{payload.get('priceTrend')}\n"

        f"- Volatility: "
        f"{payload.get('volatility')}\n"

        f"- Event Type: "
        f"{event_type}\n"

        f"- Is Sale Event: "
        f"{is_sale_event}\n"

        f"- Historical Prices: "
        f"{json.dumps(historical_prices)}\n\n"

        'Schema: '
        '{"action":"BUY NOW"|"WAIT",'
        '"confidence":"Low"|"Medium"|"High",'
        '"explanation":"English explanation",'
        '"insight":"1-2 words"}'
    )


    try:

        response = requests.post(

            f"{OLLAMA_URL.rstrip('/')}/api/generate",

            json={

                "model":
                    OLLAMA_MODEL,

                "prompt":
                    prompt,

                "max_tokens":
                    400
            },

            timeout=10
        )


        print(
            "OLLAMA STATUS:",
            response.status_code
        )


        if response.status_code != 200:

            print(
                "OLLAMA BODY:",
                response.text[:1000]
            )

            return None


        data = response.json()

        raw = None


        if isinstance(
            data,
            dict
        ):

            raw = (
                data.get(
                    "response"
                )
                or (
                    data
                    .get(
                        "generations",
                        [{}]
                    )[0]
                    .get("text")
                    if data.get(
                        "generations"
                    )
                    else None
                )
            )


        if not raw:

            raw = json.dumps(
                data
            )


        parsed = extract_json_from_text(
            raw
        )


        if (
            parsed
            and isinstance(
                parsed,
                dict
            )
        ):

            if "action" in parsed:

                parsed["action"] = (
                    parsed["action"]
                    .upper()
                )

            return {
                "parsed": parsed
            }


        kv = parse_kv_text(
            raw
        )


        if kv:

            if "action" in kv:

                kv["action"] = (
                    kv["action"]
                    .upper()
                )

            if "confidence" in kv:

                kv["confidence"] = (
                    kv["confidence"]
                    .title()
                )

            return {
                "parsed": kv
            }


        return {
            "parsed": None
        }


    except Exception as e:

        print(
            "OLLAMA CALL EXCEPTION:",
            str(e)
        )

        return None




def call_llm_analytical(
    payload: Dict[str, Any]
) -> Optional[Dict[str, Any]]:

    groq_response = call_groq(
        payload
    )

    if (
        groq_response
        and groq_response.get(
            "parsed"
        )
    ):

        return {
            "provider": "groq",
            **groq_response
        }


    if (
        USE_OLLAMA_FALLBACK
        and OLLAMA_URL
    ):

        print(
            "GROQ failed/unparseable. "
            "Trying Ollama fallback."
        )

        ollama_response = call_ollama(
            payload
        )

        if (
            ollama_response
            and ollama_response.get(
                "parsed"
            )
        ):

            return {
                "provider": "ollama",
                **ollama_response
            }


    return None




def fallback_decision(
    ml_result: Dict[str, Any]
) -> Dict[str, Any]:

    drop = ml_result.get(
        "expectedDropPercent",
        0
    )

    trend = ml_result.get(
        "priceTrend",
        0
    )

    event = (
        ml_result.get(
            "eventContext"
        )
        or {}
    )


    if (
        drop > 15
        or event.get(
            "is_sale_event"
        ) == 1
        or trend < -500
    ):

        action = "WAIT"

        confidence = (
            "High"
            if (
                drop > 15
                or trend < -500
            )
            else "Medium"
        )

        explanation = (
            f"An estimated price drop of "
            f"{round(drop, 2)}% and the current "
            f"sale or price trend suggest waiting."
        )

        insight = (
            "Sale imminent"
            if event.get(
                "is_sale_event"
            ) == 1
            else "Monitor"
        )


    elif (
        drop < 5
        and trend >= 0
    ):

        action = "BUY NOW"

        confidence = "Medium"

        explanation = (
            "The expected price drop is small "
            "and the current price trend is stable."
        )

        insight = "Buy now"


    else:

        action = "WAIT"

        confidence = "Medium"

        explanation = (
            f"The price trend shows moderate "
            f"uncertainty with an estimated "
            f"drop of {round(drop, 2)}%."
        )

        insight = "Monitor"


    return {

        "action":
            action,

        "confidence":
            confidence,

        "explanation":
            explanation,

        "insight":
            insight
    }


# ============================================================
# SHORT INSIGHT
# ============================================================

def short_insight(
    event: Dict[str, Any],
    volatility: float,
    drop_percent: float,
    trend: float
) -> str:

    if event.get(
        "is_sale_event"
    ) == 1:

        return "Sale imminent"


    if volatility >= 800:

        return "High volatility"


    if drop_percent >= 15:

        return "Good deal"


    if trend < -500:

        return "Dropping"


    return "Monitor"




@app.post("/predict")
def predict(
    data: ProductInput
):

    product = (
        data.product
        or {}
    )




    try:

        current_price = float(
            product.get(
                "currentPrice",
                0
            )
            or 0
        )

    except Exception:

        current_price = 0.0


    try:

        mrp = float(
            product.get(
                "mrp",
                current_price
            )
            or current_price
        )

    except Exception:

        mrp = current_price


    try:

        rating = float(
            product.get(
                "rating",
                4.0
            )
            or 4.0
        )

    except Exception:

        rating = 4.0


    try:

        review_count = float(
            product.get(
                "reviewCount",
                500
            )
            or 500
        )

    except Exception:

        review_count = 500.0



    discount_percent = (

        (
            mrp -
            current_price
        )
        / mrp
        * 100

        if mrp > 0
        else 0.0
    )



    dt = datetime.now()

    is_weekend = (
        1
        if dt.weekday() >= 5
        else 0
    )


    event = (
        get_event_context(
            product.get(
                "source",
                "amazon"
            )
        )
        or {}
    )




    history = (
        product.get(
            "history",
            []
        )
        or []
    )


    prices = []


    for item in history:

        try:

            if isinstance(
                item,
                dict
            ):

                price = item.get(
                    "price",
                    0
                )

                prices.append(
                    float(price)
                )

            else:

                prices.append(
                    float(item)
                )

        except Exception:

            continue


    if (
        len(prices) == 0
        or prices[-1] != current_price
    ):

        prices.append(
            current_price
        )


 

    avg_price = (
        float(
            np.mean(prices)
        )
        if prices
        else current_price
    )


    min_price = (
        float(
            np.min(prices)
        )
        if prices
        else current_price
    )


    max_price = (
        float(
            np.max(prices)
        )
        if prices
        else current_price
    )


    volatility = (
        float(
            np.std(prices)
        )
        if prices
        else 0.0
    )


    trend = (

        float(
            prices[-1]
            - prices[-2]
        )

        if len(prices) >= 2
        else 0.0
    )



    row = {

        "price":
            current_price,

        "discount_percent":
            discount_percent,

        "quantity_sold":
            100,

        "rating":
            rating,

        "review_count":
            review_count,

        "product_category":
            encode(
                "product_category",
                product.get(
                    "category",
                    "Electronics"
                )
            ),

        "customer_region":
            encode(
                "customer_region",
                "India"
            ),

        "payment_method":
            encode(
                "payment_method",
                "UPI"
            ),

        "platform":
            encode(
                "platform",
                product.get(
                    "source",
                    "amazon"
                )
            ),

        "is_sale_event":
            event.get(
                "is_sale_event",
                0
            ),

        "event_type":
            encode(
                "event_type",
                event.get(
                    "event_type",
                    "regular"
                )
            ),

        "is_weekend":
            is_weekend,

        "year":
            dt.year,

        "month":
            dt.month,

        "day":
            dt.day,

        "weekday":
            dt.weekday()
    }


    input_df = pd.DataFrame(
        [row]
    )



    try:

        predicted_price = float(
            model.predict(
                input_df
            )[0]
        )

    except Exception as e:

        print(
            "MODEL PREDICT ERROR:",
            str(e)
        )

        return {

            "success":
                False,

            "message":
                "Model prediction failed",

            "error":
                str(e)
        }




    future_price_internal = (

        predicted_price * 0.2

        + avg_price * 0.5

        + current_price * 0.3
    )


    if trend < 0:

        future_price_internal -= (
            abs(trend) * 0.3
        )

    elif trend > 0:

        future_price_internal += (
            trend * 0.2
        )


    future_price_internal = max(

        current_price * 0.8,

        min(
            future_price_internal,
            current_price * 1.2
        )
    )



    difference = (
        current_price
        - future_price_internal
    )


    rule_recommendation = (

        "WAIT"
        if difference > 100
        else "BUY NOW"
    )


    if event.get(
        "is_sale_event"
    ):

        rule_recommendation = (
            "WAIT (SALE COMING)"
        )


    drop_percent = (

        (
            abs(difference)
            / current_price
        )
        * 100

        if current_price > 0
        else 0.0
    )



    discount_check = (
        detect_fake_discount(
            product,
            avg_price
        )
    )


    fallback_confidence = (
        get_confidence(
            drop_percent,
            trend,
            volatility,
            event
        )
    )



    ml_result = {

        "currentPrice":
            current_price,

        "expectedDropPercent":
            round(
                drop_percent,
                2
            ),

        "priceTrend":
            round(
                trend,
                2
            ),

        "volatility":
            round(
                volatility,
                2
            ),

        "eventContext":
            event,

        "avgHistoricalPrice":
            round(
                avg_price,
                2
            ),

        "lowestHistoricalPrice":
            round(
                min_price,
                2
            ),

        "highestHistoricalPrice":
            round(
                max_price,
                2
            ),

        "recommendation":
            rule_recommendation,

        "reason":
            ""
    }




    llm_payload = {

        "currentPrice":
            ml_result[
                "currentPrice"
            ],

        "expectedDropPercent":
            ml_result[
                "expectedDropPercent"
            ],

        "priceTrend":
            ml_result[
                "priceTrend"
            ],

        "volatility":
            ml_result[
                "volatility"
            ],

        "eventContext":
            ml_result[
                "eventContext"
            ],

        "prices":
            prices
    }



    llm_response = (
        call_llm_analytical(
            llm_payload
        )
    )


    explain_source = "llm"

    valid_actions = {
        "BUY NOW",
        "WAIT"
    }

    llm_parsed = None


    if llm_response:

        parsed = (
            llm_response.get(
                "parsed"
            )
        )

        if (
            parsed
            and isinstance(
                parsed,
                dict
            )
        ):

            llm_parsed = parsed


 

    if (
        not llm_parsed
        or llm_parsed.get(
            "action"
        ) not in valid_actions
    ):

        llm_decision = (
            fallback_decision(
                ml_result
            )
        )

        explain_source = (
            "fallback"
        )

        llm_parsed = (
            llm_decision
        )


    else:

        llm_parsed["action"] = (
            llm_parsed
            .get(
                "action",
                "WAIT"
            )
            .upper()
        )


        if "confidence" in llm_parsed:

            llm_parsed[
                "confidence"
            ] = (
                llm_parsed[
                    "confidence"
                ]
                .title()
            )




    final_action = (
        llm_parsed.get(
            "action",
            "WAIT"
        )
    )


    final_confidence = (
        llm_parsed.get(
            "confidence",
            fallback_confidence
        )
    )


    final_explanation = (
        llm_parsed.get(
            "explanation",
            ""
        )
    )



    final_explanation = re.sub(

        r'\b('
        r'futurePrice|'
        r'future_price|'
        r'predicted price|'
        r'predicted'
        r')\b'
        r'[:\s]*[\d,.]+',

        '',

        final_explanation,

        flags=re.IGNORECASE
    )


    final_explanation = (
        final_explanation.strip()
    )


    if not final_explanation:

        if final_action == "WAIT":

            final_explanation = (
                "The current price trend and "
                "market conditions suggest waiting "
                "for a potentially better price."
            )

        else:

            final_explanation = (
                "The current price trend is stable "
                "and there is no strong indication "
                "of a significant price drop."
            )




    insight_short = (
        short_insight(
            event,
            volatility,
            drop_percent,
            trend
        )
    )



    response = {

        "success":
            True,

        "currentPrice":
            ml_result[
                "currentPrice"
            ],

        "finalDecision":
            final_action,

        "confidence":
            final_confidence,

        "explanation":
            final_explanation,

        "insight":
            insight_short,

        "explainSource":
            explain_source,

        "expectedDropPercent":
            ml_result[
                "expectedDropPercent"
            ],

        "priceTrend":
            ml_result[
                "priceTrend"
            ],

        "volatility":
            ml_result[
                "volatility"
            ],

        "eventContext":
            ml_result[
                "eventContext"
            ],

        "discountCheck":
            discount_check,

        "avgHistoricalPrice":
            ml_result[
                "avgHistoricalPrice"
            ],

        "lowestHistoricalPrice":
            ml_result[
                "lowestHistoricalPrice"
            ],

        "highestHistoricalPrice":
            ml_result[
                "highestHistoricalPrice"
            ]
    }


    


    return response
