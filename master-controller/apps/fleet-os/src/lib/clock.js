import { useState, useEffect } from "react";
export function useClock() {
  const [t, setT] = useState(() => new Date().toLocaleTimeString("en-GB",{hour12:false}));
  useEffect(() => { const i = setInterval(() => setT(new Date().toLocaleTimeString("en-GB",{hour12:false})), 1000); return () => clearInterval(i); }, []);
  return t;
}
