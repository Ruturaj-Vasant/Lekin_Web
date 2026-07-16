export type TimelineGeometry = {
  leftPercent: number;
  widthPercent: number;
};

export function timelineGeometry(startTime: number, endTime: number, makespan: number): TimelineGeometry {
  if (makespan <= 0) return { leftPercent: 0, widthPercent: 0 };
  return {
    leftPercent: (startTime / makespan) * 100,
    widthPercent: ((endTime - startTime) / makespan) * 100,
  };
}
