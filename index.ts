import { serve } from 'https://deno.land/std@0.155.0/http/server.ts'

// serve((req: Request) => new Response("Hello World"))

const proxy_domain = 'https://gist.github.com' // 修改为你的网站地址

function handler(req: Request): Promise<Response> {
    const url = proxy_domain + req.url.split('deno.dev')[1]

    return fetch(url, {
        headers: req.headers,
        method: req.method,
        body: req.body
    })
}

await serve(handler)
