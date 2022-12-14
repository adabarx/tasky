import { z } from "https://deno.land/x/zod/mod.ts";
import { datetime } from "https://deno.land/x/ptera@v1.0.2/mod.ts";
import { Client } from "https://deno.land/x/notion_sdk@v1.0.4/src/mod.ts";


import { Task, SrcTaskList, TaskHistory } from './task_gen.ts';


export type NotionHandlerData = {
    token: string,
    source: string,
    output: string,
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

    constructor(data: NotionHandlerData) {
        this.client = new Client({
            auth: data.token,
        });
        this.source = data.source
        this.output = data.output
    }

    static from_obj(data: Record<string, string>): NotionHandler | never {
        // check for token
        if (typeof data.token !== 'string') {
            throw new Error('token required: no NotionHandler')
        }
        // check for db fields
        const db_fields = ['source', 'output'];
        for (const field of db_fields) {
            if (!(field in data) || typeof data[field] !== 'string') {
                throw new Error(`NotionHandler - incomplete database list`)
            }
        }
        return new NotionHandler(data as NotionHandlerData)
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
                        title: [ {
                            type: 'text',
                            text: { content: task.name }
                        } ]
                    },
                    Status: {
                        type: 'status',
                        status: { name: 'Exercise', }
                    },
                    exc_src: {
                        type: 'relation',
                        relation: [ { id: task.id } ]
                    }
                }
            });
        }))
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
                    dt_src: {
                        type: 'relation',
                        relation: [ { id: task.id } ]
                    }
                }
            });
        }))
    }


    async query_history(src_task_list: SrcTaskList, src_name: 'dt_src' | 'exc_src'): Promise<TaskHistory> {
        const resp = await this.client.databases.query({
            database_id: this.output,
            filter: {
                and: [
                    {
                        timestamp: "created_time",
                        created_time: { "past_week": {} }
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
            'mon': 1,
            'tue': 2,
            'wed': 3,
            'thu': 4,
            'fri': 5,
            'sat': 6,
            'sun': 0,
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
                Sessions: z.object({
                    number: z.number()
                }),
                Days_off: z.object({
                    multi_select: z.object({
                        name: z.string()
                    }).array()
                }),
                Started: z.object({
                    date: z.object({
                        start: z.string()
                    })
                })
            })
        })
        resp.results.forEach(page => {
            const val_resp = pageValidator.safeParse(page);
            if (!val_resp.success) {
                console.log(val_resp.error);
                return
            }

            const current_page: Record<string, string | number | boolean | Date> = {};
            
            current_page['id'] = val_resp.data.id;

            current_page['name'] = 
                val_resp.data.properties
                    .Name
                    .title[0]
                    .plain_text;

            current_page['per_week'] = 
                val_resp.data.properties
                    .Sessions
                    .number || 0;

            current_page['active'] = 
                !val_resp.data.properties
                    .Days_off
                    .multi_select
                    .map((day) => {
                        if ('name' in day) {
                            return weekday_map[day.name]
                        }
                    })
                    .includes(datetime().toZonedTime('America/Chicago').weekDay())

            current_page['started'] =
                val_resp.data.properties
                    .Started
                    .date
                    .start

            task_set.add(current_page as Task)
        })
        return new SrcTaskList(task_set)
    }

    // async log_item(item: NotionLogItem) {
    //     return await this.client.pages.create({
    //         parent: { database_id: this.databases.log },
    //         properties: {
    //             Name: {
    //                 title: [ {
    //                     type: 'text',
    //                     text: { content: item.name }
    //                 } ]
    //             },
    //             Notes: {
    //                 rich_text: [ {
    //                     type: "text",
    //                     text: { content: item.notes }
    //                 } ]
    //             },
    //             Tags: {
    //                 multi_select: item.tags.map(tag => { return { name: tag } })
    //             }
    //         }
    //     })
    // }
}
