import dotenv from 'dotenv';
dotenv.config();

import { Client } from '@notionhq/client';
import express, { Express, Request, Response } from 'express';

import { query_focus, query_history, add_task } from './notion_handler.js';
import { the_choosening } from './task_gen.js';
import { SrcTaskList, TaskHistory } from './types.js';


const app: Express = express();
const port = process.env.PORT || 3000;

const notion = new Client({
    auth: process.env.NOTION_TOKEN
})

app.get('/', async (_req: Request, res: Response) => {
    console.log('get /')
    const src_task_list: SrcTaskList = await query_focus(notion);
    const history: TaskHistory = await query_history(notion, src_task_list);
    const [the_chosen, log] = the_choosening(src_task_list, history);
    const resp = await add_task(notion, Array.from(the_chosen));
    res.json({ 
        log, 
        history,
        src_task_list,
        the_chosen: [...the_chosen], 
        resp 
    });
});

app.listen(port, () => {
    console.log('running server')
})

