import http from 'node:http';

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-cache, no-transform',
    'Transfer-Encoding': 'chunked'
  });
  res.write('Hello\n');
  setTimeout(() => {
    res.write('World\n');
    res.end();
  }, 2000);
});

server.listen(8080, () => {
  console.log('Plain Node server on http://localhost:8080');
});
