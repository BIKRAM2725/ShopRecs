# utils/holiday_engine.py

from datetime import datetime

def get_event_context(platform):
    today = datetime.now()

    events = [
        {"date": "2026-09-23", "platform": "amazon", "is_sale_event": 1, "event_type": "sale"},
        {"date": "2026-10-20", "platform": "flipkart", "is_sale_event": 1, "event_type": "sale"},
        {"date": "2026-11-25", "platform": "amazon", "is_sale_event": 1, "event_type": "sale"},
        {"date": "2026-11-08", "platform": "all", "is_sale_event": 0, "event_type": "festival"},
    ]

    for event in events:
        event_date = datetime.strptime(event["date"], "%Y-%m-%d")

        if event["platform"] in [platform, "all"]:
            days_diff = (event_date - today).days

            if 0 <= days_diff <= 15:
                return event

    return {
        "is_sale_event": 0,
        "event_type": "regular"
    }