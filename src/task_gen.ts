// deno-lint-ignore-file no-explicit-any
import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import { datetime, diffInDays } from "https://deno.land/x/ptera@v1.0.2/mod.ts";

const CYCLE = Number(Deno.env.get('DAYS_PER_CYCLE')) || 7;

export type Weights = Record<string, number>;
export type TimeOfDay = 'morning' | 'day' | 'night';

export type Task = {
    id:             string;
    name:           string;
    tags:           string[] 
    priority:       number;
    minutes:        number;
    per_week:       number;
    time_of_day:    TimeOfDay[];
    active:         boolean;
    forced_today:   boolean;
    started:        Date;
    warm_up:        number;
    end:            Date | null;
    cooldown:       number;
    choke_group:    number | null;
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
        tasks.forEach(task => {
            this.data[task.id] = task;
            this.total_per_week += task.per_week;
        });
        
        this.total_per_week = [ ...this.getLotto(), ...this.getNotToday(), ...this.getForcedToday() ].reduce((total, task) => total + task.per_week, 0);
    }

    getLotto() {
        const now = datetime()
        return Object.values(this.data)
                     .filter(task => {
                         if (task.end === null) {
                             return !task.forced_today
                                    && task.active
                                    && datetime().isAfter(datetime(task.started))
                         }
                         return !task.forced_today
                                && task.active
                                && datetime().isAfter(datetime(task.started))
                                && datetime().isBefore( datetime(task.end).add({ day: task.warm_up * 7 }) )
                     })
                     .map(task => {
                         const rv = { ...task }
                         const start = datetime(task.started)
                         const endOfWarmup = start.add({ day: task.warm_up * 7 })
                         if (datetime().isBefore(endOfWarmup)) {
                             const totalWarmup = diffInDays(start, endOfWarmup)
                             const progressWarmup = diffInDays(start, now)
                             rv.per_week *= progressWarmup / totalWarmup
                         }

                         if (task.end) {
                             const end = datetime(task.end)
                             if (datetime().isAfter(end)) {
                                 const endOfCooldown = end.add({ day: task.cooldown * 7 })
                                 const totalCooldown = diffInDays(end, endOfCooldown)
                                 const progressCooldown = diffInDays(now, end)
                                 rv.per_week *= progressCooldown / totalCooldown
                             }
                         }

                         return rv
                     })
    }

    getForcedToday() {
        return Object.values(this.data)
                     .filter(task => task.forced_today);
    }

    getNotToday() {
        return Object.values(this.data)
                     .filter(task => !task.active);
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

    const weights = calc_weights(src_task_list, task_history, log);

    let num_today = num_tasks_today(src_task_list, task_history, log);
    num_today -= src_task_list.getForcedToday().length

    const the_chosen = new Set<Task>(src_task_list.getForcedToday());

    log['num_tasks_today']['total_weight'] = Object.values(weights)
                                                   .reduce((total, number) => total + number, 0);
    for (let i = 0; i < num_today; i++) {
        // Run a weighted lottery to semi-randomly pick todays tasks
        const entries = Object.entries(weights)
                              .sort(() => Math.random() - 0.5);
        const total_weight = Object.values(weights)
                                   .reduce((total, number) => total + number, 0);
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
            const id = entries[index][0];
            const chosen_task = src_task_list.data[id];
            the_chosen.add(chosen_task)
            Object.values(src_task_list.data).forEach(task => {
                if (chosen_task.choke_group !== null && 
                    chosen_task.choke_group === task.choke_group &&
                    chosen_task.id !== task.id
                ) {
                    delete weights[task.id]
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

    const tasks = src_task_list.getLotto()

    // calculate saturation_val
    const less_than_seven = tasks.filter(task => diffInDays(datetime(), datetime(task.started)) < 7);
    let avg_start = 7;
    if (less_than_seven.length > 0) {
        avg_start = less_than_seven.map(task => diffInDays(datetime(), datetime(task.started)))
                                   .reduce((total, diff_in_days) => total + diff_in_days, 0) / less_than_seven.length;
    }

    const saturation_val = avg_start / 7 // normalize for bias

    let num_today = 0;
    if (current_avg === 0) {
        num_today = target_avg ** 2;
    } else {
        num_today = target_avg * (target_avg / current_avg);
    }

    const bias_avg = (x: number, y: number, bias: number) => (x * bias) + (y * (1 - bias));
    const sat_curve = (x: number) => round_to(Math.tanh(x * 2), 3);

    const bias_result = bias_avg(target_avg, num_today, sat_curve(1 - saturation_val))

    const rv = random_round(bias_result)
    log['num_tasks_today'] = {
        num_today: round_to(num_today, 2),
        target_avg: round_to(target_avg, 2),
        current_avg: round_to(current_avg, 2),
        avg_days_since_start: round_to(avg_start, 2),
        bias_num_today: `(num_today: ${round_to(num_today, 2)} * bias: ${round_to(1 - sat_curve(1 - saturation_val), 2)}) ${round_to(num_today * (1 - sat_curve(1 - saturation_val)), 2)}`,
        bias_target_avg: `(target_avg: ${round_to(target_avg, 2)} * bias: ${round_to(sat_curve(1 - saturation_val), 2)}) ${round_to(target_avg * sat_curve(1 - saturation_val), 2)}`,
        bias_result: round_to(bias_result, 2),
        final: rv
    }
    
    return rv;
}

function round_to(num: number, decimals: number): number {
    decimals = 10 ** decimals
    return Math.round(num * decimals) / decimals
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
    src_task_list.getLotto().forEach(task => {
        const seed = calc_seed(task)
        const occurrences = task_history.occurrences[task.id] || 0;
        const total = occurrences + seed

        const base = total > 0 ?
                     task.per_week - (total - task.per_week) :
                     task.per_week * 2;
        const mult = total > 0 ? 
                     task.per_week / total :
                     task.per_week * 2;

        const wght = Math.max(base * mult, 0);

        log.calc_weights[task.name] = {
            occurrences: {
                per_week: round_to(task.per_week, 2),
                base: occurrences,
                seed: seed,
                total: total,
            },
            final_calc: {
                base: round_to(base, 2),
                mult: round_to(mult, 2),
                total: round_to(wght, 2),
            },
        }

        weights[task.id] = wght;
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
     *  
     * if num is a whole number: there is an equal, three-way chance
     * that this function will round up, round down, or not round at all
     * 
     * example: num == 3.75
     * output:
     *   3 - 25% of the time
     *   4 - 75% of the time
     *
     * example: num == 3
     * output:
     *   2 - 33% of the time
     *   3 - 33% of the time
     *   4 - 33% of the time
     */
    if (num % 1 === 0) {
        const r = Math.random()
        if (r < 0.333) {
            return num - 2;
        } else if (r < 0.666) {
            return num - 1
        }
        // r is above 0.5
        return num + 1
    }
    return Math.floor(num) + Number((num % 1) > Math.random());
}

