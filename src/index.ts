// Set-up
import dotenv from 'dotenv';
dotenv.config();


import { NotionHandler, MongoLogger } from './api_handlers.js';
const notion_handler = NotionHandler.from_obj({
    token: process.env.NOTION_TOKEN,
    databases: {
        focus: process.env.FOCUS_DB_ID,
        tasks: process.env.TASKS_DB_ID,
    }
})
if (notion_handler === null) throw new Error('no notion_handler, no working');

const mongo_logger = MongoLogger.from_obj({
    user: process.env.MONGO_USER,
    password: process.env.MONGO_PASS,
    url: process.env.MONGO_URL,
    database: 'NotionLog',
    collection: 'DailyTasks'
})


import express, { Express, Request, Response } from 'express';

const app: Express = express();
const port = process.env.PORT || 3000;


import { SrcTaskList, TaskHistory, the_choosening } from './task_gen.js';


app.get('/today', async (_req: Request, res: Response) => {
    console.log('get /today')
    const src_task_list: SrcTaskList = await notion_handler.query_focus();
    const history: TaskHistory = await notion_handler.query_history(src_task_list);
    const [the_chosen, log] = the_choosening(src_task_list, history);
    const notion_resp = await notion_handler.add_task(Array.from(the_chosen));
    const resp = {
        log,
        history,
        src_task_list,
        the_chosen: [...the_chosen], 
        notion_resp 
    };
    mongo_logger?.log(resp);
    res.json(resp);
});

app.listen(port, () => {
    console.log('running server')
})

