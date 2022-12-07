import { DateTime } from 'luxon';
import { Client } from '@notionhq/client';
import { Task, SrcTaskList, TaskHistory } from './types.js';

export async function add_task(notion: Client, tasks: Array<Task>) {
    let response: any[] = await Promise.all(
        tasks.map(async task => {
            const resp = await notion.pages.create({
                parent: {
                    database_id: String(process.env.TASKS_DB_ID) || 'lol',
                },
                properties: {
                    Name: {
                        type: 'title',
                        title: [
                            {
                                type: 'text',
                                text: {
                                    content: task.name
                                }
                            }
                        ]
                    },
                    Status: {
                        type: 'status',
                        status: {
                            name: 'Daily Task',
                        }
                    },
                    Focus: {
                        type: 'relation',
                        relation: [
                            {
                                id: task.id
                            }
                        ]
                    }
                }
            })
            return resp;
        })
    )
    return response;
}


export async function query_history(notion: Client, src_task_list: SrcTaskList): Promise<TaskHistory> {
    const resp = await notion.databases.query({
        database_id: process.env.TASKS_DB_ID || 'whoops',
        filter: {
            and: [
                {
                    timestamp: "created_time",
                    created_time: {
                        "past_week": {}
                    }
                },
                {
                    or: Object.keys(src_task_list.data).map(id => {
                        return {
                            property: "Focus",
                            relation: {
                                contains: id
                            }
                        } 
                    })
                }
            ]
        }
    });

    console.log(src_task_list)

    const history: Array<Task> = resp.results.map(page => {
        if (
            'properties' in page &&
            'Focus' in page.properties &&
            'relation' in page.properties.Focus
        ) {
            const task_id = page.properties
                                .Focus
                                .relation[0]
                                .id
            console.log(src_task_list.data[task_id])
            return src_task_list.data[task_id]
        }
    }).filter((task): task is Task => task !== undefined);
    return new TaskHistory(history);
}


export async function query_focus(notion: Client): Promise<SrcTaskList> {
    const weekday_map: Record<string, number> = {
        'mon': 1,
        'tue': 2,
        'wed': 3,
        'thu': 4,
        'fri': 5,
        'sat': 6,
        'sun': 7,
    }
    const resp = await notion.databases.query({
        database_id: process.env.FOCUS_DB_ID || 'whoops'
    })

    let task_set = new Set<Task>();

    resp.results.forEach(page => {
        let current_page: Record<string, any> = {};
        current_page['id'] = page.id;
        if ('properties' in page) {
            // Does the title exits?
            if ('Name' in page.properties && 'title' in page.properties.Name) {
                current_page['name'] = page.properties
                                           .Name
                                           .title[0]
                                           .plain_text;
            } else {
                return;
            }
            // Does Days_per_week exist?
            if ('Sessions' in page.properties && 'number' in page.properties.Sessions) {
                current_page['per_week'] = page.properties
                               .Sessions
                               .number || 0;
            } else {
                return;
            }
            // Is it active today?
            if ('Days_off' in page.properties && 'multi_select' in page.properties.Days_off) {
                current_page['days_off'] = page.properties
                                     .Days_off
                                     .multi_select
                                     .map((day: any) => {
                                         if ('name' in day) {
                                             return weekday_map[day.name]
                                         }
                                     });

                current_page['active'] = true;
                if (current_page['days_off'].includes(DateTime.local().weekday)) {
                    current_page['active'] = false;
                }
            }

            task_set.add(current_page as Task)
        }
    })

    return new SrcTaskList(task_set)
}
