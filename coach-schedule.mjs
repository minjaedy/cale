export function scheduleForDate(events = {}, record = {}, date, today) {
  const day = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return Object.entries(events || {}).map(([id, event]) => ({...event, id}))
    .filter(event => event.day === day)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.id.localeCompare(b.id))
    .map(event => {
      const habit = {str: 'str', cardio: 'run', jp: 'jp'}[event.cat] || (event.cat === 'rest' && event.title.includes('취침') ? 'sleep' : null);
      const done = date <= today && (typeof record.completed?.[event.id] === 'boolean' ? record.completed[event.id] : !record.completed && !!record.items?.[habit]);
      return {...event, done: !!done, upcoming: date > today};
    });
}

// Only the visible member/date is subscribed. Never persist another member's data.
export function createScheduleWatcher(subscribe, publish) {
  let revision = 0, stops = [];
  function clear() {revision++; for (const stop of stops) stop(); stops = [];}
  return {
    clear,
    watch(member, date) {
      clear();
      const mine = revision, values = {}, loaded = new Set();
      publish({member, date, loading: true});
      const paths = {events: `tempo/users/${member}/events`, completed: `tempo/users/${member}/days/${date}/completed`, items: `tempo/users/${member}/days/${date}/items`};
      for (const [key, path] of Object.entries(paths)) {
        if (mine !== revision) break;
        const stop = subscribe(path, value => {
          if (mine !== revision) return;
          values[key] = value; loaded.add(key);
          publish({member, date, ...values, loading: loaded.size !== 3});
        }, () => {
          if (mine !== revision) return;
          clear(); publish({member, date, loading: false, error: '일정을 불러오지 못했어요. 연결을 확인해 주세요.'});
        });
        if (mine === revision) stops.push(stop); else stop();
      }
    }
  };
}
