import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { WORKSHEETS } from '@/config/constants';
import { type AssignmentRepository } from '@/modules/assignments/repositories/assignment.repository';
import { type AssignmentLifecycleService } from '@/modules/assignments/services/assignment-lifecycle.service';
import { AssignmentsScheduler } from '@/modules/assignments/jobs/assignments.scheduler';

const NOW = new Date('2026-10-14T08:00:00.000Z');
const MIN = 60_000;

function setup() {
  const repo = mockDeep<AssignmentRepository>();
  const lifecycle = mockDeep<AssignmentLifecycleService>();
  lifecycle.tick.mockResolvedValue({ opened: 0, closed: 0 });
  return { repo, lifecycle, scheduler: new AssignmentsScheduler(repo, lifecycle) };
}

describe('AssignmentsScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('không có bài chờ mở / đóng → không hẹn timer, không tick', async () => {
    const { repo, lifecycle, scheduler } = setup();
    repo.nextTransitionAt.mockResolvedValue(null);
    await scheduler.reschedule();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(24 * 60 * MIN);
    expect(lifecycle.tick).not.toHaveBeenCalled();
    expect(repo.nextTransitionAt).toHaveBeenCalledTimes(1);
  });

  it('tick đúng mốc kế tiếp rồi tính lại mốc', async () => {
    const { repo, lifecycle, scheduler } = setup();
    repo.nextTransitionAt.mockResolvedValueOnce(new Date(NOW.getTime() + 10 * MIN)).mockResolvedValue(null);
    await scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(10 * MIN - 1);
    expect(lifecycle.tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(lifecycle.tick).toHaveBeenCalledTimes(1);
    expect(repo.nextTransitionAt).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mốc đã qua (vd API khởi động lại) → tick ngay', async () => {
    const { repo, lifecycle, scheduler } = setup();
    repo.nextTransitionAt.mockResolvedValueOnce(new Date(NOW.getTime() - MIN)).mockResolvedValue(null);
    scheduler.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(lifecycle.tick).toHaveBeenCalledTimes(1);
  });

  it('reschedule sau khi GV sửa bài thay timer cũ (không tick theo mốc cũ)', async () => {
    const { repo, lifecycle, scheduler } = setup();
    repo.nextTransitionAt.mockResolvedValueOnce(new Date(NOW.getTime() + 5 * MIN));
    await scheduler.reschedule();
    repo.nextTransitionAt.mockResolvedValueOnce(new Date(NOW.getTime() + 30 * MIN)).mockResolvedValue(null);
    await scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(29 * MIN);
    expect(lifecycle.tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(lifecycle.tick).toHaveBeenCalledTimes(1);
  });

  it('tick lỗi → thử lại sau assignmentRetryMs, không lặp sát nhau', async () => {
    const { repo, lifecycle, scheduler } = setup();
    repo.nextTransitionAt.mockResolvedValueOnce(NOW).mockResolvedValue(null);
    lifecycle.tick.mockRejectedValueOnce(new Error('db down'));
    await scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(lifecycle.tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(WORKSHEETS.assignmentRetryMs - 1);
    expect(lifecycle.tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(lifecycle.tick).toHaveBeenCalledTimes(2);
  });

  it('shutdown huỷ timer', async () => {
    const { repo, lifecycle, scheduler } = setup();
    repo.nextTransitionAt.mockResolvedValue(new Date(NOW.getTime() + MIN));
    await scheduler.reschedule();
    scheduler.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(lifecycle.tick).not.toHaveBeenCalled();
  });
});
