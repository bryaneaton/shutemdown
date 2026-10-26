import assert from "node:assert/strict";
import test from "node:test";
import { currentScheduleAction, scheduleRunKey } from "../server/scheduler.js";

const weekdaySchedule = {
  id: "weekday",
  enabled: true,
  days: [1, 2, 3, 4, 5],
  offTime: "21:00",
  onTime: "07:00",
};

test("blocks a group at its configured off time", () => {
  const mondayAtNine = new Date(2026, 0, 5, 21, 0);

  assert.equal(currentScheduleAction(weekdaySchedule, mondayAtNine), "block");
});

test("allows a group at its configured on time", () => {
  const tuesdayAtSeven = new Date(2026, 0, 6, 7, 0);

  assert.equal(currentScheduleAction(weekdaySchedule, tuesdayAtSeven), "allow");
});

test("does not run on disabled days or between configured times", () => {
  const sundayAtNine = new Date(2026, 0, 4, 21, 0);
  const mondayAtEight = new Date(2026, 0, 5, 8, 0);
  const disabledSchedule = { ...weekdaySchedule, enabled: false };

  assert.equal(currentScheduleAction(weekdaySchedule, sundayAtNine), null);
  assert.equal(currentScheduleAction(weekdaySchedule, mondayAtEight), null);
  assert.equal(currentScheduleAction(disabledSchedule, mondayAtEight), null);
});

test("creates a stable run key for one schedule action per day", () => {
  const mondayAtNine = new Date(2026, 0, 5, 21, 0);
  const sameDayLater = new Date(2026, 0, 5, 21, 30);

  assert.equal(
    scheduleRunKey(weekdaySchedule, "block", mondayAtNine),
    scheduleRunKey(weekdaySchedule, "block", sameDayLater),
  );
  assert.notEqual(
    scheduleRunKey(weekdaySchedule, "block", mondayAtNine),
    scheduleRunKey(weekdaySchedule, "allow", mondayAtNine),
  );
});
