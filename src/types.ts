import { DateTime } from 'luxon';

export type Weights = Record<string, number>;
export type LastCycle = Record<string, number>;

export interface Task {
    id: string,
    name: string,
    per_week: number,
    time: number,
}

export interface WorkDay {
    date: DateTime,
    tasks: Array<Task>,
}

