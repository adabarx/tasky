import { DateTime } from 'luxon';
import { Client } from '@notionhq/client';
import { Task, SrcTaskList, TaskHistory } from './task_gen.js';
import { MongoClient} from 'mongodb';


export type MongoLoggerInfo = {
    user: string,
    password: string,
    url: string,
    database: string,
    collection: string,
}

export class MongoLogger {
    client:     MongoClient;
    uri:        string;
    database:   string;
    collection: string;
    responses:  Array<any>;
    
    constructor(data: MongoLoggerInfo) {
        this.uri = `mongodb+srv://${data.user}:${data.password}@${data.url}`;
        this.database = data.database;
        this.collection = data.collection;
        this.client = new MongoClient(this.uri);
        this.responses = [];
    }

    static from_obj(data: Record<string, any>): MongoLogger | null {
        const fields = ['user', 'password', 'url', 'database', 'collection'];
        for (const field of fields) {
            if (typeof data[field] !== 'string') {
                console.log('not enough data for mongodb');
                return null
            }
        }
        return new MongoLogger(data as MongoLoggerInfo)
    }

    async log(record: Record<string, any>) {
        try {
            await this.client.connect();
            console.log("connected to mongodb")

            const database = this.client.db(this.database)
            const collection = database.collection(this.collection)

            this.responses.unshift(await collection.insertOne({ date: new Date(), ...record }))
        } catch(err) {
            if (err instanceof Error){
                console.log(err.stack)
            }
        } finally {
            this.client.close();
            return this.responses[0];
        }
    }
}

export type NotionHandlerData = {
    token: string,
    databases: NotionDatabases
}
export type NotionDatabases = {
    focus: string,
    tasks: string,
}

export class NotionHandler {
    client: Client;
    databases: NotionDatabases

    constructor(data: NotionHandlerData) {
        this.client = new Client({
            auth: data.token,
        });
        this.databases = data.databases;
    }

    static from_obj(data: Record<string, any>): NotionHandler | null {
        // check for token
        if (typeof data.token !== 'string') {
            console.log('token required: no NotionHandler')
            return null
        }
        // check for db fields
        const db_fields = ['focus', 'tasks'];
        for (const field of db_fields) {
            if (!('databases' in data) || 
                !(field in data.databases) || 
                (typeof data.databases[field] !== 'string')) {
                console.log('incomplete database list: no NotionHandler')
                return null
            }
        }
        return new NotionHandler(data as NotionHandlerData)
    }

    async add_task(tasks: Array<Task>) {
        return await Promise.all(
            tasks.map(async task => {
                return await this.client.pages.create({
                    parent: {
                        database_id: this.databases.tasks
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
                });
            })
        )
    }


    async query_history(src_task_list: SrcTaskList): Promise<TaskHistory> {
        const resp = await this.client.databases.query({
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
                return src_task_list.data[task_id]
            }
        }).filter((task): task is Task => task !== undefined);
        return new TaskHistory(history);
    }


    async query_focus(): Promise<SrcTaskList> {
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
}
