import React, { useState, useCallback } from "react";
import { _setToast } from "../lib/store.js";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type="info") => {
    const id = crypto.randomUUID();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  _setToast(add);
  return (
    <div className="toast-container">
      {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}
    </div>
  );
}
