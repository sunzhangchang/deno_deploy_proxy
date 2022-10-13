import { serve } from 'https://deno.land/std@0.155.0/http/server.ts'

// serve((req: Request) => new Response("Hello World"))

// const proxy_domain = 'https://gist.github.com'

function handler(req: Request): Promise<Response> {
    console.log(req)
    
    const parts = req.url.split('deno.dev')
    let url = ''

    if (parts.length > 1) {
        parts.shift()
        url = parts.join('deno.dev')
    }

    while (url.startsWith('/')) {
        url = url.substring(1)
    }

    if (url.length === 0) {
        url = 'https://gist.github.com'
    }

    console.log(url)

    return fetch(url, {
        headers: req.headers,
        method: req.method,
        body: req.body
    })
}

await serve(handler)
