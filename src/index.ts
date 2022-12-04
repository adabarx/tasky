import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

const notion = new Client({
    auth: process.env.NOTION_TOKEN
})

app.get('/', async (_: Request, res: Response) => {
    const get_focus = async () => {
        const data = await notion.databases.query({
            database_id: process.env.DATABASE_ID || 'eh'
        })
        return data
    }
    const b = await get_focus()
    res.json(b);
});

app.listen(port, () => {
    console.log('running server')
})

