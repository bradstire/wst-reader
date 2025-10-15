export default function handler(req, res){
  if (req.method !== 'POST') return res.status(405).end();
  const { password } = req.body || {};
  if (!password || password !== process.env.APP_PASSWORD) return res.status(401).json({ ok:false });
  // Set httpOnly cookie (session cookie)
  res.setHeader('Set-Cookie', `wst_auth=${password}; Path=/; HttpOnly; SameSite=Lax; Secure`);
  res.status(200).json({ ok:true });
}

