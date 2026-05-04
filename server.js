const http = require("http");
const fs = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;
const rootDir = __dirname;

const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
};

const server = http.createServer((request, response) => {
    const rawUrl = request.url || "/";
    const cleanUrl = rawUrl.split("?")[0];
    const requestedPath = cleanUrl === "/" ? "/index.html" : cleanUrl;
    const safePath = path.normalize(requestedPath).replace(/^(\.\.[\\/])+/, "");
    const filePath = path.join(rootDir, safePath);

    fs.readFile(filePath, (error, content) => {
        if (error) {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Recurso no encontrado.");
            return;
        }

        const extension = path.extname(filePath);
        response.writeHead(200, { "Content-Type": contentTypes[extension] || "text/plain; charset=utf-8" });
        response.end(content);
    });
});

server.listen(port, () => {
    console.log(`Casas en Guerra listo en http://localhost:${port}`);
});