export function currentScheduleAction(schedule, now = new Date()) {
  if (!schedule.enabled || !schedule.days.includes(now.getDay())) {
    return null;
  }

  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (time === schedule.offTime) return "block";
  if (time === schedule.onTime) return "allow";
  return null;
}

export function scheduleRunKey(schedule, action, now = new Date()) {
  return `${schedule.id}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}:${action}`;
}
