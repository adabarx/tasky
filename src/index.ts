import dotenv from 'dotenv';
dotenv.config();

import express, { Express, Request, Response } from 'express';
import { Client } from '@notionhq/client';
import { DateTime } from 'luxon';

import { Task } from './types.js';

const app: Express = express();
const port = process.env.PORT || 3000;

const notion = new Client({
    auth: process.env.NOTION_TOKEN
})

async function query_focus(notion: Client) {
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

    let rv: Array<Task> = [];
    resp.results.forEach(page => {
        const id = page.id;
        if ('properties' in page) {
            let name: string = ''
            let per_week: number = 0
            let time: number = 0
            // Is today a day off?
            if ('Days_off' in page.properties && 'multi_select' in page.properties.Days_off) {
                const days_off = page.properties
                                     .Days_off
                                     .multi_select
                                     .map((day: any) => {
                                         if ('name' in day) {
                                             return weekday_map[day.name]
                                         }
                                     });
                if (days_off.includes(DateTime.local().weekday)) {
                    return;
                }
            }
            // Does the title exits?
            if ('Name' in page.properties && 'title' in page.properties.Name) {
                name = page.properties
                           .Name
                           .title[0]
                           .plain_text;
            } else {
                return;
            }
            // Does Days_per_week exist?
            if ('Sessions' in page.properties && 'number' in page.properties.Sessions) {
                per_week = page.properties
                               .Sessions
                               .number || 0;
            } else {
                return;
            }
            // Does time exist?
            if ('Time' in page.properties && 'number' in page.properties.Time) {
                time = page.properties
                           .Time
                           .number || 0;
            } else {
                return;
            }
            rv.push({
                id: id,
                name: name,
                per_week: per_week,
                time: time,
            });
        }
    })

    return rv;
}

app.get('/', async (_req: Request, res: Response) => {
    res.json(await query_focus(notion));
});

app.listen(port, () => {
    console.log('running server')
})

