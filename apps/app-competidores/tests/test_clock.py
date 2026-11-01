from services.contest_service import format_hms, is_frozen, remaining_ms

HOUR = 3_600_000


def clock(status, elapsed, duration=5 * HOUR, freeze=HOUR):
    return {"status": status, "elapsedMs": elapsed, "durationMs": duration, "freezeDurationMs": freeze}


def test_running_counts_down_from_received_time():
    assert remaining_ms(clock("RUNNING", HOUR), 1000) == 4 * HOUR - 1000


def test_paused_does_not_count():
    assert remaining_ms(clock("PAUSED", HOUR), 60_000) == 4 * HOUR


def test_never_negative_and_zero_when_finished():
    assert remaining_ms(clock("RUNNING", 5 * HOUR - 500), 10_000) == 0
    assert remaining_ms(clock("FINISHED", HOUR), 0) == 0


def test_frozen_in_last_freeze_window_only():
    assert not is_frozen(clock("RUNNING", 4 * HOUR - 2000), 1000)
    assert is_frozen(clock("RUNNING", 4 * HOUR - 2000), 2000)
    assert not is_frozen(clock("RUNNING", 4 * HOUR + 1, freeze=0), 0)
    assert not is_frozen(clock("FINISHED", 5 * HOUR), 0)


def test_format_hms():
    assert format_hms(0) == "0:00:00"
    assert format_hms(4 * HOUR + 5 * 60_000 + 9_999) == "4:05:09"
