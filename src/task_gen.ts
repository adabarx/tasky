import { DateTime } from 'luxon';

import {
    Task,
    Tasks,
    WorkDay,
    Weights,
    LastCycle,
    History,
    // Weekday
} from './types.js';

const CYCLE: number = Number(process.env.DAYS_PER_WEEK) || 7;

export function generate_tasks(tasks: Tasks, history: History): Tasks {
    const last_cycle = get_last_cycle(history);
    const num_today = num_tasks_today(tasks, last_cycle);
    const weights = calc_weights(tasks, last_cycle);

    return the_choosening(tasks, weights, num_today);
}

function get_last_cycle(history: History): LastCycle {
    const now = DateTime.local();
    const cycle_ago = now.minus({ // {CYCLE} days ago at midnight
        days: CYCLE,
        hours: now.hour,
        minutes: now.minute,
        seconds: now.second,
    });

    let tally: LastCycle = {}

    // Filter the history to only include days in the past {CYCLE} days
    // and update the tally for each task in each day's tasks
    history
        .filter((day: WorkDay) => day.date > cycle_ago)
        .forEach(day => {
            day.tasks.forEach( task => {
                const current_tally = task.id in tally ? tally[task.id] : 0;
                tally[task.id] = current_tally + 1;
            })
        });

    return tally
}

function num_tasks_today(tasks: Tasks, last_cycle: LastCycle): number {
    let target_avg = tasks.map(task => task.per_week)
                          .reduce((total, number) => total + number, 0);
    let current_avg = Object.values(last_cycle)
                            .reduce((total, number) => total + number, 0);
    target_avg = target_avg / CYCLE;
    current_avg = current_avg / CYCLE;

    let rv = 0;
    if (current_avg === 0) {
        rv = target_avg * target_avg;
    } else {
        rv = target_avg / current_avg;
    }

    // randomly round rv up or down weighted by the decimal remainder
    // example: rv ===3.75
    // output:
    //   3 - 25% of the time
    //   4 - 75% of the time
    const remainder = rv % 1;
    rv = Math.floor(rv);
    const random = Math.random();
    
    return rv + Number(remainder > random)
}

function calc_weights(tasks: Tasks, last_cycle: LastCycle): Weights {
    let rv: Weights = {};
    tasks.forEach((task: Task) => {
        const in_last_cycle = task.id in last_cycle;
        const base = in_last_cycle ?
                     task.per_week - (task.per_week - last_cycle[task.id]) :
                     task.per_week * 2;
        const mult = in_last_cycle ? 
                     task.per_week / last_cycle[task.id] :
                     task.per_week * 2;

        rv[task.id] = base * mult;
    });
    return rv;
}

function the_choosening(tasks: Tasks, weights: Weights, num_today: number): Tasks {
    let rv: Tasks = [];
    for (let i = 0; i < num_today; i++) {
        const entries = Object.entries(tasks)
                              .sort(() => Math.random() - 0.5);
        const total_weight = Object.values(weights)
                                   .reduce((total, number) => total + number, 0);
        const random = Math.random() * total_weight;

        let cumulative_weight = 0;
        for (const [task_id, weight] of entries) {
            cumulative_weight =+ weight;
            if (random < cumulative_weight) {
                // move from tasks into rv
                const index = tasks.findIndex((task: Task) => task.id === task_id);
                if (index === -1) throw new Error("something fucked up");

                rv.push(tasks.splice(index, 1)[0])
                break;
            }
        }
    }

    return rv;
}
