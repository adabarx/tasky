// deno-lint-ignore-file no-explicit-any
import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import { datetime, diffInDays } from "https://deno.land/x/ptera@v1.0.2/mod.ts";

const CYCLE = Number(Deno.env.get('DAYS_PER_CYCLE')) || 7;

export type Weights = Record<string, number>;
export type TimeOfDay = 'morning' | 'day' | 'night';

export type Task = {
    id:           string;
    name:         string;
    tags:         string[]; 
    per_week:     number;
    time_of_day:  TimeOfDay[];
    active:       boolean;
    forced_today: boolean;
    started:      Date;
}

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


export function the_choosening(
    src_task_list: SrcTaskList,
    task_history: TaskHistory,
): [Set<Task>, Record<string, any>] {
    /** 
     * @param src_task_list - an array of Task objects, representing all of the 
     *                        available tasks to be completed.
     *
     * @param tasks_completed - an array of Task objects, representing the 
     *                          tasks that have been completed so far.
     *
     * @returns the array of tasks to be completed today, in no particular order
     *
     * the_choosening() first calculates the number of tasks to be completed 
     * today using the num_tasks_today function, which takes the src_task_list 
     * and tasks_completed arrays as input.
     *
     * The function then calculates the weights for each task in the 
     * src_task_list using the calc_weights function, which takes the 
     * src_task_list and tasks_completed arrays as input.
     *
     * The the_choosening function then iterates over the src_task_list and 
     * randomly selects tasks to be completed today based on their weight. The 
     * selected tasks are removed from the src_task_list and added to the returned array.
     */ 
    const log: Record<string, any> = {};

    const forced_today = Object.values(src_task_list.data).filter(task => task.forced_today);
    const num_today = num_tasks_today(src_task_list, task_history, log) - forced_today.length;
    const weights = calc_weights(src_task_list, task_history, log);

    const the_chosen = new Set<Task>(forced_today);
    for (let i = 0; i < num_today; i++) {
        // Run a weighted lottery to semi-randomly pick todays tasks
        const entries = Object.entries(weights).sort(() => Math.random() - 0.5);
        const total_weight = Object.values(weights).reduce((total, number) => total + number, 0);
        const random = Math.random() * total_weight;

        let cumulative_weight = 0;
        let index = -1;
        while (cumulative_weight < random) {
            index++;
            cumulative_weight += entries[Math.floor(index)][1]
        }

        if (index === -1) {
            break; // No more tasks in lotto
        }

        if (index < Object.entries(weights).length) {
            const id = entries[index][0]
            Object.values(src_task_list.data).forEach(task => {
                if (task.id === id) {
                    the_chosen.add(task);
                }
            });
            delete weights[id];
        } else {
            console.log('index out of range')
        }
    }
    return [the_chosen, log];
}


function num_tasks_today(
    src_task_list: SrcTaskList, 
    task_history: TaskHistory, 
    log: Record<string, any>
): number {
    /** 
     * @param src_task_list - an array of Task objects. Each Task object is 
     *                        unique has a `per_week` property representing the 
     *                        number of times the task should be completed per 
     *                        week.
     *
     * @param tasks_completed - an array of Task objects representing the tasks 
     *                          that have already been completed.
     *
     * The function returns the number of tasks that should be completed today, 
     * based on the average number of tasks to be completed per week and the 
     * average number of tasks completed per week. The calculation takes into 
     * account a random factor to avoid always returning the same number.
     *
     * The CYCLE constant is a Number used in the calculation and represents 
     * the number of days in the current cycle (e.g. 7 for a weekly cycle).
     */
    const target_avg = src_task_list.total_per_week / CYCLE;
    const current_avg = task_history.data.length / CYCLE;

    let num_today = 0;
    if (current_avg === 0) {
        num_today = target_avg + 1;
    } else {
        num_today = target_avg * (target_avg / current_avg);
    }

    num_today = Math.min(num_today, target_avg + 1)

    const rv = random_round(num_today)
    log['num_tasks_today'] = {
        target_avg,
        current_avg,
        num_today: {
            num_today,
            final: rv
        },
    }
    
    return rv;
}


function calc_weights(
    src_task_list: SrcTaskList, 
    task_history: TaskHistory, 
    log: Record<string, any>
): Weights {
    /**
     * The calc_weights function calculates the weights for a list of tasks.
     *
     * @param src_task_list - An array of unique Task objects representing the 
     *                        list of tasks to calculate weights for.
     *                
     * @param tasks_completed - An array of Task objects representing the tasks 
     *                          that have been completed.
     *                  
     * @returns
     *     A Weights (Record) object where the keys are task IDs and the values 
     *     are the calculated weights for each task.
     *
     * @description
     *     For each task in the src_task_list, the function filters the 
     *     tasks_completed array to find the number of completed tasks with the 
     *     same ID. If there are any completed tasks, the base weight is 
     *     calculated as the task's per_week value minus the difference between 
     *     the per_week value and the number of completed tasks. Otherwise, the 
     *     base weight is calculated as twice the task's per_week value.
     *
     *     The multiplicative factor is calculated as the per_week value 
     *     divided by the number of completed tasks if there are any completed 
     *     tasks, or twice the per_week value if there are no completed tasks.
     *
     *     The final weight for each task is calculated as the product of the 
     *     base weight and multiplicative factor, and stored in the Record 
     *     object with the task's ID as the key. The Record object is then returned.
     */

    log['calc_weights'] = {}
    const weights: Weights = {};
    Object.values(src_task_list.data).forEach(task => {
        if (task.active && !task.forced_today) {
            const seed = calc_seed(task)
            const occurrences = task_history.occurrences[task.id] || 0;
            const total = occurrences + seed

            const base = total > 0 ?
                         task.per_week - (total - task.per_week) :
                         task.per_week * 2;
            const mult = total > 0 ? 
                         task.per_week / total :
                         task.per_week * 2;

            log.calc_weights[task.name] = {
                occurrences: {
                    base: occurrences,
                    seed,
                    total,
                },
                final_calc: {
                    base,
                    mult,
                    total: base * mult,
                },
            }

            weights[task.id] = base * mult;
        }
    });
    return weights;
}

function calc_seed(task: Task) {
    const days_since_start = Math.floor(diffInDays(datetime(), datetime(task.started)))
    if (days_since_start >= 7) {
        return 0
    }

    const mult = (7 - days_since_start) / 7
    return Math.round(task.per_week * mult);
}

function random_round(num: number) {
    /**
     * randomly round rv up or down weighted by the decimal remainder
     * example: num == 3.75
     * output:
     *   3 - 25% of the time
     *   4 - 75% of the time
     */
    return Math.floor(num) + Number((num % 1) > Math.random());
}

