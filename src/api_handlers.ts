import { z } from "https://deno.land/x/zod@v3.20.2/mod.ts";
import { datetime } from "https://deno.land/x/ptera@v1.0.2/mod.ts";
import { Client } from "https://deno.land/x/notion_sdk@v1.0.4/src/mod.ts";


import { Task, SrcTaskList, TaskHistory } from './task_gen.ts';


export type NotionHandlerData = {
    token: string,
    source: string,
    output: string,
    log: string
}
export type NotionLogItem = {
    name: string,
    notes: string,
    tags: string[],
}

export class NotionHandler {
    client: Client;
    source: string;
    output: string;
    log: string;

    constructor(data: NotionHandlerData) {
        this.client = new Client({
            auth: data.token,
        });
        this.source = data.source
        this.output = data.output
        this.log = data.log
    }

    static from_obj(data: Record<string, string | undefined>): NotionHandler | never {
        // check for db fields
        const validator = z.object({
            token: z.string(),
            source: z.string(),
            output: z.string(),
            log: z.string(),
        })
        return new NotionHandler(validator.parse(data) as NotionHandlerData)
    }


    async add_exercises(tasks: Array<Task>) {
        return await Promise.all(tasks.map(async task => {
            return await this.client.pages.create({
                parent: {
                    database_id: this.output
                },
                properties: {
                    Name: {
                        type: 'title',
                        title: [{
                            type: 'text',
                            text: { content: task.name }
                        }]
                    },
                    Status: {
                        type: 'status',
                        status: { name: 'Exercise', }
                    },
                    Tags: {
                        type: 'multi_select',
                        multi_select: task.tags.map((tag: string) => ({ name: tag })),
                    },
                    exc_src: {
                        type: 'relation',
                        relation: [{ id: task.id }]
                    }
                }
            });
        }));
    }

    async add_tasks(tasks: Array<Task>) {
        return await Promise.all(tasks.map(async task => {
            return await this.client.pages.create({
                parent: {
                    database_id: this.output
                },
                properties: {
                    Name: {
                        type: 'title',
                        title: [ {
                            type: 'text',
                            text: { content: task.name }
                        } ]
                    },
                    Status: {
                        type: 'status',
                        status: { name: 'Daily Task', }
                    },
                    time_of_day: {
                        type: 'multi_select',
                        multi_select: task.time_of_day.map(time => ({ name: time })),
                   },
                    Tags: {
                        type: 'multi_select',
                        multi_select: task.tags.map(tag => ({ name: tag })),
                    },
                    Time: {
                        type: 'number',
                        number: task.minutes,
                    },
                    dt_src: {
                        type: 'relation',
                        relation: [ { id: task.id } ]
                    },
                    Important: {
                        type: 'number',
                        number: task.priority,
                    }
                }
            });
        }));
    }


    async query_history(src_task_list: SrcTaskList, src_name: 'dt_src' | 'exc_src'): Promise<TaskHistory> {
        const before = datetime().subtract({day: 1}).toISODate();
        const after = datetime().subtract({day: 8}).toISODate();
        const resp = await this.client.databases.query({
            database_id: this.output,
            filter: {
                and: [
                    {
                        timestamp: "created_time",
                        created_time: { "on_or_before": before }
                    },
                    {
                        timestamp: "created_time",
                        created_time: { "on_or_after": after }
                    },
                    {
                        or: Object.keys(src_task_list.data).map(id => {
                            return {
                                property: src_name,
                                relation: { contains: id }
                            } 
                        })
                    },
                ]
            }
        });

        const history: Array<Task> = resp.results.map(page => {
            if (
                'properties' in page &&
                src_name in page.properties &&
                'relation' in page.properties[src_name] &&
                typeof page.properties[src_name].relation[0] === 'object'
            ) {
                return src_task_list.data[page.properties[src_name].relation[0].id]
            }
        }).filter((task): task is Task => task !== undefined);
        return new TaskHistory(history);
    }


    async query_source(): Promise<SrcTaskList> {
        const weekday_map: Record<string, number> = {
            'mon': 2,
            'tue': 3,
            'wed': 4,
            'thu': 5,
            'fri': 6,
            'sat': 0,
            'sun': 1,
        }
        const resp = await this.client.databases.query({
            database_id: this.source
        })

        const task_set = new Set<Task>();

        const pageValidator = z.object({
            id: z.string(),
            properties: z.object({
                Name: z.object({
                    title: z.object({
                        plain_text: z.string()
                    }).array().length(1)
                }),
                Tags: z.object({
                    multi_select: z.object({
                        name: z.string()
                    }).array()
                }),
                Sessions: z.object({
                    number: z.number()
                }),
                Days_off: z.object({
                    multi_select: z.object({
                        name: z.string()
                    }).array()
                }),
                time_of_day: z.object({
                    multi_select: z.object({
                        name: z.enum(['morning', 'day', 'night'])
                    }).array()
                }),
                Days_on: z.object({
                    multi_select: z.object({
                        name: z.string()
                    }).array()
                }),
                Time: z.object({
                    number: z.number().nullable(),
                }),
                Important: z.object({
                    number: z.number().nullable(),
                }),
                Started: z.object({
                    date: z.object({
                        start: z.string()
                    })
                }),
                warm_up: z.optional(z.object({
                    number: z.number()
                })),
                End: z.object({
                    date: z.object({
                        start: z.string().nullable()
                    }).nullable()
                }),
                Cooldown: z.object({
                    number: z.number().nullable()
                }),
            })
        })
        resp.results.forEach(page => {
            const val_resp = pageValidator.safeParse(page);
            if (!val_resp.success) {
                console.log(val_resp.error);
                return
            }

            task_set.add({
                id: val_resp.data.id,

                name: val_resp.data.properties
                        .Name
                            .title[0]
                                .plain_text,

                tags: val_resp.data.properties
                        .Tags
                            .multi_select
                            .map((day) => day.name),

                priority: val_resp.data.properties
                        .Important
                            .number || 99,

                minutes: val_resp.data.properties
                        .Time
                            .number || 0,

                per_week: val_resp.data.properties
                        .Sessions
                            .number || 0,

                time_of_day: val_resp.data.properties
                        .time_of_day
                            .multi_select
                            .map(time => time.name),

                active: !val_resp.data.properties
                        .Days_off
                            .multi_select
                            .map((day) => weekday_map[day.name])
                            .includes(datetime().toZonedTime('America/Chicago').weekDay()),

                forced_today: val_resp.data.properties
                        .Days_on
                            .multi_select
                            .map((day) => weekday_map[day.name])
                            .includes(datetime().toZonedTime('America/Chicago').weekDay()),

                started: new Date(val_resp.data.properties
                                               .Started
                                               .date
                                               .start),

                warm_up: val_resp.data.properties
                                      .warm_up?.number || 0,

                end: val_resp.data.properties.End.date?.start
                     ? new Date(val_resp.data.properties.End.date.start)
                     : null,

                cooldown: val_resp.data.properties
                                       .Cooldown?.number || 0,
            } as Task)                
        })
        return new SrcTaskList(task_set)
    }

    async log_task(item: NotionLogItem) {
        return await this.client.pages.create({
            parent: { database_id: this.log },
            properties: {
                Name: {
                    title: [ {
                        type: 'text',
                        text: { content: item.name }
                    } ]
                },
                Notes: {
                    rich_text: [ {
                        type: "text",
                        text: { content: item.notes }
                    } ]
                },
                Tags: {
                    multi_select: item.tags.map(tag => ({ name: tag }))
                }
            }
        })
    }
}
