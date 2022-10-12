addEventListener('fetch', e => {
    const url = new URL(e.request.url)
    url.hostname = 'gist.github.com'
    console.log(url)
    const request = new Request(url, e.request);
    e.respondWith(fetch(request))
})
