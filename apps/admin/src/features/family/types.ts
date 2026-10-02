import type {
  ChildInput,
  Domain,
  Lesson,
  MilestoneObservation,
  MilestonesFile,
  Route,
  ValidationIssue,
} from '@sprout/schema';
import type { Dayjs } from 'dayjs';

export interface FamilyStats {
  days: { date: string; screenSec: number; lessons: number; completed: number }[];
  domains: Partial<Record<Domain, number>>;
  totalSec: number;
  streakDays: number;
}

export interface FamilyMilestones extends Pick<MilestonesFile, 'items'> {
  observations: MilestoneObservation[];
  disclaimer: MilestonesFile['disclaimer'] | string;
}

export interface FamilyLesson {
  lesson: Lesson;
  packId: string;
  baseUrl: string;
  issues: ValidationIssue[];
}

export interface RouteSummary extends Pick<Route, 'id' | 'title'> {
  packId: string;
}

export interface ChildFormValues extends Omit<ChildInput, 'birthday' | 'screen'> {
  birthday: Dayjs | null;
  screen: Omit<ChildInput['screen'], 'windows'> & {
    windows: { start: Dayjs | null; end: Dayjs | null }[];
  };
}
