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
                throw new Error('incomplete database list: no NotionHandler')
            }
        }
        return new NotionHandler(data as NotionHandlerData)
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


    async query_history(src_task_list: SrcTaskList): Promise<TaskHistory> {
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
                                property: "dt_src",
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
                'dt_src' in page.properties &&
                'relation' in page.properties.dt_src
            ) {
                const task_id = page.properties
                                    .dt_src
                                    .relation[0]
                                    .id
                return src_task_list.data[task_id]
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
            'sun': 7,
        }
        const resp = await this.client.databases.query({
            database_id: this.source
        })

        const task_set = new Set<Task>();

        resp.results.forEach(page => {
            const current_page: Record<string, any> = {};
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
                    if (current_page['days_off'].includes(datetime().toZonedTime('America/Chicago').weekDay())) {
                        current_page['active'] = false;
                    }
                }

                task_set.add(current_page as Task)
            }
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
