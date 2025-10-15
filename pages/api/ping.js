// pages/api/ping.js
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.write('Hello\n');
  setTimeout(() => {
    res.write('World\n');
    res.end();
  }, 2000);
}
