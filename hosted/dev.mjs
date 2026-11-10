import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (/^\/api\/[a-z]+$/.test(url.pathname)) {
        const module = await import(`./api/${url.pathname.slice(5)}.js`);
        return await module.default(req, res);
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!['index.html', 'app.js', 'style.css'].includes(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const data = await fs.readFile(path.join(root, 'public', file));
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)],
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch (error) {
      console.error(error);
      res.writeHead(500);
      res.end('Server error');
    }
  })
  .listen(port, () => console.log(`FridgeOps Web: http://localhost:${port}`));
