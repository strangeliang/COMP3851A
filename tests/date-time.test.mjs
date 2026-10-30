import test from "node:test";
import assert from "node:assert/strict";
import { formatStudyDate, studyTimestamp } from "../src/utils/dateTime.js";

test("SQLite UTC and explicit ISO timestamps represent the same study time", () => {
  assert.equal(studyTimestamp("2026-10-30 02:14:05"), Date.parse("2026-10-30T02:14:05Z"));
  assert.equal(studyTimestamp("2026-10-30T10:14:05+08:00"), studyTimestamp("2026-10-30 02:14:05"));
  assert.equal(formatStudyDate("2026-10-30 02:14:05"), formatStudyDate("2026-10-30T10:14:05+08:00"));
});

test("study dates use the reader's local time and selected display language", () => {
  const value = "2026-10-30T02:14:05Z";
  for (const [language, locale] of [["en", "en-GB"], ["zh", "zh-CN"]]) {
    assert.equal(formatStudyDate(value, language), new Intl.DateTimeFormat(locale, {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(value)));
  }
});

test("empty and unfamiliar legacy dates do not produce Invalid Date", () => {
  assert.equal(formatStudyDate(null), "—");
  assert.equal(formatStudyDate("", "en", "No activity yet"), "No activity yet");
  assert.equal(formatStudyDate("Just now"), "Just now");
  assert.equal(formatStudyDate("03/04/2026"), "03/04/2026", "Do not guess the day/month order of a legacy display date");
  assert.ok(Number.isNaN(studyTimestamp("not a date")));
});
