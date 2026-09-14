import { containsSecret } from "./helpChat";
export const TICKET_KEY = "study-companion-support-tickets-v1";
export const ticketStatuses = ["Open", "In progress", "Resolved"];
const categories = ["upload", "quiz", "review", "other"];

export function readTickets(storage) {
  const raw = storage.getItem(TICKET_KEY);
  const records = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(records) || records.some((t) => !t.id || !Array.isArray(t.replies))) {
    throw new Error("Saved tickets could not be read. Existing data has not been replaced.");
  }
  return records;
}

export function changeTickets(storage, user, action) {
  if (!user || user.status !== "Active") throw new Error("Please sign in with an active account.");
  const records = readTickets(storage);
  const now = new Date().toISOString();
  let ticket;
  if (action.type === "create") {
    if (user.role !== "Student") throw new Error("Only students can create tickets.");
    const title = action.title?.trim() || "";
    const description = action.description?.trim() || "";
    if (containsSecret(title) || containsSecret(description)) throw new Error("Remove passwords, verification codes and API keys before saving.");
    if (!categories.includes(action.category) || !title || title.length > 100 || description.length < 10 || description.length > 2000) {
      throw new Error("Choose a category, enter a title (1-100 characters) and a description (10-2000 characters).");
    }
    ticket = { id: `ASK-${crypto.randomUUID()}`, userId: user.id, name: user.name,
      category: action.category, title, description, status: "Open", createdAt: now,
      updatedAt: now, replies: [] };
    records.unshift(ticket);
  } else {
    ticket = records.find((t) => t.id === action.id);
    if (!ticket || (user.role !== "Admin" && ticket.userId !== user.id)) throw new Error("Ticket unavailable.");
    if (action.type === "reply") {
      const text = action.text?.trim() || "";
      if (containsSecret(text)) throw new Error("Remove passwords, verification codes and API keys before saving.");
      if (!text || text.length > 2000) throw new Error("Enter a reply of 1-2000 characters.");
      ticket.replies.push({ text, role: user.role, name: user.name, createdAt: now });
    } else if (action.type === "status") {
      if (user.role !== "Admin" || !ticketStatuses.includes(action.status)) throw new Error("Status change not allowed.");
      ticket.status = action.status;
    } else throw new Error("Unknown ticket action.");
    ticket.updatedAt = now;
  }
  // Commit before reporting success; quota or permission failures leave the old data intact.
  storage.setItem(TICKET_KEY, JSON.stringify(records));
  return ticket;
}
