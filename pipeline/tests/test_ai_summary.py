import json

from lib import ai_summary

STATS = {
    "pincode": "400703",
    "place": "Turbhe Market, Thane, Maharashtra",
    "buildings": 4210,
    "usable_sqft_total": "41,25,300",
    "potential_mw": 38.3,
    "sunlight_kwh_m2_day": 5.16,
    "median_payback_years": 3.9,
    "commercial_roofs": 312,
    "roofs_with_public_contact": 41,
    "top_10_commercial": [{"name": "IKEA", "kw": 1674.0, "saving_inr_per_year": "2,12,81,478"}],
}


def test_numbers_parse_indian_commas_and_devanagari():
    assert ai_summary.numbers_in("₹41,25,300 and ३.९ years") == [4125300.0, 3.9]


def test_number_check_accepts_input_numbers_and_rejects_invented_ones():
    allowed = ai_summary.allowed_numbers(STATS)
    assert ai_summary.unsupported_numbers("38.3 MW in 400703, payback 3.9", allowed, 0.01) == []
    assert ai_summary.unsupported_numbers("payback 3.91 years", allowed, 0.01) == []  # within 1%
    assert ai_summary.unsupported_numbers("save 25 lakh", allowed, 0.01) == [25.0]


def test_phone_numbers_are_stripped():
    assert "98765" not in ai_summary.strip_phones("Call 98765 43210 or +91-9876543210 today")


def good_reply(_stats, _model):
    return json.dumps({"en": "400703 has 4210 buildings and 38.3 MW.", "hi": "400703 में 4210 इमारतें।", "pitch": "Payback 3.9 saal."})


def test_valid_ai_output_is_used():
    out = ai_summary.summarise(STATS, call=good_reply)
    assert out["source"] == "ai" and "38.3 MW" in out["en"]


def test_invented_numbers_fall_back_to_template_after_retry():
    calls = []

    def lying(_s, _m):
        calls.append(1)
        return json.dumps({"en": "Save 99 lakh!", "hi": "ok", "pitch": "ok"})

    out = ai_summary.summarise(STATS, call=lying)
    assert len(calls) == 2 and out["source"] == "template"
    assert "4210" in out["en"] and "38.3" in out["hi"]


def test_bad_json_retries_once():
    replies = iter(["not json", good_reply(None, None)])
    out = ai_summary.summarise(STATS, call=lambda s, m: next(replies))
    assert out["source"] == "ai" and out["notes"] == ["output was not valid JSON with en/hi/pitch"]


def test_template_passes_its_own_number_check():
    _, problems = ai_summary.check(ai_summary.template_summary(STATS), STATS, 0.01)
    assert problems == []


def test_pitch_may_not_name_businesses():
    _, problems = ai_summary.check({"en": "IKEA is big.", "hi": "ok", "pitch": "IKEA jaise buildings already saving"}, STATS, 0.01)
    assert problems == ["pitch names businesses: ['IKEA']"]
