import { ScheduleItem } from '@/types/schedule';
import { timeToMinutes, getCurrentTimeMinutes } from './utils';

export interface NotificationTimer {
  itemId: string;
  timeout: NodeJS.Timeout;
  scheduledFor: number; // minutes since midnight
}

let activeTimers: NotificationTimer[] = [];

export function clearAllNotifications() {
  activeTimers.forEach(timer => clearTimeout(timer.timeout));
  activeTimers = [];
}

export function scheduleNotifications(
  schedule: ScheduleItem[],
  onNotify: (item: ScheduleItem) => void
) {
  // Clear existing timers
  clearAllNotifications();

  const currentMinutes = getCurrentTimeMinutes();

  schedule.forEach(item => {
    const itemMinutes = timeToMinutes(item.time);
    // Notify 5 minutes before
    const notifyMinutes = itemMinutes - 5;

    // Only schedule if notification time is in the future
    if (notifyMinutes > currentMinutes) {
      const delayMs = (notifyMinutes - currentMinutes) * 60 * 1000;

      const timeout = setTimeout(() => {
        onNotify(item);
        // Remove from active timers
        activeTimers = activeTimers.filter(t => t.itemId !== item.id);
      }, delayMs);

      activeTimers.push({
        itemId: item.id,
        timeout,
        scheduledFor: notifyMinutes,
      });
    }
  });

  return activeTimers.length;
}

export function getActiveTimers(): NotificationTimer[] {
  return [...activeTimers];
}
