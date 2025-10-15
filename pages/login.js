import { useState } from 'react';

export default function Login() {
  const [password, setPassword] = useState('');
  async function handleSubmit(e){
    e.preventDefault();
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password }) });
    if (res.ok) window.location.href = '/';
    else alert('Incorrect password');
  }
  return (
    <div className="container">
      <div className="glass-block">
        <div className="header"><h1>White Soul Tarot — Access</h1></div>
        <p className="subtext">Private preview interface. Enter the access key.</p>
        <form onSubmit={handleSubmit} className="controls">
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={{background:'#171717',color:'var(--txt)',border:'1px solid #2a2a2a',borderRadius:10,padding:'10px 12px'}} />
          <button type="submit">Enter</button>
        </form>
      </div>
      <div className="footer">©2025 White Soul Tarot / Private Preview</div>
    </div>
  );
}

