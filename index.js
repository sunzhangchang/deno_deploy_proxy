addEventListener('fetch', e => {
    const url = new URL(e.request.url)
    url.hostname = 'gist.github.com'
    const request = new Request(url, event.request);
    e.respondWith(fetch(request))
})
