export type Weights = Record<string, number>;


export class TaskHistory {
    data: Array<Task>;
    occurrences: Record<string, number>;

    constructor(tasks: Array<Task>) {
        this.occurrences = {};
        tasks.forEach(task => {
            this.occurrences[task.id] = task.id in this.occurrences ?
                                        this.occurrences[task.id] + 1 : 1;
        })
        this.data = tasks;
    }
}


export class SrcTaskList {
    data: Record<string, Task>;
    total_per_week: number;

    constructor(tasks: Set<Task>) {
        this.data = {}
        this.total_per_week = 0
        tasks.forEach(task => {
            this.data[task.id] = task;
            this.total_per_week += task.per_week;
        });
    }
}


export type Task = {
    id:       string,
    name:     string,
    per_week: number,
    active:   boolean,
}

