import { DateTime } from 'luxon';

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export type Tasks = Array<Task>;
export type History = Array<WorkDay>;
export type Weights = Record<string, number>;
export type LastCycle = Record<string, number>;

export interface Task {
    id: string,
    name: string,
    per_week: number,
    time: number,
    days_off: Array<Weekday>,
}

export interface WorkDay {
    date: DateTime,
    tasks: Tasks,
}

