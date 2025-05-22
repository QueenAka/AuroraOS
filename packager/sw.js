let fileMap = new Map();

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data.type === "SET_FILES") {
    fileMap = new Map(event.data.files);
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  if (fileMap.has(path)) {
    const blob = fileMap.get(path);
    event.respondWith(new Response(blob));
  }
});
