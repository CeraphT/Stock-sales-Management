import { useNavigate } from "react-router-dom";

export function BackButton({ label = "Back" }: { label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className="text-sm font-semibold text-text-secondary transition hover:text-text-primary"
    >
      ← {label}
    </button>
  );
}
