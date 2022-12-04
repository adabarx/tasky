import { uuid } from 'uuidv4';

type weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

interface Task {
    id: string,
    name: string,
    per_week: number,
    time: number,
    days_off: Array<weekday>,
}

interface WorkDay {
    date: Date,
    tasks: Array<string>,
}



