import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { Client } from '@notionhq/client';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

const notion = new Client({
    auth: process.env.NOTION_TOKEN
})

const res = await notion.databases.query({
    database_id: process.env.DATABASE_ID || "eh"
  });

  console.log("Got response:", res);

app.get('/', (_: Request, res: Response) => {
    res.send('hello there');
});

app.listen(port, () => {
    console.log('running server')
})

