import { useEffect, useState } from "react";
import { useAppData } from "../state/AppDataContext";
import { changeTickets, readTickets, ticketStatuses, TICKET_KEY } from "../services/ticketService";
import { helpTopics } from "../data/helpTopics";
import "./SupportTickets.css";

export default function SupportTickets({ initialCategory = "other", compose = false, onNewTicket }) {
  const { currentUser } = useAppData();
  const admin = currentUser?.role === "Admin";
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(compose);
  const [category, setCategory] = useState(initialCategory);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");

  useEffect(() => {
    function refresh(event) {
      if (event?.key && event.key !== TICKET_KEY) return;
      try { setTickets(readTickets(window.localStorage)); setError(""); }
      catch { setError("Cannot read local tickets. Existing data has not been replaced."); }
    }
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const visible = tickets.filter((t) => admin || t.userId === currentUser?.id);
  const selected = visible.find((t) => t.id === selectedId);
  const listed = visible.filter((t) => (filter === "All" || t.status === filter) &&
    `${t.id} ${t.title} ${t.category}`.toLowerCase().includes(search.toLowerCase()));

  function perform(action) {
    setError(""); setNotice("");
    try {
      const ticket = changeTickets(window.localStorage, currentUser, action);
      setTickets(readTickets(window.localStorage));
      setNotice(action.type === "create" ? "Ticket saved in this browser. It has not been sent to a remote support team." : "Changes saved in this browser.");
      return ticket;
    } catch (err) { setError(err.message || "Could not save. Please try again."); return null; }
  }

  return <div className="support-tickets">
    <p className="support-note">Local demo: tickets and replies are stored only in this browser. No email or server delivery. Do not include passwords, API keys or sensitive files.</p>
    <div className="support-actions">
      <button type="button" onClick={() => { setCreating(false); setSelectedId(null); setNotice(""); }}> {admin ? "All tickets" : "My tickets"} ({visible.length})</button>
      {!admin && <button type="button" onClick={() => { if (onNewTicket) { onNewTicket(); return; } setCreating(true); setSelectedId(null); setNotice(""); }}>New ticket</button>}
    </div>
    {error && <p role="alert" className="support-error">{error}</p>}
    {notice && <p role="status" className="support-notice">{notice}</p>}
    {creating && !admin ? <form onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const ticket = perform({ type: "create", category, title: data.get("title"), description: data.get("description") });
      if (ticket) { setCreating(false); setSelectedId(ticket.id); }
    }}>
      <h3>Report a problem</h3>
      <label>Problem category<select value={category} onChange={(e) => setCategory(e.target.value)}>{helpTopics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label>Short title<input name="title" required maxLength={100} placeholder="e.g. PDF upload fails" /></label>
      <label>What happened?<textarea name="description" required minLength={10} maxLength={2000} rows={5} placeholder="Page, steps, expected result and actual result (at least 10 characters)" /></label>
      <button className="support-primary" type="submit">Save local ticket</button>
    </form> : selected ? <section>
      <p className="support-id">{selected.id}</p>
      <h3>{selected.title}</h3>
      <p>{selected.category.toUpperCase()} · {selected.status}</p>
      <small>{selected.name} · {new Date(selected.createdAt).toLocaleString()}</small>
      <p className="support-message">{selected.description}</p>
      {admin && <label>Status<select aria-label="Ticket status" value={selected.status} onChange={(e) => perform({ type: "status", id: selected.id, status: e.target.value })}>{ticketStatuses.map((s) => <option key={s}>{s}</option>)}</select></label>}
      <h4>Replies</h4>
      {selected.replies.length === 0 && <p>No replies yet.</p>}
      {selected.replies.map((r, i) => <article className="support-message" key={i}><small>{r.name} ({r.role}) · {new Date(r.createdAt).toLocaleString()}</small><p>{r.text}</p></article>)}
      <form onSubmit={(e) => { e.preventDefault(); if (perform({ type: "reply", id: selected.id, text: reply })) setReply(""); }}>
        <label>Add a reply<textarea value={reply} onChange={(e) => setReply(e.target.value)} required maxLength={2000} rows={3} /></label>
        <button type="submit" className="support-primary">Save reply</button>
      </form>
    </section> : <section>
      <label>Search tickets<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, category or ticket ID" /></label>
      <label>Filter by status<select value={filter} onChange={(e) => setFilter(e.target.value)}>{["All", ...ticketStatuses].map((s) => <option key={s}>{s}</option>)}</select></label>
      {!listed.length && <p>No tickets to show.</p>}
      {listed.map((t) => <button type="button" className="support-ticket-row" key={t.id} onClick={() => { setSelectedId(t.id); setReply(""); }}><strong>{t.title}</strong><span>{t.status} · {t.category}</span><small>{new Date(t.createdAt).toLocaleString()}</small></button>)}
    </section>}
  </div>;
}
