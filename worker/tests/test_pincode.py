import pytest

from worker.pincode import InvalidPincode, is_valid_pincode, validate_pincode


@pytest.mark.parametrize("value", ["380015", "110001", "999999", "100000"])
def test_valid(value):
    assert is_valid_pincode(value)
    assert validate_pincode(f" {value} ") == value


@pytest.mark.parametrize("value", ["", "080015", "38001", "3800155", "38O015", "380 015", "abcdef", None, 380015])
def test_invalid(value):
    assert not is_valid_pincode(value)
    with pytest.raises(InvalidPincode):
        validate_pincode(value)
