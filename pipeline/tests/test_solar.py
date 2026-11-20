import copy

import pytest

from lib import config
from lib import scoring, solar


@pytest.mark.parametrize(
    "kw, expected",
    [(1, 30000), (2, 60000), (2.5, 69000), (3, 78000), (5, 78000)],
)
def test_subsidy_slabs(kw, expected):
    assert solar.subsidy(kw, "residential") == expected


def test_no_subsidy_for_commercial_or_institutional():
    assert solar.subsidy(3, "commercial") == 0
    assert solar.subsidy(3, "institutional") == 0


def test_usable_area_factor_depends_on_size():
    assert solar.usable_area(100) == pytest.approx(60)
    assert solar.usable_area(50) == pytest.approx(25)


def test_kw_rounds_down_to_half():
    assert solar.system_kw(29.9) == 2.5
    assert solar.system_kw(30) == 3.0
    assert solar.system_kw(4.9) == 0.0


def test_small_home():
    # 50 m2 footprint is "small" -> factor 0.5 -> 25 m2 usable -> 2.5 kW
    r = solar.roof_economics(50.0, "residential", 5.0, None)
    assert r["usable_m2"] == 25.0 and r["kw"] == 2.5 and r["subsidy"] == 69000


def test_full_chain_residential_3kw():
    r = solar.roof_economics(60, "residential", 5.0, None)
    # 60 m2 is not "small" (< 60), so factor 0.6 -> 36 m2 -> 3.5 kW
    assert r["kw"] == 3.5
    units = 3.5 * 5.0 * 365 * 0.75
    assert r["kwh_year"] == round(units)
    assert r["saving_year"] == round(units * 7)
    assert r["subsidy"] == 78000
    assert r["payback_years"] == round((3.5 * 60000 - 78000) / (units * 7), 1)


def test_payback_without_saving_is_none():
    assert solar.payback_years(0, 0, 0) is None


def test_state_tariff_overrides_default():
    table = {"default": {"residential": 7, "commercial": 9}, "states": {"Kerala": {"residential": 5}}}
    assert solar.tariff("residential", "Kerala", table) == 5
    assert solar.tariff("commercial", "Kerala", table) == 9
    assert solar.tariff("residential", "Goa", table) == 7


def test_score_bounds_and_ranking():
    cfg = copy.deepcopy(config())
    cfg["top_n"] = 2
    best = {"usable_m2": 500, "type": "commercial", "phone": "x", "payback_years": 0, "saving_year": 9}
    worst = {"usable_m2": 10, "type": "residential", "payback_years": 20, "saving_year": 1}
    mid = {"usable_m2": 200, "type": "residential", "payback_years": 5, "saving_year": 5}
    assert scoring.lead_score(best, 6.0, cfg) == 100
    assert scoring.lead_score(worst, 4.0, cfg) == 0
    ranked = scoring.rank([worst, mid, best], 5.0, cfg)
    assert [r["rank"] for r in ranked] == [1, 2] and ranked[0] is best
