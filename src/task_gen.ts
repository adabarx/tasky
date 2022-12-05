import { Task, Weights } from './types.js';

const CYCLE: number = Number(process.env.DAYS_PER_WEEK) || 7;

export function the_choosening(src_task_list: Array<Task>, tasks_completed:Array<Task>): Array<Task> {
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
    const num_today = num_tasks_today(src_task_list, tasks_completed);
    const weights = calc_weights(src_task_list, tasks_completed);
    
    let returned_tasks: Array<Task> = [];
    for (let i = 0; i < num_today; i++) {
        const entries = Object.entries(src_task_list)
                              .sort(() => Math.random() - 0.5);
        const total_weight = Object.values(weights)
                                   .reduce((total, number) => total + number, 0);
        const random = Math.random() * total_weight;

        let cumulative_weight = 0;
        for (const [task_id, weight] of entries) {
            cumulative_weight =+ weight;
            if (random < cumulative_weight) {
                const index = src_task_list.findIndex((task: Task) => task.id === task_id);
                if (index === -1) throw new Error("something fucked up");

                // move from tasks into rv
                returned_tasks.push(src_task_list.splice(index, 1)[0])
                break;
            }
        }
    }
    return returned_tasks;
}


function num_tasks_today(src_task_list: Array<Task>, tasks_completed: Array<Task>): number {
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

    const target_avg = src_task_list.map(task => task.per_week)
                                    .reduce((total, number) => total + number, 0)
                                    / CYCLE;
    let current_avg = tasks_completed.length / CYCLE;

    let num_today = 0;
    if (current_avg === 0) {
        num_today = target_avg * target_avg;
    } else {
        num_today = target_avg / current_avg;
    }

    /**
     * randomly round rv up or down weighted by the decimal remainder
     * example: num_today == 3.75
     * output:
     *   3 - 25% of the time
     *   4 - 75% of the time
     */
    const remainder = num_today % 1;
    num_today = Math.floor(num_today);
    const random = Math.random();
    
    return num_today + Number(remainder > random)
}


function calc_weights(src_task_list: Array<Task>, tasks_completed: Array<Task>): Weights {
    /**
     * The calc_weights function calculates the weights for a list of tasks.
     *
     * @param src_task_list - An array of Task objects representing the list of 
     *                        tasks to calculate weights for.
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
    let rv: Weights = {};
    src_task_list.forEach((task: Task) => {
        const num_times_completed = tasks_completed.filter(cmpltd_task => cmpltd_task.id === task.id).length;
        const base = num_times_completed > 0 ?
                     task.per_week - (task.per_week - num_times_completed) :
                     task.per_week * 2;
        const mult = num_times_completed > 0 ? 
                     task.per_week / num_times_completed :
                     task.per_week * 2;

        rv[task.id] = base * mult;
    });
    return rv;
}

