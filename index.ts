import { serve } from 'https://deno.land/std@0.155.0/http/server.ts'

// serve((req: Request) => new Response("Hello World"))

// const proxy_domain = 'https://gist.github.com'

// function handler(req: Request): Promise<Response> {
//     console.log(req)

//     let url = req.url
//     const urlobj = new URL(url)
//     url = url.substring(urlobj.origin.length)

//     while (url.startsWith('/')) {
//         url = url.substring(1)
//     }

//     if (url.length === 0) {
//         url = 'https://gist.github.com'
//     }

//     console.log(url)

//     return fetch(url, {
//         headers: req.headers,
//         method: req.method,
//         body: req.body
//     })
// }

// await serve(handler)

/**
 * static files (404.html, sw.js, conf.js)
 */
const ASSET_URL = 'https://etherdream.github.io/jsproxy'

const JS_VER = '10'
const MAX_RETRY = 1

const PREFLIGHT_INIT: RequestInit = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
} as RequestInit

const HeA = [
    'access-control-allow-origin',
    'access-control-expose-headers',
    'location',
    'set-cookie',
]

const HeB = [
    'cache-control',
    'content-language',
    'content-type',
    'expires',
    'last-modified',
    'pragma',
]

const Sta = [
    301,
    302,
    303,
    307,
    308,
]

function makeRes(body: BodyInit | null | undefined, status = 200, headers: Record<string, string> = {}) {
    headers['--ver'] = JS_VER
    headers['access-control-allow-origin'] = '*'
    return new Response(body, { status, headers })
}

await serve(async (req): Promise<Response> => {
    return await (
        fetchHandler(req)
            .catch((err: Error) => makeRes('cfworker error:\n' + err.stack, 502))
    )
})


async function fetchHandler(req: Request): Promise<Response> {
    const urlStr = req.url
    const urlObj = new URL(urlStr)
    const path = urlObj.href.substring(urlObj.origin.length)

    // console.log(urlStr)
    console.log('request: ', req)

    if (urlObj.protocol === 'http:') {
        urlObj.protocol = 'https:'
        return makeRes('', 301, {
            'strict-transport-security': 'max-age=99999999; includeSubDomains; preload',
            'location': urlObj.href,
        })
    }

    // console.log(path)

    if (path.startsWith('/http/')) {
        return httpHandler(req, path.substring(6))
    }

    switch (path) {
        case '/http':
            return makeRes('请更新 cfworker 到最新版本!')
        case '/ws':
            return makeRes('not support', 400)
        case '/works':
            return makeRes('it works')
        default:
            // static files
            return await fetch(ASSET_URL + path)
    }
}

function httpHandler(req: Request, pathname: string) {
    const reqHdrRaw = req.headers
    if (reqHdrRaw.has('x-jsproxy')) {
        return Response.error()
    }

    // preflight
    if (req.method === 'OPTIONS' &&
        reqHdrRaw.has('access-control-request-headers')
    ) {
        return new Response(null, PREFLIGHT_INIT)
    }

    let acehOld = false
    let rawLen = 0

    const reqHdrNew = new Headers(reqHdrRaw)
    reqHdrNew.set('x-jsproxy', '1')

    // 此处逻辑和 http-dec-req-hdr.lua 大致相同
    // https://github.com/EtherDream/jsproxy/blob/master/lua/http-dec-req-hdr.lua
    const refer = reqHdrNew.get('referer')

    if (!refer) {
        return Response.error()
    }

    const query = refer.substring(refer.indexOf('?') + 1)
    if (!query) {
        return makeRes('missing params', 403)
    }
    const param = new URLSearchParams(query)

    // console.log('param: ', param)

    for (const [k, v] of Object.entries(param)) {
        if (k.startsWith('--')) {
            // 系统信息
            switch (k.substring(2)) {
                case 'aceh':
                    acehOld = true
                    break
                case 'raw-info': {
                    const t = v.split('|')
                    rawLen = +t[1]
                    break
                }
            }
        } else {
            // 还原 HTTP 请求头
            if (v) {
                reqHdrNew.set(k, v)
            } else {
                reqHdrNew.delete(k)
            }
        }
    }
    if (!param.has('referer')) {
        reqHdrNew.delete('referer')
    }

    // cfworker 会把路径中的 `//` 合并成 `/`
    const urlStr = pathname.replace(/^(https?):\/+/, '$1://')

    try {
        const urlObj = new URL(urlStr)

        const reqInit = {
            method: req.method,
            headers: reqHdrNew,
            redirect: 'manual',
        } as RequestInit
        if (req.method === 'POST') {
            reqInit.body = req.body
        }
        return proxy(urlObj, reqInit, acehOld, rawLen, 0)
    } catch (_err) {
        return makeRes('invalid proxy url: ' + urlStr, 403)
    }
}

async function proxy(urlObj: URL, reqInit: RequestInit, acehOld: boolean, rawLen: number, retryTimes: number): Promise<Response> {
    const res = await fetch(urlObj.href, reqInit)
    const resHdrOld = res.headers
    const resHdrNew = new Headers(resHdrOld)

    let expose = '*'

    for (const [k, v] of resHdrOld.entries()) {
        if (HeA.includes(k)) {
            const x = '--' + k
            resHdrNew.set(x, v)
            if (acehOld) {
                expose += ',' + x
            }
            resHdrNew.delete(k)
        } else if (acehOld && !HeB.includes(k)
        ) {
            expose += ',' + k
        }
    }

    if (acehOld) {
        expose += ',--s'
        resHdrNew.set('--t', '1')
    }

    // verify
    if (rawLen) {
        const newLen = +(resHdrOld.get('content-length') ?? '0')
        const badLen = (rawLen !== newLen)

        if (badLen) {
            if (retryTimes < MAX_RETRY) {
                const turlObj = await parseYtVideoRedir(urlObj, newLen, res)
                if (turlObj) {
                    return proxy(turlObj, reqInit, acehOld, rawLen, retryTimes + 1)
                }
            }
            return makeRes(res.body, 400, {
                '--error': `bad len: ${newLen}, except: ${rawLen}`,
                'access-control-expose-headers': '--error',
            })
        }

        if (retryTimes > 1) {
            resHdrNew.set('--retry', retryTimes.toString())
        }
    }

    let status = res.status

    resHdrNew.set('access-control-expose-headers', expose)
    resHdrNew.set('access-control-allow-origin', '*')
    resHdrNew.set('--s', status.toString())
    resHdrNew.set('--ver', JS_VER)

    resHdrNew.delete('content-security-policy')
    resHdrNew.delete('content-security-policy-report-only')
    resHdrNew.delete('clear-site-data')

    if (Sta.includes(status)) {
        status += 10
    }

    return new Response(res.body, {
        status,
        headers: resHdrNew,
    })
}

function isYtUrl(urlObj: URL) {
    return (
        urlObj.host.endsWith('.googlevideo.com')
        && urlObj.pathname.startsWith('/videoplayback')
    ) || (
        urlObj.host.endsWith('youtube.com')
        && urlObj.pathname.startsWith('/youtubei')
    )
}

async function parseYtVideoRedir(urlObj: URL, newLen: number, res: Response) {
    if (newLen > 2000) {
        return null
    }
    if (!isYtUrl(urlObj)) {
        return null
    }
    try {
        const data = await res.text()
        urlObj = new URL(data)
    } catch (_err) {
        return null
    }
    if (!isYtUrl(urlObj)) {
        return null
    }
    return urlObj
}
