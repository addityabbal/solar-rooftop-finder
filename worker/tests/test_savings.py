import copy

from worker import savings
from worker.settings import savings_config

SQFT = savings_config()["sqft_per_m2"]


def test_worked_example_300_sqft_home():
    r = savings.estimate(300 / SQFT, "residential")
    assert r["kw"] == 3
    assert r["units_per_year"] == 4200
    assert r["saving_per_year"] == 29400
    assert r["system_cost"] == 165000
    assert r["subsidy"] == 78000
    assert r["net_cost"] == 87000
    assert r["payback_years"] == 3.0


def test_range_is_plus_minus_15_percent():
    r = savings.estimate(300 / SQFT, "residential")
    assert r["saving_low"] == 24990
    assert r["saving_high"] == 33810


def test_subsidy_slabs():
    assert savings.subsidy(1, "residential", None) == 30000
    assert savings.subsidy(2, "residential", None) == 60000
    assert savings.subsidy(2.5, "residential", None) == 69000
    assert savings.subsidy(3, "residential", None) == 78000
    assert savings.subsidy(10, "residential", None) == 78000


def test_special_category_state_subsidy():
    assert savings.subsidy(2, "residential", "Sikkim") == 66000
    assert savings.subsidy(3, "residential", "Uttarakhand") == 85800
    assert savings.subsidy(8, "residential", "Ladakh") == 85800


def test_commercial_gets_no_subsidy_and_commercial_tariff():
    r = savings.estimate(1000, "commercial")
    assert r["kw"] == 100
    assert r["subsidy"] == 0
    assert r["saving_per_year"] == 100 * 1400 * 9


def test_residential_capped_at_10_kw():
    assert savings.estimate(500, "residential")["kw"] == 10
    assert savings.estimate(500, "commercial")["kw"] == 50


def test_sunshine_hours_override_default_yield():
    r = savings.estimate(100, "commercial", sunshine_hours=2000)
    assert r["units_per_year"] == 10 * 2000 * 0.75


def test_changing_tariff_in_config_changes_output():
    cfg = copy.deepcopy(savings_config())
    cfg["tariff_inr_per_unit"]["by_state"]["Gujarat"] = {"residential": 5}
    r = savings.estimate(300 / SQFT, "residential", state="Gujarat", cfg=cfg)
    assert r["saving_per_year"] == 21000
    # Commercial falls back to the default when the state has no commercial entry.
    assert savings.tariff("commercial", "Gujarat", cfg) == 9


def test_zero_area():
    r = savings.estimate(0, "residential")
    assert r["kw"] == 0 and r["payback_years"] is None
