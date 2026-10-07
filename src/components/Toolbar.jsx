import { Search } from "lucide-react";

export default function Toolbar({ value, onChange, placeholder }) {
  return (
    <div className="user-toolbar">
      <label className="search-box">
        <Search size={18} />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>
    </div>
  );
}
