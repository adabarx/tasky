import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import { Application, Router } from "https://deno.land/x/oak@v11.1.0/mod.ts";

import { NotionHandler } from "./api_handlers.ts"
import { TaskHistory, SrcTaskList, the_choosening } from "./task_gen.ts"

const notion_handler = NotionHandler.from_obj({
    token: Deno.env.get('NOTION_TOKEN') || 'lol',
    source: Deno.env.get('SOURCE_ID') || 'lol',
    output: Deno.env.get('OUTPUT_ID') || 'lol',
})

const router = new Router();
router
    .get('/', (ctx) => {
        ctx.response.body = "Hi Router";
    })
    .get('/daily-tasks', async (ctx) => {
        console.log('get /daily-tasks');
        const src_task_list: SrcTaskList = await notion_handler.query_source();
        const history: TaskHistory = await notion_handler.query_history(src_task_list);
        const [the_chosen, log] = the_choosening(src_task_list, history);
        const notion_resp = await notion_handler.add_tasks(Array.from(the_chosen));
        const resp = {
            log,
            history,
            src_task_list,
            the_chosen, 
            notion_resp 
        };
        ctx.response.body = resp
    })
    .get('/work-out', (ctx) => {
        ctx.response.body = "generate work out"
    })

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 })

