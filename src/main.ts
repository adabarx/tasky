import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import { Application, Router } from "https://deno.land/x/oak@v11.1.0/mod.ts";
import { z } from "https://deno.land/x/zod@v3.20.2/mod.ts";

import { NotionHandler, NotionLogItem } from "./api_handlers.ts"
import { TaskHistory, SrcTaskList, the_choosening } from "./task_gen.ts"


const router = new Router();
router
    .get('/', (ctx) => {
        ctx.response.body = "Hi Router";
    })
    .get('/daily-tasks', async (ctx) => {
        const notion_handler = NotionHandler.from_obj({
            token: Deno.env.get('NOTION_TOKEN'),
            source: Deno.env.get('FOCUS_DB_ID'),
            output: Deno.env.get('OUTPUT_ID'),
            log: Deno.env.get('LOG_ID'),
        })
        console.log('get /daily-tasks');
        const src_task_list: SrcTaskList = await notion_handler.query_source();
        const history: TaskHistory = await notion_handler.query_history(src_task_list, 'dt_src');
        const [the_chosen, log] = the_choosening(src_task_list, history);
        const notion_resp = await notion_handler.add_tasks(Array.from(the_chosen));
        const resp = {
            log,
            history,
            src_task_list,
            the_chosen: [...the_chosen], 
            notion_resp 
        };
        ctx.response.body = resp
    })
    .get('/work-out', async (ctx) => {
        const notion_handler = NotionHandler.from_obj({
            token: Deno.env.get('NOTION_TOKEN'),
            source: Deno.env.get('WORKOUT_DB_ID'),
            output: Deno.env.get('OUTPUT_ID'),
            log: Deno.env.get('LOG_ID'),
        })
        console.log('get /work-out');
        const src_task_list: SrcTaskList = await notion_handler.query_source();
        const history: TaskHistory = await notion_handler.query_history(src_task_list, "exc_src");
        const [the_chosen, log] = the_choosening(src_task_list, history);
        const notion_resp = await notion_handler.add_exercises(Array.from(the_chosen));
        const resp = {
            log,
            history,
            src_task_list,
            the_chosen: [...the_chosen], 
            notion_resp 
        };
        ctx.response.body = resp

    })
    .post('/log', async (ctx) => {
        const notion_handler = NotionHandler.from_obj({
            token: Deno.env.get('NOTION_TOKEN'),
            source: Deno.env.get('FOCUS_DB_ID'),
            output: Deno.env.get('OUTPUT_ID'),
            log: Deno.env.get('LOG_ID'),
        })
        console.log('get /log');
        const validator = z.object({
            name: z.string(),
            notes: z.string(),
            tags: z.string().array(),
        })

        const result = await ctx.request.body({type: 'json'}).value
        ctx.response.body = await notion_handler.log_task(validator.parse(result) as NotionLogItem)
    })

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 })

