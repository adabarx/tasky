import { Application, Router } from "https://deno.land/x/oak@v11.1.0/mod.ts";

const router = new Router();
router
    .get('/', (ctx) => {
        ctx.response.body = "Hi Router";
    })
    .get('/daily-tasks', (ctx) => {
        ctx.response.body = "generate daily tasks"
    })
    .get('/work-out', (ctx) => {
        ctx.response.body = "generate work out"
    })

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8000 })

