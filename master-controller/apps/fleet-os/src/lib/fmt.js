export const shortId = id => id ? id.slice(0,8) : "—";
export const fmtDate = ts => ts ? new Date(ts).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";
export const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString("en-GB",{hour12:false}) : "—";
export const statusBadge = s => ({ active:"badge-active", bound:"badge-bound", unbound:"badge-unbound", validated:"badge-validated", approved:"badge-approved", rejected:"badge-rejected", failed:"badge-failed", pending:"badge-pending", revoked:"badge-revoked" }[s] || "badge-pending");
