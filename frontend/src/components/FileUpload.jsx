import { useRef, useState } from 'react';
import { subirArchivo } from '../api/conversaciones.api';
import '../styles/ChatBox.css';

export default function FileUpload({ files = [], onChange }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);

  const getName = (f) => f.nombreArchivo || f.name || (f.file && f.file.name) || 'archivo';

  // Subir un solo archivo y devolver el registro persistido (o fallback)
  const uploadFile = async (file) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await subirArchivo(form);
      if (res?.data?.archivo) return { ...res.data.archivo, uploadError: false, uploading: false };
    } catch (err) {
      console.error('Upload failed for', file.name, err);
    }
    // fallback minimal object
    return { id: null, nombreArchivo: file.name, rutaArchivo: '', file, uploadError: true, uploading: false };
  };

  // Handler cuando seleccionan archivos
  const handleFiles = async (e) => {
    const chosen = Array.from(e.target.files || []);
    if (chosen.length === 0) return;

    setUploading(true);

    // Crear objetos temporales para mostrar en UI inmediatamente
    const tempObjs = chosen.map(f => ({
      id: null,
      nombreArchivo: f.name,
      file: f,
      preview: URL.createObjectURL(f),
      uploading: true
    }));

    // Propagar inmediatamente para feedback en UI
    onChange([...(files || []), ...tempObjs]);

    // Subir secuencialmente (puedes paralelizar si prefieres)
    const results = [];
    for (const f of chosen) {
      const uploaded = await uploadFile(f);
      results.push(uploaded);
      // revoke preview URL to avoid leaks
      try { URL.revokeObjectURL(f.preview); } catch {}
    }

    // Reemplazar los temporales recién añadidos por los resultados reales
    // Strategy: quitar tantos items temporales finales como chosen.length y añadir results
    const base = (files || []).slice(); // anteriores
    const newList = [...base, ...results];
    onChange(newList);

    // Reset input so selecting the same file again triggers change
    if (inputRef.current) inputRef.current.value = null;
    setUploading(false);
  };

  const remove = (idx) => {
    const copy = [...files];
    const removed = copy.splice(idx, 1);
    // revoke preview if present
    if (removed && removed[0] && removed[0].preview) {
      try { URL.revokeObjectURL(removed[0].preview); } catch {}
    }
    onChange(copy);
  };

  return (
    <div className="file-upload">
      <div className="file-list">
        {(files || []).map((f, i) => (
          <div key={f.id || f.nombreArchivo || f.name || i} className="file-item">
            <div className="file-name">{getName(f)}</div>
            <div className="file-meta">
              {f.uploading || uploading ? <span className="badge pending">Subiendo...</span> :
                (f.id ? <span className="badge">Subido</span> : (f.uploadError ? <span className="badge error">Error</span> : <span className="badge">Pendiente</span>))}
            </div>
            <div className="file-actions">
              <button onClick={() => remove(i)} className="btn-ghost">Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      <div className="file-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 8 }}>
        <input ref={inputRef} type="file" multiple onChange={handleFiles} style={{ display: 'none' }} />
        <button onClick={() => inputRef.current.click()} disabled={uploading} className="code-btn">
          {uploading ? 'Subiendo...' : 'Adjuntar'}
        </button>
        {uploading && <div style={{ color: '#6b7280', fontSize: 13 }}>Subiendo archivos…</div>}
      </div>
    </div>
  );
}