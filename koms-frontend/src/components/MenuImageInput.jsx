import { useEffect, useState } from 'react';

export default function MenuImageInput({ file, onChange, label }) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setPreview(url), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [file]);
  return <div className="menu-image-input">
    {file && preview && <img src={preview} alt="Selected photo preview" />}
    <div><input aria-label={label} type="file" accept="image/jpeg,image/png,image/webp,image/avif" required onChange={event => {
      const selected = event.target.files?.[0];
      setError('');
      if (selected && (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(selected.type) || selected.size > 5 * 1024 * 1024)) {
        setError('Choose a JPG, PNG, WebP or AVIF image under 5 MB.');
        event.target.value = '';
        onChange(null);
      } else onChange(selected || null);
    }} /><small>JPG, PNG, WebP or AVIF. Maximum 5 MB.</small>{error && <p role="alert">{error}</p>}</div>
  </div>;
}
